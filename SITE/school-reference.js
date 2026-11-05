/* School visual system. Data and authorization stay with the existing applications. */
(() => {
  "use strict";
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const list = (v) => (Array.isArray(v) ? v : []);
  const glyphs = {
    home: "m3 10 9-7 9 7v11h-6v-7H9v7H3Z",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 1a4 4 0 0 1 0 7m4 10v-3a4 4 0 0 0-3-4",
    cap: "m2 8 10-5 10 5-10 5Zm4 2v7q6 5 12 0v-7m4-2v9",
    book: "M12 5v16M3 4q5-1 9 2 4-3 9-2v15q-5-1-9 2-4-3-9-2Z",
    calendar:
      "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v15H3V6a2 2 0 0 1 2-2m3 12 3 3 5-6",
    grades:
      "M5 2h14a2 2 0 0 1 2 2v16H3V4a2 2 0 0 1 2-2M7 15l3-8 3 8m-5-3h4m3-4h5m-2-2v5",
    chart: "M3 21v-7h4v7Zm7 0V8h4v13Zm7 0V3h4v18Z",
    tasks: "M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01",
    money: "M3 5h18v15H3ZM3 10h18m3 6h4",
    message: "M21 11a9 9 0 0 1-9 9H7l-5 3V11a9 9 0 0 1 19 0M7 10h10m-10 4h6",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10m-12 13q3 3 6 0",
    search: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
    arrow: "M3 12h18m-6-6 6 6-6 6",
    chevron: "m9 5 7 7-7 7",
    down: "m6 9 6 6 6-6",
    user: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M3 21v-2a9 9 0 0 1 18 0v2Z",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 2h6l1 3 3 1 3 4-2 3 1 4-4 4-3-1-4 2-3-3-4-1-1-5 2-3-1-4 4-3Z",
    bolt: "m14 1-11 13h8l-1 9L22 9h-9Z",
    add: "M12 4v16M4 12h16",
    help: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01",
    menu: "M3 6h18M3 12h18M3 18h18",
    gift: "M3 8h18v5H3Zm2 5v9h14v-9M12 8v14m0-14C3 10 4 0 9 3Zm0 0c9 2 8-8 3-5Z",
    check: "m5 12 4 4L19 6",
    logout: "M9 3H3v18h6m5-15 6 6-6 6M8 12h12",
  };
  const icon = (name) =>
    `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${glyphs[name] || glyphs.book}"/></svg>`;
  const safeImage = (v) =>
    /^(https:\/\/|\/assets\/|data:image\/(png|jpeg|webp);base64,)/i.test(
      v || "",
    )
      ? v
      : "";
  const logo = (school) =>
    safeImage(school.logo)
      ? `<img src="${esc(school.logo)}" alt="Logo de ${esc(school.name)}" class="sc-logo">`
      : `<strong class="sc-logo-fallback">${esc(school.name)}</strong>`;
  const average = (rows) => {
    const nums = list(rows)
      .map((g) => g.final ?? g.average ?? g.score)
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map((v) => Number(String(v).replace(",", ".")))
      .filter(Number.isFinite);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  const score = (n) =>
    n === null
      ? "—"
      : Number(n).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const localDay = () =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    );
  const dateLabel = (v) =>
    /^\d{4}-\d{2}-\d{2}/.test(v || "")
      ? new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
        })
      : "Data a definir";
  function hero(name, surface) {
    return `<section class="sc-hero sc-hero-${surface}"><div><h1>${surface === "teacher" ? "Olá, Prof." : "Bem-vindo,"} <em>${esc(name)}!</em></h1><i></i><p>${surface === "teacher" ? "Bem-vindo ao seu painel de professor.<br>Organize suas aulas, atividades e acompanhe<br>o desempenho das suas turmas." : "Acompanhe a rotina escolar, o desempenho<br>dos alunos e as principais informações do colégio."}</p></div><svg class="sc-ribbon" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 90Q220 70 410 80T740 45T1000 22V90Z" fill="var(--sc-highlight)"/><path d="M0 90Q220 80 410 88T740 58T1000 34V90Z" fill="var(--sc-primary)"/></svg></section>`;
  }
  function metric(label, value, glyph, attr = "", featured = false) {
    return `<button class="sc-stat ${featured ? "sc-stat-featured" : ""}" ${attr}>${icon(glyph)}<span><small>${esc(label)}</small><strong>${esc(value)}</strong></span></button>`;
  }
  function heading(title, glyph, link = "") {
    return `<div class="sc-heading"><h2>${icon(glyph)}${title}</h2>${link}</div>`;
  }
  const adminButton = (target, label, ico = "chevron") =>
    `<button type="button" data-nav="${target}" class="sc-text-button">${esc(label)} ${icon(ico)}</button>`;
  function events(rows, attribute) {
    return (
      list(rows)
        .slice(0, 3)
        .map(
          (x) =>
            `<button class="sc-event-row" ${attribute}><span class="sc-event-icon">${icon(x.type === "exam" ? "grades" : "calendar")}</span><span><strong>${esc(x.title || x.name || "Atividade")}</strong><small>${esc(dateLabel(x.date || x.due))}${x.subject ? " · " + esc(x.subject) : ""}</small></span>${icon("chevron")}</button>`,
        )
        .join("") ||
      '<p class="sc-empty">As próximas atividades aparecerão aqui.</p>'
    );
  }
  function admin(s, name, allowed = () => true) {
    const attendance = list(s.attendance),
      present = attendance.filter((x) => x.status === "P").length,
      absent = attendance.filter((x) => x.status === "F").length,
      justified = attendance.filter((x) =>
        ["J", "Justificada"].includes(x.status),
      ).length,
      total = attendance.length,
      pct = total ? Math.round((100 * present) / total) : 0,
      teachers = list(s.staff).filter((x) => /professor/i.test(x.role || "")),
      now = localDay(),
      births = list(s.students).filter(
        (x) => x.birth?.slice(5) === now.slice(5),
      ),
      notices = list(s.messages).slice(-3).reverse(),
      agenda = [
        ...list(s.calendar),
        ...list(s.teacherItems).filter((x) => x.status === "published"),
      ]
        .filter((x) => (x.date || x.due || "") >= now)
        .sort((a, b) => (a.date || a.due).localeCompare(b.date || b.due));
    const groups = new Map();
    for (const g of list(s.grades)) {
      const subject = g.subject || "Geral";
      if (!groups.has(subject)) groups.set(subject, []);
      groups.get(subject).push(g);
    }
    const bars = [...groups]
      .slice(0, 4)
      .map(([label, rows], i) => ({ label, value: average(rows), i }));
    const shortcuts = [
      ["students", "Cadastrar Aluno", "users"],
      ["attendance", "Registrar Frequência", "calendar"],
      ["grades", "Lançar Notas", "grades"],
      ["tasks", "Criar Tarefa", "tasks"],
      ["reports", "Emitir Relatório", "chart"],
      ["messages", "Enviar Comunicado", "message"],
      ["finance", "Financeiro", "money"],
      ["family", "Portal da Família", "users"],
    ].filter(([key]) => allowed(key));
    return `<div class="sc-admin-home">${hero(name, "admin")}<div class="sc-admin-grid"><div class="sc-admin-center"><div class="sc-stats">${[
      ["Alunos", list(s.students).length, "users", "students"],
      ["Turmas", list(s.classes).length, "cap", "classes"],
      ["Professores", teachers.length, "user", "staff"],
      ["Frequência", total ? pct + "%" : "—", "chart", "attendance"],
    ]
      .filter((x) => allowed(x[3]))
      .map((x, i) => metric(x[0], x[1], x[2], `data-nav="${x[3]}"`, i === 0))
      .join(
        "",
      )}</div><div class="sc-chart-grid"><article class="sc-card sc-performance">${heading("Desempenho Acadêmico", "chart")}<p class="sc-caption">Média dos lançamentos por disciplina</p>${bars.length ? `<div class="sc-bar-chart">${bars.map((x) => `<div><strong>${score(x.value)}</strong><div class="sc-bar-track"><i style="--bar-height:${Math.max(0, Math.min(100, (x.value || 0) * 10))}%;--bar-tone:${x.i}"></i></div><small>${esc(x.label)}</small></div>`).join("")}</div>` : '<p class="sc-empty">Lance as primeiras notas para acompanhar o desempenho.</p>'}</article><article class="sc-card">${heading("Frequência Geral", "calendar")}<p class="sc-caption">Presenças no histórico registrado</p><div class="sc-frequency"><div class="sc-donut" style="--present:${pct}%;--justified:${total ? (100 * (present + justified)) / total : 0}%"><span><strong>${total ? pct + "%" : "—"}</strong><small>Presença</small></span></div><div class="sc-legend">${[
      ["Presentes", present, "green"],
      ["Justificados", justified, "yellow"],
      ["Faltas", absent, "red"],
    ]
      .map(
        ([label, value, color]) =>
          `<span><i class="${color}"></i>${label}<b>${total ? Math.round((value * 100) / total) + "%" : "—"}</b></span>`,
      )
      .join(
        "",
      )}</div></div></article></div><div class="sc-lower-grid"><article class="sc-card">${heading("Próximas Atividades", "calendar", adminButton("calendar", "Ver agenda"))}${events(agenda, 'data-nav="calendar"')}</article><article class="sc-card">${heading("Ações Rápidas", "bolt")}<div class="sc-shortcuts">${shortcuts.map(([key, label, glyph]) => `<button type="button" data-nav="${key}">${icon(glyph)}<span>${label}</span></button>`).join("")}</div></article></div></div><div class="sc-admin-rail"><article class="sc-card">${heading("Avisos da Escola", "message", allowed("messages") ? adminButton("messages", "+ Novo", "add") : "")}${notices.map((x) => `<button class="sc-event-row" data-nav="messages"><span class="sc-event-icon">${icon("calendar")}</span><span><strong>${esc(x.title)}</strong><small>${esc(dateLabel(x.date))}</small></span></button>`).join("") || '<p class="sc-empty">Nenhum comunicado cadastrado.</p>'}</article><article class="sc-card">${heading("Aniversariantes do Dia", "gift", allowed("students") ? adminButton("students", "Ver todos") : "")}${
      births
        .slice(0, 3)
        .map(
          (x) =>
            `<button class="sc-birthday" data-nav="students"><span class="sc-person-photo">${safeImage(x.photo) ? `<img src="${esc(x.photo)}" alt="" loading="lazy">` : icon("user")}</span><span><strong>${esc(x.name)}</strong><small>${esc(list(s.classes).find((c) => c.id === x.classId)?.name || "")}</small></span><span aria-hidden="true">🎉</span></button>`,
        )
        .join("") || '<p class="sc-empty">Nenhum aniversário hoje.</p>'
    }</article>${allowed("family") ? `<article class="sc-card sc-family-promo"><div>${heading("Portal da Família", "users")}<p>Acompanhe notas, frequência, tarefas e comunicados.</p><button class="btn" data-nav="family">Acessar Portal ${icon("arrow")}</button></div><span>${icon("users")}</span></article>` : ""}</div></div></div>`;
  }
  const navIcons = {
    overview: "home",
    students: "users",
    enrollments: "calendar",
    classes: "users",
    staff: "user",
    attendance: "calendar",
    grades: "grades",
    assessments: "grades",
    tasks: "tasks",
    finance: "money",
    messages: "message",
    reports: "chart",
    settings: "settings",
    calendar: "calendar",
    family: "users",
    support: "help",
    "school-life": "book",
    subjects: "book",
    schedule: "calendar",
    documents: "book",
    incidents: "user",
  };
  let adminState;
  function decorateAdmin({ school: s, page, groups, allowed, name, title }) {
    adminState = { school: s, groups, allowed };
    document.body.dataset.schoolDesign = "admin";
    document.body.dataset.classPage = page;
    const main = document.querySelector("#root .main"),
      nav = document.querySelector("#root .navitems"),
      bar = document.querySelector(".class-appbar");
    const button = ([key, label]) =>
      `<button class="nav ${page === key ? "active" : ""}" data-nav="${key}" ${page === key ? 'aria-current="page"' : ""}>${icon(navIcons[key] || "book")}<span>${esc(label)}</span></button>`;
    const top = [
        ["overview", "Dashboard"],
        ["students", "Alunos"],
        ["classes", "Turmas"],
        ["staff", "Professores"],
      ],
      used = new Set(top.map((x) => x[0]));
    const direct = [
      ["attendance", "Frequência"],
      ["assessments", "Avaliações"],
      ["tasks", "Tarefas"],
      ["messages", "Comunicação"],
      ["reports", "Relatórios"],
      ["settings", "Configurações"],
      ["family", "Família"],
      ["support", "Suporte"],
    ];
    direct.forEach((x) => used.add(x[0]));
    const group = (label, items) => {
      items = items.filter((x) => !used.has(x[0]) && allowed(x[0]));
      items.forEach((x) => used.add(x[0]));
      return items.length
        ? `<details ${items.some((x) => x[0] === page) ? "open" : ""}><summary>${icon(label === "Financeiro" ? "money" : "cap")}<span>${label}</span>${icon("chevron")}</summary>${items.map(button).join("")}</details>`
        : "";
    };
    if (nav)
      nav.innerHTML =
        top
          .filter((x) => allowed(x[0]))
          .map(button)
          .join("") +
        group(
          "Acadêmico",
          groups.find((g) => g[0] === "academico")?.[2] || [],
        ) +
        direct
          .slice(0, 3)
          .filter((x) => allowed(x[0]))
          .map(button)
          .join("") +
        group("Financeiro", groups.find((g) => g[0] === "gestao")?.[2] || []) +
        direct
          .slice(3)
          .filter((x) => allowed(x[0]))
          .map(button)
          .join("") +
        group(
          "Outros módulos",
          groups.flatMap((g) => g[2]),
        ) +
        `<button class="nav" data-v5="logout">${icon("logout")}<span>Sair da conta</span></button>`;
    if (bar)
      bar.innerHTML = `<button class="sc-mobile-menu" data-sc-menu aria-label="Abrir menu escolar">${icon("menu")}</button><div class="sc-mobile-logo">${logo(s)}</div><div class="sc-search"><label>${icon("search")}<input type="search" id="sc-admin-search" placeholder="Buscar aluno, turma, professor ou documento..." aria-label="Buscar na escola" autocomplete="off"><kbd>⌘ K</kbd></label><div class="sc-search-results" hidden></div></div><button class="sc-icon-button" data-nav="messages" aria-label="Abrir comunicados">${icon("bell")}</button><button class="sc-icon-button" data-nav="support" aria-label="Abrir suporte">${icon("help")}</button><div class="sc-account"><span>${esc(
        name
          .split(" ")
          .map((x) => x[0])
          .slice(0, 2)
          .join(""),
      )}</span><div><strong>${esc(name)}</strong><small>Coordenação</small></div></div>`;
    if (main) {
      main.querySelector(".top")?.classList.add("sc-page-top");
      if (page === "overview")
        main.querySelector(".top")?.setAttribute("hidden", "");
    }
    const sidebar = document.querySelector("#root .sidebar");
    if (sidebar) {
      sidebar.setAttribute("aria-label", "Menu da escola");
      sidebar.inert = matchMedia("(max-width:1000px)").matches;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "sc-drawer-close";
      close.dataset.scMenu = "";
      close.setAttribute("aria-label", "Fechar menu escolar");
      close.textContent = "×";
      sidebar.prepend(close);
    }
    const shade = document.createElement("button");
    shade.className = "sc-menu-scrim";
    shade.dataset.scMenu = "";
    shade.setAttribute("aria-label", "Fechar menu escolar");
    document.querySelector("#root .app")?.append(shade);
    document.body.classList.remove("sc-menu-open");
  }
  function teacherHome(d) {
    const pending = list(d.gradeReviewQueue).length,
      items = list(d.items),
      grades = list(d.grades),
      agenda = items
        .filter((x) => x.due >= localDay())
        .sort((a, b) => a.due.localeCompare(b.due));
    return `${hero(d.teacher, "teacher")}<div class="sc-stats sc-teacher-stats">${[
      ["Minhas Turmas", d.classes.length, "users", "classes"],
      ["Alunos", d.students.length, "users", "classes"],
      [
        "Tarefas Ativas",
        items.filter((x) => x.type !== "exam" && x.status === "published")
          .length,
        "calendar",
        "activities",
      ],
      [
        "Avaliações",
        items.filter((x) => x.type === "exam").length,
        "grades",
        "grades",
      ],
      ["Média Geral", score(average(grades)), "chart", "results"],
    ]
      .map((x, i) =>
        metric(x[0], x[1], x[2], `data-teacher-tab="${x[3]}"`, i === 0),
      )
      .join(
        "",
      )}</div><div class="sc-teacher-grid"><article class="sc-card">${heading("Minhas Turmas", "users", '<button class="sc-text-button" data-teacher-tab="classes">Ver todas</button>')}${teacherClasses(d)}</article><article class="sc-card">${heading("Agenda e Entregas", "calendar")} ${events(agenda, 'data-teacher-tab="activities"')}</article><article class="sc-card">${heading("Ações Rápidas", "bolt")}<div class="sc-shortcuts sc-teacher-shortcuts">${[
      ["attendance", "Fazer Chamada", "calendar"],
      ["activities", "Criar Tarefa", "book"],
      ["grades", "Lançar Avaliação", "grades"],
      ["results", "Ver Resultados", "chart"],
      ["messages", "Comunicados", "message"],
    ]
      .map(
        ([key, label, ico]) =>
          `<button data-teacher-tab="${key}">${icon(ico)}<span>${label}</span></button>`,
      )
      .join(
        "",
      )}</div></article><article class="sc-card">${heading("Pendências", "bell")}<button class="sc-task" data-teacher-tab="grades">${icon("check")}<span>Gabaritos aguardando análise</span><b>${pending}</b></button><button class="sc-task" data-teacher-tab="messages">${icon("message")}<span>Conversas abertas</span><b>${list(d.threads).filter((x) => x.status !== "resolved").length}</b></button>${items
      .filter((x) => x.status === "draft")
      .slice(0, 2)
      .map(
        (x) =>
          `<button class="sc-task" data-teacher-tab="activities">${icon("book")}<span>${esc(x.title)}</span><b>Rascunho</b></button>`,
      )
      .join("")}</article></div>`;
  }
  function teacherClasses(d) {
    return (
      list(d.classes)
        .map(
          (c, i) =>
            `<button class="sc-class-row sc-tone-${i % 3}" data-teacher-tab="attendance" data-teacher-class-id="${esc(c.id)}"><strong>${esc(c.name)}</strong><span>${esc((list(d.subjects).find((x) => x.classId === c.id)?.subjects || []).join(" · "))}</span><small>${icon("users")}${list(d.students).filter((x) => x.classId === c.id).length} alunos</small>${icon("chevron")}</button>`,
        )
        .join("") ||
      '<p class="sc-empty">A coordenação ainda não vinculou suas turmas.</p>'
    );
  }
  function teacherPanel(tab, d) {
    if (tab === "classes")
      return heading("Minhas Turmas", "users") + teacherClasses(d);
    if (tab === "calendar")
      return (
        heading("Calendário de Atividades", "calendar") +
        events(
          list(d.items)
            .slice()
            .sort((a, b) => (a.due || "").localeCompare(b.due || "")),
          'data-teacher-tab="activities"',
        )
      );
    if (tab === "results")
      return (
        heading("Resultados Registrados", "chart") +
        `<p class="sc-caption">Notas das suas turmas. A publicação continua sujeita às regras da coordenação.</p>` +
        list(d.grades)
          .map(
            (g) =>
              `<article class="sc-result"><span>${icon("grades")}</span><div><strong>${esc(list(d.students).find((s) => s.id === g.studentId)?.name || "Aluno")}</strong><small>${esc(g.subject)} · ${esc(g.assessment)} · ${esc(g.period || "")}</small></div><b>${esc(g.score)}</b></article>`,
          )
          .join("") +
        (d.grades.length
          ? ""
          : '<p class="sc-empty">Nenhum resultado registrado.</p>')
      );
    return null;
  }
  function teacherShell({ data: d, tab, body, tabs }) {
    document.body.dataset.schoolDesign = "teacher";
    document.body.dataset.classPage = tab;
    const links = [
      ["home", "Início", "home"],
      ["classes", "Minhas Turmas", "users"],
      ["attendance", "Chamadas", "calendar"],
      ["activities", "Tarefas e Conteúdos", "book"],
      ["grades", "Avaliações", "grades"],
      ["results", "Resultados", "chart"],
      ["routines", "Rotina", "user"],
      ["messages", "Comunicados", "message"],
      ["calendar", "Calendário", "calendar"],
      ["account", "Minha Conta", "settings"],
    ];
    const nav = ([key, label, ico]) =>
      `<button data-teacher-tab="${key}" class="${tab === key ? "active" : ""}" ${tab === key ? 'aria-current="page"' : ""}>${icon(ico)}<span>${label}</span></button>`;
    return `<aside class="sc-teacher-sidebar"><div class="sc-school-brand">${logo(d.school)}</div><nav aria-label="Menu do professor">${links.map(nav).join("")}</nav><button id="teacher-logout" class="sc-logout">${icon("logout")} Sair da conta</button></aside><div class="sc-teacher-main"><header class="sc-topbar"><details class="sc-teacher-menu"><summary aria-label="Menu do professor">${icon("menu")}</summary><div>${links.map(nav).join("")}</div></details><div class="sc-mobile-logo">${logo(d.school)}</div><div class="sc-teacher-search"><label>${icon("search")}<input type="search" id="sc-teacher-search" placeholder="Buscar aluno, turma ou conteúdo..." aria-label="Buscar nas minhas turmas" autocomplete="off"></label><div class="sc-search-results" hidden></div></div><button class="sc-icon-button" data-teacher-tab="messages" aria-label="Ver comunicados">${icon("bell")}</button><div class="sc-account"><span>${esc(
      d.teacher
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join(""),
    )}</span><div><strong>Prof. ${esc(d.teacher)}</strong><small>${esc([...new Set(list(d.subjects).flatMap((x) => list(x.subjects)))].join(" · "))}</small></div></div></header>${tab === "home" ? "" : `<div class="sc-page-heading"><h1>${esc(links.find((x) => x[0] === tab)?.[1] || "Professor")}</h1><button class="btn alt" data-teacher-tab="home">${icon("home")} Início</button></div>`}<section class="${tab === "home" ? "teacher-home" : "card teacher-workspace"}">${body}<p id="teacher-status" role="status" tabindex="-1" aria-live="polite"></p></section></div><nav class="teacher-mobile-nav" aria-label="Navegação do professor">${links
      .filter((x) => ["home", "classes", "attendance", "grades"].includes(x[0]))
      .map(nav)
      .join(
        "",
      )}<details><summary>${icon("menu")}<span>Mais</span></summary><div>${links
      .filter(
        (x) => !["home", "classes", "attendance", "grades"].includes(x[0]),
      )
      .map(nav)
      .join("")}</div></details></nav>`;
  }
  function childCard(data, preview) {
    const st = data.student,
      children = list(data.children);
    return `<section class="sc-child-card"><span class="sc-child-photo">${safeImage(st.photo) ? `<img src="${esc(st.photo)}" alt="Foto de ${esc(st.name)}">` : icon("user")}</span><div><strong>${esc(st.name)}</strong><small>${esc(st.className)}</small></div>${!preview && children.length > 1 ? `<label class="sc-child-select"><span class="sc-sr-only">Escolher estudante</span><select id="family-child">${children.map((x) => `<option value="${esc(x.id)}" ${x.id === st.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>${icon("down")}</label>` : ""}</section>`;
  }
  function performance(data) {
    const rows = list(data.gradeSummary),
      periods = [...new Set(rows.map((x) => x.period).filter(Boolean))],
      lastPeriod = periods.at(-1),
      current = lastPeriod ? rows.filter((x) => x.period === lastPeriod) : rows,
      value = average(current);
    return `<div class="sc-performance-tabs">${[
      ["performance", "Desempenho", "chart"],
      ["grades", "Notas", "grades"],
      ["attendance", "Frequência", "calendar"],
    ]
      .map(
        ([key, label, ico]) =>
          `<button data-family-tab="${key}" class="${key === "performance" ? "active" : ""}">${icon(ico)}${label}</button>`,
      )
      .join(
        "",
      )}</div><section class="sc-card sc-family-average">${heading("Média Geral", "grades")}<strong>${score(value)}</strong><span>${lastPeriod ? esc(lastPeriod) : "Notas publicadas"}<small>Média das disciplinas com resultado disponível</small></span></section><section class="sc-card">${heading("Desempenho por Disciplina", "chart")}${
      current
        .map((x) => {
          const val = average([x]);
          return `<button class="sc-subject-row" data-family-tab="grades">${icon("book")}<span><strong>${esc(x.subject)}</strong><i><b style="width:${Math.max(0, Math.min(100, (val || 0) * 10))}%"></b></i></span><em>${score(val)}</em>${icon("chevron")}</button>`;
        })
        .join("") ||
      '<p class="sc-empty">Os resultados aparecerão após a publicação da escola.</p>'
    }</section>`;
  }
  function familyContent(tab, data, preview) {
    if (tab === "home")
      return `<section class="sc-family-hero"><div><h1>Portal da Família</h1><p>Acompanhe a vida escolar do seu filho de forma prática e segura.</p></div><svg class="sc-ribbon" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 45Q220 80 410 60T1000 10V90H0Z" fill="var(--sc-highlight)"/><path d="M0 62Q220 95 410 78T1000 28V90H0Z" fill="var(--sc-primary)"/></svg></section>${childCard(data, preview)}<section class="sc-family-shortcuts">${[
        ["attendance", "Frequência", "calendar"],
        ["grades", "Notas", "grades"],
        ["activities", "Tarefas", "book"],
        ["exams", "Provas", "calendar"],
        ["performance", "Evolução", "chart"],
        ["routines", "Rotina", "user"],
      ]
        .map(
          ([key, label, ico]) =>
            `<button data-family-tab="${key}">${icon(ico)}<span>${label}</span></button>`,
        )
        .join(
          "",
        )}</section><section class="sc-card">${heading("Próximas Atividades", "calendar")}${events(
        [...list(data.calendar), ...list(data.activities)]
          .filter((x) => (x.date || x.due || "") >= localDay())
          .sort((a, b) => (a.date || a.due).localeCompare(b.date || b.due)),
        'data-family-tab="calendar"',
      )}</section>`;
    if (tab === "performance")
      return childCard(data, preview) + performance(data);
    if (tab === "exams")
      return (
        childCard(data, preview) +
        `<section class="sc-card">${heading("Provas e Avaliações", "grades")}${events(
          list(data.activities).filter((x) => x.type === "exam"),
          'data-family-tab="activities"',
        )}</section>`
      );
    if (tab === "profile")
      return (
        childCard(data, preview) +
        `<section class="sc-card">${heading("Sua Conta", "user")}<p>Responsável: <strong>${esc(data.guardian || "Responsável")}</strong></p><div class="sc-profile-actions">${[
          ["conversations", "Falar com a escola"],
          ["finance", "Mensalidades"],
          ["notifications", "Novidades e notificações"],
          ["routines", "Rotina escolar"],
        ]
          .map(
            ([key, label]) =>
              `<button class="sc-event-row" data-family-tab="${key}"><span>${label}</span>${icon("chevron")}</button>`,
          )
          .join(
            "",
          )}</div>${!preview ? `<details class="account-actions"><summary>Alterar minha senha</summary><form id="family-password"><label>Nova senha (10 caracteres)<input name="password" type="password" minlength="10" maxlength="10" autocomplete="new-password" required></label><label>Confirmar senha<input name="confirm" type="password" minlength="10" maxlength="10" autocomplete="new-password" required></label><button class="btn">Salvar nova senha</button><p id="family-password-status" role="status"></p></form></details><button class="btn alt" type="button" onclick="window.BOLT_OPEN_SUPPORT()">Suporte</button><button class="btn alt" id="family-logout">Sair da conta</button>` : ""}</section>`
      );
    return null;
  }
  function familyShell({ school, data, preview, previewBar, tab, content }) {
    document.body.dataset.schoolDesign = "family";
    document.body.dataset.classPage = tab;
    return `<div class="shell sc-family-shell"><header class="header sc-family-header"><button data-family-tab="${tab === "home" ? "profile" : "home"}" class="sc-icon-button" aria-label="${tab === "home" ? "Abrir perfil e opções" : "Voltar ao início"}">${icon(tab === "home" ? "menu" : "chevron")}</button><div>${logo(school)}</div><button class="sc-icon-button" data-family-tab="notifications" aria-label="Ver notificações">${icon("bell")}</button></header>${previewBar}<main class="main">${tab === "home" || ["performance", "profile", "exams"].includes(tab) ? "" : childCard(data, preview)}${content}<p class="status" id="family-status" role="status"></p></main><nav class="nav sc-family-nav" aria-label="Navegação da família">${[
      ["home", "Início", "home"],
      ["performance", "Desempenho", "chart"],
      ["calendar", "Agenda", "calendar"],
      ["messages", "Comunicados", "message"],
      ["profile", "Perfil", "user"],
    ]
      .map(
        ([key, label, ico]) =>
          `<button data-family-tab="${key}" class="${key === tab ? "active" : ""}" ${key === tab ? 'aria-current="page"' : ""}>${icon(ico)}<span>${label}</span></button>`,
      )
      .join("")}</nav></div>`;
  }
  let teacherData;
  function search(input) {
    const isTeacher = input.id === "sc-teacher-search",
      data = isTeacher ? teacherData : adminState?.school,
      query = input.value.trim().toLocaleLowerCase("pt-BR"),
      host = input
        .closest(".sc-search,.sc-teacher-search")
        ?.querySelector(".sc-search-results");
    if (!host) return;
    if (!query || !data) {
      host.hidden = true;
      return;
    }
    const collections = isTeacher
      ? [
          ["classes", "Turma", "attendance"],
          ["students", "Aluno", "classes"],
          ["items", "Conteúdo", "activities"],
        ]
      : [
          ["students", "Aluno", "students"],
          ["classes", "Turma", "classes"],
          ["staff", "Professor", "staff"],
          ["documents", "Documento", "documents"],
        ];
    const results = collections.flatMap(([key, label, page]) =>
      !isTeacher && !adminState.allowed(page)
        ? []
        : list(data[key])
            .filter((x) =>
              (x.name || x.title || "")
                .toLocaleLowerCase("pt-BR")
                .includes(query),
            )
            .slice(0, 4)
            .map(
              (x) =>
                `<button ${isTeacher ? `data-teacher-tab="${page}" ${key === "classes" ? `data-teacher-class-id="${esc(x.id)}"` : ""}` : `data-nav="${page}"`}><span><strong>${esc(x.name || x.title)}</strong><small>${label}</small></span>${icon("chevron")}</button>`,
            ),
    );
    host.innerHTML =
      results.slice(0, 8).join("") || "<p>Nenhum resultado encontrado.</p>";
    host.hidden = false;
  }
  function setup() {
    document.addEventListener("input", (event) => {
      if (["sc-admin-search", "sc-teacher-search"].includes(event.target.id))
        search(event.target);
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-sc-menu]")) {
        const open = document.body.classList.toggle("sc-menu-open"),
          side = document.querySelector("#root .sidebar");
        if (side) {
          side.inert = !open;
          document.querySelector("#root .main").inert = open;
          if (open) side.querySelector(".sc-drawer-close")?.focus();
        }
      }
      if (event.target.closest("[data-nav]")) {
        document.body.classList.remove("sc-menu-open");
        const side = document.querySelector("#root .sidebar");
        if (side) side.inert = matchMedia("(max-width:1000px)").matches;
        document.querySelector("#root .main")?.removeAttribute("inert");
      }
      if (!event.target.closest(".sc-search,.sc-teacher-search"))
        document
          .querySelectorAll(".sc-search-results")
          .forEach((x) => (x.hidden = true));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        document.body.classList.remove("sc-menu-open");
        document.querySelector("#root .main")?.removeAttribute("inert");
        const side = document.querySelector("#root .sidebar");
        if (side) side.inert = matchMedia("(max-width:1000px)").matches;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        const input =
          document.getElementById("sc-admin-search") ||
          document.getElementById("sc-teacher-search");
        if (input) {
          event.preventDefault();
          input.focus();
        }
      }
    });
  }
  window.BOLT_CLASS_REFERENCE = {
    admin,
    decorateAdmin,
    teacherHome,
    teacherPanel,
    teacherShell: (context) => {
      teacherData = context.data;
      return teacherShell(context);
    },
    familyContent,
    familyShell,
    average,
    performance,
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
