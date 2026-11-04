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
  const list = (value) => (Array.isArray(value) ? value : []);
  let current,
    period = "";
  function set(context) {
    current = context;
  }
  async function api(body, proof) {
    let payload,
      headers = { authorization: "Bearer " + (await current.token()) };
    const fields = {
      ...body,
      requestId: body.requestId || crypto.randomUUID(),
    };
    if (proof) {
      payload = new FormData();
      for (const [k, v] of Object.entries(fields)) payload.append(k, String(v));
      payload.append("proof", proof, proof.name || "comprovante");
    } else {
      payload = JSON.stringify(fields);
      headers["content-type"] = "application/json";
    }

    const r = await fetch(
      "/api/school-life?slug=" + encodeURIComponent(current.slug),
      { method: "POST", headers, body: payload },
    );
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Não foi possível salvar.");
    return d;
  }
  function receipt(m, studentId, preview) {
    if (!m.id) return "";
    if (preview)
      return "<small>Na conta do responsável, este aviso permite confirmar o recebimento.</small>";
    if (m.receipt)
      return (
        '<p class="life-confirmed">' +
        (m.receipt.consent === null
          ? "✓ Leitura confirmada"
          : m.receipt.consent
            ? "✓ Autorizado pelo responsável"
            : "Não autorizado pelo responsável") +
        "</p>"
      );
    if (m.requiresConsent)
      return `<div class="life-actions"><button class="btn" data-parent-consent="yes" data-message="${esc(m.id)}" data-student="${esc(studentId)}">Autorizo</button><button class="btn alt" data-parent-consent="no" data-message="${esc(m.id)}" data-student="${esc(studentId)}">Não autorizo</button></div>`;
    return `<button class="btn" data-parent-read="${esc(m.id)}" data-student="${esc(studentId)}">Li e estou ciente</button>`;
  }
  function panel(tab, data, preview) {
    const student = data.student,
      empty = '<p class="muted">Nenhum registro publicado neste momento.</p>';
    if (tab === "messages")
      return `<section class="card"><h2>Avisos e autorizações</h2>${
        list(data.messages)
          .slice()
          .reverse()
          .map(
            (m) =>
              `<article class="entry"><h3>${esc(m.title)}</h3><small>${esc(m.date)}</small><p>${esc(m.content)}</p>${receipt(m, student.id, preview)}</article>`,
          )
          .join("") || empty
      }</section>`;
    if (tab === "grades") {
      const summaries = list(data.gradeSummary),
        periods = [...new Set(summaries.map((x) => x.period))];
      if (period && !periods.includes(period)) period = "";
      return `<section class="card"><h2>Boletim escolar</h2><p class="muted">Médias por disciplina, com pesos e recuperação conforme as regras da escola.</p><label class="field">Período<select id="family-grade-period"><option value="">Todos os períodos</option>${periods.map((p) => `<option ${period === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>${
        summaries
          .filter((x) => !period || x.period === period)
          .map(
            (x) =>
              `<article class="entry"><h3>${esc(x.subject)}</h3><small>${esc(x.period)} · Referência: ${x.passMark}</small><div class="life-grade-line"><span>Média <strong>${x.average ?? "—"}</strong></span><span>Recuperação <strong>${x.recovery ?? "—"}</strong></span><span>Resultado <strong>${x.final ?? "—"}</strong></span></div><p>${esc(x.status)}</p></article>`,
          )
          .join("") || empty
      }</section>`;
    }
    if (tab === "routines")
      return `<section class="card"><h2>O dia de ${esc(student.name.split(" ")[0])}</h2>${
        list(data.routines)
          .map(
            (r) =>
              `<article class="entry"><h3>${esc(r.date)}</h3>${[
                ["food", "Alimentação"],
                ["sleep", "Descanso"],
                ["mood", "Como esteve"],
                ["activity", "Atividades"],
                ["note", "Observações"],
              ]
                .filter(([id]) => r[id])
                .map(
                  ([id, label]) =>
                    `<p><strong>${label}</strong><br>${esc(r[id])}</p>`,
                )
                .join("")}</article>`,
          )
          .join("") || empty
      }</section>`;
    if (tab === "conversations")
      return `<section class="card"><h2>Falar com a escola</h2>${
        preview
          ? "<p>Mensagens ficam disponíveis no acesso individual da família.</p>"
          : `<form data-parent-form="thread"><label class="field">Assunto<input name="subject" required maxlength="160"></label><label class="field">Para quem<select name="department" id="family-department"><option value="secretary">Secretaria</option><option value="coordination">Coordenação</option>${list(data.teachers).length ? '<option value="teacher">Professor</option>' : ""}</select></label><label class="field" id="family-teacher-field" hidden>Professor<select name="staffId">${list(
              data.teachers,
            )
              .map(
                (x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`,
              )
              .join(
                "",
              )}</select></label><label class="field">Mensagem<textarea name="message" required maxlength="3000" rows="4"></textarea></label><button class="btn">Enviar para a escola</button></form>`
      }</section><section class="card"><h2>Seus atendimentos</h2>${
        list(data.conversations)
          .slice()
          .reverse()
          .map(
            (t) =>
              `<details class="life-item"><summary>${esc(t.subject)} · ${esc({ open: "Aberto", in_progress: "Em atendimento", resolved: "Resolvido" }[t.status])}</summary>${t.messages.map((m) => `<article class="life-message"><strong>${esc(m.name)}</strong><small>${esc(m.at)}</small><p>${esc(m.body)}</p></article>`).join("")}${preview ? "" : `<form data-parent-form="reply"><input name="threadId" type="hidden" value="${esc(t.id)}"><label class="field">Nova mensagem<textarea name="message" required maxlength="3000"></textarea></label><button class="btn">Enviar</button></form>`}</details>`,
          )
          .join("") || empty
      }</section>`;
    if (tab === "finance")
      return `<section class="card"><h2>Mensalidades de ${esc(student.name.split(" ")[0])}</h2>${
        list(data.finance)
          .map(
            (c) =>
              `<article class="entry"><h3>${esc(c.description || "Mensalidade")}</h3><strong>${Number(c.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong><p>Vencimento: ${esc(c.due || "Não informado")} · ${esc(c.status || "Pendente")}</p>${c.confirmation ? `<p>${esc({ pending: "Pagamento informado. Aguardando conferência da escola.", confirmed: "Pagamento confirmado pela escola.", rejected: "A escola não confirmou. Entre em contato para conferir." }[c.confirmation.status])}</p>` : ""}${c.pix ? `<details><summary>Pix e pagamento</summary><textarea readonly class="life-pix" aria-label="Pix copia e cola">${esc(c.pix)}</textarea><button class="btn" data-parent-copy="${esc(c.id)}">Copiar Pix</button>${preview || c.confirmation?.status === "pending" ? "" : `<form data-parent-form="payment-submit"><input name="chargeId" type="hidden" value="${esc(c.id)}"><label class="field">Identificador da transação no banco<input name="reference" required maxlength="200"></label><label class="field">Comprovante (opcional, imagem ou PDF até 2 MB)<input name="proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label><p class="muted">Informe depois de pagar. A escola fará a conferência no extrato.</p><button class="btn">Informar pagamento</button></form>`}</details>` : ""}</article>`,
          )
          .join("") || empty
      }</section>`;
    if (tab === "notifications")
      return `<section class="card"><h2>Novidades</h2>${preview ? "" : `<p>Receba avisos de novas publicações no celular.</p><button class="btn" data-parent-push ${data.pushPublicKey ? "" : "disabled"}>Ativar notificações neste aparelho</button>${data.pushPublicKey ? "" : '<p class="muted">A escola ainda precisa ativar o envio de notificações.</p>'}<button class="btn alt" data-parent-push-off>Desativar neste aparelho</button>`}${
        list(data.notifications)
          .map(
            (n) =>
              `<article class="entry"><h3>${esc(n.title)}</h3><small>${esc(n.at)}</small><button class="btn alt" data-family-tab="${esc(n.tab)}">Ver atualização</button></article>`,
          )
          .join("") || empty
      }</section>`;
    return null;
  }
  async function schoolPushRegistration(create = false) {
    const scope = "/family-push/" + current.slug + "/";
    let registration = await navigator.serviceWorker.getRegistration(scope);
    if (registration?.scope !== new URL(scope, location.origin).href)
      registration = null;
    if (!registration && create)
      registration = await navigator.serviceWorker.register("/sw.js", {
        scope,
      });
    if (registration && !registration.active) {
      const worker = registration.installing || registration.waiting;
      if (worker)
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                Error(
                  "Aguarde o aplicativo preparar as notificações e tente novamente.",
                ),
              ),
            15000,
          );
          const check = () => {
            if (worker.state === "activated") {
              clearTimeout(timer);
              resolve();
            }
            if (worker.state === "redundant") {
              clearTimeout(timer);
              reject(
                Error("Atualize o aplicativo para ativar as notificações."),
              );
            }
          };
          worker.addEventListener("statechange", check);
          check();
        });
    }
    return registration;
  }
  async function unsubscribe() {
    if (!("serviceWorker" in navigator)) return;
    const registration = await schoolPushRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await api({ action: "push-remove", endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
  }
  async function enablePush() {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    )
      throw Error(
        "No iPhone, adicione o portal à Tela de Início pelo Safari e abra pelo ícone para ativar as notificações.",
      );
    if ((await Notification.requestPermission()) !== "granted")
      throw Error(
        "Autorize as notificações nas configurações do aparelho para continuar.",
      );
    const registration = await schoolPushRegistration(true);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const raw = current.data.pushPublicKey
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const key = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    }
    await api({
      action: "push-subscribe",
      subscription: subscription.toJSON(),
    });
  }
  document.addEventListener("change", (e) => {
    if (e.target.id === "family-grade-period" && current) {
      period = e.target.value;
      current.render();
    }
    if (e.target.id === "family-department")
      document.getElementById("family-teacher-field").hidden =
        e.target.value !== "teacher";
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(
      "[data-parent-read],[data-parent-consent],[data-parent-copy],[data-parent-push],[data-parent-push-off]",
    );
    if (!b || !current || current.preview) return;
    b.disabled = true;
    try {
      if (b.hasAttribute("data-parent-copy")) {
        const charge = current.data.finance.find(
          (x) => x.id === b.dataset.parentCopy,
        );
        await navigator.clipboard.writeText(charge.pix);
        document.getElementById("family-status").textContent =
          "Pix copiado. Confira o recebedor no aplicativo do banco.";
        return;
      }
      if (b.hasAttribute("data-parent-push")) {
        await enablePush();
        document.getElementById("family-status").textContent =
          "Notificações ativadas neste aparelho.";
        return;
      }
      if (b.hasAttribute("data-parent-push-off")) {
        await unsubscribe();
        document.getElementById("family-status").textContent =
          "Notificações desativadas neste aparelho.";
        return;
      }
      const consent = b.dataset.parentConsent;
      if (
        consent &&
        !confirm(
          consent === "yes"
            ? "Confirmar a autorização?"
            : "Confirmar que não autoriza?",
        )
      )
        return;
      await api({
        action: "receipt",
        studentId: b.dataset.student,
        messageId: b.dataset.parentRead || b.dataset.message,
        ...(consent ? { consent: consent === "yes" } : {}),
      });
      await current.reload();
    } catch (error) {
      document.getElementById("family-status").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  });
  document.addEventListener(
    "submit",
    async (e) => {
      const form = e.target;
      if (!form.dataset.parentForm || !current || current.preview) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const b = form.querySelector("button");
      b.disabled = true;
      try {
        const fd = new FormData(form);
        let proof = fd.get("proof");
        fd.delete("proof");
        if (proof?.size && proof.type.startsWith("image/"))
          proof = await window.BOLT_UPLOAD.image(proof, {
            maxEdge: 1600,
            maxBytes: 1800000,
          });
        if (proof?.size > 2 * 1024 * 1024)
          throw Error("Use um comprovante de até 2 MB.");
        await api(
          {
            ...Object.fromEntries(fd),
            action: form.dataset.parentForm,
            studentId: current.data.student.id,
            requestId: (form.dataset.parentRequestId ||= crypto.randomUUID()),
          },
          proof?.size ? proof : null,
        );
        await current.reload();
        document.getElementById("family-status").textContent =
          "Enviado para a escola.";
      } catch (error) {
        document.getElementById("family-status").textContent = error.message;
      } finally {
        b.disabled = false;
      }
    },
    true,
  );
  function home(data) {
    const latest = list(data.routines)[0],
      pending = list(data.messages).filter((m) => m.id && !m.receipt).length;
    return `<section class="card"><h2>Mais perto do dia a dia</h2>${latest ? `<article class="entry"><h3>Última rotina publicada</h3><small>${esc(latest.date)}</small><p>${esc(latest.activity || latest.note || latest.food || "Veja os registros da escola.")}</p><button class="btn alt" data-family-tab="routines">Ver rotina do dia</button></article>` : '<p class="muted">As rotinas publicadas pela escola aparecerão aqui.</p>'}${pending ? `<p>${pending} aviso(s) aguardando sua confirmação.</p><button class="btn" data-family-tab="messages">Conferir avisos</button>` : ""}<div class="life-actions"><button class="btn alt" data-family-tab="conversations">Falar com a escola</button><button class="btn alt" data-family-tab="activities">Tarefas e provas</button></div></section>`;
  }
  window.BOLT_FAMILY_LIFE = { set, panel, home, unsubscribe };
})();
