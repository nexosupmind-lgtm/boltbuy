import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../server/buy-commerce.js";
import {
  normalizeConfig,
  availability,
  pricedItems,
} from "../SITE/Salgaditos/buy-model.js";
import { quotePDF } from "../SITE/Salgaditos/buy-quote-pdf.js";
const tid = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  p1 = "20000000-0000-4000-a000-000000000001",
  p2 = "20000000-0000-4000-a000-000000000002",
  cid = "30000000-0000-4000-a000-000000000001";
const config = () =>
  normalizeConfig({
    deliveryFee: 7,
    whatsapp: "62999999999",
    pixKey: "pix@example.test",
    pixName: "Salgaditos",
    pixCity: "Inhumas",
    combos: [
      {
        id: cid,
        name: "15 mini salgados",
        price: 15,
        units: 15,
        mode: "mixed",
        maxFlavors: 2,
        productIds: [p1, p2],
      },
    ],
  });
function harness() {
  const tables = {
    bolt_tenants: [
      { id: tid, slug: "loja-a", name: "Salgaditos", status: "active" },
      { id: other, slug: "loja-b", name: "Outra loja", status: "active" },
    ],
    bolt_delivery_storefronts: [
      {
        tenant_id: tid,
        settings: { bannerTitle: "Preservar banner", commerce: config() },
        updated_at: "2026-11-01T00:00:00.000Z",
      },
    ],
    bolt_products: [
      { id: p1, tenant_id: tid, name: "Coxinha", price: 2, active: true },
      { id: p2, tenant_id: tid, name: "Carne", price: 3, active: true },
    ],
    bolt_memberships: [
      { tenant_id: tid, user_id: "owner", role: "owner" },
      { tenant_id: tid, user_id: "staff", role: "staff" },
    ],
    bolt_master_admins: [],
    bolt_client_subscriptions: [],
    bolt_platform_plans: [],
    bolt_orders: [],
    bolt_order_items: [],
    bolt_audit_events: [],
    bolt_coupons: [],
  };
  let failTable = "",
    loseCoupon = false;
  const calls = [];
  async function mock(input, options = {}) {
    const url = new URL(input),
      method = options.method || "GET";
    calls.push({ url, method });
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id: (options.headers.authorization || "").replace("Bearer ", ""),
      });
    const name = url.pathname.split("/").pop();
    assert.ok(name in tables, name);
    let rows = tables[name];
    const matches = (row) =>
      [...url.searchParams].every(([key, value]) => {
        if (["select", "order", "limit", "offset", "on_conflict"].includes(key))
          return true;
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("neq."))
          return String(row[key]) !== value.slice(4);
        if (value.startsWith("in.("))
          return value.slice(4, -1).split(",").includes(row[key]);
        throw Error("Filter " + value);
      });
    if (name === failTable && method === "POST")
      return Response.json({ error: "failure" }, { status: 503 });
    if (method === "GET") {
      rows = rows.filter(matches);
      return Response.json(
        rows.slice(
          Number(url.searchParams.get("offset") || 0),
          Number(url.searchParams.get("offset") || 0) +
            Number(url.searchParams.get("limit") || 1000),
        ),
      );
    }
    if (method === "POST") {
      const body = JSON.parse(options.body),
        list = Array.isArray(body) ? body : [body];
      for (const row of list) {
        if (row.id && rows.some((x) => x.id === row.id))
          return Response.json({}, { status: 409 });
        rows.push({
          ...(name === "bolt_coupons" ? { uses: 0 } : {}),
          id: crypto.randomUUID(),
          created_at: "2026-11-05T13:00:00Z",
          ...row,
        });
      }
      return Response.json(list);
    }
    if (method === "PATCH") {
      if (name === "bolt_coupons" && loseCoupon) return Response.json([]);
      const updated = rows.filter(matches);
      updated.forEach((row) => Object.assign(row, JSON.parse(options.body)));
      return Response.json(updated);
    }
    if (method === "DELETE") {
      const removed = rows.filter(matches);
      tables[name] = rows.filter((row) => !matches(row));
      if (name === "bolt_orders")
        tables.bolt_order_items = tables.bolt_order_items.filter(
          (i) => !removed.some((o) => o.id === i.order_id),
        );
      return Response.json(removed);
    }
  }
  return {
    tables,
    calls,
    failTable: (value) => (failTable = value),
    loseCoupon: () => (loseCoupon = true),
    async request(action, body, token = "", slug = "loja-a") {
      const previous = globalThis.fetch;
      globalThis.fetch = mock;
      try {
        return await onRequest({
          request: new Request(
            "https://bolt.test/api/buy-commerce?tenant=" +
              slug +
              "&action=" +
              action,
            {
              method: body ? "POST" : "GET",
              headers: {
                "content-type": "application/json",
                ...(token ? { authorization: "Bearer " + token } : {}),
              },
              ...(body ? { body: JSON.stringify({ action, ...body }) } : {}),
            },
          ),
          env: {
            SUPABASE_URL: "https://test.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "private-test-service-secret",
          },
        });
      } finally {
        globalThis.fetch = previous;
      }
    },
  };
}
const order = () => ({
  requestId: crypto.randomUUID(),
  customer: "Ana",
  phone: "62999999999",
  address: "Rua 1, 10",
  mode: "delivery",
  payment: "PIX",
  items: [
    {
      comboId: cid,
      qty: 2,
      selections: [
        { productId: p1, quantity: 10 },
        { productId: p2, quantity: 5 },
      ],
      price: 0.01,
    },
  ],
});
test("Service hours honor weekdays, closing boundaries, overnight shifts and a manual pause", () => {
  const c = config();
  c.hours.enabled = true;
  c.hours.days[1] = { enabled: true, open: "18:00", close: "02:00" };
  assert.equal(availability(c, new Date("2026-11-03T02:00:00Z")).open, true); // Monday 23:00
  assert.equal(availability(c, new Date("2026-11-03T04:59:00Z")).open, true);
  assert.equal(availability(c, new Date("2026-11-03T05:00:00Z")).open, false);
  assert.equal(availability(c, new Date("2026-11-02T20:59:00Z")).open, false);
  c.hours.paused = true;
  assert.equal(availability(c, new Date("2026-11-03T02:00:00Z")).open, false);
});
test("Combo selections must contain exactly the package units, allowed flavors and current prices", () => {
  const c = config(),
    products = [
      { id: p1, name: "Coxinha", price: 2, active: true },
      { id: p2, name: "Carne", price: 3, active: true },
    ];
  assert.equal(pricedItems(c, products, order().items)[0].price, 15);
  const invalid = order().items;
  invalid[0].selections[0].quantity = 9;
  assert.throws(() => pricedItems(c, products, invalid), /15 unidades/);
  const duplicate = order().items;
  duplicate[0].selections = [
    { productId: p1, quantity: 10 },
    { productId: p1, quantity: 5 },
  ];
  assert.throws(() => pricedItems(c, products, duplicate), /Sabor/);
  c.combos[0].mode = "single";
  assert.throws(() => pricedItems(c, products, order().items), /15 unidades/);
});
test("Configuration is tenant-bound, revision-guarded and preserves existing studio settings", async () => {
  const h = harness(),
    version = h.tables.bolt_delivery_storefronts[0].updated_at;
  assert.equal(
    (await h.request("configure", { config: config(), version })).status,
    401,
  );
  assert.equal(
    (await h.request("configure", { config: config(), version }, "staff"))
      .status,
    403,
  );
  assert.equal(
    (await h.request("configure", { config: config(), version }, "outsider"))
      .status,
    403,
  );
  const next = config();
  next.hours.paused = true;
  assert.equal(
    (await h.request("configure", { config: next, version }, "owner")).status,
    200,
  );
  assert.equal(
    h.tables.bolt_delivery_storefronts[0].settings.bannerTitle,
    "Preservar banner",
  );
  assert.equal(
    (await h.request("configure", { config: config(), version }, "owner"))
      .status,
    409,
  );
});
test("Closed-store checkout is refused on the server and cannot be bypassed by changing browser state", async () => {
  const h = harness();
  h.tables.bolt_delivery_storefronts[0].settings.commerce.hours.paused = true;
  assert.equal((await h.request("order", order())).status, 409);
  assert.equal(h.tables.bolt_orders.length, 0);
});
test("Online orders use authoritative prices, persist selected flavors and have private tracking receipts", async () => {
  const h = harness(),
    body = order(),
    response = await h.request("order", body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.order.subtotal, 30);
  assert.equal(result.order.fee, 7);
  assert.equal(result.receipt.total, 37);
  assert.match(result.receipt.pix, /000201/);
  assert.match(
    h.tables.bolt_order_items[0].product_name,
    /10× Coxinha, 5× Carne/,
  );
  assert.equal(
    h.tables.bolt_audit_events[0].details.selections[0].selections[1].quantity,
    5,
  );
  assert.equal((await h.request("order", body)).status, 200);
  assert.equal(h.tables.bolt_orders.length, 1);
  assert.equal(
    (await h.request("track", { token: result.receipt.token })).status,
    200,
  );
  assert.equal(
    (await h.request("track", { token: result.receipt.token }, "", "loja-b"))
      .status,
    403,
  );
  assert.equal((await h.request("track", { token: "invalid" })).status, 403);
  assert.equal((await h.request("orders")).status, 401);
  assert.equal(
    (
      await h.request(
        "status",
        { id: result.order.id, status: "preparo" },
        "outsider",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request(
        "status",
        { id: result.order.id, status: "preparo" },
        "owner",
      )
    ).status,
    200,
  );
});
test("A foreign flavor or inactive product cannot be ordered, and failed item writes do not leave an accepted order", async () => {
  const h = harness(),
    body = order();
  body.items[0].selections[0].productId = other;
  assert.equal((await h.request("order", body)).status, 400);
  h.tables.bolt_products[0].active = false;
  assert.equal((await h.request("order", order())).status, 400);
  h.tables.bolt_products[0].active = true;
  h.failTable("bolt_order_items");
  assert.equal((await h.request("order", order())).status, 503);
  assert.equal(h.tables.bolt_orders.length, 0);
});
test("A limited coupon uses a compare-and-swap reservation and fails closed on a concurrent change", async () => {
  const h = harness();
  h.tables.bolt_coupons.push({
    id: p2,
    tenant_id: tid,
    code: "TESTE",
    kind: "fixed",
    amount: 5,
    active: true,
    uses: 0,
    max_uses: 1,
  });
  h.loseCoupon();
  const body = { ...order(), coupon: "TESTE" };
  assert.equal((await h.request("order", body)).status, 409);
  assert.equal(h.tables.bolt_orders.length, 0);
});
test("Quote records are private and the server recomputes the total", async () => {
  const h = harness(),
    quote = {
      id: crypto.randomUUID(),
      customer: "Valquíria",
      items: [{ name: "Mini salgados", qty: 250, price: 0.5 }],
      total: 0.01,
    };
  assert.equal((await h.request("quote-save", { quote })).status, 401);
  const response = await h.request("quote-save", { quote }, "owner");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).quote.total, 125);
  const publicData = await (await h.request("public")).text();
  assert.equal(publicData.includes("Valquíria"), false);
  assert.equal((await h.request("quotes", null, "outsider")).status, 403);
});
test("Existing coupons can be imported with their use counts and still apply to the online checkout", async () => {
  const h = harness(),
    coupon = {
      code: "ANTIGO",
      type: "fixed",
      value: 5,
      min: 0,
      limit: 10,
      used: 2,
      active: true,
    };
  assert.equal(
    (await h.request("coupon-save", { coupon }, "owner")).status,
    200,
  );
  assert.equal(h.tables.bolt_coupons[0].uses, 2);
  assert.equal(
    (await h.request("coupon-check", { code: "ANTIGO", phone: "62999999999" }))
      .status,
    200,
  );
  const result = await (
    await h.request("order", { ...order(), coupon: "ANTIGO" })
  ).json();
  assert.equal(result.receipt.total, 32);
  assert.equal(h.tables.bolt_coupons[0].uses, 3);
});
test("Loyalty rewards retain their phone binding without exposing it in the public store configuration", async () => {
  const h = harness(),
    coupon = {
      code: "PREMIO-TESTE",
      type: "fixed",
      value: 10,
      limit: 1,
      loyaltyPhone: "62988888888",
      active: true,
    };
  assert.equal(
    (await h.request("coupon-save", { coupon }, "owner")).status,
    200,
  );
  assert.equal(
    (
      await h.request("coupon-check", {
        code: coupon.code,
        phone: "62977777777",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await h.request("order", {
        ...order(),
        coupon: coupon.code,
        phone: "62977777777",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await h.request("coupon-check", {
        code: coupon.code,
        phone: "62988888888",
      })
    ).status,
    200,
  );
  const publicBody = await (await h.request("public")).text();
  assert.equal(publicBody.includes("62988888888"), false);
  assert.equal(publicBody.includes("PREMIO-TESTE"), false);
  assert.equal((await h.request("coupons", null, "outsider")).status, 403);
});
test("The local quote exporter emits an A4 PDF with multiple pages for long item lists", () => {
  const bytes = quotePDF(
    {
      id: p1,
      customer: "Valquíria",
      date: "2026-11-05",
      items: Array.from({ length: 70 }, (_, i) => ({
        name: "Mini salgados - item " + i,
        qty: 15,
        price: 1,
      })),
      total: 1050,
      showPrices: false,
      notes: "Condições de pagamento a combinar.",
    },
    { name: "Salgaditos", color: "#c52a30", phone: "62999999999" },
  );
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /595.28 841.89/);
  assert.ok((text.match(/\/Type \/Page /g) || []).length >= 3);
  assert.equal(text.includes("(UNIT.)"), false);
});
