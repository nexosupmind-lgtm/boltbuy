/* Master presentation layer: existing actions and authenticated platform data remain authoritative. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const money = (value) =>
    Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const paths = {
    home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75",
    layers: "m12 2 10 5-10 5L2 7Zm-10 10 10 5 10-5M2 17l10 5 10-5",
    school: "m2 8 10-5 10 5-10 5Zm4 2v7q6 5 12 0v-7m4-2v9",
    church: "M5 21V10l7-5 7 5v11ZM12 1v7M9 3h6M9 21v-7h6v7",
    cart: "M2 3h3l3 12h11l3-8H6m3 13h.01M18 20h.01",
    wallet: "M3 6q9-7 18 0v13q-9 7-18 0Zm0 0q9 7 18 0M3 12q9 7 18 0",
    support: "M3 14v-3a9 9 0 0 1 18 0v3M3 11h3v9H3Zm15 0h3v9h-3Zm0 9q0 3-6 3",
    chart: "M3 21v-7h4v7Zm7 0V8h4v13Zm7 0V3h4v18Z",
    settings:
      "m9 3 1-2h4l1 2 3 2 2 0 2 4-1 2v3l1 2-2 4h-2l-3 2-1 2h-4l-1-2-3-2H4l-2-4 1-2v-3L2 9l2-4h2Zm3 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    search: "M21 21l-5-5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10m-12 13q3 3 6 0",
    chevron: "m9 5 7 7-7 7",
    down: "m6 9 6 6 6-6",
    plus: "M12 3v18M3 12h18",
    userplus:
      "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M20 8v6m-3-3h6",
    calendar:
      "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m3 12 3 3 5-6",
    coin: "M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22m0 4v14m4-11h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8",
    check: "m5 12 4 4L19 6",
    chat: "M21 11a9 9 0 0 1-9 9H7l-5 3V11a9 9 0 0 1 19 0M7 10h.01M12 10h.01M17 10h.01",
    menu: "M3 6h18M3 12h18M3 18h18",
    arrow: "M3 12h18m-6-6 6 6-6 6",
    bolt: "m14 1-11 13h8l-1 9L22 9h-9Z",
    logout: "M9 3H3v18h6m5-15 6 6-6 6M8 12h12",
  };
  const icon = (name) =>
    `<svg class="mr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.layers}"/></svg>`;
  const products = {
    class: {
      label: "boltclass",
      desc: "Educação",
      page: "classClients",
      icon: "school",
      asset: "/Boltclass/assets/bolt-class-brand.png",
    },
    church: {
      label: "boltchurch",
      desc: "Igrejas",
      page: "churchClients",
      icon: "church",
      asset: "/assets/apps/church-brand.png",
    },
    buy: {
      label: "boltbuy",
      desc: "Vendas",
      page: "companies",
      icon: "cart",
      asset: "/assets/apps/buy-brand.png",
    },
  };
  let snapshot = null,
    period = 6,
    identity = "João Vitor";
  const active = (status) => ["active", "ativo", "Ativo"].includes(status);
  const logo = (product) =>
    `<img class="mr-product-logo" src="${products[product].asset}" alt="BOLT ${product === "class" ? "Class" : product === "church" ? "Church" : "Buy"}" width="180" height="72">`;
  const brand = () =>
    `<img class="mr-official-logo" src="/bolt-brand-white.png" alt="BOLT">`;
  const rowLink = (page, label, name, extra = "") =>
    `<button class="nav mr-nav" data-mr-page="${page}" aria-label="${label}" title="${label}" ${extra}>${icon(name)}<span>${label}</span></button>`;
  function mascot() {
    return `<svg class="mr-mascot" viewBox="0 0 240 250" role="img" aria-label="Assistente BOLT animado"><defs>
      <linearGradient id="mr-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".28" stop-color="#e7d6ff"/><stop offset=".56" stop-color="#a78bc8"/><stop offset=".78" stop-color="#eee2ff"/><stop offset="1" stop-color="#653c95"/></linearGradient>
      <radialGradient id="mr-visor"><stop stop-color="#28143d"/><stop offset="1" stop-color="#090713"/></radialGradient><linearGradient id="mr-ear"><stop stop-color="#4f196c"/><stop offset=".5" stop-color="#e4a6ff"/><stop offset="1" stop-color="#9f3bf0"/></linearGradient><filter id="mr-glow"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <ellipse cx="135" cy="240" rx="77" ry="9" fill="#9827e5" opacity=".22"/>
      <g class="mr-robot-body"><path d="m101 208-6 27q14 11 33 0l-1-22m32-8 8 29q17 9 30-3l-15-29" fill="url(#mr-metal)" stroke="#d8b5ff" stroke-width="2"/>
      <path d="M100 155q35-19 70 2l15 44q-43 34-91 0Z" fill="url(#mr-metal)" stroke="#d7b0ff" stroke-width="3"/><ellipse cx="139" cy="188" rx="27" ry="28" fill="#8e39ba" stroke="#e2c7ff" stroke-width="3"/><path d="m144 165-22 26h16l-5 18 23-28h-17Z" fill="#e6b4ff"/>
      <path d="M178 167q30 8 24 40" fill="none" stroke="url(#mr-metal)" stroke-width="22" stroke-linecap="round"/>
      <path d="M99 167q-22 11-22 37" fill="none" stroke="url(#mr-metal)" stroke-width="22" stroke-linecap="round"/></g>
      <g transform="rotate(8 137 89)"><rect x="47" y="44" width="22" height="65" rx="11" fill="url(#mr-ear)" stroke="#d9b0ff" stroke-width="3"/><rect x="198" y="48" width="24" height="67" rx="12" fill="url(#mr-ear)" stroke="#e1b5ff" stroke-width="3"/>
      <rect x="60" y="17" width="145" height="131" rx="53" fill="url(#mr-metal)" stroke="#f1dfff" stroke-width="3"/><path d="M83 37q56-25 100 13" fill="none" stroke="white" opacity=".7" stroke-width="5" stroke-linecap="round"/><rect x="72" y="43" width="121" height="91" rx="37" fill="url(#mr-visor)" stroke="#6f438f" stroke-width="4"/>
      <g class="mr-robot-eyes"><path d="M93 87q10-26 22 0m25 0q11-26 23 0" fill="none" stroke="#c883ff" stroke-width="12" filter="url(#mr-glow)"/><path d="M93 87q10-26 22 0m25 0q11-26 23 0" fill="none" stroke="#f1d8ff" stroke-width="6" stroke-linecap="round"/></g><path d="M119 108q11 8 22-1" fill="none" stroke="#a45ed3" stroke-width="3" stroke-linecap="round"/></g></svg>`;
  }
  function series(data, count = period) {
    const now = new Date();
    const months = Array.from(
      { length: count },
      (_, i) =>
        new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + 1 + i, 1),
        ),
    );
    const subscriptions = new Set(
      data.subscriptions
        .filter((s) =>
          data.clients.some((c) => c.id === (s.tenant_id || s.client_id)),
        )
        .map((s) => s.id),
    );
    return months.map((month) => ({
      label: month
        .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
        .replace(".", ""),
      value:
        data.invoices.reduce(
          (sum, invoice) =>
            sum +
            (subscriptions.has(invoice.subscription_id) &&
            invoice.paid_at?.startsWith(month.toISOString().slice(0, 7))
              ? Math.round(Number(invoice.amount || 0) * 100)
              : 0),
          0,
        ) / 100,
    }));
  }
  function chart(data) {
    const values = series(data),
      peak = Math.max(100, ...values.map((x) => x.value)),
      unit = 10 ** Math.floor(Math.log10(peak)),
      step = unit / 2,
      max = Math.ceil((peak * 1.12) / step) * step;
    const points = values.map((x, i) => [
      50 + (i * 500) / (values.length - 1),
      170 - (140 * x.value) / max,
    ]);
    let curve = `M${points[0].join(" ")}`;
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i],
        [px, py] = points[i - 1],
        middle = (px + x) / 2;
      curve += ` C${middle} ${py} ${middle} ${y} ${x} ${y}`;
    }
    return `<article class="mr-card mr-revenue"><div class="mr-card-heading"><h3>${icon("chart")} Faturamento</h3><label class="mr-period"><span class="mr-sr-only">Período do gráfico</span><select data-mr-period><option value="6" ${period === 6 ? "selected" : ""}>Últimos 6 meses</option><option value="12" ${period === 12 ? "selected" : ""}>Últimos 12 meses</option></select></label></div><svg class="mr-chart" viewBox="0 0 580 210" preserveAspectRatio="none" role="img" aria-label="Faturamento recebido nos últimos ${period} meses"><defs><linearGradient id="mr-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a32ce4" stop-opacity=".5"/><stop offset="1" stop-color="#a32ce4" stop-opacity=".02"/></linearGradient></defs>${Array.from(
      { length: 6 },
      (_, i) => {
        const y = 30 + i * 28;
        return `<path d="M50 ${y}H550" stroke="#ffffff0d"/><text x="28" y="${y + 4}" text-anchor="end">${new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format((max * (5 - i)) / 5)}</text>`;
      },
    ).join(
      "",
    )}<path d="${curve} L550 170H50Z" fill="url(#mr-chart-fill)"/><path class="mr-chart-line" d="${curve}" fill="none" stroke="#bb56f1" stroke-width="2.6"/>${points.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3.8" fill="#cf8bff"><title>${esc(values[i].label)}: ${money(values[i].value)}</title></circle><text x="${x}" y="193" text-anchor="middle">${esc(values[i].label)}</text>`).join("")}</svg><p class="mr-chart-caption">Recebido neste mês: <b>${money(data.metrics.received)}</b><span>Receita recorrente prevista: ${money(data.metrics.mrr)}</span></p></article>`;
  }
  function quickAccess() {
    return `<article class="mr-card mr-quick"><div class="mr-card-heading"><h3>${icon("bolt")} Acesso Rápido</h3></div><div class="mr-quick-grid">${Object.entries(
      products,
    )
      .map(
        ([key, p]) =>
          `<button class="mr-quick-tile mr-product-${key}" data-mr-page="${p.page}">${logo(key)}<small>${p.desc}</small></button>`,
      )
      .join(
        "",
      )}<button class="mr-quick-tile" data-mr-new>${icon("userplus")}<span>Novo Cliente</span></button><button class="mr-quick-tile" data-mr-page="create">${icon("layers")}<span>Provisionar<br>Sistema</span></button><button class="mr-quick-tile" data-mr-page="settings">${icon("settings")}<span>Configurações</span></button></div></article>`;
  }
  function alerts(data) {
    const list = data.tickets
      .filter((t) => ["open", "in_progress"].includes(t.status))
      .map((t) => ({
        label: t.subject,
        hint:
          data.clients.find((c) => c.id === (t.client_id || t.tenant_id))
            ?.name || "Chamado de suporte",
        page: "support",
        id: t.id,
        level: "Média",
      }));
    for (const invoice of data.invoices.filter(
      (i) =>
        data.subscriptions.some(
          (s) =>
            s.id === i.subscription_id &&
            data.clients.some((c) => c.id === (s.tenant_id || s.client_id)),
        ) &&
        !i.paid_at &&
        i.status !== "cancelled" &&
        i.due_date < new Date().toISOString().slice(0, 10),
    )) {
      const sub = data.subscriptions.find(
          (s) => s.id === invoice.subscription_id,
        ),
        client = data.clients.find(
          (c) => c.id === (sub?.tenant_id || sub?.client_id),
        );
      list.unshift({
        label: "Validar pagamento – " + (client?.name || "Cliente"),
        hint: "Vencimento " + invoice.due_date.split("-").reverse().join("/"),
        page: "billing",
        level: "Alta",
      });
    }
    return list;
  }
  function dashboard(data) {
    snapshot = data;
    const m = data.metrics,
      tasks = alerts(data),
      clients = [...data.clients]
        .sort((a, b) =>
          String(b.created_at || "").localeCompare(String(a.created_at || "")),
        )
        .slice(0, 3),
      systems = data.subscriptions.filter(
        (s) =>
          active(s.status) &&
          data.clients.some((c) => c.id === (s.tenant_id || s.client_id)),
      ).length;
    updateIdentity();
    const notification = $("mr-notification-dot");
    if (notification)
      notification.hidden = !data.tickets.some((t) =>
        ["open", "in_progress"].includes(t.status),
      );
    const metric = (name, value, hint, ico, cls = "") =>
      `<article class="mr-card mr-metric ${cls}"><span class="mr-metric-icon">${icon(ico)}</span><div><span>${name}</span><strong>${value}</strong><small>${hint}</small></div></article>`;
    return `<div class="mr-welcome"><h2>Bem-vindo, <span data-mr-welcome>${esc(identity)}</span>! <span class="mr-wave">👋</span></h2><p>Acompanhe o desempenho dos seus sistemas, clientes e faturamento.</p></div><div class="mr-metrics">${metric("Clientes Ativos", m.active_clients, `${m.clients} clientes cadastrados`, "users")}${metric("Sistemas Ativos", systems, "Assinaturas ativas", "layers")}${metric("Faturamento (mês)", money(m.received), "Pagamentos registrados", "coin", "mr-money")}${metric("Inadimplentes", m.overdue_clients, "Clientes inadimplentes", "calendar", m.overdue_clients ? "mr-overdue" : "")}</div><div class="mr-main-grid">${chart(data)}${quickAccess()}</div><div class="mr-bottom-grid"><article class="mr-card mr-recent"><div class="mr-card-heading"><h3>${icon("users")} Últimos Clientes</h3><button data-mr-page="commercial" class="mr-text-button">Ver todos ${icon("arrow")}</button></div>${clients.length ? clients.map((c) => `<button class="mr-client-row" data-mr-client="${esc(c.id)}"><span class="mr-client-icon mr-product-${esc(c.product)}">${icon(products[c.product]?.icon || "layers")}</span><span><strong>${esc(c.name)}</strong><small>${esc(products[c.product]?.label || "BOLT")}</small></span><span class="mr-state ${active(c.status) ? "is-active" : ""}">${active(c.status) ? "Ativo" : esc(c.status)}</span></button>`).join("") : `<div class="mr-empty">Seus clientes aparecerão aqui.<button data-mr-new class="mr-text-button">Cadastrar primeiro cliente ${icon("arrow")}</button></div>`}</article><article class="mr-card mr-alerts"><div class="mr-card-heading"><h3>${icon("calendar")} Tarefas e Alertas</h3><button class="mr-text-button" data-mr-page="support">Ver todos ${icon("arrow")}</button></div>${
      tasks
        .slice(0, 3)
        .map(
          (task) =>
            `<button class="mr-task-row" ${task.id ? `data-ticket="${esc(task.id)}"` : `data-mr-page="${task.page}"`}><span class="mr-task-square"></span><span><strong>${esc(task.label)}</strong><small>${esc(task.hint)}</small></span><span class="mr-priority ${task.level === "Alta" ? "is-high" : ""}">${task.level}</span></button>`,
        )
        .join("") ||
      `<div class="mr-empty mr-clear">${icon("check")}<span>Tudo em dia por aqui.<small>Nenhuma cobrança vencida ou chamado pendente.</small></span></div>`
    }</article><article class="mr-card mr-assistant-card"><div><h3>Assistente BOLT</h3><p>Precisa de ajuda?</p><button class="mr-assistant-button" data-mr-assistant>${icon("chat")} Falar com o BOLT</button></div>${mascot()}</article></div>`;
  }
  function updateIdentity() {
    const session = window.BOLT_GET_SESSION?.();
    const name =
      session?.user?.user_metadata?.full_name ||
      session?.user?.user_metadata?.name;
    if (name) identity = name;
    document
      .querySelectorAll("[data-mr-username],[data-mr-welcome]")
      .forEach((el) => (el.textContent = identity));
    const initials = identity
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase();
    document
      .querySelectorAll("[data-mr-initials]")
      .forEach((el) => (el.textContent = initials));
  }
  function navigate(page) {
    window.page(page);
    closeDrawer();
  }
  function syncPage() {
    const page = window.boltCurrentSection || "dashboard",
      title =
        {
          dashboard: "Dashboard",
          commercial: "Clientes e Sistemas",
          classClients: "BOLT Class",
          churchClients: "BOLT Church",
          companies: "BOLT Buy",
          billing: "Financeiro",
          plans: "Planos",
          support: "Suporte",
          operations: "Relatórios",
          capacity: "Capacidade e Consumo",
          settings: "Configurações",
          create: "Provisionar Sistema",
          studio: "BOLT Studio",
          commercialEditor: "Cadastro do Cliente",
        }[page] || "BOLT Master";
    $("title").textContent = title;
    $("subtitle").textContent =
      page === "dashboard"
        ? "Visão geral do seu ecossistema BOLT"
        : "BOLT Master / " + title;
    document.querySelectorAll("[data-mr-page].mr-nav").forEach((el) => {
      const selected = el.dataset.mrPage === page;
      el.classList.toggle("active", selected);
      if (selected) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    document
      .querySelectorAll("[data-mr-dock]")
      .forEach((el) =>
        el.classList.toggle("selected", el.dataset.mrPage === page),
      );
    document.body.dataset.masterPage = page;
    if (
      [
        "classClients",
        "churchClients",
        "companies",
        "studio",
        "commercialEditor",
      ].includes(page)
    )
      $("mr-systems")?.setAttribute("open", "");
    if (["billing", "capacity"].includes(page))
      $("mr-finance")?.setAttribute("open", "");
    updateIdentity();
  }
  function closeDrawer() {
    document.body.classList.remove("mr-drawer-open");
    $("mr-menu-toggle")?.setAttribute("aria-expanded", "false");
    $("mr-drawer-shade").hidden = true;
    document.querySelector("#mr-sidebar").inert =
      window.matchMedia("(max-width: 900px)").matches;
    document.querySelector("main").inert = false;
    document.querySelector(".mobile-dock").inert = false;
  }
  function showNew() {
    const dialog = document.createElement("dialog");
    dialog.className = "bolt-shell-dialog mr-dialog";
    dialog.innerHTML = `<header><div><small>ECOSSISTEMA BOLT</small><h2>Qual cliente vamos criar?</h2></div><button type="button" data-close aria-label="Fechar">×</button></header><p>Escolha a plataforma para abrir o cadastro.</p><div class="mr-new-options">${Object.entries(
      products,
    )
      .map(
        ([key, p]) =>
          `<button data-product="${key}" class="mr-quick-tile mr-product-${key}">${logo(key)}<span>${p.desc}</span></button>`,
      )
      .join("")}</div>`;
    document.body.append(dialog);
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove());
    dialog.querySelectorAll("[data-product]").forEach(
      (b) =>
        (b.onclick = () => {
          dialog.close();
          if (b.dataset.product === "buy") navigate("create");
          else window.boltEditCommercial(b.dataset.product);
        }),
    );
    dialog.showModal();
  }
  function search(query) {
    const host = $("mr-search-results");
    query = query.trim().toLocaleLowerCase("pt-BR");
    if (!query) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    const pages = [
      ["dashboard", "Dashboard"],
      ["commercial", "Clientes"],
      ["plans", "Planos"],
      ["billing", "Financeiro"],
      ["support", "Suporte"],
      ["capacity", "Capacidade e consumo"],
      ["operations", "Relatórios"],
      ["settings", "Configurações"],
      ...Object.values(products).map((p) => [p.page, p.label]),
    ].filter(([, name]) => name.toLowerCase().includes(query));
    const clients = (snapshot?.clients || [])
      .filter((c) =>
        (c.name + " " + c.slug).toLocaleLowerCase("pt-BR").includes(query),
      )
      .slice(0, 7);
    host.innerHTML =
      pages
        .map(
          ([page, name]) =>
            `<button role="option" data-mr-page="${page}">${icon("layers")}<span>${esc(name)}<small>Página do Master</small></span>${icon("arrow")}</button>`,
        )
        .join("") +
        clients
          .map(
            (c) =>
              `<button role="option" data-mr-client="${esc(c.id)}">${icon(products[c.product]?.icon || "users")}<span>${esc(c.name)}<small>${esc(products[c.product]?.label)}</small></span>${icon("arrow")}</button>`,
          )
          .join("") || "<p>Nenhum resultado encontrado.</p>";
    host.hidden = false;
  }
  function setup() {
    document.body.classList.add("bolt-master-reference");
    const filters = document.createElement("div");
    filters.innerHTML =
      '<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs><filter id="mr-logo-white" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 .2126 .7152 .0722 0 -.10"/><feComponentTransfer><feFuncA type="linear" slope="3"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter></defs></svg>';
    document.body.append(filters);
    const aside = document.querySelector("aside");
    aside.id = "mr-sidebar";
    aside.setAttribute("aria-label", "Navegação principal");
    aside.innerHTML = `<div class="mr-brand">${brand()}<button class="mr-sidebar-toggle" aria-label="Recolher menu" aria-expanded="true">${icon("chevron")}</button></div><nav>${rowLink("dashboard", "Dashboard", "home")}${rowLink("commercial", "Clientes", "users")}<details open id="mr-systems"><summary aria-label="Sistemas" title="Sistemas">${icon("layers")}<span>Sistemas</span>${icon("down")}</summary><div class="mr-nav-sub">${Object.values(
      products,
    )
      .map((p) => rowLink(p.page, p.label, p.icon))
      .join(
        "",
      )}${rowLink("studio", "BOLT Studio", "layers", "data-mr-studio")}</div></details><details id="mr-finance"><summary aria-label="Financeiro" title="Financeiro">${icon("wallet")}<span>Financeiro</span>${icon("down")}</summary><div class="mr-nav-sub">${rowLink("billing", "Assinaturas e cobranças", "coin")}${rowLink("capacity", "Capacidade e consumo", "chart")}</div></details>${rowLink("plans", "Planos", "layers")}${rowLink("support", "Suporte", "support").replace("</span></button>", '</span><b id="v35-support-count"></b></button>')}${rowLink("operations", "Relatórios", "chart")}${rowLink("settings", "Configurações", "settings")}</nav><div class="mr-sidebar-footer"><span class="mr-status-icon">${icon("bolt")}</span><div><strong>BOLT OS <small>v1.0</small></strong><span data-mr-connection><i></i>Online</span></div></div>`;
    for (const [product, entry] of Object.entries(products)) {
      const tile = document.querySelector(".commercial-tile.tile-" + product);
      if (tile) {
        tile.querySelector(".commercial-symbol")?.remove();
        tile.querySelector("strong")?.remove();
        tile.insertAdjacentHTML("afterbegin", logo(product));
      }
    }
    const header = document.querySelector("main>header");
    header.classList.add("mr-topbar");
    header.innerHTML = `<button id="mr-menu-toggle" class="mr-icon-button" aria-label="Abrir menu" aria-controls="mr-sidebar" aria-expanded="false">${icon("menu")}</button><div class="mr-page-title"><h1 id="title">Dashboard</h1><p id="subtitle">Visão geral do seu ecossistema BOLT</p></div><div class="mr-search"><label>${icon("search")}<input id="mr-search" type="search" placeholder="Buscar cliente, sistema ou relatório..." autocomplete="off" aria-label="Buscar cliente, sistema ou relatório" aria-controls="mr-search-results"><kbd>⌘ K</kbd></label><div id="mr-search-results" role="listbox" aria-label="Resultados da busca" hidden></div></div><button class="mr-notification mr-icon-button" data-mr-page="support" aria-label="Abrir chamados de suporte">${icon("bell")}<i id="mr-notification-dot" hidden></i></button><details class="mr-profile"><summary><span class="mr-avatar" data-mr-initials>JV</span><span><strong data-mr-username>João Vitor</strong><small>Administrador</small></span>${icon("down")}</summary><div><button data-mr-page="settings">${icon("settings")}Configurações</button><button data-mr-logout>${icon("logout")}Sair da conta</button></div></details>`;
    const shade = document.createElement("button");
    shade.id = "mr-drawer-shade";
    shade.hidden = true;
    shade.setAttribute("aria-label", "Fechar menu");
    document.body.append(shade);
    shade.onclick = closeDrawer;
    const dock = document.querySelector(".mobile-dock");
    dock.innerHTML = [
      ["dashboard", "Início", "home"],
      ["commercial", "Clientes", "users"],
      ["create", "Deploy", "plus"],
      ["billing", "Financeiro", "wallet"],
      ["menu", "Mais", "menu"],
    ]
      .map(
        ([page, name, ico]) =>
          `<button data-mr-dock ${page === "menu" ? "data-mr-menu" : `data-mr-page="${page}"`} class="${page === "create" ? "dock-deploy" : ""}">${icon(ico)}<small>${name}</small></button>`,
      )
      .join("");
    const toggle = () => {
      const open = !document.body.classList.contains("mr-drawer-open");
      document.body.classList.toggle("mr-drawer-open", open);
      shade.hidden = !open;
      $("mr-menu-toggle").setAttribute("aria-expanded", String(open));
      aside.inert = !open;
      document.querySelector("main").inert = open;
      dock.inert = open;
      if (open) aside.querySelector("button")?.focus();
    };
    $("mr-menu-toggle").onclick = toggle;
    aside.querySelector(".mr-sidebar-toggle").onclick = () => {
      if (matchMedia("(max-width: 900px)").matches) {
        closeDrawer();
        return;
      }
      const collapsed = document.body.classList.toggle("mr-sidebar-collapsed");
      aside
        .querySelector(".mr-sidebar-toggle")
        .setAttribute("aria-expanded", String(!collapsed));
      aside
        .querySelector(".mr-sidebar-toggle")
        .setAttribute(
          "aria-label",
          collapsed ? "Expandir menu" : "Recolher menu",
        );
    };
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const ds = button.dataset;
      if ("mrMenu" in ds) toggle();
      if (ds.mrPage) {
        if ("mrStudio" in ds) window.boltStudioCentralOpen();
        else navigate(ds.mrPage);
      }
      if ("mrNew" in ds) showNew();
      if (ds.mrClient) {
        const client = snapshot?.clients.find((c) => c.id === ds.mrClient);
        if (client) {
          navigate(products[client.product].page);
          const field = document.querySelector(
            `[data-client-search="${client.product}"]`,
          );
          if (field) {
            field.value = client.name;
            field.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }
      if ("mrAssistant" in ds) {
        if ($("boltChat")?.classList.contains("hidden"))
          window.toggleAssistant();
        $("boltQuestion")?.focus();
      }
      if ("mrLogout" in ds) $("bolt-logout")?.click();
      if (button.closest("#mr-search-results")) {
        $("mr-search-results").hidden = true;
        $("mr-search").value = "";
      }
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".mr-search"))
        $("mr-search-results").hidden = true;
    });
    $("mr-search").addEventListener("input", (event) =>
      search(event.target.value),
    );
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        $("mr-search").focus();
      }
      if (
        event.key === "Tab" &&
        document.body.classList.contains("mr-drawer-open")
      ) {
        const nodes = [...aside.querySelectorAll("button,summary")].filter(
          (el) => el.getClientRects().length,
        );
        if (event.shiftKey && document.activeElement === nodes[0]) {
          event.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
          event.preventDefault();
          nodes[0]?.focus();
        }
      }
      if (event.key === "Escape") {
        closeDrawer();
        $("mr-search-results").hidden = true;
        document.querySelector(".mr-profile")?.removeAttribute("open");
      }
      if (event.key === "Enter" && event.target.id === "mr-search") {
        $("mr-search-results").querySelector("button")?.click();
      }
      if (event.key === "ArrowDown" && event.target.id === "mr-search") {
        event.preventDefault();
        $("mr-search-results").querySelector("button")?.focus();
      }
    });
    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-mr-period]")) {
        period = Number(event.target.value) === 12 ? 12 : 6;
        if (snapshot) $("v35-dashboard").innerHTML = dashboard(snapshot);
      }
    });
    const previousPage = window.page;
    window.page = function (...args) {
      const result = previousPage.apply(this, args);
      syncPage();
      window.scrollTo({ top: 0, behavior: "instant" });
      return result;
    };
    const connection = () => {
      document.querySelector("[data-mr-connection]").innerHTML =
        `<i></i>${navigator.onLine ? "Online" : "Sem conexão"}`;
      document.body.classList.toggle("mr-offline", !navigator.onLine);
    };
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    connection();
    window
      .matchMedia("(max-width: 900px)")
      .addEventListener("change", closeDrawer);
    closeDrawer();
    syncPage();
  }
  window.BOLT_MASTER_REFERENCE = { dashboard, series, alerts };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
