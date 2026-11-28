/* Mobile navigation delegates to existing, permission-filtered admin controls. */
(() => {
  const source = document.getElementById('nav');
  if (!source || !document.body.classList.contains('buy-admin-app')) return;
  const icons = {
    dashboard: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
    pos: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18M8 15h3"/>',
    orders: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    products: '<path d="M4 7h16l1 14H3L4 7ZM8 8V6a4 4 0 0 1 8 0v2"/>',
    reports:'<path d="M4 20V4M4 20h17M8 15v-3M13 15V8M18 15V5"/>',
    platform:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h10M7 14h4"/>',
    'buy-combos':'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v8l9 5 9-5V8M12 13v8"/>',
    'buy-quotes':'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
    'buy-service':'<path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12h3v6H4zM17 12h3v6h-3zM17 18c0 2-2 3-5 3"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m12 2 2 3 4 1 1 4 3 2-3 2-1 4-4 1-2 3-2-3-4-1-1-4-3-2 3-2 1-4 4-1z"/>',
    coupons:'<path d="M3 7h18v4a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM12 7v11"/>',
    loyalty:'<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C4 8 5 1 9 4l3 4c8 0 7-7 3-4z"/>',
    customers:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-6"/>',
    stock:'<path d="M3 4h18v5H3zM5 9v12h14V9M9 13h6"/>',
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
  sheet.innerHTML = '<header><div><small>BOLTBUY / ADMIN</small><h2 id="buy-admin-menu-title">Seu espaço de gestão</h2><p>Escolha o que deseja gerenciar.</p></div><button type="button" aria-label="Fechar menu">×</button></header><div class="buy-admin-menu-items"></div>';
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
    const groups=[
      ['Operação diária',['dashboard','pos','orders','buy-quotes']],
      ['Catálogo e clientes',['products','buy-combos','customers','stock','coupons','loyalty']],
      ['Financeiro e gestão',['reports','platform','buy-service','settings']]
    ];
    const descriptions={dashboard:'Visão geral da loja',pos:'Registrar uma venda',orders:'Acompanhar pedidos',products:'Editar cardápio', 'buy-quotes':'Criar e editar propostas','buy-combos':'Ofertas e kits',reports:'Resultados da loja',platform:'Vendas externas','buy-service':'Horários e pagamentos',settings:'Preferências da loja',coupons:'Promoções e descontos',loyalty:'Programa de pontos',customers:'Cadastro e relacionamento',stock:'Controle de estoque'};
    const buttons=[...source.querySelectorAll('[data-page]')].filter(allowed);
    const used=new Set();
    function addGroup(label,ids){
      const selected=ids.map(id=>buttons.find(b=>b.dataset.page===id)).filter(Boolean);
      if(!selected.length)return;
      const section=document.createElement('section');section.className='buy-menu-group';
      const heading=document.createElement('h3');heading.textContent=label;section.append(heading);
      const grid=document.createElement('div');grid.className='buy-menu-grid';section.append(grid);
      for(const original of selected){
        const id=original.dataset.page;used.add(id);
        const button=document.createElement('button');button.type='button';button.className='buy-menu-tile';
        const icon=document.createElement('span');icon.className='buy-menu-icon';icon.innerHTML=svg(id);
        const copy=document.createElement('span');copy.className='buy-menu-copy';
        const title=document.createElement('strong');title.textContent=original.querySelector('.label')?.textContent||original.textContent;
        const desc=document.createElement('small');desc.textContent=descriptions[id]||'Abrir módulo';
        copy.append(title,desc);button.append(icon,copy);
        if(original.classList.contains('active')){button.classList.add('current');button.setAttribute('aria-current','page');}
        button.onclick=()=>go(id);grid.append(button);
      }
      target.append(section);
    }
    groups.forEach(([label,ids])=>addGroup(label,ids));
    addGroup('Outros recursos',buttons.map(b=>b.dataset.page).filter(id=>!used.has(id)));
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
