import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function harness({ failSave = false, failRefresh = false } = {}) {
  const nodes = new Map(),
    events = {},
    layouts = [],
    posts = [];
  class Element {
    constructor(tag = "div") {
      this.tag = tag;
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.textContent = "";
    }
    append(...items) {
      this.children.push(...items);
      for (const item of items) if (item?.id) nodes.set(item.id, item);
    }
    replaceChildren(...items) {
      this.children = [];
      this.append(...items);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    addEventListener(name, fn) {
      this.events ??= {};
      this.events[name] = fn;
    }
    remove() {
      nodes.delete(this.id);
    }
    showModal() {
      this.visible = true;
    }
    scrollIntoView() {
      this.scrolled = true;
    }
    focus() {
      this.focused = true;
    }
    querySelector(selector) {
      if (selector === "[role=status]")
        return this.children.find((x) => x.attributes?.role === "status");
      return null;
    }
  }
  const document = {
    body: new Element("body"),
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: text }),
    getElementById: (id) => nodes.get(id) || null,
    querySelector(selector) {
      if (selector === ".main") return document.body;
      if (selector === "#life-credential-dialog [role=status]")
        return nodes
          .get("life-credential-dialog")
          ?.querySelector("[role=status]");
      return null;
    },
    addEventListener(name, fn) {
      (events[name] ??= []).push(fn);
    },
  };
  nodes.set("life-result", new Element("p"));
  const school = {
    slug: "escola-a",
    name: "Escola A",
    staff: [{ id: "p1", name: "Professora Ana", email: "ana@example.test" }],
    classes: [
      { id: "c1", name: "1º A", teacherId: "p1" },
      { id: "c2", name: "2º B" },
    ],
    subjects: [
      { id: "math", name: "Matemática", teacherId: "p1" },
      { id: "port", name: "Português" },
    ],
    students: [],
    teacherAssignments: [],
    schoolLife: { teachers: [] },
  };
  const ctx = {
    school: () => school,
    db: () => ({ schools: [school] }),
    replace() {},
    navigate() {},
    layout(title, body) {
      layouts.push(body);
    },
    workspace: {
      bundle: { data: { schools: [school] } },
      client: {
        auth: {
          getSession: async () => ({
            data: { session: { access_token: "owner-token" } },
          }),
        },
      },
      flush: async () => true,
      refresh: async () => {
        if (failRefresh) throw Error("Refresh offline");
        return { data: { schools: [school] } };
      },
    },
  };
  const context = vm.createContext({
    document,
    window: {},
    location: { origin: "https://bolt.test" },
    URL,
    crypto,
    structuredClone,
    navigator: { clipboard: { writeText: async () => {} } },
    confirm: () => true,
    FormData: class {
      constructor(form) {
        this.values = form.values;
      }
      [Symbol.iterator]() {
        return this.values[Symbol.iterator]();
      }
      getAll(key) {
        return this.values
          .filter(([name]) => name === key)
          .map(([, value]) => value);
      }
      has(key) {
        return this.values.some(([name]) => name === key);
      }
    },
    fetch: async (url, options) => {
      if (options.method === "GET")
        return {
          ok: true,
          json: async () => ({
            ok: true,
            life: { teachers: [] },
            alerts: [],
            accounts: [],
          }),
        };
      posts.push(JSON.parse(options.body));
      if (failSave)
        return {
          ok: false,
          json: async () => ({
            error: "E-mail já em uso. Verifique o acesso cadastrado.",
          }),
        };
      return {
        ok: true,
        json: async () => ({
          ok: true,
          email: "ana@example.test",
          password: "Aa1!secret",
          login_url: "/teacher.html?slug=escola-a",
        }),
      };
    },
  });
  vm.runInContext(
    readFileSync("SITE/Boltclass/school-life-admin.js", "utf8"),
    context,
  );
  const api = context.window.BOLT_LIFE_ADMIN;
  async function team() {
    await api.render(ctx);
    const button = { dataset: { lifePane: "team" } };
    await events.click[0]({ target: { closest: () => button } });
  }
  function form(values) {
    const submit = {
        disabled: false,
        textContent: "Criar acesso e gerar senha",
      },
      selectAll = { disabled: false, textContent: "Marcar todas" },
      status = new Element("p");
    const form = {
      dataset: { lifeForm: "teacher-create" },
      values,
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return submit;
        if (selector === "button") return selectAll;
        if (selector === "[data-life-status]") return status;
        return null;
      },
    };
    return { form, submit, selectAll, status };
  }
  async function submit(form) {
    await events.submit[0]({
      target: form,
      preventDefault() {},
      stopImmediatePropagation() {},
    });
  }
  return { team, form, submit, nodes, layouts, posts, school };
}
const values = [
  ["staffId", "p1"],
  ["email", "ana@example.test"],
  ["classIds", "c1"],
  ["subjectIds", "math"],
];

test("Teacher setup uses checked classes and catalog disciplines with the email already filled", async () => {
  const h = harness();
  await h.team();
  const html = h.layouts.at(-1);
  assert.match(html, /name="classIds"/);
  assert.match(html, /name="subjectIds"/);
  assert.match(html, /value="ana@example.test"/);
  assert.match(html, /1º A/);
  assert.match(html, /Matemática/);
  assert(!html.includes("separadas por vírgula"));
  assert(!html.includes('name="subjects"'));
});

test("Submitting teacher creation displays credentials even if refreshing the list fails", async () => {
  const h = harness({ failRefresh: true });
  await h.team();
  const f = h.form(values);
  await h.submit(f.form);
  assert.deepEqual(h.posts[0].classIds, ["c1"]);
  assert.deepEqual(h.posts[0].subjectIds, ["math"]);
  const dialog = h.nodes.get("life-credential-dialog");
  assert(dialog?.visible);
  const fields = dialog.children
    .flatMap((x) => x.children || [])
    .filter((x) => x.tag === "input");
  assert(fields.some((x) => x.value === "ana@example.test"));
  assert(fields.some((x) => x.value === "Aa1!secret"));
  assert(
    fields.some(
      (x) => x.value === "https://bolt.test/teacher.html?slug=escola-a",
    ),
  );
  assert.equal(f.submit.disabled, false);
  assert.equal(f.selectAll.disabled, false);
});

test("Teacher creation shows API failure next to the submit button and retains the selection", async () => {
  const h = harness({ failSave: true });
  await h.team();
  const f = h.form(values);
  await h.submit(f.form);
  assert.match(f.status.textContent, /E-mail já em uso/);
  assert.equal(f.status.attributes.role, "alert");
  assert(f.status.scrolled);
  assert.deepEqual(f.form.values, values);
  assert.equal(f.submit.disabled, false);
  assert(!h.nodes.has("life-credential-dialog"));
});

test("Missing checked classes is explained inline before creating any account", async () => {
  const h = harness();
  await h.team();
  const f = h.form(values.filter(([name]) => name !== "classIds"));
  await h.submit(f.form);
  assert.match(f.status.textContent, /Marque pelo menos uma turma/);
  assert.equal(h.posts.length, 0);
  assert.equal(f.submit.textContent, "Criar acesso e gerar senha");
});
