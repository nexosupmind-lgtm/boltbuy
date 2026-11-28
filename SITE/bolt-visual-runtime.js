/* Visual overrides contain presentation only. Application actions keep their own authorization. */
(() => {
  'use strict';
  if (window.BOLT_VISUAL_RUNTIME) return;
  window.BOLT_VISUAL_RUNTIME = true;
  const q = new URLSearchParams(location.search);
  const path = location.pathname.replace(/\.html$/, '');
  const surface = path.includes('/Salgaditos/') || path.includes('/delivery/') || ['/shop', '/admin'].includes(path)
    ? (/cliente|shop/.test(path) ? 'shop' : 'delivery-admin')
    : path.startsWith('/Boltbarber') ? ({ admin: 'barber-admin', login: 'barber-login' }[q.get('view')] || 'barber-site')
    : path.includes('/Boltclass/') ? 'class-admin'
    : path.includes('/Boltchurch/') ? 'church-admin'
    : path.endsWith('/family') ? 'family'
    : path.endsWith('/teacher') ? 'teacher'
    : path.endsWith('/member') ? 'member'
    : path.endsWith('/portal') ? 'login' : null;
  if (!surface) return;
  const product = surface === 'shop' || surface === 'delivery-admin' ? 'buy'
    : surface.startsWith('barber-') ? 'barber'
    : ['class-admin', 'family', 'teacher'].includes(surface) ? 'class'
    : ['church-admin', 'member'].includes(surface) ? 'church' : q.get('product');
  const slug = q.get('tenant') || q.get('slug') || (product === 'buy' ? 'salgaditos' : '');
  if (!slug) return;
  const embedded = window.parent !== window && q.get('studioVisual') === '1';
  let edit = false, rules = [], preview = false;
  const originals = new Map();
  const css = document.createElement('style');
  css.textContent = '[data-visual-hover]{outline:2px dashed #a78bfa!important;outline-offset:3px;cursor:crosshair!important}';
  document.head.append(css);
  const send = (type, data = {}) => {
    if (embedded) parent.postMessage({ type, product, slug, surface, ...data }, location.origin);
  };
  function selector(element) {
    const parts = [];
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id) && document.querySelectorAll('#' + current.id).length === 1) {
        parts.unshift('#' + current.id);
        return parts.join(' > ');
      }
      const tag = current.tagName.toLowerCase();
      const index = [...current.parentElement.children].filter(el => el.tagName === current.tagName).indexOf(current) + 1;
      parts.unshift(tag + ':nth-of-type(' + index + ')');
    }
    return 'body' + (parts.length ? ' > ' + parts.join(' > ') : '');
  }
  function reset() {
    for (const [element, record] of originals) {
      for (const [name, entry] of Object.entries(record.styles)) {
        if (entry.value) element.style.setProperty(name, entry.value, entry.priority);
        else element.style.removeProperty(name);
      }
      if (record.text !== undefined && element.textContent === record.appliedText) element.textContent = record.text;
    }
    originals.clear();
  }
  function viewKey() {
    return [...document.querySelectorAll('nav [aria-current="page"], nav .active, #sideNav .active, .sidebar .active, .sidebar .selected, .tabs .active, .member-tabs [aria-selected="true"], .bottomnav .active')]
      .filter(el => el.getClientRects().length).map(el => selector(el)).join('|').slice(0,300) + location.hash;
  }
  let appliedView = '';
  function apply() {
    const currentView = viewKey();
    if (currentView !== appliedView) { reset(); appliedView = currentView; }

    for (const rule of rules) {
      if (rule.view !== undefined && rule.view !== currentView) continue;
      let elements;
      try { elements = document.querySelectorAll(rule.selector); } catch { continue; }
      for (const element of elements) {
        if (/^(SCRIPT|STYLE|INPUT|TEXTAREA|SELECT|OPTION)$/.test(element.tagName)) continue;
        let record = originals.get(element);
        if (!record) { record = { styles: {} }; originals.set(element, record); }
        for (const [key, value] of Object.entries(rule.style || {})) {
          const property = key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
          if (!record.styles[property]) record.styles[property] = { value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
          if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value, 'important');
        }
        if (typeof rule.text === 'string' && !element.children.length && element.textContent === rule.original && element.textContent !== rule.text) {
          record.text = rule.original;
          record.appliedText = rule.text;
          element.textContent = rule.text;
        }
      }
    }
    for (const element of originals.keys()) if (!element.isConnected) originals.delete(element);
  }
  function navigation() {
    const elements = [...document.querySelectorAll('#sideNav button, nav a, nav button, .sidebar a, .sidebar button, .tabs button, .member-tabs button, .mobile-dock button, .bottomnav button')];
    return elements.filter(el => el.getClientRects().length && !/sair|logout|excluir/i.test(el.textContent)).slice(0,80).map(el => ({ selector: selector(el), label: el.textContent.trim().slice(0,80) }));
  }
  function clearHover() { document.querySelectorAll('[data-visual-hover]').forEach(el => el.removeAttribute('data-visual-hover')); }
  document.addEventListener('mouseover', event => {
    if (!edit || !(event.target instanceof HTMLElement)) return;
    clearHover();
    event.target.setAttribute('data-visual-hover', '');
  });
  document.addEventListener('click', event => {
    if (!edit) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const el = event.target;
    if (!(el instanceof HTMLElement) || /^(SCRIPT|STYLE|INPUT|TEXTAREA|SELECT|OPTION)$/.test(el.tagName)) return;
    const style = getComputedStyle(el);
    const record = originals.get(el);
    const editableText = !el.children.length && !el.closest('table, [data-id], [data-product-id], .product, .menu-card, [role=status], [role=alert]') && !/password|email|phone|total|price|amount|balance|count/i.test(el.id);
    send('bolt-visual-select', {
      view: viewKey(), selector: selector(el), tag: el.tagName.toLowerCase(), text: el.textContent,
      original: record?.text ?? el.textContent, editableText,
      style: Object.fromEntries(['color','backgroundColor','borderColor','borderRadius','fontSize','fontWeight','fontFamily','padding','gap','textAlign','maxWidth'].map(key=>[key,style[key]]))
    });
  }, true);
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== parent || event.data?.type !== 'bolt-visual-config' || event.data.product !== product || event.data.slug !== slug) return;
    preview = true;
    reset();
    rules = event.data.visual?.pages?.[surface] || [];
    edit = !!event.data.edit;
    clearHover(); apply();
    if (event.data.navigate) {
      try {
        const el = document.querySelector(event.data.navigate);
        if (el && navigation().some(item => item.selector === event.data.navigate)) {
          const previous = edit; edit = false; el.click(); edit = previous;
        }
      } catch {}
    }
    send('bolt-visual-pages', { pages: navigation() });
  });
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { apply(); send('bolt-visual-pages', { pages: navigation() }); }, 120);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-current'] });
  send('bolt-visual-ready');
  fetch('/api/studio-visual?product=' + product + '&slug=' + encodeURIComponent(slug))
    .then(response => response.ok ? response.json() : null)
    .then(data => { if (data && !preview) { rules = data.visual?.pages?.[surface] || []; apply(); } })
    .catch(() => {});
})();
