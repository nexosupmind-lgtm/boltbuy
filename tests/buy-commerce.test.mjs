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
  const calls = [], pushes = [];
  let pushStatus = 201, minimalWrites = false;
  async function mock(input, options = {}) {
    const url = new URL(input),
      method = options.method || "GET";
    calls.push({ url, method });
    if(url.hostname==='web.push.apple.com') {pushes.push({url,options});return new Response(null,{status:pushStatus});}

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
      return minimalWrites && !options.headers?.Prefer?.includes("return=representation") ? new Response(null,{status:201}) : Response.json(list);
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
    pushes,
    pushStatus: value => pushStatus=value,
    minimalWrites: () => minimalWrites=true,
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

test("Admin saves a variable-price bundle and checkout sums the selected quantities at catalog prices", async () => {
  const h = harness();
  const next = config();
  next.combos[0].pricing = "unit";
  const version = h.tables.bolt_delivery_storefronts[0].updated_at;
  const saved = await h.request("configure", { config: next, version }, "owner");
  assert.equal(saved.status, 200);
  const cart = order();
  cart.items[0].price = 0.01;
  const response = await h.request("order", cart);
  assert.ok(response.ok);
  const record = h.tables.bolt_order_items[0];
  assert.equal(Number(record.unit_price), 35);
  assert.equal(Number(record.quantity), 2);
});

test('Single-flavor combos multiply unit price by package units', () => {
  const c = normalizeConfig({combos:[{id:cid,name:'Combo 15',pricing:'option',units:15,mode:'mixed',maxFlavors:2,productIds:[p1,p2],active:true}]});
  const products = [{id:p1,name:'Coxinha',price:0.5,active:true},{id:p2,name:'Mini churros',price:0.8,active:true}];
  assert.equal(c.combos[0].mode,'single');
  const line = productId => ({comboId:cid,qty:2,price:0.01,selections:[{productId,quantity:15}]});
  assert.equal(pricedItems(c,products,[line(p1)])[0].price,7.5);
  assert.equal(pricedItems(c,products,[line(p2)])[0].price,12);
  assert.throws(()=>pricedItems(c,products,[{comboId:cid,qty:1,selections:[{productId:p1,quantity:7},{productId:p2,quantity:8}]}]));
  assert.throws(()=>pricedItems(c,[{...products[0],active:false},products[1]],[line(p1)]));
});

async function device(endpoint='https://web.push.apple.com/device-a') {
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const b64=b=>Buffer.from(b).toString('base64url');
  return {endpoint,keys:{p256dh:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}};
}
async function pushKey(h){const r=await h.request('push-key',{});assert.equal(r.status,200);return (await r.json()).publicKey;}

test('Push keys are stable across stores and private keys/subscriptions are encrypted',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device();
 assert.equal((await (await h.request('push-key',{},'', 'loja-b')).json()).publicKey,key);
 assert.equal((await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner')).status,200);
 const serialized=JSON.stringify(h.tables.bolt_audit_events);
 assert(!serialized.includes(subscription.endpoint));assert(!serialized.includes(subscription.keys.auth));assert(!serialized.includes('privateKey'));
 assert.equal((await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner')).status,200);
 assert.equal(h.tables.bolt_audit_events.filter(x=>x.event_type==='buy_push_subscription').length,1);
});
test('Merchant push requires authentication, tenant membership and order feature',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device(),body={audience:'admin',subscription,publicKey:key};
 assert.equal((await h.request('push-subscribe',body)).status,401);
 assert.equal((await h.request('push-subscribe',body,'stranger')).status,403);
 assert.equal((await h.request('push-subscribe',body,'owner','loja-b')).status,403);
 h.tables.bolt_client_subscriptions.push({tenant_id:tid,plan_id:cid});h.tables.bolt_platform_plans.push({id:cid,product:'buy',features:['products']});
 assert.equal((await h.request('push-subscribe',body,'owner')).status,403);
});
test('Customer push requires a valid receipt from the same tenant and rejects unsafe endpoints',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device();
 const bought=await (await h.request('order',order())).json();
 const body={audience:'customer',subscription,publicKey:key,token:bought.receipt.token};
 assert.equal((await h.request('push-subscribe',{...body,token:'forged'})).status,403);
 assert.equal((await h.request('push-subscribe',body,'','loja-b')).status,403);
 assert.equal((await h.request('push-subscribe',{...body,subscription:{...subscription,endpoint:'https://127.0.0.1/private'}})).status,400);
 assert.equal((await h.request('push-subscribe',body)).status,200);
 assert.equal((await h.request('push-unsubscribe',body)).status,200);
 assert.equal(h.tables.bolt_audit_events.filter(x=>x.event_type==='buy_push_subscription').length,0);
});
test('Confirmed order notifies merchant once; status update notifies only its customer and duplicate saves do not resend',async()=>{
 const h=harness(),key=await pushKey(h),merchant=await device(),customer=await device('https://web.push.apple.com/customer'),otherCustomer=await device('https://web.push.apple.com/other-customer');
 await h.request('push-subscribe',{audience:'admin',subscription:merchant,publicKey:key},'owner');
 const request=order(),bought=await (await h.request('order',request)).json();
 assert.equal(h.pushes.length,1);assert.equal(h.pushes[0].url.href,merchant.endpoint);
 assert.match(h.pushes[0].options.headers.Authorization,/^vapid t=/);assert.equal(h.pushes[0].options.headers['Content-Encoding'],'aes128gcm');
 await h.request('order',request);assert.equal(h.pushes.length,1);
 await h.request('push-subscribe',{audience:'customer',subscription:customer,publicKey:key,token:bought.receipt.token});
 const second=await (await h.request('order',order())).json();
 await h.request('push-subscribe',{audience:'customer',subscription:otherCustomer,publicKey:key,token:second.receipt.token});
 const before=h.pushes.length;
 assert.equal((await h.request('status',{id:bought.order.id,status:'preparo'},'owner')).status,200);
 assert.equal(h.pushes.length,before+1);assert.equal(h.pushes.at(-1).url.href,customer.endpoint);
 await h.request('status',{id:bought.order.id,status:'preparo'},'owner');assert.equal(h.pushes.length,before+1);
});
test('Expired push subscriptions and transport failures do not roll back a confirmed order',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device();
 await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner');
 h.pushStatus(410);const r=await h.request('order',order());assert.equal(r.status,200);
 assert.equal(h.tables.bolt_orders[0].status,'recebido');
 assert(h.tables.bolt_audit_events.some(x=>x.event_type==='buy_push_subscription'&&x.details.expired));
 await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner');
 h.pushStatus(500);assert.equal((await h.request('order',order())).status,200);
 assert(h.tables.bolt_audit_events.some(x=>x.event_type==='buy_push_delivery'&&x.details.failed===1));
});
test('Revoked merchant membership prevents delivery to a previously authorized device',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device();
 await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner');
 h.tables.bolt_memberships.length=0;
 assert.equal((await h.request('order',order())).status,200);assert.equal(h.pushes.length,0);
});


test('Real PostgREST empty HTTP 201 writes do not break first push activation or order creation',async()=>{
 const h=harness();h.minimalWrites();
 const key=await pushKey(h),subscription=await device();
 assert.equal((await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner')).status,200);
 const response=await h.request('order',order());assert.equal(response.status,200);
 const bought=await response.json();assert.equal(bought.order.status,'recebido');assert.equal(h.pushes.length,1);
 assert.equal((await h.request('push-subscribe',{audience:'customer',subscription:await device('https://web.push.apple.com/customer'),publicKey:key,token:bought.receipt.token})).status,200);
 assert.equal((await h.request('status',{id:bought.order.id,status:'preparo'},'owner')).status,200);
 assert.equal(h.pushes.length,2);
});

test('Push diagnostic is private, identifies the exact device and never exposes endpoints or keys',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device();
 assert.equal((await h.request('push-status',{})).status,401);
 assert.equal((await h.request('push-status',{},'stranger')).status,403);
 await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner');
 const status=await (await h.request('push-status',{endpoint:subscription.endpoint},'owner')).json();
 assert.equal(status.thisDevice,true);assert.equal(status.devices,1);assert(!JSON.stringify(status).includes(subscription.endpoint));
 const different=await (await h.request('push-status',{endpoint:'https://web.push.apple.com/different'},'owner')).json();assert.equal(different.thisDevice,false);
});
test('Test push targets only the authenticated saved device and is rate limited',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device();
 await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner');
 const body={audience:'admin',subscription};
 assert.equal((await h.request('push-test',body,'staff')).status,409);
 const result=await h.request('push-test',body,'owner');assert.equal(result.status,200);assert.equal(h.pushes.length,1);
 assert.equal((await result.json()).accepted,true);
 assert.equal((await h.request('push-test',body,'owner')).status,429);assert.equal(h.pushes.length,1);
});
test('Test push surfaces provider refusal instead of claiming activation means delivery',async()=>{
 const h=harness(),key=await pushKey(h),subscription=await device();
 await h.request('push-subscribe',{audience:'admin',subscription,publicKey:key},'owner');h.pushStatus(403);
 const r=await h.request('push-test',{audience:'admin',subscription},'owner');assert.equal(r.status,502);assert.match((await r.json()).error,/HTTP 403/);
});

test('Deletion requires management permission and cannot cross stores',async()=>{
 const h=harness();
 for(const action of ['order-delete','product-delete']){
  assert.equal((await h.request(action,{id:p1})).status,401);
  assert.equal((await h.request(action,{id:p1},'staff')).status,403);
 }
 h.tables.bolt_products.push({id:cid,tenant_id:other,name:'Other'});
 assert.equal((await h.request('product-delete',{id:cid},'owner')).status,404);
 assert.equal(h.tables.bolt_products.length,3);
 assert.equal((await h.request('product-delete',{id:p1},'owner')).status,200);
 assert(!h.tables.bolt_products.some(p=>p.id===p1));
 assert(h.tables.bolt_audit_events.some(e=>e.event_type==='buy_product_delete'&&e.details.actor_id==='owner'));
});
test('Deleted orders reconcile across devices; failed delete intents do not hide live orders',async()=>{
 const h=harness();h.tables.bolt_orders.push({id:cid,tenant_id:tid,status:'recebido'});
 h.tables.bolt_audit_events.push({id:crypto.randomUUID(),tenant_id:tid,event_type:'buy_order_delete',details:{target_id:cid}});
 let r=await h.request('orders',null,'owner');assert.deepEqual((await r.json()).deletedIds,[]);
 assert.equal((await h.request('order-delete',{id:cid},'owner')).status,200);
 r=await h.request('orders',null,'owner');const data=await r.json();assert(data.deletedIds.includes(cid));assert.equal(data.orders.length,0);
 assert.equal((await h.request('order-delete',{id:cid},'owner')).status,404);
});
test('Deletion stops if the audit write fails',async()=>{
 const h=harness();h.failTable('bolt_audit_events');
 assert.notEqual((await h.request('product-delete',{id:p1},'owner')).status,200);
 assert(h.tables.bolt_products.some(p=>p.id===p1));
});
