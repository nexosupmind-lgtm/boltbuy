export const list = (value) => (Array.isArray(value) ? value : []);
export const clean = (value, max = 200) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
export const visible = (row, student) =>
  (!row.studentId || row.studentId === student.id) &&
  (!row.classId || row.classId === student.classId);
export const published = (row) =>
  !["draft", "review", "cancelled"].includes(row.status) &&
  !["draft", "review"].includes(row.publishStatus);
export function teacherScope(s, userId) {
  const account = list(s.schoolLife?.teachers).find(
    (x) => x.userId === userId && x.active !== false,
  );
  if (!account || !list(s.staff).some((x) => x.id === account.staffId))
    return null;
  const assignments = list(s.teacherAssignments).filter(
    (x) => x.teacherId === account.staffId,
  );
  const classes = list(s.classes).filter(
    (c) =>
      c.teacherId === account.staffId ||
      assignments.some((x) => x.classId === c.id),
  );
  const subjects = (classId) => {
    const explicit = assignments
      .filter((x) => x.classId === classId)
      .flatMap((x) => list(x.subjects));
    return explicit.length ? explicit : list(account.subjects);
  };
  return {
    staffId: account.staffId,
    classes,
    subjects,
    allows(classId, subject) {
      return (
        classes.some((c) => c.id === classId) &&
        (!subject ||
          subjects(classId).some(
            (x) => x.toLowerCase() === clean(subject).toLowerCase(),
          ))
      );
    },
  };
}
export async function familyStudents(s, account, fingerprint) {
  const life = s.schoolLife || {};
  if (list(life.revokedGuardians).includes(account.user_id)) return [];
  const anchor = list(s.students).find((x) => x.id === account.student_id);
  const contact = list(life.contacts).find(
    (x) =>
      x.id === account.student_id &&
      x.userId === account.user_id &&
      x.active !== false,
  );
  const authorized = anchor
    ? (await fingerprint(anchor)) === account.guardian_fingerprint
    : contact && (await fingerprint(contact)) === account.guardian_fingerprint;
  if (!authorized) return [];
  const links = list(life.familyLinks).find(
    (x) => x.userId === account.user_id,
  );
  const refs = contact ? list(contact.students) : list(links?.students);
  const result = anchor ? [anchor] : [];
  for (const ref of refs) {
    const student = list(s.students).find((x) => x.id === ref.id);
    if (
      student &&
      (await fingerprint(student)) === ref.fingerprint &&
      !result.some((x) => x.id === student.id)
    )
      result.push(student);
  }
  return result;
}
export function gradeSummary(grades, settings = {}) {
  const groups = new Map(),
    minimum = Number.isFinite(Number(settings.passMark))
      ? Number(settings.passMark)
      : 6;
  for (const g of list(grades)) {
    if (
      g.score === null ||
      g.score === undefined ||
      String(g.score).trim() === ""
    )
      continue;
    const score = Number(String(g.score).replace(",", ".")),
      weight = Number(g.weight || 1);
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10 ||
      !Number.isFinite(weight) ||
      weight <= 0
    )
      continue;
    const key = JSON.stringify([
      g.subject || "Geral",
      g.period || "Sem período",
    ]);
    if (!groups.has(key))
      groups.set(key, {
        subject: g.subject || "Geral",
        period: g.period || "Sem período",
        total: 0,
        weight: 0,
        recovery: null,
        count: 0,
      });
    const row = groups.get(key);
    if (g.isRecovery === true || g.type === "recovery") {
      row.recovery = Math.max(row.recovery ?? 0, score);
      continue;
    }
    row.total += score * weight;
    row.weight += weight;
    row.count++;
  }
  return [...groups.values()].map((row) => {
    const average = row.weight ? row.total / row.weight : null;
    const final =
      average === null
        ? row.recovery
        : row.recovery === null
          ? average
          : settings.recoveryRule === "average"
            ? (average + row.recovery) / 2
            : Math.max(average, row.recovery);
    return {
      subject: row.subject,
      period: row.period,
      count: row.count,
      average: average === null ? null : Number(average.toFixed(2)),
      recovery: row.recovery,
      final: final === null ? null : Number(final.toFixed(2)),
      status:
        final === null
          ? "Sem notas"
          : final >= minimum
            ? "Dentro da média"
            : "Requer acompanhamento",
      passMark: minimum,
    };
  });
}
function emv(id, value) {
  return (
    id + String(new TextEncoder().encode(value).length).padStart(2, "0") + value
  );
}
export function isChargeOpen(charge) {
  const amount = Number(charge?.amount);
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    ![
      "paid",
      "pago",
      "quitado",
      "cancelled",
      "canceled",
      "cancelado",
      "cancelada",
      "quitada",
    ].includes(clean(charge.status).toLowerCase())
  );
}
export function pixPayload(config, charge) {
  const key = clean(config?.key, 77),
    amount = Number(charge.amount);
  if (!key || !isChargeOpen(charge)) return "";
  const ascii = (v, max) =>
    clean(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 .-]/gi, "")
      .toUpperCase()
      .slice(0, max);
  const receiver = ascii(config.receiver, 25),
    city = ascii(config.city, 15);
  if (!receiver || !city) return "";
  const txid =
    clean(charge.id)
      .replace(/[^a-z0-9]/gi, "")
      .slice(-25) || "***";
  const body =
    emv("00", "01") +
    emv("26", emv("00", "br.gov.bcb.pix") + emv("01", key)) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", amount.toFixed(2)) +
    emv("58", "BR") +
    emv("59", receiver) +
    emv("60", city) +
    emv("62", emv("05", txid)) +
    "6304";
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(body)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return body + crc.toString(16).toUpperCase().padStart(4, "0");
}
export function familyLife(s, student, userId) {
  const life = s.schoolLife || {};
  const messages = list(s.messages)
    .filter((x) => visible(x, student) && published(x))
    .map((x) => ({
      id: x.id,
      title: x.title,
      content: x.content,
      date: x.date,
      kind: x.kind || "notice",
      requiresConsent: x.requiresConsent === true,
      receipt:
        list(life.receipts).find(
          (r) =>
            r.messageId === x.id &&
            r.studentId === student.id &&
            r.userId === userId,
        ) || null,
    }));
  return {
    messages,
    pushPublicKey: life.push?.publicKey || null,
    teachers: list(life.teachers)
      .filter(
        (t) =>
          t.active !== false &&
          teacherScope(s, t.userId)?.allows(student.classId),
      )
      .map((t) => ({
        id: t.staffId,
        name:
          list(s.staff).find((x) => x.id === t.staffId)?.name || "Professor",
      })),
    routines: list(life.routines)
      .filter((x) => x.studentId === student.id && x.status === "published")
      .map(({ id, date, food, sleep, mood, activity, note }) => ({
        id,
        date,
        food,
        sleep,
        mood,
        activity,
        note,
      }))
      .sort((a, b) => String(b.date).localeCompare(a.date)),
    conversations: list(life.threads)
      .filter((x) => x.userId === userId && x.studentId === student.id)
      .map((x) => ({
        id: x.id,
        subject: x.subject,
        department: x.department,
        status: x.status,
        messages: list(x.messages).map(({ id, body, at, from, name }) => ({
          id,
          body,
          at,
          from,
          name,
        })),
      })),
    finance: list(s.finance)
      .filter((x) => x.studentId === student.id)
      .map((x) => {
        const payments = list(life.payments).filter(
          (p) => p.chargeId === x.id && p.studentId === student.id,
        );
        const proof = payments.at(-1);
        const projectProof = (p) => ({
          id: p.id,
          hasProof: !!p.proofPath && p.userId === userId,
          status: p.status,
          submittedAt: p.submittedAt,
          confirmedAt: p.confirmedAt,
          reference: p.userId === userId ? p.reference : undefined,
        });
        return {
          id: x.id,
          description: x.description,
          amount: Number(x.amount) || 0,
          due: x.due,
          status: x.status,
          pix: pixPayload(life.pix, x),
          confirmation: proof ? projectProof(proof) : null,
          proofHistory: payments
            .filter((p) => p.userId === userId)
            .slice(-20)
            .reverse()
            .map(projectProof),
        };
      }),
    gradeSummary: gradeSummary(
      list(s.grades).filter(
        (x) =>
          x.studentId === student.id &&
          published(x) &&
          (!x.teacherExamId || x.publishStatus === "published"),
      ),
      life.grading,
    ),
    notifications: list(life.notifications)
      .filter((x) => x.studentId === student.id)
      .slice(-40)
      .reverse()
      .map(({ id, title, at, tab }) => ({ id, title, at, tab })),
  };
}
export function schoolAlerts(s) {
  const alerts = [],
    today = new Date().toISOString().slice(0, 10),
    life = s.schoolLife || {};
  for (const st of list(s.students)) {
    const recent = list(s.attendance)
      .filter((x) => x.studentId === st.id)
      .sort((a, b) => String(b.date).localeCompare(a.date));
    if (recent.slice(0, 2).filter((x) => x.status === "F").length >= 2)
      alerts.push({
        type: "attendance",
        studentId: st.id,
        name: st.name,
        text: "Duas faltas nas últimas chamadas",
        page: "attendance",
      });
    if (!st.guardian || !st.phone || !st.birth || !st.classId)
      alerts.push({
        type: "registration",
        studentId: st.id,
        name: st.name,
        text: "Cadastro com dados pendentes",
        page: "students",
      });
  }
  for (const doc of list(s.documents).filter(
    (x) => x.status && /pendente|pending/i.test(x.status),
  ))
    alerts.push({
      type: "document",
      name: doc.name || doc.title || "Documento",
      text: "Documento pendente",
      page: "documents",
    });
  for (const charge of list(s.finance).filter(
    (x) =>
      x.due &&
      x.due < today &&
      isChargeOpen(x),
  ))
    alerts.push({
      type: "finance",
      name:
        list(s.students).find((x) => x.id === charge.studentId)?.name ||
        "Mensalidade",
      text: "Vencimento em " + charge.due,
      page: "finance",
    });
  for (const thread of list(life.threads).filter(
    (x) =>
      x.status !== "resolved" && list(x.messages).at(-1)?.from === "family",
  ))
    alerts.push({
      type: "message",
      name: thread.subject,
      text: "Família aguardando resposta",
      page: "school-life",
    });
  return alerts;
}
