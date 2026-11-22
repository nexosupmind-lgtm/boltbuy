/* Mobile navigation delegates to existing, permission-filtered admin controls. */
(() => {
  const source = document.getElementById('nav');
  if (!source || !document.body.classList.contains('buy-admin-app')) return;
  const icons = {
    dashboard: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
    pos: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18M8 15h3"/>',
    orders: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    products: '<path d="M4 7h16l1 14H3L4 7ZM8 8V6a4 4 0 0 1 8 0v2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const svg = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id] || icons.menu}</svg>`;
  const nav = document.createElement('nav');
  nav.className = 'buy-admin-dock';
  nav.setAttribute('aria-label', 'Navegação administrativa');
  const main = [['dashboard','Início'],['pos','Vendas'],['orders','Pedidos'],['products','Produtos']];
  const sheet = document.createElement('dialog');
  sheet.className = 'buy-admin-menu';
  sheet.id = 'buy-admin-menu';
  sheet.setAttribute('aria-labelledby', 'buy-admin-menu-title');
  sheet.innerHTML = '<header><div><small>GESTÃO DA LOJA</small><h2 id="buy-admin-menu-title">Mais opções</h2></div><button type="button" aria-label="Fechar menu">×</button></header><div class="buy-admin-menu-items"></div>';
  document.body.append(nav, sheet);
  const allowed = button => button && !button.hidden && !button.disabled && button.style.display !== 'none';
  const get = id => [...source.querySelectorAll('[data-page]')].find(b => b.dataset.page === id);
  function go(id) {
    const original = get(id);
    if (!allowed(original) || document.documentElement.classList.contains('bolt-locked')) return;
    if (sheet.open) sheet.close();
    original.click();
  }
  for (const [id,label] of main) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.destination = id;
    button.innerHTML = svg(id) + `<span>${label}</span>`;
    button.onclick = () => go(id);
    nav.append(button);
  }
  const more = document.createElement('button');
  more.type = 'button'; more.innerHTML = svg('menu') + '<span>Menu</span>';
  more.setAttribute('aria-haspopup','dialog'); more.setAttribute('aria-controls',sheet.id);
  more.setAttribute('aria-expanded','false');
  more.onclick = () => {
    if (document.documentElement.classList.contains('bolt-locked')) return;
    rebuild(); sheet.showModal(); more.setAttribute('aria-expanded','true');
  };
  nav.append(more);
  sheet.querySelector('header button').onclick = () => sheet.close();
  sheet.addEventListener('click', event => { if (event.target === sheet) { const r=sheet.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) sheet.close(); } });
  sheet.addEventListener('close', () => { more.setAttribute('aria-expanded','false'); more.focus(); });
  function rebuild() {
    const target = sheet.querySelector('.buy-admin-menu-items'); target.replaceChildren();
    for (const original of source.querySelectorAll('[data-page]')) {
      if (!allowed(original)) continue;
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = original.querySelector('.label')?.textContent || original.textContent;
      button.onclick = () => go(original.dataset.page); target.append(button);
    }
  }
  function sync() {
    let primary = false;
    nav.querySelectorAll('[data-destination]').forEach(button => {
      const original = get(button.dataset.destination);
      button.hidden = !allowed(original);
      const active = !!original?.classList.contains('active'); primary ||= active;
      button.classList.toggle('active',active);
      if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    more.classList.toggle('active',!primary);
    // Menu actions recheck permissions at activation.
  }
  new MutationObserver(sync).observe(source,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','style','disabled']});
  const mobile = matchMedia('(max-width: 760px)');
  mobile.addEventListener('change', () => { if (!mobile.matches && sheet.open) sheet.close(); });
  new MutationObserver(() => { if(document.documentElement.classList.contains('bolt-locked') && sheet.open) sheet.close(); }).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  document.body.classList.add('buy-mobile-ready');
  sync();
})();
