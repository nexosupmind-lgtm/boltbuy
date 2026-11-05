/* Shared, lightweight school interactions. No data or authentication changes. */
(() => {
  const root =
    document.getElementById("teacher-root") ||
    document.getElementById("family-root") ||
    document.getElementById("root");
  if (!root) return;
  const surface =
    root.id === "teacher-root"
      ? "teacher"
      : root.id === "family-root"
        ? "family"
        : "admin";
  document.body.dataset.schoolSurface = surface;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const seen = new WeakSet();
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    attendance:
      '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7 12 3 3 7-7"/>',
    grades: '<path d="M4 21h16M7 17v-5m5 5V4m5 13V8"/>',
    students:
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
    staff: '<path d="m2 8 10-5 10 5-10 5zM6 10v6c4 3 8 3 12 0v-6m4-2v8"/>',
    classes:
      '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
    finance:
      '<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    reports: '<path d="M4 21h16M7 17v-5m5 5V4m5 13V8"/>',
    enrollments:
      '<rect x="5" y="4" width="14" height="18" rx="3"/><path d="M9 2h6v4H9zM8 14l3 3 5-6"/>',
    messages:
      '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10m-10 4h6"/>',
  };
  function scan() {
    const color = getComputedStyle(document.body)
      .getPropertyValue("--experience-primary")
      .trim();
    if (/^#[a-f\d]{6}$/i.test(color)) {
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      document.body.style.setProperty(
        "--experience-on",
        r * 0.2126 + g * 0.7152 + b * 0.0722 > 0.179 ? "#17213a" : "#fff",
      );
    }
    root.querySelectorAll('[data-key-grid]').forEach(grid=>{
      grid.classList.add('visual-answer-sheet');
      grid.querySelectorAll('[data-key-q]').forEach(select=>{
        if(seen.has(select))return;seen.add(select);
        const row=select.closest('label');row.classList.add('visual-answer-row');
        const choices=document.createElement('span');choices.className='visual-answer-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','Questão '+select.dataset.keyQ);
        for(const letter of 'ABCDE'){
          const button=document.createElement('button');button.type='button';button.textContent=letter;button.setAttribute('aria-label','Questão '+select.dataset.keyQ+', alternativa '+letter);
          const sync=()=>button.setAttribute('aria-pressed',String(select.value===letter));sync();select.addEventListener('change',sync);
          button.addEventListener('click',()=>{select.value=letter;select.dispatchEvent(new Event('change',{bubbles:true}));});choices.append(button);
        }
        select.classList.add('visual-answer-native');row.append(choices);
      });
    });
    let index = 0;
    root
      .querySelectorAll(
        ".main > section,.main > .card,.main > .student,.main > .overview,.teacher-home > section,.teacher-workspace,.teacher-class-card,.school-mobile-sheet > section,.life-row,.teacher-activity",
      )
      .forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        el.classList.add("school-enter");
        el.style.setProperty(
          "--school-delay",
          `${Math.min(index++, 5) * 35}ms`,
        );
      });
    if (surface === "admin")
      root
        .querySelectorAll(".school-shortcuts [data-nav]")
        .forEach((button) => {
          if (seen.has(button)) return;
          seen.add(button);
          const span = button.querySelector("span"),
            name = button.dataset.nav;
          if (span && paths[name]) {
            span.classList.add("school-tile-icon");
            span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
          }
        });
    if (surface === "family") {
      root
        .querySelectorAll(".nav > button[data-family-tab]")
        .forEach((button) => {
          if (seen.has(button)) return;
          seen.add(button);
          const name = button.dataset.familyTab,
            span = button.querySelector("span");
          if (span && paths[name] && !button.querySelector("svg"))
            span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
          if (button.classList.contains("active"))
            button.setAttribute("aria-current", "page");
        });
      const value = root.querySelector(".metrics .metric:first-child strong");
      if (
        value &&
        !seen.has(value) &&
        /^\d+%$/.test(value.textContent.trim())
      ) {
        seen.add(value);
        const amount = Math.min(100, Number.parseInt(value.textContent, 10));
        const icon = value.closest(".metric")?.querySelector(".metric-icon");
        if (icon)
          icon.innerHTML = `<svg class="school-frequency-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="#dce9e2" stroke-width="3"/><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="${amount} 100" transform="rotate(-90 20 20)"/><path d="m13 20 5 5 9-10" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
      }
    }
  }
  let scheduled = false;
  const observer = new MutationObserver(records => {
    if (!records.some(record => [...record.addedNodes].some(node => node.nodeType === 1))) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      observer.disconnect();
      try { scan(); } finally { observer.observe(root, { childList: true, subtree: true }); }
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener(
    "pointerup",
    (event) => {
      if (reduce.matches) return;
      const button = event.target.closest("button,summary");
      if (
        !button ||
        !root.contains(button) ||
        button.disabled ||
        !button.animate
      )
        return;
      button.animate([{ scale: "1" }, { scale: ".96" }, { scale: "1" }], {
        duration: 220,
        easing: "ease-out",
      });
      const icon = button.querySelector("svg,.metric-icon");
      icon?.animate?.(
        [
          { transform: "rotate(-7deg) scale(.9)" },
          { transform: "rotate(3deg) scale(1.08)" },
          { transform: "rotate(0) scale(1)" },
        ],
        { duration: 360, easing: "ease-out" },
      );
    },
    { passive: true },
  );
  const visibility = () =>
    document.body.classList.toggle("school-motion-paused", document.hidden);
  document.addEventListener("visibilitychange", visibility);
  visibility();
  scan();
})();
