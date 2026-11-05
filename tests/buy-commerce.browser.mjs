import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  normalizeConfig,
  availability,
  pricedItems,
  subtotalOf,
} from "../SITE/Salgaditos/buy-model.js";
import { pixPayload } from "../server/school-life-model.js";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOLT_TEST_CHROMIUM
    ? {
        executablePath: process.env.BOLT_TEST_CHROMIUM,
        args: [
          "--no-sandbox",
          "--no-zygote",
          "--single-process",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      }
    : {}),
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
      reducedMotion: "reduce",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = fileURLToPath(new URL("../SITE/", import.meta.url)),
    tenantId = "10000000-0000-4000-a000-000000000001",
    p1 = "20000000-0000-4000-a000-000000000001",
    p2 = "20000000-0000-4000-a000-000000000002";
  const products = [
    {
      id: p1,
      name: "Coxinha",
      price: 2,
      active: true,
      category: "Salgados",
      image_url: "https://bolt.test/Salgaditos/assets/coxinha-adesivo.svg",
      emoji: "◇",
    },
    {
      id: p2,
      name: "Carne",
      price: 3,
      active: true,
      category: "Salgados",
      image_url: "https://bolt.test/Salgaditos/assets/coxinha-adesivo.svg",
      emoji: "◇",
    },
  ];
  let config = normalizeConfig({}, true),
    version = "v1",
    quotes = [],
    orders = [],
    postedOrder;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/buy-commerce") {
      const body =
          route.request().method() === "POST"
            ? route.request().postDataJSON()
            : null,
        action = body?.action || url.searchParams.get("action");
      if (action === "admin")
        return route.fulfill({ json: { ok: true, config, version } });
      if (action === "configure") {
        config = normalizeConfig(body.config, true);
        version += "x";
        return route.fulfill({ json: { ok: true, config, version } });
      }
      if (action === "public")
        return route.fulfill({
          json: {
            ok: true,
            config,
            availability: availability(config),
            serverTime: new Date().toISOString(),
          },
        });
      if (action === "coupons")
        return route.fulfill({ json: { ok: true, coupons: [] } });
      if (action === "quotes")
        return route.fulfill({ json: { ok: true, quotes } });
      if (action === "quote-save") {
        const quote = {
          ...body.quote,
          total: subtotalOf(body.quote.items),
          date: new Date().toISOString(),
        };
        quotes = [{ id: quote.id, details: quote }];
        return route.fulfill({ json: { ok: true, quote } });
      }
      if (action === "orders")
        return route.fulfill({ json: { ok: true, orders } });
      if (action === "order") {
        postedOrder = body;
        if (!availability(config).open)
          return route.fulfill({
            status: 409,
            json: { error: "Loja fechada" },
          });
        const items = pricedItems(config, products, body.items),
          id = "30000000-0000-4000-a000-000000000001",
          subtotal = subtotalOf(items),
          fee = body.mode === "delivery" ? config.deliveryFee : 0;
        const order = {
          id,
          customer: body.customer,
          phone: body.phone,
          address: body.address,
          date: new Date().toISOString(),
          mode: body.mode,
          payment: body.payment,
          channel: "Site",
          cloud: true,
          status: "recebido",
          items: items.map((i) => ({ ...i, id: i.productId })),
          subtotal,
          fee,
          discount: 0,
        };
        orders = [order];
        const total = subtotal + fee,
          receipt = {
            id,
            total,
            token: "private-receipt",
            pix: pixPayload(
              {
                key: config.pixKey,
                receiver: config.pixName,
                city: config.pixCity,
              },
              { id, amount: total },
            ),
            pixKey: config.pixKey,
            whatsapp: config.whatsapp,
          };
        return route.fulfill({ json: { ok: true, order, receipt } });
      }
      if (action === "track")
        return route.fulfill({
          json: {
            ok: true,
            order: orders[0],
            receipt: {
              id: orders[0].id,
              total: orders[0].subtotal + orders[0].fee,
              token: "private-receipt",
              pixKey: config.pixKey,
              whatsapp: config.whatsapp,
            },
          },
        });
      if (action === "status") {
        orders[0].status = body.status;
        return route.fulfill({ json: { ok: true, order: orders[0] } });
      }
      throw Error(action);
    }
    if (url.pathname === "/api/platform")
      return route.fulfill({ json: { features: null } });
    if (url.pathname === "/bolt-auth.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: 'document.documentElement.classList.remove("bolt-locked");',
      });
    if (url.pathname === "/bolt-shell.js")
      return route.fulfill({ contentType: "application/javascript", body: "" });
    if (url.hostname === "cdn.jsdelivr.net") {
      const data = {
        bolt_tenants: {
          id: tenantId,
          name: "Salgaditos",
          slug: "salgaditos",
          primary_color: "#c52a30",
          background_color: "#06172b",
          logo_url: "https://bolt.test/Salgaditos/assets/logo-transparente.png",
        },
        bolt_products: products,
        bolt_delivery_storefronts: { settings: {} },
      };
      return route.fulfill({
        contentType: "application/javascript",
        body: `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'owner',user:{id:'owner'}}}})},from:table=>{let single=false;const query={select:()=>query,eq:()=>query,order:()=>query,single:()=>{single=true;return query},maybeSingle:()=>{single=true;return query},then:(resolve,reject)=>Promise.resolve({data:${JSON.stringify(data)}[table]||(single?null:[]),error:null}).then(resolve,reject)};return query}})};window.BOLT_SUPABASE=window.supabase.createClient();`,
      });
    }
    const file = base + decodeURIComponent(url.pathname).slice(1);
    if (existsSync(file))
      return route.fulfill({
        contentType: file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".png")
              ? "image/png"
              : file.endsWith(".svg")
                ? "image/svg+xml"
                : "text/html",
        body: readFileSync(file),
      });
    return route.abort();
  });
  await page.goto("https://bolt.test/Salgaditos/admin.html?tenant=salgaditos");
  await page.locator("#nav [data-page=buy-combos]").click();
  await page.locator("#buy-combo-form").waitFor();
  await page
    .locator("#buy-combo-form [name=name]")
    .fill("Combo 15 mini salgados");
  await page.locator("#buy-combo-form [name=price]").fill("15");
  await page.locator("#buy-combo-form [name=mode]").selectOption("mixed");
  await page
    .locator(`#buy-combo-form [name=productIds][value="${p1}"]`)
    .check();
  await page
    .locator(`#buy-combo-form [name=productIds][value="${p2}"]`)
    .check();
  await page.getByRole("button", { name: "Salvar combo", exact: true }).click();
  await page.getByText("Combo salvo e publicado no cardápio.").waitFor();
  assert.equal(config.combos.length, 1);
  await page.locator("#nav [data-page=buy-service]").click();
  for (const [key, value] of Object.entries({
    whatsapp: "62999999999",
    pixKey: "pix@example.test",
    pixName: "Salgaditos",
    pixCity: "Inhumas",
    deliveryFee: "7",
  }))
    await page.locator(`#buy-service-form [name=${key}]`).fill(value);
  await page.getByRole("button", { name: "Salvar atendimento e Pix" }).click();
  await page.getByText("Atendimento, frete e Pix salvos no sistema.").waitFor();
  await page.locator("#buy-service-form [name=hoursEnabled]").check();
  for (let i = 0; i < 7; i++) {
    await page.locator("#buy-service-form [name=day" + i + "]").check();
    await page.locator("#buy-service-form [name=open" + i + "]").fill("00:00");
    await page.locator("#buy-service-form [name=close" + i + "]").fill("23:59");
  }
  await page.getByRole("button", { name: "Salvar atendimento e Pix" }).click();
  await page.waitForTimeout(100);
  assert.equal(config.hours.enabled, true);
  assert.equal(config.hours.days[1].open, "00:00");
  await page.locator("#nav [data-page=buy-quotes]").click();
  await page
    .locator("#buy-quote-form [name=customer]")
    .fill("Cliente de exemplo");
  await page
    .locator("#buy-quote-form [name=event]")
    .fill("Evento para 30 pessoas - 14/11/2026 às 19h");
  await page
    .locator("#buy-quote-product")
    .selectOption("combo:" + config.combos[0].id);
  await page.locator(`[data-flavor="${p1}"]`).fill("10");
  await page.locator(`[data-flavor="${p2}"]`).fill("5");
  await page.locator("#buy-combo-picker [type=submit]").click();
  await page.locator('[data-qi="0"][data-field=qty]').fill("10");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar e exportar PDF" }).click();
  const download = await downloadPromise;
  await download.saveAs("/tmp/buy-browser-quote.pdf");
  assert.equal(quotes[0].details.total, 150);
  assert.equal(quotes[0].details.showPrices, false);
  await page.screenshot({ path: "/tmp/buy-admin-quotes.png", fullPage: true });
  await page.goto(
    "https://bolt.test/Salgaditos/cliente.html?tenant=salgaditos",
  );
  await page.locator("#buy-shop-combos [data-open-combo]").waitFor();
  await page.waitForTimeout(3000);
  await page.locator("[data-open-combo]").click();
  assert.equal(await page.locator(".buy-flavor img").count(), 2);
  await page.locator(`[data-flavor="${p1}"]`).fill("10");
  assert.equal(
    await page.locator("#buy-combo-picker [type=submit]").isDisabled(),
    true,
  );
  await page.locator(`[data-flavor="${p2}"]`).fill("5");
  await page.locator("#buy-combo-picker [type=submit]").click();
  await page.locator(".bottomnav [data-view=cart]").click();
  for (const [id, value] of Object.entries({
    customer: "Ana",
    phone: "62999999999",
    address: "Rua 1, 10",
  }))
    await page.locator("#" + id).fill(value);
  assert.equal(
    await page.locator("#buy-pix textarea").inputValue(),
    "pix@example.test",
  );
  await page.locator("#checkout button").click();
  await page.locator("#ordersView .buy-pix").waitFor();
  assert.equal(postedOrder.items[0].selections[0].quantity, 10);
  assert.equal(postedOrder.items[0].selections[1].quantity, 5);
  assert.equal(orders[0].subtotal, 15);
  assert.equal(orders[0].fee, 7);
  assert.match(
    await page.locator("#ordersView .buy-pix a").getAttribute("href"),
    /wa.me\/5562999999999/,
  );
  assert.match(
    await page.locator("#ordersView .buy-pix textarea").inputValue(),
    /^000201/,
  );
  await page.screenshot({ path: "/tmp/buy-shop-pix.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".bottomnav [data-view=home]").click();
  await page.screenshot({ path: "/tmp/buy-shop-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator("[data-open-combo]").click();
  await page.screenshot({ path: "/tmp/buy-combo-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator("[data-close]").click();
  config.combos[0].mode = "single";
  config.combos[0].maxFlavors = 1;
  config.combos[0].productIds = [p2];
  await page.reload();
  await page.locator("[data-open-combo]").waitFor();
  await page.waitForTimeout(2600);
  await page.locator("[data-open-combo]").click();
  assert.equal(
    await page.locator("#buy-combo-picker [type=submit]").isDisabled(),
    true,
  );
  await page.locator("#buy-combo-picker input[type=radio]").check();
  await page.locator("#buy-combo-picker [type=submit]").click();
  await page.locator(".bottomnav [data-view=cart]").click();
  await page.getByText("15× Carne", { exact: false }).first().waitFor();
  config.hours.paused = true;
  await page.reload();
  await page.locator("#buy-store-status[data-open=false]").waitFor();
  await page.locator(".bottomnav [data-view=cart]").click();
  assert.equal(await page.locator("#checkout button").isDisabled(), true);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("https://bolt.test/Salgaditos/admin.html?tenant=salgaditos");
  await page.locator("#nav [data-page=orders]").click();
  await page.getByText("15×", { exact: false }).count();
  await page.locator("#ordersList select").first().selectOption("preparo");
  await page.waitForTimeout(100);
  assert.equal(orders[0].status, "preparo");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: combo creation and photos, mixed quantities, quote save and PDF download, Pix copy field and WhatsApp link, authoritative online order, admin status, closed checkout and mobile layout.",
  );
} finally {
  await browser.close();
}
