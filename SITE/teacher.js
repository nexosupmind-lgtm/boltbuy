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
    tab = "attendance",
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
  function login(error = "") {
    root.innerHTML = `<section class="card life-login"><small>ÁREA DO PROFESSOR</small><h1>${esc(schoolName)}</h1><form id="teacher-login"><label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="btn">Entrar</button></form><p id="teacher-error" role="status">${esc(error)}</p></section>`;
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
    if (!classId && tab !== "account")
      body =
        "<p>Suas turmas ainda precisam ser vinculadas pela coordenação.</p>";
    else if (tab === "attendance") {
      body = `${classSelect}<form data-teacher-form="attendance"><label class="field">Data<input name="date" type="date" value="${new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date())}" required id="teacher-call-date"></label><div id="teacher-roster"></div><button class="btn">Salvar chamada</button></form>`;
    } else if (tab === "activities") {
      body = `${classSelect}<form data-teacher-form="teacher-item">${subjectSelect}<label class="field">Tipo<select name="type"><option value="task">Tarefa</option><option value="exam">Prova</option></select></label><label class="field">Título<input name="title" required maxlength="160"></label><label class="field">Data<input name="due" type="date" required></label><label class="field">Orientações<textarea name="description" maxlength="3000"></textarea></label><label class="field">Publicação<select name="status"><option value="published">Publicar / enviar para revisão</option><option value="draft">Rascunho</option></select></label><button class="btn">Salvar atividade</button></form><h2>Atividades cadastradas</h2>${
        data.items
          .filter((x) => x.classId === classId)
          .map(
            (x) =>
              `<article class="life-row"><strong>${esc(x.title)}</strong><span>${esc(x.subject)} · ${esc(x.due)} · ${esc(x.status)}</span></article>`,
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
        ? `<label class="field">Prova<select id="teacher-exam">${exams.map((x) => `<option value="${esc(x.id)}" ${x.id === examId ? "selected" : ""}>${esc(x.title)} · ${esc(x.subject)}</option>`).join("")}</select></label><form data-teacher-form="teacher-grades"><label class="field">Período<input name="period" value="1º Bimestre" required maxlength="60"></label><label class="field">Peso<input name="weight" type="number" min="0.1" max="100" step="0.1" value="1" required></label><label class="life-check"><input name="isRecovery" type="checkbox"> Avaliação de recuperação</label>${roster.map((st) => `<label class="life-row">${esc(st.name)}<input type="number" name="grade_${esc(st.id)}" min="0" max="10" step="0.1" value="${esc(data.grades.find((g) => g.studentId === st.id && g.teacherExamId === exam.id)?.score ?? "")}" aria-label="Nota de ${esc(st.name)}"></label>`).join("")}<label class="field">Resultados<select name="publish"><option value="draft">Rascunho</option><option value="published">Publicar / enviar para revisão</option></select></label><button class="btn">Salvar resultados</button></form><div id="teacher-review-host"></div>`
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
    root.innerHTML = `<header class="life-header"><div><small>${esc(schoolName)}</small><h1>Olá, ${esc(data.teacher)}!</h1></div><button class="btn alt" id="teacher-logout">Sair</button></header><nav class="life-tabs" aria-label="Área do professor">${[
      ["attendance", "Chamada"],
      ["activities", "Atividades"],
      ["grades", "Notas"],
      ["routines", "Rotina"],
      ["messages", "Mensagens"],
      ["account", "Minha conta"],
    ]
      .map(
        ([id, label]) =>
          `<button class="btn ${id === tab ? "" : "alt"}" data-teacher-tab="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</nav><section class="card">${body}<p id="teacher-status" role="status"></p></section>`;
    if (tab === "attendance") roster();
    if (tab === "grades" && examId && window.BOLT_GRADE_REVIEW) {
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
          items: () => data.gradeReviewQueue || [],
          grades: () => data.grades,
          enqueue: (record) =>
            update({ action: "review-enqueue", examId, record }),
          approve: (reviewId, review) =>
            update({ action: "review-approve", examId, reviewId, review }),
          discard: (reviewId) =>
            update({ action: "review-discard", examId, reviewId }),
        },
      );
    }
  }
  function roster() {
    const date = document.getElementById("teacher-call-date")?.value;
    const host = document.getElementById("teacher-roster");
    if (!host) return;
    host.innerHTML = students()
      .map((st) => {
        const old = data.attendance.find(
          (x) =>
            x.studentId === st.id && x.classId === classId && x.date === date,
        );
        return `<div class="life-row"><span>${st.photo ? `<img class="life-photo" src="${esc(st.photo)}" alt="" loading="lazy">` : ""}${esc(st.name)}</span><label><input type="radio" name="call_${esc(st.id)}" value="P" ${old?.status === "P" ? "checked" : ""} required> Presente</label><label><input type="radio" name="call_${esc(st.id)}" value="F" ${old?.status === "F" ? "checked" : ""}> Faltou</label></div>`;
      })
      .join("");
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(
      "[data-teacher-tab],#teacher-logout,#teacher-retry",
    );
    if (!b) return;
    if (b.id === "teacher-logout") {
      await sb.auth.signOut();
      login();
    } else if (b.id === "teacher-retry") await load();
    else {
      tab = b.dataset.teacherTab;
      render();
    }
  });
  document.addEventListener("change", (e) => {
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
    const b = form.querySelector("button");
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
      if (out) out.textContent = error.message;
    } finally {
      b.disabled = false;
    }
  });
  (async () => {
    if ((await sb.auth.getSession()).data?.session) await load();
    else login();
  })();
})();
