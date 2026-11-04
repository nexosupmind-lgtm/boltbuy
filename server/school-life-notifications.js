import {
  list,
  published,
  familyStudents,
  visible,
} from "./school-life-model.js";
import { guardianFingerprint } from "./family.js";
import { deliverSchoolPush } from "./school-push.js";
export function recordSchoolChanges(before, next, revision) {
  const notifications = [];
  const add = (ids, title, tab) => {
    for (const studentId of new Set(ids))
      notifications.push({
        id: "workspace-" + revision + "-" + notifications.length,
        studentId,
        title,
        tab,
        at: new Date().toISOString(),
      });
  };
  for (const message of list(next.messages).filter(published)) {
    const previous = list(before?.messages).find((x) => x.id === message.id);
    if (
      !previous ||
      !published(previous) ||
      previous.content !== message.content ||
      previous.title !== message.title
    )
      add(
        list(next.students)
          .filter((st) => visible(message, st))
          .map((st) => st.id),
        "Novo comunicado da escola",
        "messages",
      );
  }
  for (const grade of list(next.grades).filter(
    (x) =>
      published(x) && (!x.teacherExamId || x.publishStatus === "published"),
  )) {
    const previous = list(before?.grades).find((x) => x.id === grade.id);
    if (!previous || !published(previous) || previous.score !== grade.score)
      add([grade.studentId], "Nova avaliação publicada", "grades");
  }
  for (const row of list(next.attendance).filter((x) => x.status === "F")) {
    const previous = list(before?.attendance).find(
      (x) =>
        x.studentId === row.studentId &&
        x.classId === row.classId &&
        x.date === row.date,
    );
    if (!previous || previous.status !== "F")
      add([row.studentId], "Novo registro de frequência", "attendance");
  }
  if (notifications.length) {
    next.schoolLife ??= {};
    next.schoolLife.notifications = [
      ...list(next.schoolLife.notifications),
      ...notifications,
    ].slice(-500);
  }
  return [...new Set(notifications.map((x) => x.studentId))];
}
export async function notifyWorkspaceFamilies({
  school,
  studentIds,
  clientId,
  slug,
  env,
  origin,
}) {
  if (!studentIds.length || !school.schoolLife?.push) return;
  const base = env.SUPABASE_URL.replace(/\/$/, ""),
    secret = env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(
    base +
      "/rest/v1/bolt_family_accounts?client_id=eq." +
      encodeURIComponent(clientId) +
      "&select=*",
    { headers: { apikey: secret, authorization: "Bearer " + secret } },
  );
  if (!response.ok) return;
  const recipients = [];
  for (const account of await response.json()) {
    if (
      (await familyStudents(school, account, guardianFingerprint)).some((x) =>
        studentIds.includes(x.id),
      )
    )
      recipients.push(account.user_id);
  }
  await deliverSchoolPush(
    school,
    clientId,
    env.BOLT_FAMILY_CREDENTIAL_KEY || secret,
    origin,
    slug,
    recipients,
  );
}
