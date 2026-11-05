import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
function layer() {
  const document = {
    readyState: "loading",
    addEventListener() {},
    body: { dataset: {} },
  };
  const context = { document, Intl, Date, console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync("SITE/school-reference.js", "utf8"), context);
  return context.BOLT_CLASS_REFERENCE;
}
const school = () => ({
  name: "Minha Escola",
  logo: "https://school.test/logo.png",
  students: [],
  classes: [],
  staff: [],
  attendance: [],
  grades: [],
  messages: [],
  calendar: [],
  teacherItems: [],
});
test("School average accepts published numeric values and leaves missing results empty", () => {
  const ui = layer();
  assert.equal(ui.average([]), null);
  assert.equal(
    ui.average([{ score: null }, { score: "" }, { score: "sem nota" }]),
    null,
  );
  assert.equal(
    ui.average([{ final: 8 }, { average: 9 }, { score: "8,5" }]),
    8.5,
  );
});
test("Admin dashboard uses actual data and filters quick actions by entitlement", () => {
  const ui = layer(),
    s = school();
  s.students.push({ name: "Alice", id: "s" });
  const html = ui.admin(s, "Coordenação", (key) =>
    ["students", "classes", "attendance"].includes(key),
  );
  assert(html.includes('data-nav="students"'));
  assert(!html.includes('data-nav="finance"'));
  assert(!html.includes('data-nav="family"'));
  assert(!html.includes("487"));
  assert(html.includes("Lance as primeiras notas"));
});
test("Teacher home stays within the projected roster and classes instead of nested workspace data", () => {
  const ui = layer(),
    d = {
      school: { ...school(), students: [{ name: "SEGREDO de outra turma" }] },
      teacher: "Prof <script>x</script>",
      classes: [{ id: "c", name: "6º A" }],
      students: [{ id: "s", name: "Alice", classId: "c" }],
      subjects: [{ classId: "c", subjects: ["Matemática"] }],
      items: [],
      grades: [],
      attendance: [],
      threads: [],
      gradeReviewQueue: [],
    };
  const html = ui.teacherHome(d);
  assert(!html.includes("SEGREDO"));
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;script&gt;"));
  assert(html.includes('data-teacher-class-id="c"'));
  assert(html.includes("Nenhum") || html.includes("próximas atividades"));
});
test("Family performance uses the current period summaries and does not invent progress trends", () => {
  const ui = layer();
  const html = ui.performance({
    gradeSummary: [
      { subject: "História", period: "1º", final: 2 },
      { subject: "Matemática", period: "2º", final: 8.5 },
      { subject: "Português", period: "2º", final: 9 },
    ],
  });
  assert(!html.includes("História"));
  assert(html.includes("Matemática"));
  assert(html.includes("8,8"));
  assert(!html.includes("+0,4"));
  assert(!html.includes("NaN"));
});
test("Family shell preserves child selection and password form hooks without exposing admin controls", () => {
  const ui = layer(),
    data = {
      student: { id: "s1", name: "Alice", className: "6º A" },
      children: [
        { id: "s1", name: "Alice" },
        { id: "s2", name: "Bob" },
      ],
      guardian: "Responsável",
      activities: [],
      calendar: [],
    };
  const content = ui.familyContent("profile", data, false);
  assert(content.includes('id="family-child"'));
  assert(content.includes('id="family-password"'));
  assert(content.includes('id="family-logout"'));
  const html = ui.familyShell({
    school: school(),
    data,
    preview: false,
    previewBar: "",
    tab: "profile",
    content,
  });
  assert(html.includes('data-family-tab="performance"'));
  assert(html.includes("https://school.test/logo.png"));
  assert(!html.includes("data-nav="));
  assert(
    !ui.familyContent("profile", data, true).includes('id="family-password"'),
  );
});
test("Family home and exam list only render supplied student publications with escaped titles", () => {
  const ui = layer(),
    data = {
      student: { id: "s", name: "Alice", className: "6º A" },
      activities: [
        { type: "exam", title: "Prova <img src=x>", due: "2099-01-01" },
        { type: "task", title: "Tarefa privada?", due: "2099-01-01" },
      ],
      calendar: [],
    };
  const html = ui.familyContent("exams", data, false);
  assert(html.includes("&lt;img"));
  assert(!html.includes("<img src=x>"));
  assert(!html.includes("Tarefa privada?"));
  assert.equal(ui.familyContent("finance", data, false), null);
});
