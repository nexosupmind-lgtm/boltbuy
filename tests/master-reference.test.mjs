import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function renderLayer() {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : ["2026-01-12T12:00:00Z"]));
    }
  }
  const context = {
    Date: FixedDate,
    Intl,
    console,
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      getElementById() {
        return null;
      },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    readFileSync("SITE/bolt-master-reference.js", "utf8"),
    context,
  );
  return context.BOLT_MASTER_REFERENCE;
}
function snapshot() {
  return {
    clients: [
      {
        id: "c",
        product: "class",
        name: "Escola <img src=x onerror=alert(1)>",
        status: "active",
        slug: "escola",
      },
    ],
    subscriptions: [
      { id: "s", client_id: "c", status: "active" },
      { id: "orphan", client_id: "removed", status: "active" },
    ],
    invoices: [
      {
        id: "paid",
        subscription_id: "s",
        amount: 10.1,
        paid_at: "2026-01-05T12:00:00Z",
        due_date: "2026-01-05",
      },
      {
        id: "paid2",
        subscription_id: "s",
        amount: 0.2,
        paid_at: "2026-01-06T12:00:00Z",
        due_date: "2026-01-06",
      },
      {
        id: "orphan-payment",
        subscription_id: "orphan",
        amount: 9000,
        paid_at: "2026-01-06T12:00:00Z",
        due_date: "2026-01-06",
      },
      { id: "late", subscription_id: "s", amount: 50, due_date: "2026-01-01" },
      {
        id: "future",
        subscription_id: "s",
        amount: 50,
        due_date: "2026-02-01",
      },
    ],
    tickets: [
      {
        id: "t",
        client_id: "c",
        status: "open",
        subject: "Acesso <script>err()</script>",
      },
      {
        id: "resolved",
        client_id: "c",
        status: "resolved",
        subject: "Resolvido",
      },
    ],
    metrics: {
      clients: 1,
      active_clients: 1,
      received: 10.3,
      mrr: 50,
      overdue_clients: 1,
    },
  };
}
test("Reference revenue chart crosses the year boundary and uses only paid invoices linked to an existing client", () => {
  const layer = renderLayer(),
    values = layer.series(snapshot(), 6);
  assert.equal(values.length, 6);
  assert.equal(values[0].label, "ago");
  assert.equal(values.at(-1).label, "jan");
  assert.equal(values.at(-1).value, 10.3);
  assert.equal(
    values.reduce((sum, row) => sum + row.value, 0),
    10.3,
  );
});
test("Reference alerts use real pending work, omit resolved tickets and future invoices", () => {
  const layer = renderLayer(),
    data = snapshot();
  data.invoices.push({
    subscription_id: "orphan",
    due_date: "2025-01-01",
    amount: 9000,
  });
  const alerts = layer.alerts(data);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].page, "billing");
  assert.equal(alerts[0].level, "Alta");
  assert.equal(alerts[1].id, "t");
});
test("Reference dashboard escapes customer and ticket content and does not fabricate trends or orphan systems", () => {
  const html = renderLayer().dashboard(snapshot());
  assert(!html.includes("<img src=x"));
  assert(!html.includes("<script>err()"));
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes("+20%"));
  assert.match(html, /Sistemas Ativos<\/span><strong>1<\/strong>/);
  for (const product of ["BOLT Class", "BOLT Buy", "BOLT Church"])
    assert(html.includes('alt="' + product + '"'));
  assert(html.includes("data-mr-assistant"));
});
test("Empty Master has useful zero and empty states instead of example customers and tasks", () => {
  const data = {
    clients: [],
    subscriptions: [],
    invoices: [],
    tickets: [],
    metrics: {
      clients: 0,
      active_clients: 0,
      received: 0,
      mrr: 0,
      overdue_clients: 0,
    },
  };
  const html = renderLayer().dashboard(data);
  assert(html.includes("Cadastrar primeiro cliente"));
  assert(html.includes("Nenhuma cobrança vencida ou chamado pendente."));
  assert(!html.includes("Escola Nova Geração"));
  assert(!html.includes("NaN"));
});

test('Latest client block orders by creation timestamp rather than alphabetical position', () => {
  const data = snapshot();
  data.clients = [
    {id:'a',product:'class',name:'Antigo A',created_at:'2025-01-01',status:'active'},
    {id:'b',product:'buy',name:'Novo Z',created_at:'2026-01-10',status:'ativo'},
    {id:'c',product:'church',name:'Meio M',created_at:'2025-12-20',status:'active'},
  ];
  const html = renderLayer().dashboard(data);
  assert(html.indexOf('Novo Z') < html.indexOf('Meio M'));
  assert(html.indexOf('Meio M') < html.indexOf('Antigo A'));
});
