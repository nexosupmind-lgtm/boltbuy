(() => {
  "use strict";
  const root = document.getElementById("root");
  if (!root) return;
  const normalize = (value) =>
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  let sequence = 0;
  function enhance(table) {
    if (table.dataset.classList || table.closest("form, dialog, .modal"))
      return;
    const header = table.querySelector("tr");
    if (!header || !header.querySelector("th")) return;
    const headings = [...header.children].map((cell) =>
      cell.textContent.trim(),
    );
    const rows = [...table.querySelectorAll("tr")].filter(
      (row) => row !== header && !row.querySelector("th"),
    );
    const records = rows.filter((row) => !row.querySelector("[colspan]"));
    table.dataset.classList = "ready";
    table.classList.add("class-record-table");
    if (!records.length) {
      table.classList.add("class-record-empty");
      return;
    }
    const wrap = table.closest(".tablewrap") || table;
    const toolbar = document.createElement("div");
    toolbar.className = "class-list-tools";
    const summary = document.createElement("span");
    summary.className = "class-list-count";
    summary.setAttribute("role", "status");
    const existingSearch = table.classList.contains("student-table") ? document.getElementById("studentSearch") : null;
    const label = document.createElement("label");
    label.className = "class-list-search";
    const caption = document.createElement("span");
    caption.textContent = "Buscar nesta lista";
    const input = existingSearch || document.createElement("input");
    input.type = "search";
    input.placeholder = "Nome, turma, situação…";
    input.autocomplete = "off";
    if (!existingSearch) label.append(caption, input);
    toolbar.append(summary);
    if (!existingSearch) toolbar.append(label);
    wrap.before(toolbar);
    const empty = document.createElement("p");
    empty.className = "class-list-no-results";
    empty.textContent = "Nenhum resultado. Tente outro nome ou termo.";
    empty.hidden = true;
    wrap.after(empty);
    const indexed = records.map((row, index) => {
      row.dataset.recordIndex = index;
      [...row.children].forEach((cell, i) => {
        cell.dataset.label = headings[i] || "Informação";
        const key = normalize(headings[i] || "");
        if (key === "acoes" || key === "acao")
          cell.classList.add("class-record-actions");
        if (
          /^(situacao|status)$/.test(key) &&
          !cell.querySelector("input, select, button, a")
        ) {
          const text = cell.textContent.trim();
          const badge = document.createElement("span");
          badge.className = "class-status";
          const value = normalize(text);
          badge.dataset.tone =
            /^(ativo|ativa|pago|paga|concluido|concluida|presente|regular)$/.test(
              value,
            )
              ? "success"
              : /pendente|atras|inadimpl|inativo|suspens|cancel|revog/.test(
                    value,
                  )
                ? "attention"
                : "neutral";
          badge.textContent = text;
          cell.replaceChildren(badge);
        }
        if (
          i === 0 &&
          /^(aluno|nome|nome completo|professor|profissional|turma \/ serie|turma|titulo|evento|descricao)$/.test(
            key,
          )
        ) {
          cell.classList.add("class-record-title");
          if (
            !cell.querySelector(
              "img, .student-avatar, .avatar, input, button, a",
            )
          ) {
            const identity = document.createElement("div");
            identity.className = "class-record-identity";
            const icon = document.createElement("span");
            icon.className = "class-record-avatar";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent =
              cell.textContent
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word.charAt(0))
                .join("")
                .toUpperCase() || "•";
            const content = document.createElement("div");
            while (cell.firstChild) content.append(cell.firstChild);
            identity.append(icon, content);
            cell.append(identity);
          }
        }
      });
      return { row, text: normalize(row.textContent) };
    });
    const pageSize = 50;
    let page = 0;
    const previous = document.createElement("button"), next = document.createElement("button");
    previous.type = next.type = "button";
    previous.className = next.className = "btn alt small";
    previous.textContent = "← Anterior"; next.textContent = "Próxima →";
    previous.setAttribute("aria-label", "Página anterior da lista");
    next.setAttribute("aria-label", "Próxima página da lista");
    toolbar.append(previous, next);
    function filter(reset = true) {
      if (reset) page = 0;
      const terms = normalize(input.value).split(/\s+/).filter(Boolean);
      const matches = indexed.filter(item => terms.every(term => item.text.includes(term)));
      const count = matches.length;
      page = Math.min(page, Math.max(0, Math.ceil(count / pageSize) - 1));
      const visible = new Set(matches.slice(page * pageSize, (page + 1) * pageSize));
      indexed.forEach(item => { item.row.hidden = !visible.has(item); });
      summary.textContent = count > pageSize
        ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, count)} de ${count} registros`
        : `${count} ${count === 1 ? "registro" : "registros"}`;
      empty.hidden = count > 0;
      previous.hidden = next.hidden = count <= pageSize;
      previous.disabled = page === 0;
      next.disabled = (page + 1) * pageSize >= count;
    }
    previous.addEventListener("click", () => { page--; filter(false); });
    next.addEventListener("click", () => { page++; filter(false); });
    input.addEventListener("input", () => filter());
    filter();
    table.id ||= `class-list-${++sequence}`;
    input.setAttribute("aria-controls", table.id);
    // Sorting moves the original rows, preserving delegated edit/delete actions.
    [...header.children].forEach((cell, i) => {
      if (
        !cell.textContent.trim() ||
        /^(acoes|acao)$/.test(normalize(cell.textContent)) ||
        cell.querySelector("button, input")
      )
        return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "class-list-sort";
      const name = cell.textContent.trim();
      button.textContent = name;
      button.setAttribute("aria-label", `Ordenar por ${name}`);
      cell.replaceChildren(button);
      button.addEventListener("click", () => {
        const descending = cell.getAttribute("aria-sort") === "ascending";
        [...header.children].forEach((th) => th.removeAttribute("aria-sort"));
        cell.setAttribute("aria-sort", descending ? "descending" : "ascending");
        const sorted = [...records].sort((a, b) => {
          const left = a.children[i]?.textContent.trim() || "";
          const right = b.children[i]?.textContent.trim() || "";
          return (
            left.localeCompare(right, "pt-BR", {
              numeric: true,
              sensitivity: "base",
            }) * (descending ? -1 : 1)
          );
        });
        const order = new Map(sorted.map((row, index) => [row, index]));
        indexed.sort((a, b) => order.get(a.row) - order.get(b.row));
        const fragment = document.createDocumentFragment();
        sorted.forEach(row => fragment.append(row));
        const parent = header.parentNode.tagName === "THEAD" ? table.tBodies[0] : header.parentNode;
        parent.append(fragment);
        filter();
      });
    });
  }
  let scheduled = false;
  function scan() {
    scheduled = false;
    observer.disconnect();
    try {
      root.querySelectorAll(".main table:not([data-class-list])").forEach(enhance);
    } finally { observer.observe(root, { childList: true, subtree: true }); }
  }
  const observer = new MutationObserver(records => {
    if (!records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.("table") || node.querySelector?.("table"))))) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  });
  scan();
})();
