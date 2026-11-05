(() => {
  "use strict";
  const slug = new URLSearchParams(location.search).get("slug"),
    root = document.getElementById("teacher-root"),
    cfg = window.BOLT_CONFIG;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) {
    root.textContent = "Abra o link enviado pela escola.";
    return;
  }
  const sb = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabaseAnonKey,
    {
      auth: {
        storageKey: "bolt-class-teacher-" + slug,
        detectSessionInUrl: false,
      },
    },
  );
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
  let data,
    tab = "home",
    classId = "",
    examId = "",
    schoolName = "Acesso do professor";
  const students = () => data.students.filter((x) => x.classId === classId);
  const opts = (rows) =>
    rows
      .map(
        (x) =>
          `<option value="${esc(x.id)}">${esc(x.name || x.title)}</option>`,
      )
      .join("");
  const tabs = [
    ["home", "Visão geral", "home"],
    ["attendance", "Chamada", "check"],
    ["activities", "Atividades", "book"],
    ["grades", "Provas e notas", "chart"],
    ["routines", "Rotina", "sun"],
    ["messages", "Mensagens", "message"],
    ["account", "Minha conta", "user"],
  ];
  const symbols = {
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    check:
      '<path d="m5 12 4 4L19 6"/><rect x="3" y="3" width="18" height="18" rx="5"/>',
    book: '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
    chart: '<path d="M4 20h17M7 16v-5m5 5V5m5 11V8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    message:
      '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] || symbols.book}</svg>`;
  const today = () =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    );
  const dateLabel = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || "")
      ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
        })
      : "Sem data";
  const initials = (name) =>
    String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join("");
  const photo = (st) =>
    st.photo
      ? `<img src="${esc(st.photo)}" alt="" loading="lazy">`
      : esc(initials(st.name));
  const statusLabel = (value) =>
    ({
      published: "Publicado",
      draft: "Rascunho",
      review: "Em revisão",
      resolved: "Resolvido",
      open: "Em aberto",
    })[value] ||
    value ||
    "Em aberto";
  function home() {
    if (window.BOLT_CLASS_REFERENCE)
      return window.BOLT_CLASS_REFERENCE.teacherHome(data);
    const pending = (data.gradeReviewQueue || []).length;
    const threads = data.threads.filter((x) => x.status !== "resolved").length;
    const agenda = data.items
      .filter((x) => x.due >= today())
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 5);
    return `<section class="teacher-welcome"><div><span class="teacher-kicker">SEU ESPAÇO DE ENSINAR</span><h2>Um novo dia.<br>Novas descobertas.</h2><p>Chamada, atividades e evolução dos alunos em um só lugar.</p><button class="btn" data-teacher-tab="attendance">${icon("check")} Fazer chamada</button></div><div class="teacher-welcome-art" aria-hidden="true"><span>${icon("book")}</span><i>✦</i><b>Aa</b><em>+</em></div></section>
    <section class="teacher-metrics" aria-label="Resumo do seu trabalho">${[
      ["Turmas", data.classes.length, "book", "attendance"],
      ["Alunos", data.students.length, "user", "attendance"],
      ["Análises pendentes", pending, "chart", "grades"],
      ["Conversas abertas", threads, "message", "messages"],
    ]
      .map(
        ([label, value, glyph, target], i) =>
          `<button data-teacher-tab="${target}" class="teacher-metric tone-${i}"><span>${icon(glyph)}</span><strong>${value}</strong><small>${label}</small></button>`,
      )
      .join("")}</section>
    <div class="teacher-home-grid"><section><div class="teacher-section-heading"><div><span class="teacher-kicker">SUAS CONEXÕES</span><h2>Minhas turmas</h2></div><span class="teacher-badge">${data.classes.length} turmas</span></div><div class="teacher-class-grid">${
      data.classes
        .map((c, i) => {
          const roster = data.students.filter((x) => x.classId === c.id),
            done = roster.filter((st) =>
              data.attendance.some(
                (a) =>
                  a.studentId === st.id &&
                  a.classId === c.id &&
                  a.date === today(),
              ),
            ).length;
          return `<article class="teacher-class-card tone-${i % 4}"><div class="teacher-class-icon">${icon("book")}</div><h3>${esc(c.name)}</h3><p>${esc((data.subjects.find((x) => x.classId === c.id)?.subjects || []).join(" · "))}</p><div class="teacher-avatar-stack">${roster
            .slice(0, 4)
            .map((st) => `<span>${photo(st)}</span>`)
            .join(
              "",
            )}<small>${roster.length} alunos</small></div><div class="teacher-progress-label"><span>Chamada de hoje</span><strong>${done}/${roster.length}</strong></div><progress max="${roster.length || 1}" value="${done}" aria-label="Chamada de ${esc(c.name)}"></progress><button class="btn alt" data-teacher-tab="attendance" data-teacher-class-id="${esc(c.id)}">Abrir turma →</button></article>`;
        })
        .join("") ||
      '<div class="teacher-empty">Suas turmas aparecerão aqui assim que a coordenação fizer o vínculo.</div>'
    }</div></section><section><div class="teacher-section-heading"><div><span class="teacher-kicker">NO SEU RADAR</span><h2>Próximas entregas</h2></div></div><div class="teacher-agenda">${agenda.map((x) => `<article><time>${esc(dateLabel(x.due))}</time><div><strong>${esc(x.title)}</strong><small>${esc(data.classes.find((c) => c.id === x.classId)?.name)} · ${esc(x.subject)}</small><span class="teacher-badge">${x.type === "exam" ? "Prova" : "Tarefa"} · ${statusLabel(x.status)}</span></div></article>`).join("") || '<div class="teacher-empty">Tudo em dia! Crie uma atividade para planejar as próximas entregas.</div>'}<button class="btn alt" data-teacher-tab="activities">Planejar atividade ${icon("book")}</button></div></section></div>`;
  }
  function login(error = "") {
    root.innerHTML = `<section class="card life-login"><span class="teacher-login-icon">${icon("book")}</span><small>ÁREA DO PROFESSOR</small><h1>${esc(schoolName)}</h1><form id="teacher-login"><label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="btn">Entrar</button></form><p id="teacher-error" role="status">${esc(error)}</p></section>`;
  }
  async function api(method, body) {
    if (body) body.requestId ??= crypto.randomUUID();
    const token = (await sb.auth.getSession()).data?.session?.access_token;
    const r = await fetch("/api/school-life?slug=" + encodeURIComponent(slug), {
      method,
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await r.json();
    if (!r.ok) {
      const error = Error(result.error || "Não foi possível conectar.");
      error.status = r.status;
      throw error;
    }
    return result;
  }
  async function load() {
    try {
      data = await api("GET");
      if (data.role !== "teacher")
        throw Error("Use uma conta de professor vinculada à escola.");
      schoolName = data.school.name;
      const color = /^#[a-f0-9]{6}$/i.test(data.school.color || "")
        ? data.school.color
        : "#334155";
      document.documentElement.style.setProperty("--school-primary", color);
      const luminance = [1, 3, 5]
        .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      document.documentElement.style.setProperty(
        "--school-on-primary",
        0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] >
          0.179
          ? "#17213a"
          : "#fff",
      );
      classId = data.classes.some((x) => x.id === classId)
        ? classId
        : data.classes[0]?.id || "";
      render();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        await sb.auth.signOut();
        login(error.message);
      } else {
        root.innerHTML =
          '<section class="card"><h1>Não foi possível abrir</h1><p id="teacher-load-error"></p><button class="btn" id="teacher-retry">Tentar novamente</button></section>';
        document.getElementById("teacher-load-error").textContent =
          error.message;
      }
    }
  }
  function render() {
    const classSelect = `<label class="field">Turma<select id="teacher-class">${data.classes.map((c) => `<option value="${esc(c.id)}" ${c.id === classId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>`;
    const subjects =
      data.subjects.find((x) => x.classId === classId)?.subjects || [];
    const subjectSelect = `<label class="field">Disciplina<select name="subject" required>${subjects.map((x) => `<option>${esc(x)}</option>`).join("")}</select></label>`;
    let body = "";
    const referencePanel = window.BOLT_CLASS_REFERENCE?.teacherPanel(tab, data);
    if (referencePanel !== null && referencePanel !== undefined)
      body = referencePanel;
    else if (tab === "home") body = home();
    else if (!classId && tab !== "account")
      body =
        "<p>Suas turmas ainda precisam ser vinculadas pela coordenação.</p>";
    else if (tab === "attendance") {
      body = `${classSelect}<form data-teacher-form="attendance"><label class="field">Data<input name="date" type="date" value="${new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date())}" required id="teacher-call-date"></label><div class="teacher-roster-tools"><span id="teacher-call-count" role="status"></span><button class="btn alt" type="button" id="teacher-mark-present">Marcar todos presentes</button></div><div id="teacher-roster"></div><button class="btn">Salvar chamada</button></form>`;
    } else if (tab === "activities") {
      body = `${classSelect}<form data-teacher-form="teacher-item">${subjectSelect}<label class="field">Tipo<select name="type"><option value="task">Tarefa</option><option value="exam">Prova</option></select></label><label class="field">Título<input name="title" required maxlength="160"></label><label class="field">Data<input name="due" type="date" required></label><label class="field">Orientações<textarea name="description" maxlength="3000"></textarea></label><label class="field">Publicação<select name="status"><option value="published">Publicar / enviar para revisão</option><option value="draft">Rascunho</option></select></label><button class="btn">Salvar atividade</button></form><h2>Atividades cadastradas</h2>${
        data.items
          .filter((x) => x.classId === classId)
          .map(
            (x) =>
              `<article class="teacher-activity"><span class="teacher-activity-icon">${icon(x.type === "exam" ? "chart" : "book")}</span><div><span class="teacher-badge">${x.type === "exam" ? "Prova" : "Tarefa"} · ${esc(statusLabel(x.status))}</span><h3>${esc(x.title)}</h3><p>${esc(x.subject)} · ${esc(dateLabel(x.due))}</p><p>${esc(x.description)}</p></div>${x.type === "exam" ? `<button class="btn alt" type="button" data-teacher-tab="grades" data-teacher-exam-id="${esc(x.id)}">Gabarito e correção →</button>` : ""}</article>`,
          )
          .join("") || "<p>Nenhuma atividade cadastrada.</p>"
      }`;
    } else if (tab === "grades") {
      const exams = data.items.filter((x) => x.type === "exam");
      examId = exams.some((x) => x.id === examId) ? examId : exams[0]?.id || "";
      const exam = exams.find((x) => x.id === examId),
        roster = exam
          ? data.students.filter((x) => x.classId === exam.classId)
          : [];
      body = exam
        ? `<label class="field">Prova<select id="teacher-exam">${exams.map((x) => `<option value="${esc(x.id)}" ${x.id === examId ? "selected" : ""}>${esc(x.title)} · ${esc(x.subject)}</option>`).join("")}</select></label><details class="teacher-manual-grades"><summary>Digitar notas manualmente</summary><form id="teacherResults" data-teacher-form="teacher-grades"><label class="field">Período<input name="period" value="1º Bimestre" required maxlength="60"></label><label class="field">Peso<input name="weight" type="number" min="0.1" max="100" step="0.1" value="1" required></label><label class="life-check"><input name="isRecovery" type="checkbox"> Avaliação de recuperação</label>${roster.map((st) => `<label class="life-row">${esc(st.name)}<input type="number" name="grade_${esc(st.id)}" min="0" max="10" step="0.1" value="${esc(data.grades.find((g) => g.studentId === st.id && g.teacherExamId === exam.id)?.score ?? "")}" aria-label="Nota de ${esc(st.name)}"></label>`).join("")}<label class="field">Resultados<select name="publish"><option value="draft">Rascunho</option><option value="published">Publicar / enviar para revisão</option></select></label><button class="btn">Salvar resultados</button></form></details><div id="teacher-review-host"></div>`
        : "<p>Cadastre uma prova em Atividades para lançar notas.</p>";
    } else if (tab === "routines") {
      body = `${classSelect}<form data-teacher-form="routine"><label class="field">Aluno<select name="studentId" required>${opts(students())}</select></label><label class="field">Data<input name="date" type="date" value="${new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date())}" required></label>${[
        ["food", "Alimentação"],
        ["sleep", "Descanso"],
        ["mood", "Como a criança esteve"],
      ]
        .map(
          ([id, label]) =>
            `<label class="field">${label}<input name="${id}" maxlength="120"></label>`,
        )
        .join(
          "",
        )}<label class="field">Atividades<textarea name="activity" maxlength="800"></textarea></label><label class="field">Observações para a família<textarea name="note" maxlength="1200"></textarea></label><label class="field">Visibilidade<select name="status"><option value="published">Publicar para a família</option><option value="draft">Guardar rascunho</option></select></label><button class="btn">Salvar rotina</button></form>`;
    } else if (tab === "messages") {
      body =
        data.threads
          .map(
            (t) =>
              `<details class="life-item"><summary>${esc(t.subject)} · ${esc(data.students.find((x) => x.id === t.studentId)?.name)} · ${esc(t.status)}</summary>${t.messages.map((m) => `<article class="life-message"><strong>${esc(m.name)}</strong><p>${esc(m.body)}</p></article>`).join("")}<form data-teacher-form="reply"><input name="threadId" type="hidden" value="${esc(t.id)}"><label class="field">Resposta<textarea name="message" required maxlength="3000"></textarea></label><label class="life-check"><input name="resolve" type="checkbox"> Resolvido</label><button class="btn">Enviar resposta</button></form></details>`,
          )
          .join("") || "<p>Nenhuma mensagem das famílias.</p>";
    } else
      body =
        '<form id="teacher-password"><label class="field">Nova senha forte de 10 caracteres<input name="password" type="password" required minlength="10" maxlength="10" autocomplete="new-password"></label><button class="btn">Alterar senha</button></form>';
    const currentTab = tabs.find((x) => x[0] === tab) || tabs[0];
    const navButton = ([id, label, glyph]) =>
      `<button class="btn ${id === tab ? "" : "alt"}" data-teacher-tab="${id}" ${id === tab ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${label}</span></button>`;
    root.innerHTML =
      window.BOLT_CLASS_REFERENCE?.teacherShell({ data, tab, body, tabs }) ||
      `<header class="teacher-topbar"><a class="teacher-school-brand" href="?slug=${encodeURIComponent(slug)}" aria-label="Início da escola">${data.school.logo ? `<img src="${esc(data.school.logo)}" alt="${esc(schoolName)}">` : `<span>${icon("book")}</span><strong>${esc(schoolName)}</strong>`}</a><div class="teacher-account"><span>${esc(initials(data.teacher))}</span><div><small>Olá, professor(a)</small><strong>${esc(data.teacher)}</strong></div><button class="btn alt" id="teacher-logout">Sair</button></div></header><nav class="life-tabs teacher-desktop-nav" aria-label="Área do professor">${tabs.map(navButton).join("")}</nav><div class="teacher-page-heading"><div><span class="teacher-kicker">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" })}</span><h1>${currentTab[1]}</h1></div>${tab !== "home" ? `<button class="btn alt" data-teacher-tab="home">${icon("home")} Início</button>` : ""}</div><section class="${tab === "home" ? "teacher-home" : "card teacher-workspace"}">${body}<p id="teacher-status" role="status" tabindex="-1" aria-live="polite"></p></section><nav class="teacher-mobile-nav" aria-label="Navegação do professor">${tabs.slice(0, 4).map(navButton).join("")}<details><summary>${icon("user")}<span>Mais</span></summary><div>${tabs.slice(4).map(navButton).join("")}</div></details></nav>`;
    if (tab === "attendance") roster();
    if (
      tab === "grades" &&
      examId &&
      data.items.some((x) => x.id === examId) &&
      document.getElementById("teacher-review-host") &&
      window.BOLT_GRADE_REVIEW
    ) {
      const exam = data.items.find((x) => x.id === examId);
      const update = async (body) => {
        await api("POST", body);
        const latest = await api("GET");
        data = latest;
      };
      window.BOLT_GRADE_REVIEW.mount(
        document.getElementById("teacher-review-host"),
        {
          students: data.students.filter((x) => x.classId === exam.classId),
          exam,
          saveKey: (key) =>
            update({ action: "teacher-answer-key", examId: exam.id, key }),
          items: () => data.gradeReviewQueue || [],
          grades: () => data.grades,
          enqueue: (record) =>
            update({ action: "review-enqueue", examId: exam.id, record }),
          approve: (reviewId, review) =>
            update({
              action: "review-approve",
              examId: exam.id,
              reviewId,
              review,
            }),
          discard: (reviewId) =>
            update({ action: "review-discard", examId: exam.id, reviewId }),
        },
      );
    }
  }
  function roster() {
    const date = document.getElementById("teacher-call-date")?.value;
    const host = document.getElementById("teacher-roster");
    if (!host) return;
    host.innerHTML =
      students()
        .map((st) => {
          const old = data.attendance.find(
            (x) =>
              x.studentId === st.id && x.classId === classId && x.date === date,
          );
          return `<div class="life-row teacher-student-row"><span class="teacher-student-identity"><span class="teacher-student-photo">${photo(st)}</span><strong>${esc(st.name)}</strong></span><label class="teacher-present"><input type="radio" name="call_${esc(st.id)}" value="P" ${old?.status === "P" ? "checked" : ""} required> Presente</label><label class="teacher-absent"><input type="radio" name="call_${esc(st.id)}" value="F" ${old?.status === "F" ? "checked" : ""}> Faltou</label></div>`;
        })
        .join("") ||
      '<p class="teacher-empty">Esta turma ainda não tem alunos cadastrados.</p>';
    callCount();
  }
  function callCount() {
    const host = document.getElementById("teacher-roster"),
      out = document.getElementById("teacher-call-count");
    if (!host || !out) return;
    out.textContent = `${host.querySelectorAll('input[value="P"]:checked').length} presentes · ${host.querySelectorAll('input[value="F"]:checked').length} ausentes · ${students().length} alunos`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(
      "[data-teacher-tab],#teacher-logout,#teacher-retry,#teacher-mark-present",
    );
    if (!b) return;
    if (b.id === "teacher-mark-present") {
      document
        .querySelectorAll('#teacher-roster input[value="P"]')
        .forEach((input) => (input.checked = true));
      callCount();
      return;
    }
    if (b.id === "teacher-logout") {
      await sb.auth.signOut();
      login();
    } else if (b.id === "teacher-retry") await load();
    else {
      tab = b.dataset.teacherTab;
      if (b.dataset.teacherClassId) classId = b.dataset.teacherClassId;
      if (b.dataset.teacherExamId) examId = b.dataset.teacherExamId;
      render();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.name?.startsWith("call_")) callCount();
    if (e.target.id === "teacher-class") {
      classId = e.target.value;
      render();
    }
    if (e.target.id === "teacher-exam") {
      examId = e.target.value;
      render();
    }
    if (e.target.id === "teacher-call-date") roster();
  });
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (
      form.id !== "teacher-login" &&
      form.id !== "teacher-password" &&
      !form.dataset.teacherForm
    )
      return;
    e.preventDefault();
    const b = form.querySelector('button[type="submit"],button:not([type])');
    b.disabled = true;
    try {
      if (form.id === "teacher-login") {
        const result = await sb.auth.signInWithPassword({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value,
        });
        if (result.error) throw Error("E-mail ou senha inválidos.");
        await load();
        return;
      }
      if (form.id === "teacher-password") {
        const password = form.elements.password.value;
        if (
          !/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%&*])[A-Za-z0-9!@#$%&*]{10}$/.test(
            password,
          )
        )
          throw Error("Use maiúscula, minúscula, número e símbolo (!@#$%&*).");
        const result = await sb.auth.updateUser({ password });
        if (result.error) throw result.error;
        form.reset();
      } else {
        const fd = new FormData(form),
          body = {
            ...Object.fromEntries(fd),
            action: form.dataset.teacherForm,
            classId,
          };
        if (body.action === "attendance")
          body.students = students().map((st) => ({
            id: st.id,
            status: fd.get("call_" + st.id),
          }));
        if (body.action === "teacher-grades") {
          const exam = data.items.find((x) => x.id === examId);
          body.examId = examId;
          body.isRecovery = fd.has("isRecovery");
          body.grades = data.students
            .filter((x) => x.classId === exam.classId)
            .filter((x) => fd.get("grade_" + x.id) !== "")
            .map((st) => ({
              studentId: st.id,
              score: fd.get("grade_" + st.id),
            }));
        }
        body.resolve = fd.has("resolve");
        body.requestId = form.dataset.teacherRequestId ||= crypto.randomUUID();
        await api("POST", body);
        await load();
      }
      document.getElementById("teacher-status").textContent =
        "Salvo e confirmado pela escola.";
    } catch (error) {
      const out = document.getElementById(
        form.id === "teacher-login" ? "teacher-error" : "teacher-status",
      );
      if (out) {
        out.textContent = error.message;
        out.setAttribute("role", "alert");
        out.focus?.({ preventScroll: true });
        out.scrollIntoView?.({ block: "nearest" });
      }
    } finally {
      b.disabled = false;
    }
  });
  (async () => {
    if ((await sb.auth.getSession()).data?.session) await load();
    else login();
  })();
})();
