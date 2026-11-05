import { normalizeConfig, availability, subtotalOf } from "./buy-model.js";
import { quotePDF } from "./buy-quote-pdf.js";
const admin = location.pathname.endsWith("admin.html"),
  slug = new URLSearchParams(location.search).get("tenant") || "salgaditos";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const amount = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
let checkoutBusy = false,
  adminDirty = false,
  configError = "";
let config = null,
  version = null,
  loading = false,
  serverOffset = 0,
  quoteItems = [],
  quoteId = crypto.randomUUID(),
  lastReceipt = null;
const comboCart = new Map(),
  receiptsKey = "bolt_buy_receipts_" + slug;
let receipts = {};
try {
  receipts = JSON.parse(localStorage.getItem(receiptsKey) || "{}");
} catch {}
async function api(action, body, authenticated = false) {
  const session = authenticated
    ? (await window.BOLT_SUPABASE?.auth.getSession())?.data?.session
    : null;
  const r = await fetch(
    "/api/buy-commerce?tenant=" +
      encodeURIComponent(slug) +
      (body ? "" : "&action=" + action),
    {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(session ? { authorization: "Bearer " + session.access_token } : {}),
      },
      ...(body ? { body: JSON.stringify({ ...body, action }) } : {}),
    },
  );
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "Não foi possível concluir.");
  return result;
}
const catalog = () => load().products || [];
const image = (p) => p.photo || p.image_url || "";
const photo = (p) =>
  image(p)
    ? `<img src="${esc(image(p))}" alt="" loading="lazy">`
    : '<span aria-hidden="true">◇</span>';
const message = (id, text) => {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = text;
    if (text) node.scrollIntoView?.({ block: "nearest" });
  }
};
async function saveConfig(next) {
  const result = await api("configure", { config: next, version }, true);
  config = result.config;
  version = result.version;
  const local = load();
  if (local.fee !== config.deliveryFee) {
    local.fee = config.deliveryFee;
    save(local);
  }
  return config;
}
const sessionReady = () =>
  !document.documentElement.classList.contains("bolt-locked");
function mergeOrders(orders) {
  const d = load();
  let changed = false;
  for (const o of orders) {
    const old = d.orders.findIndex((x) => x.id === o.id);
    if (old < 0) {
      d.orders.push(o);
      changed = true;
    } else if (JSON.stringify(d.orders[old]) !== JSON.stringify(o)) {
      d.orders[old] = o;
      changed = true;
    }
  }
  if (changed) save(d);
}
function pickCombo(combo, done) {
  const products = catalog().filter(
    (p) => p.active && combo.productIds.includes(p.id),
  );
  if (!products.length) {
    notify("Os sabores deste combo estão indisponíveis.");
    return;
  }
  document.getElementById("buy-combo-picker")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "buy-combo-picker";
  dialog.className = "buy-dialog";
  dialog.innerHTML = `<form><header><div><small>MONTE DO SEU JEITO</small><h2>${esc(combo.name)}</h2></div><button type="button" data-close aria-label="Fechar">×</button></header><p>${esc(combo.description)}</p><p>${combo.mode === "single" ? `Escolha um sabor para as ${combo.units} unidades.` : `Distribua ${combo.units} unidades entre até ${combo.maxFlavors} sabores.`}</p><div class="buy-flavors">${products.map((p) => `<label class="buy-flavor">${photo(p)}<strong>${esc(p.name)}</strong>${combo.mode === "single" ? `<input type="radio" name="flavor" value="${esc(p.id)}" required>` : `<input type="number" min="0" max="${combo.units}" step="1" value="0" data-flavor="${esc(p.id)}" aria-label="Quantidade de ${esc(p.name)}">`}</label>`).join("")}</div><p data-count role="status"></p><button class="btn red full" type="submit" disabled>Adicionar · ${amount(combo.price)}</button></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form"),
    submit = form.querySelector("[type=submit]");
  let choices = [];
  function update() {
    choices =
      combo.mode === "single"
        ? form.querySelector('[name="flavor"]:checked')?.value
          ? [
              {
                productId: form.querySelector("[name=flavor]:checked").value,
                quantity: combo.units,
              },
            ]
          : []
        : [...form.querySelectorAll("[data-flavor]")]
            .filter((i) => Number(i.value) > 0)
            .map((i) => ({
              productId: i.dataset.flavor,
              quantity: Number(i.value),
            }));
    const count = choices.reduce((s, x) => s + x.quantity, 0);
    submit.disabled =
      count !== combo.units ||
      !choices.length ||
      choices.length > combo.maxFlavors ||
      choices.some((x) => !Number.isInteger(x.quantity));
    dialog.querySelector("[data-count]").textContent =
      `${count} de ${combo.units} unidades selecionadas` +
      (choices.length > combo.maxFlavors
        ? " · reduza a quantidade de sabores"
        : "");
  }
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.onsubmit = (e) => {
    e.preventDefault();
    update();
    if (submit.disabled) return;
    done(choices, products);
    dialog.close();
  };
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  update();
}
function comboProduct(c, selections, products) {
  return {
    id: "combo_" + crypto.randomUUID(),
    name:
      c.name +
      " · " +
      selections
        .map(
          (s) =>
            `${s.quantity}× ${products.find((p) => p.id === s.productId)?.name || ""}`,
        )
        .join(", "),
    price: c.price,
    emoji: "◇",
    photo: image(products.find((p) => p.id === selections[0]?.productId) || {}),
    active: true,
    comboId: c.id,
    selections,
  };
}
function configSections() {
  const main = document.querySelector("main");
  for (const [id, title, icon] of [
    ["buy-combos", "Combos", "◇"],
    ["buy-quotes", "Orçamentos", "▤"],
    ["buy-service", "Atendimento e Pix", "◷"],
  ]) {
    navItems.push([id, icon, title]);
    const section = document.createElement("section");
    section.id = id;
    section.className = "page hide buy-admin-page";
    section.innerHTML = `<div class="panel"><h2>${title}</h2><p>Carregando configurações da loja…</p></div>`;
    main.append(section);
    for (const navId of ["nav", "mobileNav"]) {
      const node = document.getElementById(navId);
      if (!node) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = navId === "nav" ? "nav" : "btn small";
      button.dataset.page = id;
      button.innerHTML = `<span>${icon}</span><span class="label">${title}</span>`;
      button.onclick = () => window.showPage(id);
      node.append(button);
    }
  }
  const ordersStatus = document.createElement("p");
  ordersStatus.id = "buy-orders-status";
  ordersStatus.setAttribute("role", "status");
  document.getElementById("ordersList")?.before(ordersStatus);
  const previous = window.showPage;
  window.showPage = function (id, ...args) {
    const value = previous.call(this, id, ...args);
    if (id === "orders") void refreshOrders();
    return value;
  };
}
function renderAdmin() {
  const combos = document.getElementById("buy-combos");
  combos.innerHTML = `<section class="panel"><h2>Combos com escolha de sabores</h2><p class="hint">Defina o preço do pacote. O cliente vê as fotos e escolhe um sabor ou distribui as unidades.</p><form id="buy-combo-form" class="formgrid"><input name="id" type="hidden"><label class="field">Nome<input name="name" required maxlength="100" placeholder="Combo de 15 mini salgados"></label><label class="field">Preço do combo<input name="price" type="number" min="0" step=".01" required></label><label class="field">Unidades por combo<input name="units" type="number" min="1" max="1000" value="15" required></label><label class="field">Escolha dos sabores<select name="mode"><option value="single">Um sabor para o pacote inteiro</option><option value="mixed">Misturar sabores</option></select></label><label class="field">Máximo de sabores diferentes<input name="maxFlavors" type="number" min="1" max="100" value="1" required></label><label class="field">Descrição<input name="description" maxlength="600"></label><fieldset class="buy-span"><legend>Produtos / sabores disponíveis no combo</legend><div class="buy-product-checks">${
    catalog()
      .map(
        (p) =>
          `<label>${photo(p)}<span>${esc(p.name)}</span><input name="productIds" type="checkbox" value="${esc(p.id)}"></label>`,
      )
      .join("") ||
    "<p>Cadastre os produtos e suas fotos primeiro na aba Produtos.</p>"
  }</div></fieldset><label class="buy-span"><input name="active" type="checkbox" checked> Disponível no shop</label><div class="buy-span actions"><button class="btn red" type="submit">Salvar combo</button><button class="btn" type="reset">Novo / limpar</button></div><p id="buy-combo-message" class="buy-span" role="status"></p></form></section><section class="panel"><h3>Combos cadastrados</h3><div id="buy-combo-list"></div></section>`;
  renderComboList();
  const form = document.getElementById("buy-combo-form");
  form.elements.mode.onchange = () => {
    form.elements.maxFlavors.value =
      form.elements.mode.value === "single"
        ? 1
        : Math.min(
            Number(form.elements.units.value) || 15,
            catalog().length || 15,
            100,
          );
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const fd = new FormData(form),
        combo = {
          ...Object.fromEntries(fd),
          id: fd.get("id") || crypto.randomUUID(),
          productIds: fd.getAll("productIds"),
          active: fd.has("active"),
        };
      const next = normalizeConfig({
        ...config,
        combos: [...config.combos.filter((c) => c.id !== combo.id), combo],
      });
      await saveConfig(next);
      renderComboList();
      form.reset();
      message("buy-combo-message", "Combo salvo e publicado no cardápio.");
    } catch (error) {
      message("buy-combo-message", error.message);
    } finally {
      b.disabled = false;
    }
  };
  document.getElementById("buy-service").innerHTML =
    `<section class="panel"><h2>Atendimento da loja</h2><form id="buy-service-form" class="formgrid"><label class="buy-span"><input name="hoursEnabled" type="checkbox" ${config.hours.enabled ? "checked" : ""}> Usar dias e horários abaixo para aceitar pedidos</label><label class="buy-span"><input name="paused" type="checkbox" ${config.hours.paused ? "checked" : ""}> Pausar pedidos agora (loja fechada)</label><label class="field">Fuso horário<select name="timeZone">${["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Rio_Branco", "America/Noronha"].map((zone) => `<option ${config.hours.timeZone === zone ? "selected" : ""}>${zone}</option>`).join("")}</select></label><div class="buy-hours buy-span">${["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((name, i) => `<div><label><input name="day${i}" type="checkbox" ${config.hours.days[i].enabled ? "checked" : ""}> ${name}</label><input name="open${i}" type="time" value="${config.hours.days[i].open}" aria-label="Abertura ${name}"><span>até</span><input name="close${i}" type="time" value="${config.hours.days[i].close}" aria-label="Fechamento ${name}"></div>`).join("")}</div><p class="hint buy-span">Se o fechamento for antes da abertura, o atendimento termina no dia seguinte. Sem a opção de horários marcada, a loja aceita pedidos a qualquer hora, exceto quando pausada.</p><label class="field">Frete padrão (R$)<input name="deliveryFee" type="number" min="0" step=".01" value="${config.deliveryFee}" required></label><label class="field">WhatsApp da loja com DDD<input name="whatsapp" value="${esc(config.whatsapp)}" placeholder="62999999999"></label><h3 class="buy-span">Pix da loja</h3><label class="field">Chave Pix<input name="pixKey" value="${esc(config.pixKey)}" maxlength="77"></label><label class="field">Nome do recebedor<input name="pixName" value="${esc(config.pixName)}" maxlength="100"></label><label class="field">Cidade do recebedor<input name="pixCity" value="${esc(config.pixCity)}" maxlength="60"></label><button class="btn red" type="submit">Salvar atendimento e Pix</button><p id="buy-service-message" class="buy-span" role="status"></p></form></section>`;
  document.getElementById("buy-service-form").onsubmit = async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    try {
      const fd = new FormData(e.target),
        next = {
          ...config,
          ...Object.fromEntries(fd),
          hours: {
            enabled: fd.has("hoursEnabled"),
            paused: fd.has("paused"),
            timeZone: fd.get("timeZone"),
            days: config.hours.days.map((d, i) => ({
              enabled: fd.has("day" + i),
              open: fd.get("open" + i),
              close: fd.get("close" + i),
            })),
          },
        };
      if (next.pixKey && (!next.pixName || !next.pixCity || !next.whatsapp))
        throw Error(
          "Para habilitar Pix, informe recebedor, cidade e WhatsApp da loja.",
        );
      await saveConfig(next);
      message(
        "buy-service-message",
        "Atendimento, frete e Pix salvos no sistema.",
      );
    } catch (error) {
      message("buy-service-message", error.message);
    } finally {
      e.submitter.disabled = false;
    }
  };
  renderQuotes();
}
function refreshQuoteCatalog() {
  const select = document.getElementById("buy-quote-product");
  if (select)
    select.innerHTML =
      '<option value="">Escolha para adicionar</option>' +
      catalog()
        .filter((p) => p.active)
        .map(
          (p) =>
            `<option value="${p.id}">${esc(p.name)} · ${amount(p.price)}</option>`,
        )
        .join("") +
      (config?.combos || [])
        .filter((c) => c.active)
        .map(
          (c) =>
            `<option value="combo:${c.id}">${esc(c.name)} · ${amount(c.price)}</option>`,
        )
        .join("");
}
function renderComboList() {
  refreshQuoteCatalog();
  document.getElementById("buy-combo-list").innerHTML =
    config.combos
      .map(
        (c) =>
          `<article class="buy-admin-combo"><div><strong>${esc(c.name)}</strong><p>${c.units} unidades · ${amount(c.price)} · ${c.mode === "mixed" ? "Misturar sabores" : "Um sabor"} · ${c.active ? "Ativo" : "Oculto"}</p></div><button class="btn small" data-edit-combo="${c.id}">Editar</button></article>`,
      )
      .join("") || "<p>Nenhum combo cadastrado.</p>";
  document.querySelectorAll("[data-edit-combo]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = config.combos.find((x) => x.id === b.dataset.editCombo),
          f = document.getElementById("buy-combo-form");
        for (const key of [
          "id",
          "name",
          "price",
          "units",
          "mode",
          "maxFlavors",
          "description",
        ])
          f.elements[key].value = c[key];
        f.elements.active.checked = c.active;
        f.querySelectorAll("[name=productIds]").forEach(
          (i) => (i.checked = c.productIds.includes(i.value)),
        );
        f.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
  );
}
function renderQuotes() {
  document.getElementById("buy-quotes").innerHTML =
    `<section class="panel"><h2>Montar orçamento</h2><p class="hint">Selecione produtos e combos ou inclua itens personalizados. O orçamento é salvo antes da exportação em PDF A4.</p><form id="buy-quote-form" class="formgrid"><label class="field">Cliente<input name="customer" required maxlength="120"></label><label class="field">Contato<input name="phone" maxlength="30"></label><label class="field">Evento / data / local<input name="event" maxlength="160"></label><label class="field">Validade<input name="validUntil" type="date"></label><label class="field buy-span">Produto ou combo<select id="buy-quote-product"><option value="">Escolha para adicionar</option>${catalog()
      .filter((p) => p.active)
      .map(
        (p) =>
          `<option value="${p.id}">${esc(p.name)} · ${amount(p.price)}</option>`,
      )
      .join("")}${config.combos
      .filter((c) => c.active)
      .map(
        (c) =>
          `<option value="combo:${c.id}">${esc(c.name)} · ${amount(c.price)}</option>`,
      )
      .join(
        "",
      )}</select></label><div id="buy-quote-items" class="buy-span"></div><button type="button" class="btn" id="buy-quote-custom">Adicionar item personalizado</button><label class="buy-span"><input name="showPrices" type="checkbox"> Mostrar preço unitário e valor de cada item no PDF</label><label class="field buy-span">Observações e condições<textarea name="notes" maxlength="2000" placeholder="Condições de pagamento, entrega e demais informações."></textarea></label><div class="buy-span actions"><button class="btn red" type="submit">Salvar e exportar PDF</button><button class="btn" type="button" id="buy-quote-new">Novo orçamento</button></div><p id="buy-quote-message" class="buy-span" role="status"></p></form></section><section class="panel"><h3>Orçamentos salvos</h3><button class="btn small" id="buy-refresh-quotes">Atualizar lista</button><div id="buy-quote-history"></div></section>`;
  renderQuoteItems();
  document.getElementById("buy-quote-product").onchange = (e) => {
    const value = e.target.value;
    if (!value) return;
    if (value.startsWith("combo:")) {
      const c = config.combos.find((c) => c.id === value.slice(6));
      pickCombo(c, (s, ps) => {
        const p = comboProduct(c, s, ps);
        quoteItems.push({ name: p.name, qty: 1, price: p.price });
        renderQuoteItems();
      });
    } else {
      const p = catalog().find((p) => p.id === value);
      quoteItems.push({ name: p.name, qty: 1, price: p.price });
      renderQuoteItems();
    }
    e.target.value = "";
  };
  document.getElementById("buy-quote-custom").onclick = () => {
    quoteItems.push({ name: "", qty: 1, price: 0 });
    renderQuoteItems();
  };
  document.getElementById("buy-quote-new").onclick = () => {
    quoteId = crypto.randomUUID();
    quoteItems = [];
    document.getElementById("buy-quote-form").reset();
    renderQuoteItems();
  };
  document.getElementById("buy-quote-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    message("buy-quote-message", "Salvando orçamento…");
    try {
      const fd = new FormData(e.target),
        result = await api(
          "quote-save",
          {
            quote: {
              ...Object.fromEntries(fd),
              id: quoteId,
              items: quoteItems,
              showPrices: fd.has("showPrices"),
            },
          },
          true,
        );
      await exportQuote(result.quote);
      message("buy-quote-message", "Orçamento salvo. PDF exportado.");
      await refreshQuotes();
    } catch (error) {
      message("buy-quote-message", error.message);
    } finally {
      button.disabled = false;
    }
  };
  document.getElementById("buy-refresh-quotes").onclick = refreshQuotes;
  void refreshQuotes();
}
function renderQuoteItems() {
  const host = document.getElementById("buy-quote-items");
  host.innerHTML =
    quoteItems
      .map(
        (i, n) =>
          `<div class="buy-quote-line"><label>Descrição<input data-qi="${n}" data-field="name" value="${esc(i.name)}" required maxlength="300"></label><label>Qtd.<input data-qi="${n}" data-field="qty" type="number" min="1" max="10000" value="${i.qty}" required></label><label>Preço unitário<input data-qi="${n}" data-field="price" type="number" min="0" step=".01" value="${i.price}" required></label><button type="button" class="btn small" data-remove-qi="${n}" aria-label="Remover item ${n + 1}">×</button></div>`,
      )
      .join("") +
    '<p class="buy-quote-total">Total: <strong id="buy-quote-total">' +
    amount(subtotalOf(quoteItems)) +
    "</strong></p>";
  host.querySelectorAll("[data-qi]").forEach(
    (input) =>
      (input.oninput = () => {
        quoteItems[Number(input.dataset.qi)][input.dataset.field] =
          input.dataset.field === "name" ? input.value : Number(input.value);
        document.getElementById("buy-quote-total").textContent = amount(
          subtotalOf(quoteItems),
        );
      }),
  );
  host.querySelectorAll("[data-remove-qi]").forEach(
    (b) =>
      (b.onclick = () => {
        quoteItems.splice(Number(b.dataset.removeQi), 1);
        renderQuoteItems();
      }),
  );
}
async function logoJPEG() {
  const url = window.BOLT_TENANT?.logo;
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error()), 7000);
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(Error());
      };
      img.src = url;
    });
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 500 / img.width, 250 / img.height);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = window.BOLT_TENANT.primary || "#475569";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const raw = atob(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    };
  } catch {
    return null;
  }
}
async function exportQuote(quote) {
  const logo = await logoJPEG(),
    pdf = quotePDF(
      quote,
      {
        name: window.BOLT_TENANT?.name || "Loja",
        color: window.BOLT_TENANT?.primary,
        phone: config.whatsapp,
      },
      logo,
    ),
    url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" })),
    a = document.createElement("a");
  a.href = url;
  a.download =
    "Orcamento-" +
    quote.customer.replace(/[^a-z0-9]/gi, "-") +
    "-" +
    quote.id.slice(0, 8) +
    ".pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function refreshQuotes() {
  try {
    const result = await api("quotes", null, true),
      host = document.getElementById("buy-quote-history");
    host.innerHTML =
      result.quotes
        .map(
          (row) =>
            `<article class="buy-admin-combo"><div><strong>${esc(row.details.customer)}</strong><p>${amount(row.details.total)} · ${new Date(row.details.date).toLocaleDateString("pt-BR")}</p></div><button class="btn small" data-export-quote="${row.id}">Baixar PDF</button></article>`,
        )
        .join("") || "<p>Nenhum orçamento salvo.</p>";
    host.querySelectorAll("[data-export-quote]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await exportQuote(
              result.quotes.find((r) => r.id === b.dataset.exportQuote).details,
            );
          } catch (error) {
            notify(error.message);
          } finally {
            b.disabled = false;
          }
        }),
    );
  } catch (error) {
    message("buy-quote-history", error.message);
  }
}
async function syncCoupons() {
  const remote = await api("coupons", null, true),
    local = load().coupons || [],
    merged = [...remote.coupons];
  for (const coupon of local.filter(
    (c) => !merged.some((r) => r.code === c.code),
  )) {
    const saved = await api("coupon-save", { coupon }, true);
    merged.push(saved.coupon);
  }
  const d = load();
  d.coupons = merged;
  save(d);
}
function installCouponAdmin() {
  const form = document.getElementById("couponForm");
  if (form)
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = e.submitter || form.querySelector("button");
      button.disabled = true;
      try {
        const coupon = {
          code: document.getElementById("cpCode").value,
          type: document.getElementById("cpType").value,
          value: document.getElementById("cpValue").value,
          min: document.getElementById("cpMin").value,
          limit: document.getElementById("cpLimit").value,
          expires: document.getElementById("cpExpiry").value,
          active: true,
        };
        const result = await api("coupon-save", { coupon }, true),
          d = load();
        d.coupons = [
          ...(d.coupons || []).filter((c) => c.code !== result.coupon.code),
          result.coupon,
        ];
        save(d);
        form.reset();
        notify("Cupom salvo no sistema da loja.");
      } catch (error) {
        notify(error.message);
      } finally {
        button.disabled = false;
      }
    };
  window.toggleCoupon = async (code) => {
    const coupon = load().coupons.find((c) => c.code === code);
    try {
      const result = await api(
          "coupon-save",
          { coupon: { ...coupon, active: !coupon.active } },
          true,
        ),
        d = load();
      d.coupons = d.coupons.map((c) => (c.code === code ? result.coupon : c));
      save(d);
    } catch (error) {
      notify(error.message);
    }
  };
}
async function loadAdmin() {
  if (loading) return;
  loading = true;
  try {
    const result = await api("admin", null, true);
    config = result.config;
    version = result.version;
    const local = load();
    if (local.fee !== config.deliveryFee) {
      local.fee = config.deliveryFee;
      save(local);
    }
    renderAdmin();
    const feeForm = document.getElementById("feeForm");
    if (feeForm)
      feeForm.onsubmit = async (event) => {
        event.preventDefault();
        const button = event.submitter || feeForm.querySelector("button");
        button.disabled = true;
        try {
          await saveConfig({
            ...config,
            deliveryFee: document.getElementById("fee").value,
          });
          const field = document.querySelector(
            "#buy-service-form [name=deliveryFee]",
          );
          if (field) field.value = config.deliveryFee;
          notify("Frete salvo e atualizado no shop.");
        } catch (error) {
          notify(error.message);
        } finally {
          button.disabled = false;
        }
      };
    installCouponAdmin();
    void syncCoupons().catch((error) => notify(error.message));
    void refreshOrders();
  } catch (error) {
    for (const id of ["buy-combos", "buy-quotes", "buy-service"]) {
      const node = document.getElementById(id);
      node.innerHTML =
        '<section class="panel"><p role="status"></p><button class="btn" type="button">Tentar novamente</button></section>';
      node.querySelector("p").textContent = error.message;
      node.querySelector("button").onclick = loadAdmin;
    }
  } finally {
    loading = false;
  }
}
let refreshing = false;
async function refreshOrders() {
  if (refreshing || !sessionReady()) return;
  refreshing = true;
  try {
    const result = await api("orders", null, true);
    message("buy-orders-status", "");
    const newOrders = result.orders.filter(
      (o) =>
        o.status === "recebido" &&
        !load().orders.some((old) => old.id === o.id),
    );
    mergeOrders(result.orders);
    if (newOrders.length)
      notify(newOrders.length + " novo(s) pedido(s) online para atender.");
    if (typeof page !== "undefined" && page === "orders") renderOrders(load());
  } catch (error) {
    if (document.getElementById("ordersList"))
      message("buy-orders-status", error.message);
  } finally {
    refreshing = false;
  }
}
function installShop() {
  const applyExisting = window.applyCoupon;
  window.applyCoupon = async () => {
    const code = document.getElementById("couponCode").value;
    try {
      const result = await api("coupon-check", {
          code,
          phone: document.getElementById("phone").value,
        }),
        d = load();
      d.coupons = [
        ...(d.coupons || []).filter((c) => c.code !== result.coupon.code),
        result.coupon,
      ];
      save(d);
      applyExisting();
    } catch (error) {
      notify(error.message);
      document.getElementById("couponFeedback").textContent = error.message;
    }
  };
  const originalLines = window.lines;
  window.lines = function (d) {
    return [
      ...originalLines(d),
      ...Object.entries(cart)
        .filter(([id, q]) => q > 0 && comboCart.has(id))
        .map(([id, qty]) => ({ p: comboCart.get(id), qty })),
    ];
  };
  const originalTotals = window.totals;
  window.totals = function (d) {
    const value = originalTotals(d);
    if (config)
      value.fee =
        document.getElementById("mode").value === "delivery"
          ? config.deliveryFee
          : 0;
    return value;
  };
  const originalAdd = window.addItem;
  window.addItem = function (id, n = 1) {
    const combo = config?.combos.find((c) => c.id === id);
    if (combo) {
      pickCombo(combo, (s, ps) => {
        const p = comboProduct(combo, s, ps);
        comboCart.set(p.id, p);
        cart[p.id] = 1;
        renderShop();
        notify("Combo adicionado ao carrinho.");
      });
      return;
    }
    if (comboCart.has(id)) {
      cart[id] = Math.max(0, (cart[id] || 0) + n);
      renderShop();
      return;
    }
    return originalAdd(id, n);
  };
  const comboSection = document.createElement("section");
  comboSection.id = "buy-shop-combos";
  comboSection.className = "buy-shop-combos";
  document.getElementById("homeView").prepend(comboSection);
  const status = document.createElement("div");
  status.id = "buy-store-status";
  status.className = "buy-store-status";
  status.setAttribute("role", "status");
  status.textContent = "Conferindo atendimento da loja…";
  document.querySelector(".shophead").after(status);
  const pix = document.createElement("section");
  pix.id = "buy-pix";
  pix.className = "panel buy-pix";
  document.getElementById("checkout").before(pix);
  const oldRender = window.renderShop;
  window.renderShop = function () {
    oldRender();
    renderCommerceShop();
  };
  document
    .getElementById("payment")
    .addEventListener("change", renderCommerceShop);
  const form = document.getElementById("checkout");
  let pendingId = null;
  form.addEventListener("input", () => {
    pendingId = null;
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = form.querySelector("[type=submit],button");
    if (checkoutBusy || b.disabled) return;
    checkoutBusy = true;
    document.body.classList.add("buy-order-pending");
    b.disabled = true;
    try {
      if (!config) throw Error("Aguarde a confirmação do atendimento da loja.");
      const t = totals(load());
      if (!t.items.length) throw Error("Adicione produtos ao carrinho.");
      pendingId ??= crypto.randomUUID();
      const body = {
        requestId: pendingId,
        customer: document.getElementById("customer").value,
        phone: document.getElementById("phone").value,
        address: document.getElementById("address").value,
        mode: document.getElementById("mode").value,
        payment: document.getElementById("payment").value,
        coupon: typeof appliedCode === "string" ? appliedCode : "",
        items: t.items.map(({ p, qty }) =>
          p.comboId
            ? { comboId: p.comboId, selections: p.selections, qty }
            : { productId: p.id, qty },
        ),
      };
      const result = await api("order", body);
      receipts[result.order.id] = result.receipt;
      localStorage.setItem(receiptsKey, JSON.stringify(receipts));
      lastReceipt = result.receipt;
      seenStatus[result.order.id] = result.order.status;
      mergeOrders([result.order]);
      saveIds([...new Set([...myIds(), result.order.id])]);
      cart = {};
      comboCart.clear();
      pendingId = null;
      if (typeof appliedCode === "string") appliedCode = "";
      form.reset();
      view("orders");
      notify("Pedido confirmado no sistema da loja.");
    } catch (error) {
      notify(error.message);
      document.getElementById("buy-store-status").textContent = error.message;
      void refreshShopConfig();
    } finally {
      checkoutBusy = false;
      document.body.classList.remove("buy-order-pending");
      b.disabled = false;
      renderCommerceShop();
    }
  };
  const oldOrders = window.renderOrders;
  window.renderOrders = function (d) {
    oldOrders(d);
    for (const o of d.orders.filter(
      (o) => myIds().includes(o.id) && o.payment === "PIX" && receipts[o.id],
    )) {
      const card = document.createElement("section");
      card.className = "panel buy-pix";
      card.innerHTML = pixHTML(receipts[o.id], o.id);
      document.getElementById("myOrders").append(card);
    }
    bindCopy();
  };
  const originalReorder = window.reorder;
  window.reorder = function (id) {
    if (
      load()
        .orders.find((o) => o.id === id)
        ?.items.some((i) => !i.id)
    ) {
      notify(
        "Este pedido contém combos. Escolha os sabores novamente no cardápio.",
      );
      view("home");
      return;
    }
    originalReorder(id);
  };
  renderCommerceShop();
  void refreshShopConfig();
  void trackOrders();
  setInterval(() => {
    if (document.visibilityState === "visible") {
      void refreshShopConfig();
      void trackOrders();
    }
  }, 30000);
}
function whatsappURL(phone, id) {
  let n = String(phone || "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  return n
    ? "https://wa.me/" +
        n +
        "?text=" +
        encodeURIComponent(
          "Olá! Fiz o pedido #" +
            id.slice(-6) +
            ". Vou enviar o comprovante do Pix em anexo.",
        )
    : "";
}
function pixHTML(receipt, id) {
  const link = whatsappURL(receipt.whatsapp, id);
  return `<h3>Pix · pedido #${esc(id.slice(-6))}</h3><p>Total: <strong>${amount(receipt.total)}</strong></p><label class="field">${receipt.pix ? "Pix Copia e Cola" : "Chave Pix"}<textarea readonly>${esc(receipt.pix || receipt.pixKey)}</textarea></label><button class="btn red" type="button" data-copy-pix>Copiar Pix</button>${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Enviar comprovante no WhatsApp</a>` : "<p>WhatsApp da loja não configurado.</p>"}<p class="hint">Ao abrir o WhatsApp, anexe a imagem do comprovante. O pagamento será conferido pela loja.</p>`;
}
function bindCopy() {
  document.querySelectorAll("[data-copy-pix]").forEach(
    (button) =>
      (button.onclick = async () => {
        const input = button.closest(".buy-pix").querySelector("textarea");
        try {
          await navigator.clipboard.writeText(input.value);
          notify("Pix copiado.");
        } catch {
          input.focus();
          input.select();
          notify("Selecione e copie o Pix neste campo.");
        }
      }),
  );
}
function renderCommerceShop() {
  const closed =
      !config ||
      !availability(config, new Date(Date.now() + serverOffset)).open,
    info = config
      ? availability(config, new Date(Date.now() + serverOffset))
      : { label: configError || "Conferindo atendimento da loja…" };
  const status = document.getElementById("buy-store-status");
  if (status) {
    status.textContent = info.label;
    status.dataset.open = String(!closed);
  }
  document.querySelectorAll(".shopbar .live").forEach((e) => {
    e.textContent = info.label;
    e.classList.toggle("buy-closed", closed);
  });
  const button = document.querySelector("#checkout button");
  if (button) {
    button.disabled = closed || checkoutBusy;
    button.textContent = checkoutBusy
      ? "Confirmando pedido…"
      : closed
        ? "Loja fechada para pedidos"
        : "Confirmar pedido";
  }
  const host = document.getElementById("buy-shop-combos");
  if (host) {
    const combos = (config?.combos || []).filter(
      (c) =>
        c.active &&
        catalog().some((p) => p.active && c.productIds.includes(p.id)),
    );
    const signature = JSON.stringify([
      combos,
      catalog().map((p) => [p.id, p.photo, p.active]),
    ]);
    if (host.dataset.signature !== signature) {
      host.dataset.signature = signature;
      host.innerHTML = combos.length
        ? '<h2>Combos · monte do seu jeito</h2><div class="buy-combo-grid">' +
          combos
            .map((c) => {
              const p = catalog().find(
                (p) => p.active && c.productIds.includes(p.id),
              );
              return `<article>${photo(p)}<div><small>${c.units} unidades</small><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p><strong>${amount(c.price)}</strong><button class="btn red" type="button" data-open-combo="${c.id}">Escolher sabores</button></div></article>`;
            })
            .join("") +
          "</div>"
        : "";
      host
        .querySelectorAll("[data-open-combo]")
        .forEach(
          (b) => (b.onclick = () => window.addItem(b.dataset.openCombo)),
        );
    }
  }
  const pix = document.getElementById("buy-pix");
  if (pix) {
    const enabled = document.getElementById("payment").value === "PIX";
    pix.hidden = !enabled;
    const signature = String(config?.pixKey || "") + enabled;
    if (pix.dataset.signature !== signature) {
      pix.dataset.signature = signature;
      pix.innerHTML = config?.pixKey
        ? `<h3>Pague com Pix</h3><p>${esc(config.pixName)} · ${esc(config.pixCity)}</p><label class="field">Chave Pix da loja<textarea readonly>${esc(config.pixKey)}</textarea></label><button class="btn" type="button" data-copy-pix>Copiar chave Pix</button><p class="hint">Após confirmar o pedido, você terá o Pix Copia e Cola com o valor e o botão para enviar o comprovante.</p>`
        : "<p>A loja ainda não configurou o Pix. Escolha outra forma de pagamento.</p>";
      bindCopy();
    }
  }
}
async function refreshShopConfig() {
  try {
    const result = await api("public");
    configError = "";
    config = result.config;
    serverOffset = new Date(result.serverTime).getTime() - Date.now();
    renderShop();
  } catch {
    config = null;
    configError =
      "Não foi possível conferir o atendimento. Atualize a página para tentar novamente.";
    const status = document.getElementById("buy-store-status");
    if (status)
      status.textContent =
        "Não foi possível conferir o atendimento. Tente atualizar a página.";
    renderCommerceShop();
  }
}
let tracking = false;
async function trackOrders() {
  if (tracking) return;
  tracking = true;
  try {
    const orders = [];
    for (const receipt of Object.values(receipts).slice(-20)) {
      try {
        const result = await api("track", { token: receipt.token });
        orders.push(result.order);
        receipts[result.order.id] = result.receipt;
      } catch {}
    }
    mergeOrders(orders);
  } finally {
    tracking = false;
  }
}
if (admin) {
  configSections();
  const oldStatus = window.changeStatus;
  window.changeStatus = async (id, status) => {
    if (!load().orders.find((o) => o.id === id)?.cloud)
      return oldStatus(id, status);
    try {
      const result = await api("status", { id, status }, true);
      oldStatus(id, status);
      mergeOrders([result.order]);
      void syncCoupons().catch((error) => notify(error.message));
      notify("Situação do pedido confirmada.");
    } catch (error) {
      notify(error.message);
    }
  };
  void loadAdmin();
  new MutationObserver(() => {
    if (sessionReady() && !config) void loadAdmin();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  setInterval(() => {
    if (document.visibilityState === "visible") void refreshOrders();
  }, 30000);
  window.addEventListener("bolt-catalog-ready", () => {
    if (!config) return;
    refreshQuoteCatalog();
    const box = document.querySelector(".buy-product-checks");
    if (!box) return;
    const selected = new Set(
      [...box.querySelectorAll(":checked")].map((i) => i.value),
    );
    box.innerHTML = catalog()
      .map(
        (p) =>
          `<label>${photo(p)}<span>${esc(p.name)}</span><input name="productIds" type="checkbox" value="${esc(p.id)}" ${selected.has(p.id) ? "checked" : ""}></label>`,
      )
      .join("");
  });
} else {
  document.body.classList.add("buy-shop-app");
  installShop();
}
function theme() {
  const c = window.BOLT_TENANT?.primary || "#475569";
  if (/^#[a-f0-9]{6}$/i.test(c)) {
    const v = [1, 3, 5]
      .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    document.documentElement.style.setProperty(
      "--buy-on-primary",
      v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722 > 0.179
        ? "#17213a"
        : "#fff",
    );
  }
}
theme();
window.addEventListener("bolt-tenant-ready", theme);

document.addEventListener("input", (e) => {
  if (e.target.closest(".buy-admin-page")) adminDirty = true;
});
