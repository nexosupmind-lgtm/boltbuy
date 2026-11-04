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
    const label = document.createElement("label");
    label.className = "class-list-search";
    const caption = document.createElement("span");
    caption.textContent = "Buscar nesta lista";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Nome, turma, situação…";
    input.autocomplete = "off";
    label.append(caption, input);
    toolbar.append(summary, label);
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
    function filter() {
      const terms = normalize(input.value).split(/\s+/).filter(Boolean);
      let count = 0;
      indexed.forEach((item) => {
        item.row.hidden = !terms.every((term) => item.text.includes(term));
        if (!item.row.hidden) count++;
      });
      summary.textContent =
        count === records.length
          ? `${count} ${count === 1 ? "registro" : "registros"}`
          : `${count} de ${records.length} registros`;
      empty.hidden = count > 0;
    }
    input.addEventListener("input", filter);
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
        sorted.forEach((row) => row.parentNode.append(row));
      });
    });
  }
  let scheduled = false;
  function scan() {
    scheduled = false;
    root
      .querySelectorAll(".main table:not([data-class-list])")
      .forEach(enhance);
  }
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }).observe(root, { childList: true, subtree: true });
  scan();
})();
