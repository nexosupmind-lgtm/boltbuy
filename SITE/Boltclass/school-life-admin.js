(() => {
  "use strict";
  const esc = (value) =>
    String(value ?? "").replace(
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
  const input = (name, label, type = "text", value = "", required = true) =>
    `<label class="field">${esc(label)}<input name="${name}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${esc(value)}" ${required ? "required" : ""} maxlength="200"></label>`;
  const options = (rows) =>
    rows
      .map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`)
      .join("");
  const select = (name, label, rows) =>
    `<label class="field">${esc(label)}<select name="${name}">${options(rows)}</select></label>`;
  const form = (action, body, title = "Salvar") =>
    `<form data-life-form="${action}">${body}<button class="btn" type="submit">${title}</button><p class="life-form-status" data-life-status role="status" aria-live="polite" tabindex="-1"></p></form>`;
  const card = (title, body) =>
    `<section class="card"><h2>${title}</h2>${body}</section>`;
  const blank = '<p class="muted">Nenhum registro neste momento.</p>';
  let ctx,
    pane = "alerts",
    result,
    generation = 0,
    permissionsUser = "";
  async function api(method, body) {
    const token = (await ctx.workspace.client.auth.getSession()).data?.session
      ?.access_token;
    const r = await fetch(
      "/api/school-life?slug=" + encodeURIComponent(ctx.school().slug),
      {
        method,
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Não foi possível concluir.");
    return d;
  }
  function rows(items, render) {
    return items.length ? items.map(render).join("") : blank;
  }
  function studentSelect(name = "studentId") {
    return select(
      name,
      "Aluno",
      ctx.school().students.map((x) => [x.id, x.name]),
    );
  }
  function childChecks(selected = []) {
    return (
      "<fieldset><legend>Alunos autorizados neste acesso</legend>" +
      ctx
        .school()
        .students.map(
          (st) =>
            `<label class="life-check"><input name="studentIds" type="checkbox" value="${esc(st.id)}" ${selected.includes(st.id) ? "checked" : ""}>${esc(st.name)}</label>`,
        )
        .join("") +
      "</fieldset>"
    );
  }
  function feedback(form, message, error = false) {
    const local = form?.querySelector("[data-life-status]");
    const target = local || document.getElementById("life-result");
    if (!target) return;
    target.textContent = message;
    target.setAttribute("role", error ? "alert" : "status");
    if (error) {
      target.focus?.({ preventScroll: true });
      target.scrollIntoView?.({ block: "nearest" });
    }
  }
  function credential(data) {
    document.getElementById("life-credential-dialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "life-credential-dialog";
    dialog.className = "life-credentials";
    dialog.setAttribute("aria-labelledby", "life-credential-title");
    const title = document.createElement("h2");
    title.id = "life-credential-title";
    title.textContent = "Acesso pronto para enviar";
    const description = document.createElement("p");
    description.textContent = "Copie os dados abaixo antes de fechar.";
    dialog.append(title, description);
    const link = new URL(data.login_url, location.origin).href;
    const values = [
      ["Link de acesso", link],
      ["Login", data.username || data.email],
      ["Senha", data.password || "Utilize a senha já definida no portal."],
    ];
    for (const [label, value] of values) {
      const field = document.createElement("label");
      field.className = "field";
      field.append(document.createTextNode(label));
      const input = document.createElement("input");
      input.readOnly = true;
      input.value = value;
      input.addEventListener("focus", () => input.select());
      field.append(input);
      dialog.append(field);
    }
    const message = values
      .map(([label, value]) => label + ": " + value)
      .join("\n");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const actions = document.createElement("div");
    actions.className = "life-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn";
    copy.textContent = "Copiar acesso";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(message);
        status.textContent = "Acesso copiado.";
      } catch {
        status.textContent = "Selecione e copie os campos acima.";
      }
    };
    actions.append(copy);
    if (data.phone) {
      const teacher = link.includes("/teacher"),
        a = document.createElement("a");
      a.className = "btn alt";
      a.target = "_blank";
      a.rel = "noopener";
      a.href =
        "https://wa.me/" +
        data.phone +
        "?text=" +
        encodeURIComponent(
          "Olá! A " +
            ctx.school().name +
            " preparou seu acesso " +
            (teacher ? "à área do professor." : "ao Portal da Família.") +
            "\n\n" +
            message,
        );
      a.textContent = "Enviar pelo WhatsApp";
      actions.append(a);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn alt";
    close.textContent = "Fechar";
    close.onclick = () => {
      if (dialog.close) dialog.close();
      else dialog.remove();
    };
    actions.append(close);
    dialog.append(actions, status);
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    if (dialog.showModal) dialog.showModal();
    else {
      dialog.setAttribute("open", "");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
    }
  }
  function teachingState(staffId) {
    const s = ctx.school(),
      teacher = (s.schoolLife?.teachers || []).find(
        (x) => x.staffId === staffId,
      );
    const assignments = (s.teacherAssignments || []).filter(
      (x) => x.teacherId === staffId,
    );
    const names = new Set(
      [
        ...(teacher?.subjects || []),
        ...assignments.flatMap((x) => x.subjects || []),
      ].map((x) => String(x).toLowerCase()),
    );
    return {
      classIds: (s.classes || [])
        .filter(
          (c) =>
            c.teacherId === staffId ||
            assignments.some((a) => a.classId === c.id),
        )
        .map((c) => c.id),
      subjectIds: (s.subjects || [])
        .filter(
          (x) =>
            x.teacherId === staffId || names.has(String(x.name).toLowerCase()),
        )
        .map((x) => x.id),
    };
  }
  function teachingChecks(selected) {
    const s = ctx.school();
    return [
      ["classIds", "Turmas", s.classes || [], selected.classIds, "classes"],
      [
        "subjectIds",
        "Disciplinas",
        s.subjects || [],
        selected.subjectIds,
        "subjects",
      ],
    ]
      .map(
        ([name, label, items, checked, page]) =>
          `<fieldset class="life-teaching-options"><legend>${label}</legend>${items.length ? `<button class="btn alt small" type="button" data-life-select-all="${name}">Marcar todas</button><div class="life-check-grid">${items.map((item) => `<label class="life-check"><input type="checkbox" name="${name}" value="${esc(item.id)}" ${checked.includes(item.id) ? "checked" : ""}>${esc(item.name)}</label>`).join("")}</div>` : `<p>Cadastre as ${label.toLowerCase()} da escola para selecionar aqui.</p><button class="btn alt" type="button" data-life-nav="${page}">Cadastrar ${label.toLowerCase()}</button>`}</fieldset>`,
      )
      .join("");
  }
  function applyTeaching(form, staffId) {
    const selected = teachingState(staffId);
    for (const name of ["classIds", "subjectIds"])
      for (const checkbox of form.querySelectorAll(
        'input[name="' + name + '"]',
      ))
        checkbox.checked = selected[name].includes(checkbox.value);
  }
  function content() {
    const s = ctx.school(),
      life = result.life || {},
      students = s.students || [],
      staff = s.staff || [];
    const studentName = (id) =>
      students.find((st) => st.id === id)?.name || "Aluno removido";
    if (pane === "alerts")
      return card(
        "Pendências para resolver",
        rows(
          result.alerts || [],
          (a) =>
            `<article class="life-row"><div><strong>${esc(a.name)}</strong><p>${esc(a.text)}</p></div><button class="btn alt" data-life-nav="${esc(a.page)}">Resolver</button></article>`,
        ),
      );
    if (pane === "team") {
      const accounts = life.teachers || [],
        available = staff.filter(
          (person) => !accounts.some((t) => t.staffId === person.id),
        );
      const first = available[0],
        selection = first
          ? teachingState(first.id)
          : { classIds: [], subjectIds: [] };
      const create = first
        ? form(
            "teacher-create",
            select(
              "staffId",
              "Professor",
              available.map((x) => [x.id, x.name]),
            ) +
              input(
                "email",
                "E-mail do professor",
                "email",
                first.email || "",
              ) +
              teachingChecks(selection) +
              '<p class="muted">A senha será gerada e mostrada ao criar o acesso. As turmas e disciplinas selecionadas já serão vinculadas.</p>',
            "Criar acesso e gerar senha",
          )
        : "<p>" +
          (!staff.length
            ? "Cadastre o profissional para criar o acesso."
            : "Os profissionais já têm acesso cadastrado. Use as opções abaixo para editar ou reativar.") +
          '</p><button class="btn alt" data-life-nav="staff">Abrir Equipe</button>';
      const choices = accounts.filter((t) =>
        staff.some((x) => x.id === t.staffId),
      );
      const account =
        choices.find((x) => x.userId === permissionsUser) || choices[0];
      if (account) permissionsUser = account.userId;
      const edit = account
        ? card(
            "Editar turmas e disciplinas",
            form(
              "teacher-permissions",
              '<label class="field">Professor<select name="userId">' +
                choices
                  .map(
                    (t) =>
                      `<option value="${esc(t.userId)}" ${t.userId === permissionsUser ? "selected" : ""}>${esc(staff.find((x) => x.id === t.staffId)?.name || t.email)}</option>`,
                  )
                  .join("") +
                "</select></label>" +
                teachingChecks(teachingState(account.staffId)),
              "Salvar turmas e disciplinas",
            ),
          )
        : "";
      return (
        card("Criar acesso do professor", create) +
        edit +
        card(
          "Acessos cadastrados",
          rows(accounts, (t) => {
            const assigned = teachingState(t.staffId),
              names = (s.classes || [])
                .filter((c) => assigned.classIds.includes(c.id))
                .map((c) => c.name);
            return `<article class="life-row"><div><strong>${esc(staff.find((x) => x.id === t.staffId)?.name || "Profissional")}</strong><p>${esc(t.email)} · ${t.active === false ? "Revogado" : "Ativo"}</p><p>Turmas: ${esc(names.join(", ") || "Nenhuma vinculada")}</p><p>Disciplinas: ${esc((t.subjects || []).join(", "))}</p><a href="/teacher.html?slug=${encodeURIComponent(s.slug)}" target="_blank" rel="noopener">Abrir login do professor</a></div>${t.active !== false ? `<button class="btn alt" data-life-reset="${esc(t.userId)}">Redefinir senha</button><button class="btn danger" data-life-revoke="teacher" data-user="${esc(t.userId)}">Revogar acesso</button>` : `<button class="btn" data-life-activate="${esc(t.userId)}">Reativar</button>`}</article>`;
          }),
        )
      );
    }
    if (pane === "routines")
      return (
        card(
          "Registrar rotina do aluno",
          form(
            "routine",
            studentSelect() +
              input(
                "date",
                "Data",
                "date",
                new Intl.DateTimeFormat("sv-SE", {
                  timeZone: "America/Sao_Paulo",
                }).format(new Date()),
              ) +
              input("food", "Alimentação", "text", "", false) +
              input("sleep", "Descanso", "text", "", false) +
              input("mood", "Como a criança esteve", "text", "", false) +
              '<label class="field">Atividades do dia<textarea name="activity" rows="3" maxlength="800"></textarea></label><label class="field">Observação para a família<textarea name="note" rows="3" maxlength="1200"></textarea></label>' +
              select("status", "Visibilidade", [
                ["published", "Publicar para a família"],
                ["draft", "Guardar rascunho"],
              ]),
          ),
        ) +
        card(
          "Últimas rotinas",
          rows(
            (life.routines || [])
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 30),
            (x) =>
              `<article class="life-row"><div><strong>${esc(studentName(x.studentId))} · ${esc(x.date)}</strong><p>${esc(x.activity || x.note || x.food)} · ${x.status === "published" ? "Publicada" : "Rascunho"}</p></div></article>`,
          ),
        )
      );
    if (pane === "notices")
      return (
        card(
          "Comunicado ou autorização",
          form(
            "notice",
            input("title", "Título") +
              '<label class="field">Mensagem<textarea name="content" required rows="4" maxlength="3000"></textarea></label>' +
              select("classId", "Público", [
                ["", "Toda a escola"],
                ...(s.classes || []).map((x) => [x.id, x.name]),
              ]) +
              '<label class="life-check"><input type="checkbox" name="requiresConsent"> Solicitar autorização expressa do responsável</label>',
            "Publicar",
          ),
        ) +
        card(
          "Confirmações das famílias",
          rows((s.messages || []).slice().reverse(), (m) => {
            const targeted = students.filter(
              (st) =>
                (!m.classId || st.classId === m.classId) &&
                (!m.studentId || st.id === m.studentId),
            );
            const receipts = (life.receipts || []).filter(
              (r) => r.messageId === m.id,
            );
            const pending = targeted.filter(
              (st) => !receipts.some((r) => r.studentId === st.id),
            );
            return `<details class="life-item"><summary>${esc(m.title)} · ${new Set(receipts.map((x) => x.studentId)).size}/${targeted.length} alunos com confirmação</summary><p>Pendentes: ${pending.map((x) => esc(x.name)).join(", ") || "Nenhum"}</p>${receipts.map((r) => `<p>${esc(studentName(r.studentId))}: ${r.consent === null ? "Leitura confirmada" : r.consent ? "Autorizado" : "Não autorizado"} · ${esc(r.at)}</p>`).join("")}</details>`;
          }),
        )
      );
    if (pane === "conversations")
      return card(
        "Atendimentos da escola",
        rows(
          (life.threads || []).slice().reverse(),
          (t) =>
            `<details class="life-item"><summary>${esc(studentName(t.studentId))} · ${esc(t.subject)} · ${esc(t.status === "open" ? "Aberto" : t.status === "resolved" ? "Resolvido" : "Em atendimento")}</summary><p>Destino: ${esc({ secretary: "Secretaria", coordination: "Coordenação", teacher: "Professor" }[t.department])}</p>${(t.messages || []).map((m) => `<article class="life-message"><strong>${esc(m.name)}</strong><small>${esc(m.at)}</small><p>${esc(m.body)}</p></article>`).join("")}${form("reply", `<input type="hidden" name="threadId" value="${esc(t.id)}"><label class="field">Resposta<textarea name="message" required maxlength="3000"></textarea></label><label class="life-check"><input type="checkbox" name="resolve"> Marcar como resolvido</label>`, "Enviar resposta")}</details>`,
        ),
      );
    if (pane === "families")
      return (
        card(
          "Vincular filhos a um acesso existente",
          form(
            "family-link",
            select(
              "userId",
              "Responsável",
              (result.accounts || []).map((x) => [
                x.userId,
                x.guardian + " · " + x.username,
              ]),
            ) + childChecks(),
            "Salvar vínculos",
          ),
        ) +
        card(
          "Adicionar outro responsável",
          form(
            "guardian-create",
            input("guardian", "Nome do responsável") +
              input("phone", "WhatsApp com DDD", "tel") +
              childChecks(),
            "Criar acesso individual",
          ),
        ) +
        card(
          "Revogar acesso",
          rows(
            result.accounts || [],
            (a) =>
              `<article class="life-row"><span>${esc(a.guardian)} · ${esc(a.username)}</span><button class="btn alt" data-life-share="${esc(a.userId)}">Enviar acesso</button><button class="btn danger" data-life-revoke="guardian" data-user="${esc(a.userId)}">Revogar</button></article>`,
          ),
        )
      );
    if (pane === "finance")
      return (
        card(
          "Pix da escola",
          form(
            "pix-settings",
            input("key", "Chave Pix", "text", life.pix?.key || "") +
              input(
                "receiver",
                "Nome do recebedor",
                "text",
                life.pix?.receiver || "",
              ) +
              input(
                "city",
                "Cidade do recebedor",
                "text",
                life.pix?.city || "",
              ),
          ),
        ) +
        card(
          "Pagamentos informados pelas famílias",
          "<p>A família informa a referência da transação. Confira no extrato antes de confirmar a baixa.</p>" +
            rows((life.payments || []).slice().reverse(), (p) => {
              const charge = (s.finance || []).find((c) => c.id === p.chargeId);
              return `<article class="life-row"><div><strong>${esc(studentName(p.studentId))} · ${Number(charge?.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong><p>${esc(p.reference)} · ${esc({ pending: "Aguardando conferência", confirmed: "Confirmado", rejected: "Não confirmado" }[p.status])}</p></div>${p.proofPath ? `<button class="btn alt" data-life-proof="${esc(p.id)}">Ver comprovante</button>` : ""}${p.status === "pending" ? `<button class="btn" data-life-payment="${esc(p.id)}" data-approve="1">Confirmar no extrato</button><button class="btn alt" data-life-payment="${esc(p.id)}" data-approve="0">Não confirmar</button>` : ""}</article>`;
            }),
        )
      );
    return (
      card(
        "Regras do boletim",
        form(
          "grading",
          input(
            "passMark",
            "Média de referência",
            "number",
            life.grading?.passMark ?? 6,
          ) +
            select("recoveryRule", "Regra da recuperação", [
              [
                life.grading?.recoveryRule === "average"
                  ? "average"
                  : "highest",
                life.grading?.recoveryRule === "average"
                  ? "Média entre nota e recuperação"
                  : "Maior nota entre média e recuperação",
              ],
              [
                life.grading?.recoveryRule === "average"
                  ? "highest"
                  : "average",
                life.grading?.recoveryRule === "average"
                  ? "Maior nota"
                  : "Média entre nota e recuperação",
              ],
            ]) +
            '<label class="life-check"><input type="checkbox" name="requireReview" ' +
            (s.teacherPublicationReview ? "checked" : "") +
            "> Coordenação revisa publicações de professores antes de liberar</label>",
        ),
      ) +
      card(
        "Publicações para revisar",
        rows(
          (s.teacherItems || []).filter((x) => x.status === "review"),
          (x) =>
            `<article class="life-row"><strong>${esc(x.title)}</strong><button class="btn" data-life-publish="${esc(x.id)}">Publicar atividade</button></article>`,
        ) +
          rows(
            [
              ...new Set(
                (s.grades || [])
                  .filter((x) => x.publishStatus === "draft" && x.teacherExamId)
                  .map((x) => x.teacherExamId),
              ),
            ],
            (id) =>
              `<article class="life-row"><strong>${esc((s.teacherItems || []).find((x) => x.id === id)?.title || "Avaliação")}</strong><button class="btn" data-life-grade="${esc(id)}">Publicar resultados</button></article>`,
          ),
      ) +
      card(
        "Notificações do Portal da Família",
        life.push
          ? "<p>Notificações ativadas para a escola. Cada responsável autoriza o recebimento no próprio celular.</p>"
          : '<p>Ative o serviço para permitir que as famílias recebam avisos de novas publicações.</p><button class="btn" data-life-push>Ativar notificações</button>',
      )
    );
  }
  async function render(context) {
    ctx = context;
    const own = ++generation;
    ctx.layout(
      "Central escolar",
      '<section class="card"><p role="status">Carregando a central da escola…</p></section>',
    );
    try {
      if (!(await ctx.workspace.flush()))
        throw Error("Aguarde o salvamento das alterações.");
      if (!ctx.workspace.bundle.data) await ctx.workspace.persist(ctx.db());
      result = await api("GET");
      if (own !== generation) return;
      ctx.layout(
        "Central escolar",
        `<div class="life-tabs">${[
          ["alerts", "Pendências"],
          ["team", "Equipe"],
          ["routines", "Rotina"],
          ["notices", "Avisos"],
          ["conversations", "Atendimentos"],
          ["families", "Famílias"],
          ["finance", "Financeiro"],
          ["settings", "Boletim e notificações"],
        ]
          .map(
            ([id, label]) =>
              `<button class="btn ${id === pane ? "" : "alt"}" data-life-pane="${id}">${label}</button>`,
          )
          .join("")}</div><p id="life-result" role="status"></p>${content()}`,
      );
    } catch (error) {
      const node = document.querySelector(".main");
      if (node) {
        const p = document.createElement("p");
        p.textContent = error.message;
        node.append(p);
      }
    }
  }
  async function mutate(body) {
    body.requestId ??= crypto.randomUUID();
    if (!(await ctx.workspace.flush()))
      throw Error("Há alterações pendentes. Aguarde.");
    const data = await api("POST", body);
    if (data.password || data.credentials) credential(data);
    try {
      const latest = await ctx.workspace.refresh();
      ctx.replace(latest.data);
      await render(ctx);
    } catch (error) {
      data.refreshWarning =
        "A alteração foi salva, mas a lista não atualizou. Recarregue a página para conferir.";
      const status = document.querySelector(
        "#life-credential-dialog [role=status]",
      );
      if (status) status.textContent = data.refreshWarning;
    }
    return data;
  }
  document.addEventListener(
    "click",
    async (e) => {
      const b = e.target.closest(
        "[data-life-pane],[data-life-nav],[data-life-revoke],[data-life-payment],[data-life-publish],[data-life-grade],[data-life-push],[data-life-share],[data-life-proof],[data-life-reset],[data-life-activate],[data-life-select-all]",
      );
      if (!b || !ctx) return;
      if (b.dataset.lifeSelectAll) {
        const fields = [
            ...b
              .closest("form")
              .querySelectorAll(
                'input[name="' + b.dataset.lifeSelectAll + '"]',
              ),
          ],
          checked = fields.some((x) => !x.checked);
        for (const field of fields) field.checked = checked;
        b.textContent = checked ? "Desmarcar todas" : "Marcar todas";
        return;
      }
      if (b.dataset.lifePane) {
        pane = b.dataset.lifePane;
        await render(ctx);
        return;
      }
      if (b.dataset.lifeNav) {
        ctx.navigate(b.dataset.lifeNav);
        return;
      }
      if (b.dataset.lifeRevoke && !confirm("Revogar este acesso?")) return;
      b.disabled = true;
      try {
        if (b.dataset.lifeProof) {
          const popup = window.open("about:blank", "_blank");
          if (popup) popup.opener = null;
          try {
            const d = await api("POST", {
              action: "payment-proof-url",
              paymentId: b.dataset.lifeProof,
            });
            if (popup) popup.location.href = d.url;
            else window.open(d.url, "_blank", "noopener");
          } catch (error) {
            if (popup) popup.close();
            throw error;
          }
          return;
        }
        let body;
        if (b.dataset.lifeReset) {
          if (!confirm("Gerar uma nova senha para este professor?")) return;
          body = { action: "teacher-reset", userId: b.dataset.lifeReset };
        }
        if (b.dataset.lifeActivate)
          body = { action: "teacher-activate", userId: b.dataset.lifeActivate };
        if (b.dataset.lifeShare)
          body = { action: "guardian-share", userId: b.dataset.lifeShare };
        if (b.dataset.lifeRevoke)
          body = {
            action:
              b.dataset.lifeRevoke === "teacher"
                ? "teacher-revoke"
                : "guardian-revoke",
            userId: b.dataset.user,
          };
        if (b.dataset.lifePayment) {
          if (
            b.dataset.approve === "1" &&
            !confirm("O pagamento foi conferido no extrato da escola?")
          )
            return;
          body = {
            action: "payment-review",
            paymentId: b.dataset.lifePayment,
            approve: b.dataset.approve === "1",
          };
        }
        if (b.dataset.lifePublish)
          body = { action: "publish-item", itemId: b.dataset.lifePublish };
        if (b.dataset.lifeGrade)
          body = { action: "publish-grades", examId: b.dataset.lifeGrade };
        if (b.hasAttribute("data-life-push")) body = { action: "push-enable" };
        if (body) {
          body.requestId = b.dataset.lifeRequestId ||= crypto.randomUUID();
          await mutate(body);
        }
      } catch (error) {
        const local = b.closest("article") || b.closest("form");
        let status = local?.querySelector("[data-life-status]");
        if (local && !status) {
          status = document.createElement("p");
          status.dataset.lifeStatus = "";
          local.append(status);
        }
        if (status) {
          status.textContent = error.message;
          status.setAttribute("role", "alert");
          status.scrollIntoView?.({ block: "nearest" });
        } else feedback(null, error.message, true);
      } finally {
        b.disabled = false;
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    async (e) => {
      const form = e.target;
      if (!form.dataset.lifeForm || !ctx) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const b = form.querySelector('button[type="submit"]'),
        fd = new FormData(form),
        body = Object.fromEntries(fd);
      body.action = form.dataset.lifeForm;
      body.requestId = form.dataset.lifeRequestId ||= crypto.randomUUID();
      if (["guardian-create", "family-link"].includes(body.action))
        body.studentIds = fd.getAll("studentIds");
      if (["teacher-create", "assign-teacher"].includes(body.action))
        body.subjects = String(body.subjects || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      if (["teacher-create", "teacher-permissions"].includes(body.action)) {
        body.classIds = fd.getAll("classIds");
        body.subjectIds = fd.getAll("subjectIds");
      }
      body.requiresConsent = fd.has("requiresConsent");
      body.resolve = fd.has("resolve");
      body.requireReview = fd.has("requireReview");
      const buttonText = b.textContent;
      b.disabled = true;
      b.textContent =
        body.action === "teacher-create" ? "Criando acesso…" : "Salvando…";
      feedback(form, "Aguarde a confirmação.");
      try {
        if (["teacher-create", "teacher-permissions"].includes(body.action)) {
          if (!body.classIds.length)
            throw Error("Marque pelo menos uma turma.");
          if (!body.subjectIds.length)
            throw Error("Marque pelo menos uma disciplina.");
        }
        let saved;
        if (body.action === "assign-teacher") {
          const next = structuredClone(ctx.db());
          const s = next.schools[0];
          s.teacherAssignments = (s.teacherAssignments || []).filter(
            (x) =>
              !(x.classId === body.classId && x.teacherId === body.teacherId),
          );
          if (body.mode === "remove") {
            const classroom = s.classes.find((x) => x.id === body.classId);
            if (classroom?.teacherId === body.teacherId)
              delete classroom.teacherId;
          } else {
            if (!body.subjects.length)
              throw Error("Informe as disciplinas do vínculo.");
            s.teacherAssignments.push({
              classId: body.classId,
              teacherId: body.teacherId,
              subjects: body.subjects,
            });
          }
          await ctx.workspace.persist(next);
          ctx.replace(next);
          await render(ctx);
        } else saved = await mutate(body);
        feedback(form, saved?.refreshWarning || "Alteração confirmada.");
      } catch (error) {
        feedback(form, error.message, true);
      } finally {
        b.disabled = false;
        b.textContent = buttonText;
      }
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      const form = e.target.closest("form");
      if (!form || !ctx) return;
      if (
        form.dataset.lifeForm === "teacher-create" &&
        e.target.name === "staffId"
      ) {
        const person = ctx.school().staff.find((x) => x.id === e.target.value);
        form.elements.namedItem("email").value = person?.email || "";
        applyTeaching(form, person?.id);
      }
      if (
        form.dataset.lifeForm === "teacher-permissions" &&
        e.target.name === "userId"
      ) {
        permissionsUser = e.target.value;
        const account = (ctx.school().schoolLife?.teachers || []).find(
          (x) => x.userId === permissionsUser,
        );
        applyTeaching(form, account?.staffId);
      }
    },
    true,
  );
  document.addEventListener(
    "invalid",
    (e) => {
      const form = e.target.closest("form[data-life-form]");
      if (form)
        feedback(
          form,
          e.target.validationMessage || "Confira os campos obrigatórios.",
          true,
        );
    },
    true,
  );
  async function dashboard(context) {
    const root = document.getElementById("life-dashboard-alerts");
    if (!root) return;
    try {
      const token = (await context.workspace.client.auth.getSession()).data
        ?.session?.access_token;
      const r = await fetch(
        "/api/school-life?slug=" +
          encodeURIComponent(context.school().slug) +
          "&view=alerts",
        { headers: { authorization: "Bearer " + token } },
      );
      const result = await r.json();
      if (!r.ok || !root.isConnected) return;
      root.innerHTML = result.alerts.length
        ? result.alerts
            .slice(0, 5)
            .map(
              (a) =>
                `<article class="life-row"><span><strong>${esc(a.name)}</strong> · ${esc(a.text)}</span><button class="btn alt" data-nav="${esc(a.page)}">Resolver</button></article>`,
            )
            .join("") +
          `<p>${result.alerts.length} pendência(s) na Central escolar.</p>`
        : "<p>Nenhuma pendência detectada nas verificações automáticas.</p>";
    } catch {
      if (root.isConnected)
        root.textContent =
          "Abra a Central escolar para consultar as pendências.";
    }
  }
  window.BOLT_LIFE_ADMIN = { render, dashboard };
})();
