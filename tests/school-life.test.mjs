import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../server/school-life.js";
import { guardianFingerprint } from "../server/family.js";
import {
  familyStudents,
  gradeSummary,
  pixPayload,
  familyLife,
  schoolAlerts,
} from "../server/school-life-model.js";
import { recordSchoolChanges } from "../server/school-life-notifications.js";
import {
  createPushKeys,
  encryptPush,
  decode,
  encode,
  validSubscription,
  sendPush,
} from "../server/school-push.js";
const clientId = "00000000-0000-4000-8000-000000000001";
async function harness() {
  let actor = "owner",
    revision = 1,
    races = 0,
    uid = 0,
    features = null;
  const accounts = [],
    deleted = [],
    users = new Map(),
    calls = [];
  let school = {
    id: clientId,
    slug: "escola-a",
    name: "Escola A",
    students: [
      {
        id: "s1",
        name: "Alice",
        classId: "c1",
        guardian: "Ana",
        phone: "62999991234",
        birth: "2018-01-01",
        health: "private",
      },
      {
        id: "s2",
        name: "Bob",
        classId: "c2",
        guardian: "Maria",
        phone: "62988885678",
        birth: "2019-01-01",
      },
    ],
    staff: [
      { id: "p1", name: "Professora A", email: "prof@example.test" },
      { id: "p2", name: "Professor B", email: "other@example.test" },
    ],
    classes: [
      { id: "c1", name: "1º A", teacherId: "p1" },
      { id: "c2", name: "2º B", teacherId: "p2" },
    ],
    teacherAssignments: [
      { teacherId: "p1", classId: "c1", subjects: ["Matemática"] },
    ],
    teacherItems: [
      {
        id: "e1",
        teacherId: "p1",
        classId: "c1",
        type: "exam",
        subject: "Matemática",
        title: "Prova",
        status: "published",
      },
    ],
    attendance: [],
    grades: [],
    finance: [
      {
        id: "fee1",
        studentId: "s1",
        description: "Mensalidade",
        amount: 100,
        due: "2026-01-01",
        status: "Pendente",
      },
      { id: "fee2", studentId: "s2", amount: 500, status: "Pendente" },
    ],
    messages: [
      {
        id: "m1",
        classId: "c1",
        title: "Passeio",
        content: "Autorize",
        requiresConsent: true,
        status: "published",
      },
      { id: "draft", title: "Segredo", status: "draft" },
    ],
    calendar: [],
    schoolLife: {
      teachers: [
        {
          userId: "teacher",
          staffId: "p1",
          active: true,
          subjects: ["Matemática"],
        },
      ],
    },
  };
  accounts.push({
    id: "account1",
    client_id: clientId,
    user_id: "parent",
    student_id: "s1",
    username: "12345678",
    guardian_fingerprint: await guardianFingerprint(school.students[0]),
    version: 1,
  });
  const response = (data, status = 200) => Response.json(data, { status });
  const matches = (row, q) =>
    [...q].every(
      ([k, v]) =>
        k === "select" ||
        k === "limit" ||
        !v.startsWith("eq.") ||
        String(row[k]) === v.slice(3),
    );
  async function mock(input, options = {}) {
    const url = new URL(input),
      body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, options, body });
    if (url.pathname.startsWith("/auth/v1/admin/users/") && !options.method) {
      const id = url.pathname.split("/").at(-1);
      return response({
        id,
        app_metadata: {
          bolt_school_id: id === "teacher" ? clientId : "other-school",
          bolt_school_role: "teacher",
        },
      });
    }
    if (url.pathname === "/auth/v1/user")
      return actor === "unknown"
        ? response({}, 401)
        : response({
            id: actor,
            email: actor + "@example.test",
            user_metadata: { full_name: actor },
          });
    if (url.pathname === "/auth/v1/admin/users" && options.method === "POST") {
      const id = "created-" + ++uid;
      users.set(id, body);
      return response({ id }, 201);
    }
    if (
      url.pathname === "/auth/v1/admin/users/teacher" &&
      options.method === "PUT"
    ) {
      users.set("teacher", body);
      return response({ id: "teacher" });
    }
    if (
      url.pathname.startsWith("/auth/v1/admin/users/") &&
      options.method === "DELETE"
    ) {
      deleted.push(url.pathname.split("/").at(-1));
      users.delete(deleted.at(-1));
      return response({});
    }
    const table = url.pathname.split("/").at(-1);
    if (table === "bolt_commercial_clients")
      return response([
        { id: clientId, name: "Escola A", slug: "escola-a", status: "active" },
      ]);
    if (table === "bolt_commercial_memberships")
      return response(
        actor === "owner" ? [{ user_id: "owner", role: "owner" }] : [],
      );
    if (table === "bolt_client_subscriptions")
      return response(features ? [{ plan_id: "p" }] : []);
    if (table === "bolt_platform_plans") return response([{ features }]);
    if (table === "bolt_family_accounts") {
      if (options.method === "POST") {
        const row = { id: "account-" + accounts.length, ...body };
        accounts.push(row);
        return response([row], 201);
      }
      if (options.method === "DELETE") {
        const i = accounts.findIndex((x) => matches(x, url.searchParams));
        if (i >= 0) accounts.splice(i, 1);
        return new Response(null, { status: 204 });
      }
      return response(
        structuredClone(accounts.filter((x) => matches(x, url.searchParams))),
      );
    }
    assert.equal(table, "bolt_commercial_workspaces");
    if (!options.method)
      return response([
        {
          revision,
          payload: { schools: [structuredClone(school)], logs: [], plans: [] },
        },
      ]);
    if (options.method === "PATCH") {
      if (races > 0) {
        races--;
        revision++;
        return response([]);
      }
      if (url.searchParams.get("revision") !== "eq." + revision)
        return response([]);
      school = structuredClone(body.payload.schools[0]);
      revision = body.revision;
      return response([{ revision, payload: body.payload }]);
    }
    throw Error("Unexpected request");
  }
  return {
    accounts,
    users,
    deleted,
    calls,
    get school() {
      return school;
    },
    setActor(value) {
      actor = value;
    },
    race(count = 1) {
      races = count;
    },
    features(value) {
      features = value;
    },
    async request(action, body = {}) {
      const previous = globalThis.fetch;
      globalThis.fetch = mock;
      try {
        return await onRequest({
          request: new Request(
            "https://bolt.test/api/school-life?slug=escola-a",
            {
              method: action ? "POST" : "GET",
              headers: { authorization: "Bearer token" },
              ...(action ? { body: JSON.stringify({ action, ...body }) } : {}),
            },
          ),
          env: {
            SUPABASE_URL: "https://project.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "server-secret",
          },
        });
      } finally {
        globalThis.fetch = previous;
      }
    },
  };
}
test("Teacher GET excludes guardian contact, health, finances, other classes and other subjects", async () => {
  const h = await harness();
  h.setActor("teacher");
  const r = await h.request(),
    d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.role, "teacher");
  assert.deepEqual(
    d.students.map((x) => x.id),
    ["s1"],
  );
  const raw = JSON.stringify(d);
  for (const value of ["62999991234", "private", "Maria", "fee2"])
    assert(!raw.includes(value));
});
test("Teacher actions reject another class, unassigned subject and owner configuration", async () => {
  const h = await harness();
  h.setActor("teacher");
  assert.equal(
    (
      await h.request("attendance", {
        classId: "c2",
        date: "2026-11-04",
        students: [{ id: "s2", status: "P" }],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request("teacher-item", {
        classId: "c1",
        subject: "Português",
        title: "Aula",
        due: "2026-11-04",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request("teacher-create", {
        staffId: "p2",
        email: "bad@example.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (await h.request("pix-settings", { key: "anything" })).status,
    403,
  );
});
test("Chamada saves atomically, retries CAS, emits absence only on a change, and is idempotent", async () => {
  const h = await harness();
  h.setActor("teacher");
  h.race();
  const payload = {
    classId: "c1",
    date: "2026-11-04",
    students: [{ id: "s1", status: "F" }],
    requestId: "11111111-1111-1111-1111-111111111111",
  };
  assert.equal((await h.request("attendance", payload)).status, 200);
  assert.equal(h.school.attendance.length, 1);
  assert.equal(h.school.schoolLife.notifications.length, 1);
  assert.equal((await h.request("attendance", payload)).status, 200);
  assert.equal(h.school.attendance.length, 1);
  assert.equal(
    (await h.request("attendance", { ...payload, requestId: undefined }))
      .status,
    200,
  );
  assert.equal(h.school.schoolLife.notifications.length, 1);
});
test("Publication review keeps teacher work hidden until owner approval", async () => {
  const h = await harness();
  h.school.teacherPublicationReview = true;
  h.setActor("teacher");
  assert.equal(
    (
      await h.request("teacher-item", {
        classId: "c1",
        subject: "Matemática",
        type: "task",
        title: "Tarefa",
        due: "2026-11-05",
        status: "published",
      })
    ).status,
    200,
  );
  const item = h.school.teacherItems.at(-1);
  assert.equal(item.status, "review");
  assert.equal(
    (
      await h.request("teacher-grades", {
        examId: "e1",
        period: "1º Bimestre",
        weight: 2,
        publish: "published",
        grades: [{ studentId: "s1", score: 8 }],
      })
    ).status,
    200,
  );
  assert.equal(h.school.grades[0].publishStatus, "draft");
  h.setActor("owner");
  assert.equal(
    (await h.request("publish-item", { itemId: item.id })).status,
    200,
  );
  assert.equal(h.school.teacherItems.at(-1).status, "published");
  assert.equal(
    (await h.request("publish-grades", { examId: "e1" })).status,
    200,
  );
  assert.equal(h.school.grades[0].publishStatus, "published");
});
test("Professor photo review queue requires human approval before a grade is recorded", async () => {
  const h = await harness();
  h.setActor("teacher");
  const result = await h.request("review-enqueue", {
    examId: "e1",
    record: {
      studentId: "s1",
      key: "01 A",
      answers: "01 A",
      score: 10,
      correct: 1,
      total: 1,
    },
  });
  assert.equal(result.status, 200);
  assert.equal(h.school.grades.length, 0);
  const item = h.school.gradeReviewQueue[0];
  assert.equal(
    (
      await h.request("review-approve", {
        examId: "e1",
        reviewId: item.id,
        review: { score: 9, period: "2º Bimestre", publishStatus: "published" },
      })
    ).status,
    200,
  );
  assert.equal(h.school.grades[0].score, 9);
  assert.equal(h.school.gradeReviewQueue.length, 0);
});
test("Family may acknowledge or decline only a published notice addressed to its own child", async () => {
  const h = await harness();
  h.setActor("parent");
  assert.equal(
    (
      await h.request("receipt", {
        studentId: "s2",
        messageId: "m1",
        consent: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (await h.request("receipt", { studentId: "s1", messageId: "draft" }))
      .status,
    404,
  );
  assert.equal(
    (await h.request("receipt", { studentId: "s1", messageId: "m1" })).status,
    400,
  );
  assert.equal(
    (
      await h.request("receipt", {
        studentId: "s1",
        messageId: "m1",
        consent: false,
      })
    ).status,
    200,
  );
  assert.equal(h.school.schoolLife.receipts[0].consent, false);
});
test("Routine drafts stay private while published routine reaches only the selected family", async () => {
  const h = await harness();
  h.setActor("teacher");
  assert.equal(
    (
      await h.request("routine", {
        studentId: "s1",
        date: "2026-11-04",
        food: "Bem",
        activity: "Leitura",
        status: "draft",
      })
    ).status,
    200,
  );
  assert.equal(
    familyLife(h.school, h.school.students[0], "parent").routines.length,
    0,
  );
  assert.equal(
    (
      await h.request("routine", {
        studentId: "s1",
        date: "2026-11-04",
        food: "Bem",
        activity: "Leitura",
        status: "published",
      })
    ).status,
    200,
  );
  assert.equal(
    familyLife(h.school, h.school.students[0], "parent").routines.length,
    1,
  );
  assert.equal(
    familyLife(h.school, h.school.students[1], "other").routines.length,
    0,
  );
});
test("Family conversation is private, teacher sees only addressed threads and an unrelated guardian cannot reply", async () => {
  const h = await harness();
  h.setActor("parent");
  assert.equal(
    (
      await h.request("thread", {
        studentId: "s1",
        subject: "Dúvida",
        department: "secretary",
        message: "Preciso conversar.",
      })
    ).status,
    200,
  );
  const thread = h.school.schoolLife.threads[0];
  h.setActor("teacher");
  assert.equal((await (await h.request()).json()).threads.length, 0);
  assert.equal(
    (await h.request("reply", { threadId: thread.id, message: "No access" }))
      .status,
    403,
  );
  h.setActor("owner");
  assert.equal(
    (
      await h.request("reply", {
        threadId: thread.id,
        message: "Vamos ajudar.",
        resolve: true,
      })
    ).status,
    200,
  );
  assert.equal(h.school.schoolLife.threads[0].status, "resolved");
});
test("Sibling linkage requires owner approval and is revoked by changed guardian records", async () => {
  const h = await harness();
  h.setActor("parent");
  assert.equal(
    (await h.request("family-link", { userId: "parent", studentIds: ["s2"] }))
      .status,
    403,
  );
  h.setActor("owner");
  assert.equal(
    (await h.request("family-link", { userId: "parent", studentIds: ["s2"] }))
      .status,
    200,
  );
  assert.deepEqual(
    (await familyStudents(h.school, h.accounts[0], guardianFingerprint)).map(
      (x) => x.id,
    ),
    ["s1", "s2"],
  );
  h.school.students[1].guardian = "Alterado";
  assert.deepEqual(
    (await familyStudents(h.school, h.accounts[0], guardianFingerprint)).map(
      (x) => x.id,
    ),
    ["s1"],
  );
});
test("Additional guardian gets a numeric account, restricted child list and can be revoked independently", async () => {
  const h = await harness();
  const r = await h.request("guardian-create", {
    guardian: "Pai da Alice",
    phone: "62977776666",
    studentIds: ["s1"],
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.match(d.username, /^\d{8}$/);
  assert.equal(d.password.length, 10);
  const account = h.accounts.find((x) => x.username === d.username);
  assert.deepEqual(
    (await familyStudents(h.school, account, guardianFingerprint)).map(
      (x) => x.id,
    ),
    ["s1"],
  );
  assert.equal(
    (await h.request("guardian-revoke", { userId: account.user_id })).status,
    200,
  );
  assert.equal(
    (await familyStudents(h.school, account, guardianFingerprint)).length,
    0,
  );
  assert.equal(
    (await familyStudents(h.school, h.accounts[0], guardianFingerprint)).length,
    1,
  );
});
test("Failed account binding cleans up only the newly created Auth account", async () => {
  const h = await harness();
  h.race(10);
  assert.equal(
    (
      await h.request("teacher-create", {
        staffId: "p2",
        email: "new@example.test",
        subjects: ["Português"],
      })
    ).status,
    409,
  );
  assert.equal(h.users.size, 0);
  assert.equal(h.deleted.length, 1);
});
test("Reporting Pix payment never marks a charge paid until owner checks it", async () => {
  const h = await harness();
  h.setActor("parent");
  assert.equal(
    (
      await h.request("payment-submit", {
        studentId: "s1",
        chargeId: "fee1",
        reference: "bank-tx-1",
      })
    ).status,
    200,
  );
  assert.equal(h.school.finance[0].status, "Pendente");
  const payment = h.school.schoolLife.payments[0];
  assert.equal(
    (
      await h.request("payment-review", {
        paymentId: payment.id,
        approve: true,
      })
    ).status,
    403,
  );
  h.setActor("owner");
  assert.equal(
    (
      await h.request("payment-review", {
        paymentId: payment.id,
        approve: true,
      })
    ).status,
    200,
  );
  assert.equal(h.school.finance[0].status, "Pago");
  assert.equal(
    familyLife(h.school, h.school.students[0], "parent").finance.length,
    1,
  );
});
test("Plan permissions reject writes to excluded modules before saving", async () => {
  const h = await harness();
  h.features(["family"]);
  h.setActor("parent");
  assert.equal(
    (
      await h.request("payment-submit", {
        studentId: "s1",
        chargeId: "fee1",
        reference: "x",
      })
    ).status,
    403,
  );
  assert.equal(h.school.schoolLife.payments, undefined);
});
test("Boletim honors weights, periods, missing grades and both recovery rules", () => {
  const grades = [
    { subject: "Mat", period: "1", score: 4, weight: 1 },
    { subject: "Mat", period: "1", score: 8, weight: 3 },
    { subject: "Mat", period: "1", score: 9, isRecovery: true },
    { subject: "Mat", period: "2", score: 2, weight: 1 },
    { subject: "Other", score: null },
  ];
  const rows = gradeSummary(grades, { passMark: 6, recoveryRule: "highest" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].average, 7);
  assert.equal(rows[0].final, 9);
  assert.equal(rows[1].status, "Requer acompanhamento");
  assert.equal(gradeSummary(grades, { recoveryRule: "average" })[0].final, 8);
});
test("Pix payload contains school receiver, exact charge amount and valid CRC", () => {
  const p = pixPayload(
    { key: "financeiro@example.test", receiver: "Escola A", city: "Inhumas" },
    { id: "fee1", amount: 123.45 },
  );
  assert(p.includes("123.45"));
  assert(p.includes("ESCOLA A"));
  assert(p.endsWith(p.slice(-4).toUpperCase()));
  assert.equal(pixPayload({}, { amount: 123 }), "");
});
test("Push endpoints reject arbitrary URLs, credentials and malformed encryption keys", () => {
  for (const endpoint of [
    "http://fcm.googleapis.com/a",
    "https://evil.example/a",
    "https://fcm.googleapis.com.evil.example/a",
    "https://user:pass@web.push.apple.com/a",
  ]) {
    assert.equal(
      validSubscription({
        endpoint,
        keys: {
          p256dh: encode(new Uint8Array(65)),
          auth: encode(new Uint8Array(16)),
        },
      }),
      false,
    );
  }
});
test("Web Push payload decrypts at the subscriber with a valid delimiter and VAPID signature", async () => {
  const receiver = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", receiver.publicKey),
    ),
    auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription = {
    endpoint: "https://web.push.apple.com/test",
    keys: { p256dh: encode(raw), auth: encode(auth) },
  };
  assert(validSubscription(subscription));
  const payload = { title: "Novidades", body: "Abra o portal" };
  const encrypted = await encryptPush(subscription, payload),
    sender = encrypted.slice(21, 86),
    salt = encrypted.slice(0, 16);
  const pub = await crypto.subtle.importKey(
    "raw",
    sender,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: pub },
      receiver.privateKey,
      256,
    ),
    encoder = new TextEncoder();
  const concat = (...a) => new Uint8Array(a.flatMap((x) => [...x]));
  const derive = async (ikm, salt, info, n) =>
    crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]),
      n * 8,
    );
  const ikm = await derive(
    secret,
    auth,
    concat(encoder.encode("WebPush: info\0"), raw, sender),
    32,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    await derive(
      ikm,
      salt,
      encoder.encode("Content-Encoding: aes128gcm\0"),
      16,
    ),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: await derive(
          ikm,
          salt,
          encoder.encode("Content-Encoding: nonce\0"),
          12,
        ),
      },
      key,
      encrypted.slice(86),
    ),
  );
  assert.equal(plain.at(-1), 2);
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(plain.slice(0, -1))),
    payload,
  );
  const config = await createPushKeys(
      "server-secret",
      "school-a",
      "school@example.test",
    ),
    original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const value = options.headers.Authorization;
    const jwt = value.match(/t=([^,]+)/)[1],
      parts = jwt.split(".");
    const verifier = await crypto.subtle.importKey(
      "raw",
      decode(config.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    assert(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        verifier,
        decode(parts[2]),
        encoder.encode(parts[0] + "." + parts[1]),
      ),
    );
    assert.equal(
      JSON.parse(new TextDecoder().decode(decode(parts[1]))).aud,
      "https://web.push.apple.com",
    );
    return new Response(null, { status: 201 });
  };
  try {
    assert.equal(
      (
        await sendPush(
          subscription,
          config,
          "server-secret",
          "school-a",
          payload,
        )
      ).status,
      201,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("Traditional administrator edits generate notifications for affected children only", () => {
  const before = {
    students: [
      { id: "s1", classId: "c1" },
      { id: "s2", classId: "c2" },
    ],
    messages: [],
    grades: [],
    attendance: [],
  };
  const next = structuredClone(before);
  next.messages = [
    { id: "m1", classId: "c1", title: "Aviso", content: "Texto" },
  ];
  assert.deepEqual(recordSchoolChanges(before, next, 2), ["s1"]);
  assert.equal(next.schoolLife.notifications[0].tab, "messages");
});
test("Operational dashboard detects actionable missing registration, absence and overdue finance", async () => {
  const h = await harness();
  h.school.students[0].birth = "";
  h.school.attendance = [
    { studentId: "s1", date: "2026-11-02", status: "F" },
    { studentId: "s1", date: "2026-11-03", status: "F" },
  ];
  const types = schoolAlerts(h.school).map((x) => x.type);
  for (const type of ["registration", "attendance", "finance"])
    assert(types.includes(type));
});
test("Comprovantes stay in a private bucket and signed links expire without exposing arbitrary storage", async () => {
  const { uploadReceipt, receiptURL } =
    await import("../server/school-receipts.js");
  const previous = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (input, options = {}) => {
    calls.push({ input, options });
    if (input.endsWith("/bucket/bolt-school-receipts"))
      return Response.json({ public: false });
    if (input.includes("/object/sign/")) {
      assert.equal(JSON.parse(options.body).expiresIn, 300);
      return Response.json({
        signedURL:
          "/object/sign/bolt-school-receipts/" +
          clientId +
          "/abc.png?token=temporary",
      });
    }
    assert.equal(options.headers["content-type"], "image/png");
    return Response.json({});
  };
  try {
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "receipt.png",
      { type: "image/png" },
    );
    const proof = await uploadReceipt(
      "https://project.supabase.co",
      { "content-type": "application/json" },
      clientId,
      "../../other-client",
      file,
    );
    assert.match(proof.path, new RegExp("^" + clientId + "/[a-f0-9-]+.png$"));
    assert(!proof.path.includes("other-client"));
    const signed = await receiptURL(
      "https://project.supabase.co",
      {},
      proof.path,
    );
    assert(
      signed.startsWith("https://project.supabase.co/storage/v1/object/sign/"),
    );
    assert(!calls.some((c) => c.input.includes("/object/public/")));
  } finally {
    globalThis.fetch = previous;
  }
});
test("Public bucket configuration rejects proof uploads before any file is stored", async () => {
  const { uploadReceipt } = await import("../server/school-receipts.js");
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ public: true });
  try {
    await assert.rejects(
      uploadReceipt(
        "https://project.supabase.co",
        {},
        clientId,
        "s1",
        new File(["%PDF-test"], "r.pdf", { type: "application/pdf" }),
      ),
      /privado/,
    );
  } finally {
    globalThis.fetch = previous;
  }
});
test("An unassigned teacher and another family cannot obtain a proof link", async () => {
  const h = await harness();
  h.school.schoolLife.payments = [
    {
      id: "proof1",
      studentId: "s1",
      userId: "other-parent",
      proofPath: clientId + "/11111111-1111-4111-8111-111111111111.png",
    },
  ];
  h.setActor("parent");
  assert.equal(
    (await h.request("payment-proof-url", { paymentId: "proof1" })).status,
    403,
  );
  h.setActor("teacher");
  assert.equal(
    (await h.request("payment-proof-url", { paymentId: "proof1" })).status,
    403,
  );
});
test("Only the school owner can reset an active teacher password and revoked access blocks the old session", async () => {
  const h = await harness();
  h.school.schoolLife.teachers[0].email = "teacher@example.test";
  h.setActor("teacher");
  assert.equal(
    (await h.request("teacher-reset", { userId: "teacher" })).status,
    403,
  );
  h.setActor("owner");
  const reset = await h.request("teacher-reset", { userId: "teacher" });
  assert.equal(reset.status, 200);
  const details = await reset.json();
  assert.equal(details.password.length, 10);
  assert.equal(details.email, "teacher@example.test");
  assert.equal(
    (await h.request("teacher-revoke", { userId: "teacher" })).status,
    200,
  );
  h.setActor("teacher");
  assert.equal((await h.request()).status, 403);
  h.setActor("owner");
  assert.equal(
    (await h.request("teacher-activate", { userId: "teacher" })).status,
    200,
  );
  h.setActor("teacher");
  assert.equal((await h.request()).status, 200);
});
test("An owner cannot reset a global account by injecting it into the school teacher map", async () => {
  const h = await harness();
  h.school.schoolLife.teachers.push({
    userId: "another-admin",
    staffId: "p2",
    active: true,
    email: "other@example.test",
  });
  const result = await h.request("teacher-reset", { userId: "another-admin" });
  assert.equal(result.status, 403);
  assert(
    !h.calls.some(
      (c) =>
        c.options.method === "PUT" && c.url.pathname.endsWith("/another-admin"),
    ),
  );
});
test("A resubmitted payment keeps the earlier report and exposes the latest state", async () => {
  const h = await harness();
  h.setActor("parent");
  assert.equal(
    (
      await h.request("payment-submit", {
        studentId: "s1",
        chargeId: "fee1",
        reference: "first-transfer",
      })
    ).status,
    200,
  );
  const first = structuredClone(h.school.schoolLife.payments[0]);
  h.setActor("owner");
  assert.equal(
    (
      await h.request("payment-review", {
        paymentId: first.id,
        approve: false,
      })
    ).status,
    200,
  );
  h.setActor("parent");
  assert.equal(
    (
      await h.request("payment-submit", {
        studentId: "s1",
        chargeId: "fee1",
        reference: "corrected-transfer",
      })
    ).status,
    200,
  );
  assert.equal(h.school.schoolLife.payments.length, 2);
  assert.equal(h.school.schoolLife.payments[0].status, "rejected");
  const finance = familyLife(h.school, h.school.students[0], "parent")
    .finance[0];
  assert.equal(finance.confirmation.status, "pending");
  assert.equal(finance.confirmation.reference, "corrected-transfer");
  assert.equal(finance.proofHistory.length, 2);
  assert.equal(finance.proofHistory[1].id, first.id);
  h.setActor("owner");
  assert.equal(
    (
      await h.request("payment-review", {
        paymentId: first.id,
        approve: true,
      })
    ).status,
    409,
  );
  assert.equal(h.school.finance[0].status, "Pendente");
});

test("A stale review cannot reverse an already confirmed payment report", async () => {
  const h = await harness();
  h.setActor("parent");
  await h.request("payment-submit", {
    studentId: "s1",
    chargeId: "fee1",
    reference: "confirmed-transfer",
  });
  const id = h.school.schoolLife.payments[0].id;
  h.setActor("owner");
  assert.equal(
    (await h.request("payment-review", { paymentId: id, approve: true }))
      .status,
    200,
  );
  assert.equal(
    (await h.request("payment-review", { paymentId: id, approve: false }))
      .status,
    409,
  );
  assert.equal(h.school.finance[0].status, "Pago");
  assert.equal(h.school.schoolLife.payments[0].status, "confirmed");
});

test("Cancelled charges cannot receive a payment report or generate Pix", async () => {
  const h = await harness();
  h.school.finance[0].status = "Cancelado";
  h.setActor("parent");
  assert.equal(
    (
      await h.request("payment-submit", {
        studentId: "s1",
        chargeId: "fee1",
        reference: "cancelled-charge",
      })
    ).status,
    409,
  );
  assert.equal(
    familyLife(h.school, h.school.students[0], "parent").finance[0].pix,
    "",
  );
  assert.equal(
    pixPayload(
      { key: "school@example.test", receiver: "Escola", city: "Inhumas" },
      h.school.finance[0],
    ),
    "",
  );
});

test("A second guardian sees billing status without another guardian's bank reference or proof history", async () => {
  const h = await harness();
  h.school.schoolLife.payments = [
    {
      id: "report1",
      studentId: "s1",
      chargeId: "fee1",
      userId: "parent",
      reference: "private-bank-reference",
      proofPath: clientId + "/receipt.png",
      status: "pending",
    },
  ];
  const parent = familyLife(h.school, h.school.students[0], "parent")
    .finance[0];
  const other = familyLife(h.school, h.school.students[0], "second-parent")
    .finance[0];
  assert(parent.confirmation.hasProof);
  assert.equal(other.confirmation.status, "pending");
  assert.equal(other.confirmation.hasProof, false);
  assert.equal(other.proofHistory.length, 0);
  assert(!JSON.stringify(other).includes("private-bank-reference"));
});
test("Teacher account creation binds checked classes and catalog subjects in one save", async () => {
  const h = await harness();
  h.school.subjects = [{ id: "portugues", name: "Português" }];
  const response = await h.request("teacher-create", {
    staffId: "p2",
    email: "new-prof@example.test",
    classIds: ["c2"],
    subjectIds: ["portugues"],
    subjects: ["Untrusted free text"],
  });
  assert.equal(response.status, 200);
  const access = await response.json();
  assert.equal(access.password.length, 10);
  assert.equal(access.login_url, "/teacher.html?slug=escola-a");
  const account = h.school.schoolLife.teachers.find((x) => x.staffId === "p2");
  assert.deepEqual(account.subjects, ["Português"]);
  assert.deepEqual(
    h.school.teacherAssignments.find((x) => x.teacherId === "p2"),
    {
      teacherId: "p2",
      classId: "c2",
      subjects: ["Português"],
    },
  );
  h.setActor(account.userId);
  const teacher = await (await h.request()).json();
  assert.deepEqual(
    teacher.classes.map((x) => x.id),
    ["c2"],
  );
  assert.deepEqual(teacher.subjects[0].subjects, ["Português"]);
});

test("Invalid checked classes and subjects are rejected before an Auth account is created", async () => {
  for (const selection of [
    { classIds: [], subjectIds: ["portugues"] },
    { classIds: ["c2"], subjectIds: [] },
    { classIds: ["other-school-class"], subjectIds: ["portugues"] },
    { classIds: ["c2"], subjectIds: ["other-school-subject"] },
  ]) {
    const h = await harness();
    h.school.subjects = [{ id: "portugues", name: "Português" }];
    assert.equal(
      (
        await h.request("teacher-create", {
          staffId: "p2",
          email: "new-prof@example.test",
          ...selection,
        })
      ).status,
      400,
    );
    assert.equal(h.users.size, 0);
    assert(
      !h.calls.some(
        (c) =>
          c.url.pathname === "/auth/v1/admin/users" &&
          c.options.method === "POST",
      ),
    );
  }
});

test("Updating checked permissions removes old class access without changing the teacher login", async () => {
  const h = await harness();
  h.school.subjects = [{ id: "math", name: "Matemática" }];
  const before = structuredClone(h.school.schoolLife.teachers[0]);
  h.setActor("teacher");
  assert.equal(
    (
      await h.request("teacher-permissions", {
        userId: "teacher",
        classIds: ["c2"],
        subjectIds: ["math"],
      })
    ).status,
    403,
  );
  h.setActor("owner");
  assert.equal(
    (
      await h.request("teacher-permissions", {
        userId: "teacher",
        classIds: ["c2"],
        subjectIds: ["math"],
      })
    ).status,
    200,
  );
  assert.equal(h.school.schoolLife.teachers[0].userId, before.userId);
  assert.equal(
    h.school.classes.find((x) => x.id === "c1").teacherId,
    undefined,
  );
  h.setActor("teacher");
  const teacher = await (await h.request()).json();
  assert.deepEqual(
    teacher.classes.map((x) => x.id),
    ["c2"],
  );
  assert.deepEqual(
    teacher.students.map((x) => x.id),
    ["s2"],
  );
});
