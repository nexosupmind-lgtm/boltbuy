/* Local contrast calculation: no requests, customer data, or image uploads. */
(function (scope) {
  'use strict';
  const DARK = [23, 37, 58], LIGHT = [248, 250, 252];
  function luminance(rgb) {
    return rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0);
  }
  function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function parse(value) {
    const m = String(value).match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  }
  function over(fg, bg) { const a = fg[3] ?? 1; return fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a)); }
  function choose(backgrounds) {
    const score = color => Math.min(...backgrounds.map(bg => ratio(color, bg)));
    const preferred = score(DARK) >= score(LIGHT) ? DARK : LIGHT;
    if (score(preferred) >= 4.5) return preferred;
    return score([0, 0, 0]) >= score([255, 255, 255]) ? [0, 0, 0] : [255, 255, 255];
  }
  const api = { luminance, ratio, parse, over, choose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!scope.document) return;
  const document = scope.document;
  function start() {
    if (!document.body.classList.contains('buy-admin-app')) return;
    const root = document.querySelector('.shell'); if (!root) return;
    const overrides = new Map(); let scheduled = false;
    const options = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] };
    const observer = new MutationObserver(records => { if (records.some(r => r.target === document.documentElement || r.target === document.body || root.contains(r.target))) schedule(); });
    function watch() { observer.observe(document.body, options); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] }); }
    function update() {
      scheduled = false; observer.disconnect();
      try {
        // Restore authored colors first so accents that already pass remain unchanged.
        for (const [el, original] of overrides) {
          if (el.style.getPropertyValue('color') === original.applied) {
            if (original.value) el.style.setProperty('color', original.value, original.priority); else el.style.removeProperty('color');
          }
        }
        overrides.clear();
        const styles = new Map(), backgrounds = new Map();
        const style = el => { if (!styles.has(el)) styles.set(el, getComputedStyle(el)); return styles.get(el); };
        function background(el) {
          if (!el) return [[255, 255, 255]];
          if (backgrounds.has(el)) return backgrounds.get(el);
          const s = style(el), solid = parse(s.backgroundColor) || [0, 0, 0, 0];
          let colors = solid[3] === 1 ? [solid.slice(0, 3)] : background(el.parentElement).map(bg => over(solid, bg));
          // Computed gradients resolve theme colors to RGB. Check every stop, not just the first.
          if (s.backgroundImage.includes('gradient(')) {
            const stops = [...s.backgroundImage.matchAll(/rgba?\([^)]*\)/g)].map(m => parse(m[0])).filter(Boolean);
            if (stops.length) colors = stops.flatMap(stop => colors.map(bg => over(stop, bg)));
          }
          backgrounds.set(el, colors); return colors;
        }
        const changes = [];
        for (const el of root.querySelectorAll('*')) {
          if (!el.getClientRects().length || el.closest('svg,script,style,[aria-hidden="true"]')) continue;
          const input = el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea');
          if (!input && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          const s = style(el), fg = parse(s.color); if (!fg) continue;
          const bg = background(el), current = Math.min(...bg.map(b => ratio(over(fg, b), b)));
          if (current >= 4.5) continue;
          const best = choose(bg); if (Math.min(...bg.map(b => ratio(best, b))) <= current) continue;
          changes.push({ el, value: el.style.getPropertyValue('color'), priority: el.style.getPropertyPriority('color'), applied: `rgb(${best.join(', ')})` });
        }
        for (const change of changes) { overrides.set(change.el, change); change.el.style.setProperty('color', change.applied, 'important'); }
      } finally { watch(); }
    }
    function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
    watch(); schedule();
    scope.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('load', schedule, true);
    root.addEventListener('transitionend', schedule);
    document.fonts?.ready.then(schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
