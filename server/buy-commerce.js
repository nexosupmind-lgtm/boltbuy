import {
  normalizeConfig,
  availability,
  pricedItems,
  subtotalOf,
  clean,
  UUID,
  moneyValue,
  integer,
} from "../SITE/Salgaditos/buy-model.js";
import { seal, unseal, normalizePhone } from "./family.js";
import { pixPayload } from "./school-life-model.js";
const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
export async function onRequest({ request, env }) {
  try {
    const base = (env.SUPABASE_URL || "").replace(/\/$/, ""),
      secret = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!/^https:\/\/[^/]+\.supabase\.co$/.test(base) || !secret)
      fail(503, "Serviço de pedidos indisponível.");
    const headers = {
      apikey: secret,
      authorization: "Bearer " + secret,
      "content-type": "application/json",
    };
    async function db(path, options = {}) {
      const r = await fetch(base + "/rest/v1/" + path, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
      if (!r.ok)
        fail(
          r.status === 409 ? 409 : 503,
          r.status === 409
            ? "Este registro já foi atualizado. Recarregue antes de tentar novamente."
            : "Não foi possível confirmar os dados da loja.",
        );
      return r.status === 204 ? null : r.json();
    }
    const q = new URL(request.url).searchParams,
      slug = q.get("tenant");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "") || slug.length > 80)
      fail(400, "Loja inválida.");
    if (!["GET", "POST"].includes(request.method))
      fail(405, "Método não permitido.");
    if (Number(request.headers.get("content-length") || 0) > 200000)
      fail(413, "Dados muito grandes.");
    const raw = request.method === "POST" ? await request.text() : "";
    if (raw.length > 200000) fail(413, "Dados muito grandes.");
    let body = {};
    try {
      if (raw) body = JSON.parse(raw);
    } catch {
      fail(400, "Dados inválidos.");
    }
    const action =
      request.method === "GET" ? q.get("action") || "public" : body.action;
    const tenants = await db(
      "bolt_tenants?slug=eq." +
        encodeURIComponent(slug) +
        "&select=id,name,status,logo_url,primary_color",
    );
    const tenant = tenants[0];
    if (
      !tenant ||
      [
        "blocked",
        "suspended",
        "cancelled",
        "bloqueado",
        "suspenso",
        "cancelado",
        "inactive",
        "inativo",
      ].includes(tenant.status)
    )
      fail(403, "Loja indisponível.");
    const snapshots = await db(
        "bolt_delivery_storefronts?tenant_id=eq." +
          tenant.id +
          "&select=settings,updated_at",
      ),
      snapshot = snapshots[0];
    const config = normalizeConfig(
      snapshot?.settings?.commerce || {},
      slug === "salgaditos",
    );
    let actor,
      canManage = false;
    async function member(feature, manage = false) {
      if (!actor) {
        const token = request.headers
          .get("authorization")
          ?.replace(/^Bearer\s+/i, "");
        if (!token) fail(401, "Entre no administrativo da loja.");
        const r = await fetch(base + "/auth/v1/user", {
          headers: { apikey: secret, authorization: "Bearer " + token },
        });
        if (!r.ok) fail(401, "Sessão expirada.");
        actor = await r.json();
        const [members, masters] = await Promise.all([
          db(
            "bolt_memberships?tenant_id=eq." +
              tenant.id +
              "&user_id=eq." +
              actor.id +
              "&select=role",
          ),
          db("bolt_master_admins?user_id=eq." + actor.id + "&select=user_id"),
        ]);
        canManage =
          !!masters.length ||
          members.some((m) => ["owner", "manager"].includes(m.role));
        if (
          !masters.length &&
          !members.some((m) => ["owner", "manager", "staff"].includes(m.role))
        )
          fail(403, "Esta conta não tem acesso a esta loja.");
      }
      if (manage && !canManage)
        fail(
          403,
          "Somente o proprietário ou gerente pode alterar combos, atendimento e Pix.",
        );
      if (feature) {
        const subscriptions = await db(
          "bolt_client_subscriptions?tenant_id=eq." +
            tenant.id +
            "&select=plan_id",
        );
        if (subscriptions[0]?.plan_id) {
          const plans = await db(
            "bolt_platform_plans?id=eq." +
              subscriptions[0].plan_id +
              "&product=eq.buy&select=features",
          );
          if (
            !plans.length ||
            (Array.isArray(plans[0].features) &&
              !plans[0].features.includes(feature))
          )
            fail(403, "Recurso não incluído no plano.");
        }
      }
    }
    const products = () =>
      db(
        "bolt_products?tenant_id=eq." +
          tenant.id +
          "&select=id,name,price,category,image_url,active",
      );
    const receipt = async (order) => ({
      id: order.id,
      token: await seal(
        JSON.stringify({
          id: order.id,
          tenant: tenant.id,
          expires: Date.now() + 30 * 86400000,
        }),
        secret,
        "buy-receipt",
      ),
      total: Number(order.total),
      pix: pixPayload(
        { key: config.pixKey, receiver: config.pixName, city: config.pixCity },
        { id: order.id, amount: order.total },
      ),
      pixKey: config.pixKey,
      whatsapp: config.whatsapp,
    });
    async function orderProjection(order, preloaded) {
      const [items, meta] =
        preloaded ||
        (await Promise.all([
          db(
            "bolt_order_items?order_id=eq." +
              order.id +
              "&select=product_id,product_name,quantity,unit_price",
          ),
          db(
            "bolt_audit_events?id=eq." +
              order.id +
              "&tenant_id=eq." +
              tenant.id +
              "&event_type=eq.buy_order&select=details",
          ),
        ]));
      const details = meta[0]?.details || {};
      return {
        id: order.id,
        date: order.created_at,
        customer: order.customer_name,
        phone: order.customer_phone,
        address: order.delivery_address,
        mode: details.mode || "delivery",
        payment: details.payment || "Não informado",
        channel: "Site",
        status: order.status,
        subtotal: Number(order.subtotal),
        fee: Number(order.delivery_fee),
        discount: Number(order.discount),
        cloud: true,
        items: items.map((x) => ({
          id: x.product_id,
          name: x.product_name,
          qty: x.quantity,
          price: Number(x.unit_price),
        })),
      };
    }
    const couponView = (c) => ({
      code: c.code,
      type: c.kind,
      value: Number(c.amount),
      min: Number(c.minimum_order || 0),
      limit: Number(c.max_uses || 0),
      used: Number(c.uses || 0),
      expires: c.expires_at?.slice(0, 10) || "",
      active: c.active,
      id: c.id,
    });
    async function couponAccess(coupon, phone) {
      const rewards = await db(
        "bolt_audit_events?id=eq." +
          coupon.id +
          "&tenant_id=eq." +
          tenant.id +
          "&event_type=eq.buy_reward&select=details",
      );
      if (
        rewards.length &&
        normalizePhone(rewards[0].details.phone) !== normalizePhone(phone)
      )
        fail(400, "Recompensa vinculada a outro WhatsApp.");
      return rewards[0];
    }
    if (action === "coupons" && request.method === "GET") {
      await member("banners");
      const [rows, rewards] = await Promise.all([
        db("bolt_coupons?tenant_id=eq." + tenant.id + "&select=*"),
        db(
          "bolt_audit_events?tenant_id=eq." +
            tenant.id +
            "&event_type=eq.buy_reward&select=id,details",
        ),
      ]);
      return json(200, {
        ok: true,
        coupons: rows.map((c) => ({
          ...couponView(c),
          ...(rewards.find((r) => r.id === c.id)
            ? { loyaltyPhone: rewards.find((r) => r.id === c.id).details.phone }
            : {}),
        })),
      });
    }
    if (action === "coupon-save" && request.method === "POST") {
      await member("banners");
      const c = body.coupon || {},
        code = clean(c.code, 24).toUpperCase(),
        kind = c.type === "percent" ? "percent" : "fixed";
      let amount, minimum, limit;
      try {
        amount = moneyValue(c.value);
        minimum = moneyValue(c.min || 0);
        limit = integer(c.limit || 0, 0, 1000000);
      } catch (e) {
        fail(400, e.message);
      }
      if (
        !/^[A-Z0-9_-]{3,24}$/.test(code) ||
        amount <= 0 ||
        (kind === "percent" && amount > 100) ||
        (c.expires && !/^\d{4}-\d{2}-\d{2}$/.test(c.expires))
      )
        fail(400, "Confira o código, valor e validade do cupom.");
      const existing = (
          await db(
            "bolt_coupons?tenant_id=eq." +
              tenant.id +
              "&code=eq." +
              encodeURIComponent(code) +
              "&select=*",
          )
        )[0],
        id = existing?.id || crypto.randomUUID();
      const row = {
        tenant_id: tenant.id,
        code,
        kind,
        amount,
        minimum_order: minimum,
        max_uses: limit,
        expires_at: c.expires ? c.expires + "T23:59:59-03:00" : null,
        active: c.loyaltyPhone ? false : c.active !== false,
      };
      if (existing)
        await db("bolt_coupons?id=eq." + id + "&tenant_id=eq." + tenant.id, {
          method: "PATCH",
          body: JSON.stringify(row),
        });
      else
        await db("bolt_coupons", {
          method: "POST",
          body: JSON.stringify({
            id,
            ...row,
            uses: integer(c.used || 0, 0, 1000000),
          }),
        });
      if (c.loyaltyPhone) {
        const phone = normalizePhone(c.loyaltyPhone);
        if (!phone) fail(400, "WhatsApp da recompensa inválido.");
        const old = await db(
          "bolt_audit_events?id=eq." +
            id +
            "&tenant_id=eq." +
            tenant.id +
            "&event_type=eq.buy_reward&select=id",
        );
        await db(
          "bolt_audit_events" +
            (old.length ? "?id=eq." + id + "&tenant_id=eq." + tenant.id : ""),
          {
            method: old.length ? "PATCH" : "POST",
            body: JSON.stringify(
              old.length
                ? { details: { phone } }
                : {
                    id,
                    tenant_id: tenant.id,
                    event_type: "buy_reward",
                    details: { phone },
                  },
            ),
          },
        );
      }
      if (c.loyaltyPhone) {
        row.active = c.active !== false;
        await db("bolt_coupons?id=eq." + id + "&tenant_id=eq." + tenant.id, {
          method: "PATCH",
          body: JSON.stringify({ active: row.active }),
        });
      }
      return json(200, {
        ok: true,
        coupon: {
          ...couponView({ ...existing, ...row, id, uses: existing?.uses || 0 }),
          ...(c.loyaltyPhone ? { loyaltyPhone: c.loyaltyPhone } : {}),
        },
      });
    }
    if (action === "coupon-check" && request.method === "POST") {
      const rows = await db(
          "bolt_coupons?tenant_id=eq." +
            tenant.id +
            "&code=eq." +
            encodeURIComponent(clean(body.code, 24).toUpperCase()) +
            "&select=*",
        ),
        c = rows[0];
      if (
        !c ||
        !c.active ||
        (c.expires_at && new Date(c.expires_at) < new Date()) ||
        (c.max_uses > 0 && Number(c.uses) >= c.max_uses)
      )
        fail(400, "Cupom inválido ou indisponível.");
      await couponAccess(c, body.phone);
      return json(200, { ok: true, coupon: couponView(c) });
    }
    if (action === "public" && request.method === "GET")
      return json(200, {
        ok: true,
        config,
        availability: availability(config),
        serverTime: new Date().toISOString(),
      });
    if (action === "admin" && request.method === "GET") {
      await member();
      return json(200, {
        ok: true,
        config,
        version: snapshot?.updated_at || null,
      });
    }
    if (action === "configure" && request.method === "POST") {
      await member("products", true);
      if ((body.version || null) !== (snapshot?.updated_at || null))
        fail(
          409,
          "As configurações mudaram em outra sessão. Recarregue antes de salvar.",
        );
      let next;
      try {
        next = normalizeConfig(body.config, slug === "salgaditos");
      } catch (e) {
        fail(400, e.message);
      }
      const catalog = await products();
      if (
        next.combos.some((c) =>
          c.productIds.some((id) => !catalog.some((p) => p.id === id)),
        )
      )
        fail(400, "Um sabor não pertence a esta loja.");
      const row = {
        settings: { ...snapshot?.settings, commerce: next },
        updated_at: new Date().toISOString(),
      };
      let saved;
      if (snapshot)
        saved = await db(
          "bolt_delivery_storefronts?tenant_id=eq." +
            tenant.id +
            "&updated_at=eq." +
            encodeURIComponent(snapshot.updated_at),
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(row),
          },
        );
      else
        saved = await db("bolt_delivery_storefronts", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ tenant_id: tenant.id, ...row }),
        });
      if (!saved?.length)
        fail(409, "As configurações mudaram. Recarregue antes de salvar.");
      return json(200, {
        ok: true,
        config: next,
        version: saved[0].updated_at,
      });
    }
    if (action === "order" && request.method === "POST") {
      if (!availability(config).open)
        fail(
          409,
          "A loja está fechada. Aguarde o próximo horário de atendimento.",
        );
      if (!UUID.test(body.requestId))
        fail(400, "Identificador do pedido inválido.");
      const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            secret + "|" + tenant.id + "|" + body.requestId,
          ),
        ),
        hex = [...new Uint8Array(digest)]
          .slice(0, 16)
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
      const existing = await db(
        "bolt_orders?id=eq." + id + "&tenant_id=eq." + tenant.id + "&select=*",
      );
      if (existing.length) {
        if (existing[0].status === "criando")
          fail(
            409,
            "Pedido em processamento. Aguarde alguns segundos e tente novamente.",
          );
        return json(200, {
          ok: true,
          receipt: await receipt(existing[0]),
          order: await orderProjection(existing[0]),
        });
      }
      const customer = clean(body.customer, 120),
        phone = normalizePhone(body.phone),
        mode = body.mode === "retirada" ? "retirada" : "delivery",
        address = mode === "delivery" ? clean(body.address, 500) : "";
      if (!customer || !phone || (mode === "delivery" && !address))
        fail(400, "Confira nome, WhatsApp e endereço.");
      if (!["PIX", "Dinheiro", "Cartão na entrega"].includes(body.payment))
        fail(400, "Forma de pagamento inválida.");
      if (body.payment === "PIX" && !config.pixKey)
        fail(400, "O Pix ainda não foi configurado pela loja.");
      let items;
      try {
        items = pricedItems(config, await products(), body.items);
      } catch (e) {
        fail(400, e.message);
      }
      const subtotal = subtotalOf(items),
        fee = mode === "delivery" ? config.deliveryFee : 0;
      let discount = 0,
        couponId = null,
        couponReservation = null,
        reservedCoupon = null;
      if (body.coupon) {
        const coupons = await db(
            "bolt_coupons?tenant_id=eq." +
              tenant.id +
              "&code=eq." +
              encodeURIComponent(clean(body.coupon, 24).toUpperCase()) +
              "&select=*",
          ),
          coupon = coupons[0];
        if (
          !coupon ||
          !coupon.active ||
          (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) ||
          Number(coupon.minimum_order) > subtotal
        )
          fail(400, "Cupom inválido ou indisponível.");
        if (coupon.max_uses > 0) {
          const used = await db(
            "bolt_orders?tenant_id=eq." +
              tenant.id +
              "&coupon_id=eq." +
              coupon.id +
              "&status=neq.cancelado&select=id",
          );
          const usedCount = Math.max(used.length, Number(coupon.uses || 0));
          if (usedCount >= coupon.max_uses)
            fail(400, "Este cupom atingiu o limite de usos.");
          couponReservation = {
            id: coupon.id,
            previous: Number(coupon.uses || 0),
            next: usedCount + 1,
          };
        }
        await couponAccess(coupon, phone);
        couponId = coupon.id;
        discount = Math.min(
          subtotal,
          Math.round(
            (coupon.kind === "percent"
              ? (subtotal * Number(coupon.amount)) / 100
              : Number(coupon.amount)) * 100,
          ) / 100,
        );
      }
      const order = {
        id,
        tenant_id: tenant.id,
        customer_name: customer,
        customer_phone: phone,
        delivery_address: address,
        status: "criando",
        subtotal,
        delivery_fee: fee,
        discount,
        total: Math.round((subtotal + fee - discount) * 100) / 100,
        coupon_id: couponId,
      };
      await db("bolt_orders", { method: "POST", body: JSON.stringify(order) });
      try {
        if (couponReservation) {
          const c = couponReservation,
            rows = await db(
              "bolt_coupons?id=eq." +
                c.id +
                "&tenant_id=eq." +
                tenant.id +
                "&uses=eq." +
                c.previous,
              {
                method: "PATCH",
                headers: { Prefer: "return=representation" },
                body: JSON.stringify({ uses: c.next }),
              },
            );
          if (!rows.length)
            fail(409, "Este cupom foi atualizado. Tente novamente.");
          reservedCoupon = c;
        }
        await db("bolt_order_items", {
          method: "POST",
          body: JSON.stringify(
            items.map((i) => ({
              order_id: id,
              product_id: i.productId,
              product_name: i.name,
              quantity: i.qty,
              unit_price: i.price,
            })),
          ),
        });
        await db("bolt_audit_events", {
          method: "POST",
          body: JSON.stringify({
            id,
            tenant_id: tenant.id,
            event_type: "buy_order",
            details: {
              mode,
              payment: body.payment,
              selections: items
                .filter((i) => i.comboId)
                .map((i) => ({
                  comboId: i.comboId,
                  selections: i.selections,
                  qty: i.qty,
                })),
            },
          }),
        });
        const saved = await db(
          "bolt_orders?id=eq." +
            id +
            "&tenant_id=eq." +
            tenant.id +
            "&status=eq.criando",
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ status: "recebido" }),
          },
        );
        return json(200, {
          ok: true,
          receipt: await receipt(saved[0]),
          order: await orderProjection(saved[0]),
        });
      } catch (error) {
        const removed = await db(
          "bolt_orders?id=eq." +
            id +
            "&tenant_id=eq." +
            tenant.id +
            "&status=eq.criando",
          { method: "DELETE", headers: { Prefer: "return=representation" } },
        ).catch(() => []);
        if (removed?.length && reservedCoupon)
          await db(
            "bolt_coupons?id=eq." +
              reservedCoupon.id +
              "&tenant_id=eq." +
              tenant.id +
              "&uses=eq." +
              reservedCoupon.next,
            {
              method: "PATCH",
              body: JSON.stringify({ uses: reservedCoupon.previous }),
            },
          ).catch(() => {});
        throw error;
      }
    }
    if (action === "track" && request.method === "POST") {
      let token;
      try {
        token = JSON.parse(
          await unseal(body.token || "", secret, "buy-receipt"),
        );
      } catch {
        fail(403, "Acesso ao pedido inválido.");
      }
      if (token.tenant !== tenant.id || token.expires < Date.now())
        fail(403, "Acesso ao pedido expirado.");
      const orders = await db(
        "bolt_orders?id=eq." +
          token.id +
          "&tenant_id=eq." +
          tenant.id +
          "&select=*",
      );
      if (!orders.length) fail(404, "Pedido não encontrado.");
      return json(200, {
        ok: true,
        order: await orderProjection(orders[0]),
        receipt: await receipt(orders[0]),
      });
    }
    if (action === "orders" && request.method === "GET") {
      await member("orders");
      const orders = await db(
        "bolt_orders?tenant_id=eq." +
          tenant.id +
          "&status=neq.criando&select=*&order=created_at.desc&limit=100",
      );
      if (!orders.length) return json(200, { ok: true, orders: [] });
      const ids = orders.map((o) => o.id).join(","),
        items = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const rows = await db(
          "bolt_order_items?order_id=in.(" +
            ids +
            ")&select=order_id,product_id,product_name,quantity,unit_price&order=id&limit=1000&offset=" +
            offset,
        );
        items.push(...rows);
        if (rows.length < 1000) break;
      }
      const meta = await db(
        "bolt_audit_events?tenant_id=eq." +
          tenant.id +
          "&id=in.(" +
          ids +
          ")&event_type=eq.buy_order&select=id,details",
      );
      return json(200, {
        ok: true,
        orders: await Promise.all(
          orders.map((order) =>
            orderProjection(order, [
              items.filter((i) => i.order_id === order.id),
              meta.filter((m) => m.id === order.id),
            ]),
          ),
        ),
      });
    }
    if (action === "status" && request.method === "POST") {
      await member("orders");
      if (
        !UUID.test(body.id) ||
        ![
          "recebido",
          "confirmado",
          "preparo",
          "pronto",
          "entrega",
          "entregue",
          "concluido",
          "cancelado",
        ].includes(body.status)
      )
        fail(400, "Situação inválida.");
      const rows = await db(
        "bolt_orders?id=eq." +
          body.id +
          "&tenant_id=eq." +
          tenant.id +
          "&status=neq.criando",
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status: body.status }),
        },
      );
      if (!rows.length) fail(404, "Pedido não encontrado.");
      return json(200, { ok: true, order: await orderProjection(rows[0]) });
    }
    if (action === "quotes" && request.method === "GET") {
      await member("pdv");
      return json(200, {
        ok: true,
        quotes: await db(
          "bolt_audit_events?tenant_id=eq." +
            tenant.id +
            "&event_type=eq.buy_quote&select=id,details,created_at&order=created_at.desc&limit=100",
        ),
      });
    }
    if (action === "quote-save" && request.method === "POST") {
      await member("pdv");
      const v = body.quote || {};
      if (
        !UUID.test(v.id) ||
        !clean(v.customer) ||
        !Array.isArray(v.items) ||
        !v.items.length ||
        v.items.length > 100
      )
        fail(400, "Preencha o cliente e os itens do orçamento.");
      let items;
      try {
        items = v.items.map((i) => ({
          name: clean(i.name, 300),
          qty: integer(i.qty, 1, 10000),
          price: moneyValue(i.price),
        }));
        if (items.some((i) => !i.name)) throw Error("Descreva todos os itens.");
      } catch (e) {
        fail(400, e.message);
      }
      const quote = {
        id: v.id,
        customer: clean(v.customer, 120),
        phone: clean(v.phone, 30),
        event: clean(v.event, 160),
        notes: clean(v.notes, 2000),
        validUntil: clean(v.validUntil, 10),
        items,
        total: subtotalOf(items),
        showPrices: v.showPrices === true,
        date: new Date().toISOString(),
      };
      const old = await db(
        "bolt_audit_events?id=eq." + v.id + "&select=tenant_id,event_type",
      );
      if (
        old.length &&
        (old[0].tenant_id !== tenant.id || old[0].event_type !== "buy_quote")
      )
        fail(403, "Orçamento não autorizado.");
      await db(
        "bolt_audit_events" +
          (old.length ? "?id=eq." + v.id + "&tenant_id=eq." + tenant.id : ""),
        {
          method: old.length ? "PATCH" : "POST",
          body: JSON.stringify(
            old.length
              ? { details: quote }
              : {
                  id: v.id,
                  tenant_id: tenant.id,
                  actor_id: actor.id,
                  event_type: "buy_quote",
                  details: quote,
                },
          ),
        },
      );
      return json(200, { ok: true, quote });
    }
    fail(400, "Ação inválida.");
  } catch (e) {
    return json(e.status || 500, {
      ok: false,
      error: e.status
        ? e.message
        : "Não foi possível concluir. Tente novamente.",
    });
  }
}
