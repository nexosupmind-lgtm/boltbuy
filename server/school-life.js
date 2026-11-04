import { uploadReceipt, removeReceipt, receiptURL } from "./school-receipts.js";
import { normalizePhone, guardianFingerprint, seal, unseal } from "./family.js";
import {
  list,
  clean,
  visible,
  published,
  teacherScope,
  familyStudents,
  familyLife,
  schoolAlerts,
} from "./school-life-model.js";
import {
  createPushKeys,
  validSubscription,
  deliverSchoolPush,
} from "./school-push.js";
const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const fail = (status, message) => {
  const error = Error(message);
  error.status = status;
  throw error;
};
const now = () => new Date().toISOString();
const password = () => {
  const groups = [
      "ABCDEFGHJKLMNPQRSTUVWXYZ",
      "abcdefghijkmnopqrstuvwxyz",
      "23456789",
      "!@#$%&*",
    ],
    all = groups.join("");
  const pick = (alphabet) => {
    const buffer = new Uint8Array(1),
      max = 256 - (256 % alphabet.length);
    do {
      crypto.getRandomValues(buffer);
    } while (buffer[0] >= max);
    return alphabet[buffer[0] % alphabet.length];
  };
  const chars = groups.map(pick);
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};
function studentById(s, id) {
  const student = list(s.students).find((x) => x.id === id);
  if (!student) fail(404, "Aluno não encontrado.");
  return student;
}
function text(value, max = 200) {
  const out = clean(value, max);
  if (!out) fail(400, "Preencha os campos obrigatórios.");
  return out;
}
function checkDate(value) {
  const date = text(value, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date
  )
    fail(400, "Data inválida.");
  return date;
}
export async function onRequest(context) {
  const { request, env } = context;
  let createdUser = null,
    createdAccount = null,
    uploadedReceipt = null,
    committed = false;
  try {
    if (!["GET", "POST"].includes(request.method))
      fail(405, "Método não permitido.");
    const base = clean(env.SUPABASE_URL).replace(/\/$/, ""),
      secret = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!/^https:\/\/[^/]+\.supabase\.co$/.test(base) || !secret)
      fail(503, "Servidor indisponível.");
    const headers = {
      apikey: secret,
      authorization: "Bearer " + secret,
      "content-type": "application/json",
    };
    const rest = async (path, options = {}) => {
      const response = await fetch(base + "/rest/v1/" + path, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
      if (!response.ok)
        fail(
          response.status === 409 ? 409 : 503,
          "Não foi possível confirmar os dados. Atualize a tela e tente novamente.",
        );
      return response.status === 204 ? null : response.json();
    };
    const query = new URL(request.url).searchParams,
      slug = query.get("slug") || "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80)
      fail(400, "Escola inválida.");
    const token = (request.headers.get("authorization") || "").match(
      /^Bearer (\S+)$/i,
    )?.[1];
    if (!token) fail(401, "Entre para continuar.");
    const [who, clients] = await Promise.all([
      fetch(base + "/auth/v1/user", {
        headers: { apikey: secret, authorization: "Bearer " + token },
      }),
      rest(
        "bolt_commercial_clients?product=eq.class&slug=eq." +
          slug +
          "&select=id,name,status",
      ),
    ]);
    if (!who.ok) fail(401, "Entre novamente para continuar.");
    const user = await who.json(),
      client = clients[0];
    if (
      !user.id ||
      !client ||
      clients.length !== 1 ||
      client.status === "paused"
    )
      fail(403, "Escola ou usuário sem acesso.");
    const members = await rest(
      "bolt_commercial_memberships?client_id=eq." +
        client.id +
        "&user_id=eq." +
        encodeURIComponent(user.id) +
        "&role=eq.owner&select=user_id",
    );
    const owner = members.length === 1;
    const accounts = owner
      ? []
      : await rest(
          "bolt_family_accounts?client_id=eq." +
            client.id +
            "&user_id=eq." +
            encodeURIComponent(user.id) +
            "&select=*",
        );
    const statePath = "bolt_commercial_workspaces?client_id=eq." + client.id;
    async function snapshot() {
      const rows = await rest(statePath + "&select=payload,revision");
      if (rows.length !== 1 || rows[0].payload?.schools?.[0]?.id !== client.id)
        fail(503, "Escola sem dados confirmados.");
      return rows[0];
    }
    let current = await snapshot(),
      s = current.payload.schools[0];
    let scope = teacherScope(s, user.id),
      children = accounts[0]
        ? await familyStudents(s, accounts[0], guardianFingerprint)
        : [];
    if (!owner && !scope && !children.length)
      fail(403, "Acesso não autorizado.");
    const subscriptions = await rest(
      "bolt_client_subscriptions?client_id=eq." + client.id + "&select=plan_id",
    );
    let features = null;
    if (subscriptions[0]?.plan_id) {
      const plans = await rest(
        "bolt_platform_plans?id=eq." +
          subscriptions[0].plan_id +
          "&product=eq.class&select=features",
      );
      if (!Array.isArray(plans[0]?.features)) fail(503, "Plano indisponível.");
      features = plans[0].features;
    }
    function feature(key) {
      if (features && !features.includes(key))
        fail(403, "Este módulo não está incluído no plano da escola.");
    }
    let body = {};
    let proofFile = null;
    if (request.method === "POST") {
      if (
        (request.headers.get("content-type") || "").startsWith(
          "multipart/form-data",
        )
      ) {
        if (Number(request.headers.get("content-length")) > 2300000)
          fail(413, "Comprovante muito grande.");
        const form = await request.formData();
        proofFile = form.get("proof");
        body = Object.fromEntries([...form].filter(([k]) => k !== "proof"));
        if (body.action !== "payment-submit")
          fail(400, "Envio de arquivo inválido.");
      } else {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 40000)
          fail(413, "Solicitação muito grande.");
        try {
          body = JSON.parse(raw);
        } catch {
          fail(400, "Dados inválidos.");
        }
      }
    }

    function requireOwner() {
      if (!owner) fail(403, "Apenas a administração pode realizar esta ação.");
    }
    function allowedStudent(id) {
      const student = studentById(s, id);
      if (
        !owner &&
        !scope?.allows(student.classId) &&
        !children.some((x) => x.id === id)
      )
        fail(403, "Aluno fora do seu acesso.");
      return student;
    }
    function project() {
      const life = s.schoolLife || {};
      if (owner)
        return {
          ok: true,
          role: "owner",
          alerts: schoolAlerts(s),
          life: {
            ...life,
            push: life.push ? { publicKey: life.push.publicKey } : null,
            subscriptions: undefined,
          },
          accounts: [],
          revision: current.revision,
        };
      if (scope) {
        const allowed = list(s.students).filter((x) => scope.allows(x.classId));
        return {
          ok: true,
          role: "teacher",
          school: { name: client.name, slug, color: s.color, logo: s.logo },
          teacher: list(s.staff).find((x) => x.id === scope.staffId)?.name,
          staffId: scope.staffId,
          classes: scope.classes,
          subjects: scope.classes.map((c) => ({
            classId: c.id,
            subjects: scope.subjects(c.id),
          })),
          students: allowed.map(({ id, name, photo, classId }) => ({
            id,
            name,
            photo,
            classId,
          })),
          attendance: list(s.attendance).filter((x) =>
            allowed.some((st) => st.id === x.studentId),
          ),
          items: list(s.teacherItems).filter(
            (x) =>
              x.teacherId === scope.staffId &&
              scope.allows(x.classId, x.subject),
          ),
          grades: list(s.grades).filter(
            (x) =>
              allowed.some((st) => st.id === x.studentId) &&
              scope.allows(
                allowed.find((st) => st.id === x.studentId).classId,
                x.subject,
              ),
          ),
          gradeReviewQueue: list(s.gradeReviewQueue).filter(
            (x) =>
              x.teacherId === scope.staffId &&
              list(s.teacherItems).some(
                (i) =>
                  i.id === x.examId &&
                  i.teacherId === scope.staffId &&
                  scope.allows(i.classId, i.subject),
              ),
          ),
          routines: list(life.routines).filter((x) =>
            allowed.some((st) => st.id === x.studentId),
          ),
          threads: list(life.threads).filter(
            (x) =>
              x.department === "teacher" &&
              x.staffId === scope.staffId &&
              allowed.some((st) => st.id === x.studentId),
          ),
          features,
          revision: current.revision,
        };
      }
      feature("family");
      const student =
        children.find((x) => x.id === query.get("student_id")) || children[0];
      return {
        ok: true,
        role: "family",
        student: { id: student.id, name: student.name },
        children: children.map(({ id, name }) => ({ id, name })),
        ...familyLife(
          {
            ...s,
            finance: !features || features.includes("finance") ? s.finance : [],
          },
          student,
          user.id,
        ),
        publicKey: life.push?.publicKey || null,
      };
    }
    if (request.method === "GET") {
      if (owner && query.get("view") === "alerts")
        return json(200, { ok: true, alerts: schoolAlerts(s) });
      const result = project();
      if (owner) {
        const rows = await rest(
          "bolt_family_accounts?client_id=eq." +
            client.id +
            "&select=user_id,student_id,username,activated_at",
        );
        result.accounts = rows.map((a) => ({
          userId: a.user_id,
          studentId: a.student_id,
          username: a.username,
          active: !!a.activated_at,
          guardian:
            list(s.students).find((st) => st.id === a.student_id)?.guardian ||
            list(s.schoolLife?.contacts).find((x) => x.id === a.student_id)
              ?.guardian ||
            "Responsável",
        }));
      }
      return json(200, result);
    }
    const requestId = clean(body.requestId, 80);
    if (requestId && !/^[a-z0-9-]{16,80}$/i.test(requestId))
      fail(400, "Identificador inválido.");
    if (
      requestId &&
      list(s.schoolLife?.operations).some(
        (x) => x.id === requestId && x.userId === user.id,
      )
    )
      return json(200, { ok: true, replayed: true });
    const id = requestId || crypto.randomUUID(),
      action = body.action,
      key = env.BOLT_FAMILY_CREDENTIAL_KEY || secret;
    if (action === "teacher-reset") {
      requireOwner();
      feature("staff");
      const account = list(s.schoolLife?.teachers).find(
        (x) => x.userId === body.userId && x.active !== false,
      );
      if (!account) fail(404, "Professor sem acesso ativo.");
      const verified = await fetch(
        base + "/auth/v1/admin/users/" + encodeURIComponent(account.userId),
        { headers },
      );
      if (!verified.ok)
        fail(503, "Não foi possível confirmar a conta do professor.");
      const authUser = await verified.json();
      if (
        authUser.app_metadata?.bolt_school_id !== client.id ||
        authUser.app_metadata?.bolt_school_role !== "teacher"
      )
        fail(
          403,
          "Esta conta não foi criada como acesso de professor desta escola.",
        );
      const generated = password();
      const result = await fetch(
        base + "/auth/v1/admin/users/" + encodeURIComponent(account.userId),
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ password: generated }),
        },
      );
      if (!result.ok) fail(503, "Não foi possível redefinir a senha.");
      return json(200, {
        ok: true,
        email: account.email,
        password: generated,
        login_url: "/teacher.html?slug=" + slug,
      });
    }
    if (action === "guardian-share") {
      requireOwner();
      feature("family");
      const rows = await rest(
          "bolt_family_accounts?client_id=eq." +
            client.id +
            "&user_id=eq." +
            encodeURIComponent(text(body.userId, 100)) +
            "&select=*",
        ),
        account = rows[0];
      if (
        !account ||
        (await familyStudents(s, account, guardianFingerprint)).length === 0
      )
        fail(403, "Acesso revogado ou vínculo alterado. Gere um novo acesso.");
      const contact =
        list(s.schoolLife?.contacts).find(
          (x) => x.userId === account.user_id,
        ) || list(s.students).find((x) => x.id === account.student_id);
      return json(200, {
        ok: true,
        username: account.username,
        password: account.onboarding_secret
          ? await unseal(
              account.onboarding_secret,
              key,
              client.id + ":" + account.student_id + ":" + account.username,
            )
          : null,
        phone: normalizePhone(contact.phone),
        login_url: "/family.html?slug=" + slug,
        credentials: true,
      });
    }

    if (action === "payment-proof-url") {
      feature("finance");
      const payment = list(s.schoolLife?.payments).find(
        (x) => x.id === body.paymentId,
      );
      if (!payment?.proofPath) fail(404, "Comprovante não encontrado.");
      if (
        !owner &&
        (!children.some((st) => st.id === payment.studentId) ||
          payment.userId !== user.id)
      )
        fail(403, "Comprovante fora do seu acesso.");
      if (
        !payment.proofPath.startsWith(client.id + "/") ||
        !/^[-a-f0-9]+\.(png|jpg|webp|pdf)$/.test(
          payment.proofPath.slice(client.id.length + 1),
        )
      )
        fail(403, "Comprovante inválido.");
      return json(200, {
        ok: true,
        url: await receiptURL(base, headers, payment.proofPath),
      });
    }
    if (proofFile) {
      feature("finance");
      if (owner || scope) fail(403, "Envie pelo acesso do responsável.");
      const student = allowedStudent(body.studentId),
        charge = list(s.finance).find(
          (x) => x.id === body.chargeId && x.studentId === student.id,
        );
      if (
        !charge ||
        ["paid", "pago", "quitado"].includes(
          String(charge.status).toLowerCase(),
        )
      )
        fail(409, "Cobrança indisponível para pagamento.");
      if (
        list(s.schoolLife?.payments).some(
          (x) => x.chargeId === charge.id && x.status === "pending",
        )
      )
        fail(409, "Este pagamento já aguarda conferência.");
      text(body.reference, 200);
      uploadedReceipt = await uploadReceipt(
        base,
        headers,
        client.id,
        student.id,
        proofFile,
      );
    }
    let response = {},
      recipients = [],
      pushConfig = null;
    const notify = (studentIds, title, tab) => {
      const life = s.schoolLife;
      for (const studentId of new Set(studentIds)) {
        life.notifications = list(life.notifications);
        life.notifications.push({
          id: id + "-" + studentId,
          studentId,
          title,
          tab,
          at: now(),
        });
      }
      life.notifications = life.notifications.slice(-500);
    };
    if (action === "teacher-create") {
      requireOwner();
      feature("staff");
      const staff = list(s.staff).find((x) => x.id === body.staffId);
      if (!staff) fail(404, "Profissional não encontrado.");
      if (
        list(s.schoolLife?.teachers).some(
          (x) => x.staffId === staff.id && x.active !== false,
        )
      )
        fail(
          409,
          "Este professor já possui acesso. Revogue antes de criar outro.",
        );
      const email = text(body.email, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, "Informe um e-mail válido.");
      const generated = password();
      const r = await fetch(base + "/auth/v1/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password: generated,
          email_confirm: true,
          user_metadata: { full_name: staff.name },
          app_metadata: {
            bolt_school_id: client.id,
            bolt_school_role: "teacher",
          },
        }),
      });
      if (!r.ok)
        fail(
          409,
          "Não foi possível criar a conta. Verifique se o e-mail já está em uso.",
        );
      const auth = await r.json();
      createdUser = auth.id;
      if (!createdUser) fail(503, "Conta não confirmada.");
      response = {
        password: generated,
        email,
        login_url: "/teacher.html?slug=" + slug,
      };
    }
    if (action === "guardian-create") {
      requireOwner();
      feature("family");
      const guardian = text(body.guardian, 120),
        phone = normalizePhone(body.phone);
      if (!phone || !list(body.studentIds).length)
        fail(400, "Informe o responsável, WhatsApp e os alunos.");
      for (const studentId of body.studentIds) studentById(s, studentId);
      const generated = password(),
        email = crypto.randomUUID() + "@bolt-family.invalid";
      const r = await fetch(base + "/auth/v1/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password: generated,
          email_confirm: true,
          user_metadata: { full_name: guardian },
        }),
      });
      if (!r.ok) fail(503, "Não foi possível criar a conta do responsável.");
      const auth = await r.json();
      createdUser = auth.id;
      if (!createdUser) fail(503, "Conta não confirmada.");
      let username;
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = String(
          crypto.getRandomValues(new Uint32Array(1))[0] % 100000000,
        ).padStart(8, "0");
        const taken = await rest(
          "bolt_family_accounts?username=eq." + candidate + "&select=id",
        );
        if (!taken.length) {
          username = candidate;
          break;
        }
      }
      if (!username) fail(503, "Não foi possível reservar o código.");
      const studentId = "guardian-" + id;
      const account = {
        client_id: client.id,
        student_id: studentId,
        user_id: createdUser,
        username,
        auth_email: email,
        guardian_fingerprint: await guardianFingerprint({ guardian, phone }),
        version: 1,
        activated_at: null,
        created_at: now(),
        onboarding_secret: await seal(
          generated,
          key,
          client.id + ":" + studentId + ":" + username,
        ),
      };
      const saved = await rest("bolt_family_accounts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(account),
      });
      createdAccount = saved[0]?.id;
      if (!createdAccount) fail(503, "Acesso não confirmado.");
      response = {
        username,
        password: generated,
        phone,
        login_url: "/family.html?slug=" + slug,
      };
    }
    if (action === "push-enable") {
      requireOwner();
      feature("family");
      if (!s.schoolLife?.push) {
        const contact = clean(user.email, 254);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
          fail(400, "Seu perfil precisa de e-mail para ativar notificações.");
        pushConfig = await createPushKeys(key, client.id, contact);
      }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) {
        current = await snapshot();
        s = current.payload.schools[0];
        scope = teacherScope(s, user.id);
        children = accounts[0]
          ? await familyStudents(s, accounts[0], guardianFingerprint)
          : [];
        if (!owner && !scope && !children.length) fail(403, "Acesso revogado.");
      }
      if (
        requestId &&
        list(s.schoolLife?.operations).some(
          (x) => x.id === requestId && x.userId === user.id,
        )
      )
        fail(409, "Esta solicitação já foi confirmada. Atualize a lista.");
      const payload = structuredClone(current.payload);
      s = payload.schools[0];
      s.schoolLife ??= {};
      const life = s.schoolLife;
      recipients = [];
      switch (action) {
        case "teacher-create": {
          requireOwner();
          const staff = list(s.staff).find((x) => x.id === body.staffId);
          if (
            !staff ||
            list(life.teachers).some(
              (x) => x.staffId === body.staffId && x.active !== false,
            )
          )
            fail(409, "Acesso do professor foi alterado.");
          const subjects = list(body.subjects).map((x) => text(x, 100));
          if (!subjects.length) fail(400, "Informe as disciplinas permitidas.");
          life.teachers = list(life.teachers);
          life.teachers.push({
            staffId: staff.id,
            userId: createdUser,
            active: true,
            subjects,
            email: response.email,
          });
          break;
        }
        case "teacher-activate":
          requireOwner();
          life.teachers = list(life.teachers).map((x) =>
            x.userId === body.userId ? { ...x, active: true } : x,
          );
          break;
        case "teacher-revoke":
          requireOwner();
          life.teachers = list(life.teachers).map((x) =>
            x.userId === body.userId ? { ...x, active: false } : x,
          );
          break;
        case "guardian-create": {
          requireOwner();
          life.contacts = list(life.contacts);
          const students = [];
          for (const studentId of body.studentIds) {
            const st = studentById(s, studentId);
            students.push({
              id: st.id,
              fingerprint: await guardianFingerprint(st),
            });
          }
          life.contacts.push({
            id: "guardian-" + id,
            userId: createdUser,
            guardian: clean(body.guardian, 120),
            phone: normalizePhone(body.phone),
            students,
            active: true,
          });
          break;
        }
        case "family-link": {
          requireOwner();
          feature("family");
          const rows = await rest(
            "bolt_family_accounts?client_id=eq." +
              client.id +
              "&user_id=eq." +
              encodeURIComponent(text(body.userId, 100)) +
              "&select=*",
          );
          const account = rows[0];
          if (!account) fail(404, "Acesso não encontrado.");
          const students = [];
          for (const studentId of list(body.studentIds)) {
            const st = studentById(s, studentId);
            students.push({
              id: st.id,
              fingerprint: await guardianFingerprint(st),
            });
          }
          const contact = list(life.contacts).find(
            (x) => x.userId === account.user_id,
          );
          if (contact) contact.students = students;
          else {
            life.familyLinks = list(life.familyLinks).filter(
              (x) => x.userId !== account.user_id,
            );
            life.familyLinks.push({ userId: account.user_id, students });
          }
          break;
        }
        case "guardian-revoke": {
          requireOwner();
          life.revokedGuardians = [
            ...new Set([
              ...list(life.revokedGuardians),
              text(body.userId, 100),
            ]),
          ];
          life.contacts = list(life.contacts).map((x) =>
            x.userId === body.userId ? { ...x, active: false } : x,
          );
          life.familyLinks = list(life.familyLinks).filter(
            (x) => x.userId !== body.userId,
          );
          break;
        }
        case "routine": {
          feature("family");
          if (!owner && !scope) fail(403, "Apenas a escola registra a rotina.");
          const student = allowedStudent(body.studentId),
            date = checkDate(body.date);
          if (!owner && !scope.allows(student.classId))
            fail(403, "Turma não autorizada.");
          if (
            !["food", "sleep", "mood", "activity", "note"].some((k) =>
              clean(body[k]),
            )
          )
            fail(400, "Informe ao menos um detalhe da rotina.");
          const row = {
            id,
            studentId: student.id,
            date,
            food: clean(body.food, 120),
            sleep: clean(body.sleep, 120),
            mood: clean(body.mood, 120),
            activity: clean(body.activity, 800),
            note: clean(body.note, 1200),
            status: body.status === "draft" ? "draft" : "published",
            author: user.id,
            at: now(),
          };
          life.routines = list(life.routines).filter(
            (x) => !(x.studentId === student.id && x.date === date),
          );
          life.routines.push(row);
          if (row.status === "published")
            notify([student.id], "Rotina do dia publicada", "routines");
          break;
        }
        case "notice": {
          requireOwner();
          feature("messages");
          const classId = clean(body.classId, 100);
          if (classId && !list(s.classes).some((x) => x.id === classId))
            fail(400, "Turma inválida.");
          s.messages = list(s.messages);
          s.messages.push({
            id,
            title: text(body.title, 160),
            content: text(body.content, 3000),
            date: now().slice(0, 10),
            classId,
            kind: body.requiresConsent ? "authorization" : "notice",
            requiresConsent: body.requiresConsent === true,
            status: "published",
          });
          notify(
            list(s.students)
              .filter((x) => !classId || x.classId === classId)
              .map((x) => x.id),
            "Novo comunicado da escola",
            "messages",
          );
          break;
        }
        case "receipt": {
          feature("family");
          if (owner || scope)
            fail(403, "Confirmação exclusiva do responsável.");
          const student = allowedStudent(body.studentId);
          const message = list(s.messages).find(
            (x) =>
              x.id === body.messageId && visible(x, student) && published(x),
          );
          if (!message) fail(404, "Comunicado não encontrado.");
          const consent = message.requiresConsent ? body.consent : null;
          if (message.requiresConsent && typeof consent !== "boolean")
            fail(400, "Escolha autorizar ou não autorizar.");
          life.receipts = list(life.receipts).filter(
            (x) =>
              !(
                x.userId === user.id &&
                x.studentId === student.id &&
                x.messageId === message.id
              ),
          );
          life.receipts.push({
            id,
            userId: user.id,
            studentId: student.id,
            messageId: message.id,
            consent,
            at: now(),
          });
          break;
        }
        case "thread": {
          feature("family");
          if (owner || scope)
            fail(403, "A família inicia o atendimento pelo portal.");
          const student = allowedStudent(body.studentId),
            department = ["secretary", "coordination", "teacher"].includes(
              body.department,
            )
              ? body.department
              : "secretary";
          const staffId =
            department === "teacher" ? clean(body.staffId, 100) : "";
          if (
            department === "teacher" &&
            !list(s.schoolLife.teachers).some(
              (x) =>
                x.active !== false &&
                x.staffId === staffId &&
                teacherScope(s, x.userId)?.allows(student.classId),
            )
          )
            fail(400, "Selecione um professor vinculado à turma.");
          life.threads = list(life.threads);
          life.threads.push({
            id,
            userId: user.id,
            studentId: student.id,
            subject: text(body.subject, 160),
            department,
            staffId,
            status: "open",
            at: now(),
            messages: [
              {
                id,
                body: text(body.message, 3000),
                at: now(),
                from: "family",
                name: clean(
                  user.user_metadata?.full_name || "Responsável",
                  120,
                ),
              },
            ],
          });
          break;
        }
        case "reply": {
          feature("family");
          const thread = list(life.threads).find((x) => x.id === body.threadId);
          if (!thread) fail(404, "Atendimento não encontrado.");
          if (
            !owner &&
            !(
              scope &&
              thread.department === "teacher" &&
              thread.staffId === scope.staffId &&
              scope.allows(studentById(s, thread.studentId).classId)
            ) &&
            !(
              children.some((x) => x.id === thread.studentId) &&
              thread.userId === user.id
            )
          )
            fail(403, "Atendimento fora do seu acesso.");
          thread.messages = list(thread.messages);
          if (thread.messages.length >= 250)
            fail(400, "Este atendimento atingiu o limite. Abra um novo.");
          thread.messages.push({
            id,
            body: text(body.message, 3000),
            at: now(),
            from: owner || scope ? "school" : "family",
            name: clean(user.user_metadata?.full_name || "Escola", 120),
          });
          thread.status =
            owner || scope
              ? body.resolve
                ? "resolved"
                : "in_progress"
              : "open";
          if (owner || scope) {
            notify(
              [thread.studentId],
              "A escola respondeu sua mensagem",
              "conversations",
            );
            recipients.push(thread.userId);
          }
          break;
        }
        case "grading": {
          requireOwner();
          feature("grades");
          const passMark = Number(body.passMark);
          if (!Number.isFinite(passMark) || passMark < 0 || passMark > 10)
            fail(400, "Média deve estar entre 0 e 10.");
          life.grading = {
            passMark,
            recoveryRule:
              body.recoveryRule === "average" ? "average" : "highest",
          };
          s.teacherPublicationReview = body.requireReview === true;
          break;
        }
        case "pix-settings": {
          requireOwner();
          feature("finance");
          life.pix = {
            key: text(body.key, 77),
            receiver: text(body.receiver, 25),
            city: text(body.city, 15),
          };
          break;
        }
        case "payment-submit": {
          feature("finance");
          if (owner || scope)
            fail(403, "Informe o pagamento pelo acesso do responsável.");
          const student = allowedStudent(body.studentId),
            charge = list(s.finance).find(
              (x) => x.id === body.chargeId && x.studentId === student.id,
            );
          if (!charge) fail(404, "Cobrança não encontrada.");
          if (
            ["paid", "pago", "quitado"].includes(
              String(charge.status).toLowerCase(),
            )
          )
            fail(409, "Este pagamento já foi confirmado.");
          const existing = list(life.payments).find(
            (x) => x.chargeId === charge.id && x.status === "pending",
          );
          if (existing) fail(409, "Este pagamento já aguarda conferência.");
          life.payments = list(life.payments).filter(
            (x) => !(x.chargeId === charge.id && x.status !== "confirmed"),
          );
          life.payments.push({
            id,
            studentId: student.id,
            chargeId: charge.id,
            userId: user.id,
            reference: text(body.reference, 200),
            status: "pending",
            submittedAt: now(),
            ...(uploadedReceipt
              ? {
                  proofPath: uploadedReceipt.path,
                  proofName: uploadedReceipt.name,
                }
              : {}),
          });
          break;
        }
        case "payment-review": {
          requireOwner();
          feature("finance");
          if (typeof body.approve !== "boolean")
            fail(400, "Confirme a decisão sobre o pagamento.");
          const payment = list(life.payments).find(
            (x) => x.id === body.paymentId,
          );
          if (!payment) fail(404, "Pagamento não encontrado.");
          payment.status = body.approve ? "confirmed" : "rejected";
          payment.confirmedAt = body.approve ? now() : null;
          payment.reviewedBy = user.id;
          const charge = list(s.finance).find((x) => x.id === payment.chargeId);
          if (!charge) fail(404, "Cobrança não encontrada.");
          if (body.approve) charge.status = "Pago";
          notify(
            [payment.studentId],
            body.approve
              ? "Pagamento confirmado pela escola"
              : "Pagamento precisa de conferência",
            "finance",
          );
          break;
        }
        case "attendance": {
          feature("attendance");
          if (!owner && !scope) fail(403, "Apenas a escola registra chamadas.");
          const classroom = list(s.classes).find((x) => x.id === body.classId);
          if (!classroom || (!owner && !scope.allows(classroom.id)))
            fail(403, "Turma não autorizada.");
          if (!list(body.students).length)
            fail(400, "Selecione os alunos da chamada.");
          const date = checkDate(body.date);
          s.attendance = list(s.attendance);
          for (const item of list(body.students)) {
            const student = studentById(s, item.id);
            if (
              student.classId !== classroom.id ||
              !["P", "F"].includes(item.status)
            )
              fail(400, "Chamada inválida.");
            const previous = s.attendance.find(
                (x) =>
                  x.classId === classroom.id &&
                  x.studentId === student.id &&
                  x.date === date,
              ),
              wasAbsent = previous?.status === "F",
              row = {
                id: id + "-" + student.id,
                classId: classroom.id,
                studentId: student.id,
                date,
                status: item.status,
                teacherId: scope?.staffId || null,
              };
            if (previous) Object.assign(previous, { status: row.status });
            else s.attendance.push(row);
            if (item.status === "F" && !wasAbsent)
              notify([student.id], "Novo registro de frequência", "attendance");
          }
          break;
        }
        case "teacher-item": {
          if (!scope) fail(403, "Acesso do professor necessário.");
          feature("classes");
          const subject = text(body.subject, 100);
          if (!scope.allows(body.classId, subject))
            fail(403, "Turma ou disciplina não autorizada.");
          s.teacherItems = list(s.teacherItems);
          s.teacherItems.push({
            id,
            teacherId: scope.staffId,
            classId: body.classId,
            subject,
            type: body.type === "exam" ? "exam" : "task",
            title: text(body.title, 160),
            description: clean(body.description, 3000),
            due: checkDate(body.due),
            status:
              body.status === "draft"
                ? "draft"
                : s.teacherPublicationReview
                  ? "review"
                  : "published",
          });
          if (s.teacherItems.at(-1).status === "published")
            notify(
              list(s.students)
                .filter((x) => x.classId === body.classId)
                .map((x) => x.id),
              "Nova atividade da turma",
              "activities",
            );
          break;
        }
        case "teacher-grades": {
          if (!scope) fail(403, "Acesso do professor necessário.");
          feature("grades");
          const exam = list(s.teacherItems).find(
            (x) =>
              x.id === body.examId &&
              x.type === "exam" &&
              x.teacherId === scope.staffId,
          );
          if (!exam || !scope.allows(exam.classId, exam.subject))
            fail(403, "Prova não autorizada.");
          if (!list(body.grades).length)
            fail(400, "Preencha ao menos uma nota.");
          s.grades = list(s.grades);
          for (const item of list(body.grades)) {
            const student = studentById(s, item.studentId),
              score = Number(item.score),
              weight = Number(body.weight || 1);
            if (
              student.classId !== exam.classId ||
              !Number.isFinite(score) ||
              score < 0 ||
              score > 10 ||
              !Number.isFinite(weight) ||
              weight <= 0 ||
              weight > 100
            )
              fail(400, "Revise as notas e o peso.");
            const previous = s.grades.find(
              (x) => x.teacherExamId === exam.id && x.studentId === student.id,
            );
            const row = {
              studentId: student.id,
              teacherExamId: exam.id,
              subject: exam.subject,
              assessment: exam.title,
              period: text(body.period, 60),
              score,
              weight,
              isRecovery: body.isRecovery === true,
              publishStatus:
                body.publish === "published" && !s.teacherPublicationReview
                  ? "published"
                  : "draft",
            };
            if (previous) Object.assign(previous, row);
            else s.grades.push({ id: id + "-" + student.id, ...row });
            if (row.publishStatus === "published")
              notify([student.id], "Nova avaliação publicada", "grades");
          }
          break;
        }
        case "review-enqueue":
        case "review-approve":
        case "review-discard": {
          feature("grades");
          if (!scope) fail(403, "Acesso do professor necessário.");
          const exam = list(s.teacherItems).find(
            (x) =>
              x.id === body.examId &&
              x.teacherId === scope.staffId &&
              x.type === "exam",
          );
          if (!exam || !scope.allows(exam.classId, exam.subject))
            fail(403, "Prova não autorizada.");
          s.gradeReviewQueue = list(s.gradeReviewQueue);
          if (action === "review-enqueue") {
            const record = body.record || {},
              student = studentById(s, record.studentId);
            const score = Number(record.score),
              correct = Number(record.correct),
              total = Number(record.total);
            if (
              student.classId !== exam.classId ||
              !Number.isFinite(score) ||
              score < 0 ||
              score > 10 ||
              !Number.isInteger(total) ||
              total < 1 ||
              total > 200 ||
              !Number.isInteger(correct) ||
              correct < 0 ||
              correct > total
            )
              fail(400, "Revise o aluno e as respostas.");
            s.gradeReviewQueue = s.gradeReviewQueue.filter(
              (x) => !(x.examId === exam.id && x.studentId === student.id),
            );
            s.gradeReviewQueue.push({
              id,
              examId: exam.id,
              teacherId: scope.staffId,
              studentId: student.id,
              key: text(record.key, 4000),
              answers: text(record.answers, 4000),
              score,
              correct,
              total,
            });
          } else {
            const record = s.gradeReviewQueue.find(
              (x) =>
                x.id === body.reviewId &&
                x.examId === exam.id &&
                x.teacherId === scope.staffId,
            );
            if (
              !record ||
              studentById(s, record.studentId).classId !== exam.classId
            )
              fail(404, "Análise não encontrada.");
            if (action === "review-approve") {
              const review = body.review || {},
                score = Number(review.score);
              if (!Number.isFinite(score) || score < 0 || score > 10)
                fail(400, "Nota deve estar entre 0 e 10.");
              const grade = {
                studentId: record.studentId,
                teacherExamId: exam.id,
                subject: exam.subject,
                assessment: exam.title,
                period: text(review.period, 60),
                score,
                weight: 1,
                publishStatus:
                  review.publishStatus === "published" &&
                  !s.teacherPublicationReview
                    ? "published"
                    : "draft",
              };
              s.grades = list(s.grades);
              const previous = s.grades.find(
                (x) =>
                  x.teacherExamId === exam.id &&
                  x.studentId === record.studentId,
              );
              if (previous) Object.assign(previous, grade);
              else s.grades.push({ id, ...grade });
              if (grade.publishStatus === "published")
                notify(
                  [record.studentId],
                  "Nova avaliação publicada",
                  "grades",
                );
            }
            s.gradeReviewQueue = s.gradeReviewQueue.filter(
              (x) => x.id !== record.id,
            );
          }
          break;
        }
        case "publish-item": {
          requireOwner();
          const item = list(s.teacherItems).find((x) => x.id === body.itemId);
          if (!item) fail(404, "Atividade não encontrada.");
          item.status = "published";
          notify(
            list(s.students)
              .filter((x) => x.classId === item.classId)
              .map((x) => x.id),
            "Nova atividade da turma",
            "activities",
          );
          break;
        }
        case "publish-grades": {
          requireOwner();
          feature("grades");
          const affected = [];
          for (const g of list(s.grades).filter(
            (x) => x.teacherExamId === body.examId,
          )) {
            g.publishStatus = "published";
            affected.push(g.studentId);
          }
          notify(affected, "Nova avaliação publicada", "grades");
          break;
        }
        case "push-enable":
          requireOwner();
          feature("family");
          if (!life.push) life.push = pushConfig;
          break;
        case "push-subscribe": {
          feature("family");
          if (!children.length) fail(403, "Ative pelo Portal da Família.");
          if (!life.push)
            fail(400, "A escola ainda precisa ativar as notificações.");
          if (!validSubscription(body.subscription))
            fail(400, "Assinatura de notificações inválida.");
          life.subscriptions = list(life.subscriptions).filter(
            (x) => x.endpoint !== body.subscription.endpoint,
          );
          if (life.subscriptions.length >= 1000)
            fail(400, "Limite de dispositivos atingido.");
          life.subscriptions.push({
            endpoint: body.subscription.endpoint,
            keys: body.subscription.keys,
            userId: user.id,
            at: now(),
          });
          break;
        }
        case "push-remove":
          feature("family");
          life.subscriptions = list(life.subscriptions).filter(
            (x) => !(x.userId === user.id && x.endpoint === body.endpoint),
          );
          break;
        default:
          fail(400, "Ação inválida.");
      }
      if (requestId)
        life.operations = [
          ...list(life.operations),
          { id: requestId, userId: user.id },
        ].slice(-250);
      const raw = JSON.stringify(payload);
      if (new TextEncoder().encode(raw).length > 4 * 1024 * 1024)
        fail(
          413,
          "A escola atingiu o limite de dados. Exporte registros antigos antes de continuar.",
        );
      if (current.revision >= 2147483647)
        fail(409, "Limite de revisão atingido. Contate o suporte.");
      const saved = await fetch(
        base + "/rest/v1/" + statePath + "&revision=eq." + current.revision,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({
            payload,
            revision: current.revision + 1,
            updated_at: now(),
          }),
        },
      );
      if (!saved.ok) fail(503, "Falha ao salvar. Tente novamente.");
      const rows = await saved.json();
      if (!rows.length) continue;
      committed = true;
      if (
        list(life.notifications).some(
          (x) => typeof x.id === "string" && x.id.startsWith(id),
        )
      ) {
        const familyAccounts = await rest(
          "bolt_family_accounts?client_id=eq." + client.id + "&select=*",
        ).catch(() => []);
        const studentIds = list(life.notifications)
          .filter((x) => typeof x.id === "string" && x.id.startsWith(id))
          .map((x) => x.studentId);
        for (const account of familyAccounts) {
          const allowed = await familyStudents(s, account, guardianFingerprint);
          if (allowed.some((st) => studentIds.includes(st.id)))
            recipients.push(account.user_id);
        }
      }
      const deliver = deliverSchoolPush(
        s,
        client.id,
        key,
        new URL(request.url).origin,
        slug,
        [...new Set(recipients)],
      ).catch(() => {});
      if (context.waitUntil) context.waitUntil(deliver);
      else await deliver;
      return json(200, {
        ok: true,
        ...response,
        revision: current.revision + 1,
      });
    }
    fail(409, "Há outras alterações acontecendo. Tente novamente.");
  } catch (error) {
    if (uploadedReceipt && !committed) {
      const base = (env.SUPABASE_URL || "").replace(/\/$/, ""),
        secret = env.SUPABASE_SERVICE_ROLE_KEY;
      await removeReceipt(
        base,
        {
          apikey: secret,
          authorization: "Bearer " + secret,
          "content-type": "application/json",
        },
        uploadedReceipt.path,
      ).catch(() => {});
    }
    if (createdUser && !committed) {
      const base = (env.SUPABASE_URL || "").replace(/\/$/, ""),
        secret = env.SUPABASE_SERVICE_ROLE_KEY,
        headers = { apikey: secret, authorization: "Bearer " + secret };
      if (createdAccount)
        await fetch(
          base +
            "/rest/v1/bolt_family_accounts?id=eq." +
            encodeURIComponent(createdAccount),
          { method: "DELETE", headers },
        ).catch(() => {});
      await fetch(
        base + "/auth/v1/admin/users/" + encodeURIComponent(createdUser),
        { method: "DELETE", headers },
      ).catch(() => {});
    }
    return json(error.status || 503, {
      error: error.status
        ? error.message
        : "Não foi possível concluir. Tente novamente.",
    });
  }
}
