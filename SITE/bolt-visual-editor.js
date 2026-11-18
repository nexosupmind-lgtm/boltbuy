(() => {
  'use strict';
  const routes = {
    buy: [['Shop','shop','/Salgaditos/cliente.html'],['Admin','delivery-admin','/Salgaditos/admin.html']],
    class: [['Login','login','/portal.html'],['Admin da escola','class-admin','/Boltclass/index.html'],['Professor','teacher','/teacher.html'],['Portal da família','family','/family.html']],
    church: [['Login','login','/portal.html'],['Admin da igreja','church-admin','/Boltchurch/index.html'],['Portal do membro','member','/member.html']]
  };
  const properties = [['color','Texto'],['backgroundColor','Fundo'],['borderColor','Borda'],['borderRadius','Arredondamento'],['fontSize','Tamanho da fonte'],['fontWeight','Peso da fonte'],['padding','Espaçamento interno'],['gap','Distância entre itens'],['maxWidth','Largura máxima']];
  const copy = value => structuredClone(value);
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  async function open(context) {
    if (document.getElementById('bolt-visual-dialog')) return;
    const modal = document.createElement('dialog');
    modal.id = 'bolt-visual-dialog';
    modal.setAttribute('aria-label', 'Editor visual do cliente');
    for (const [key,value] of Object.entries({
      position:'fixed',inset:'0',width:'100vw',height:'100dvh',
      maxWidth:'none',maxHeight:'none',margin:'0',padding:'0',border:'0',
      overflow:'hidden',background:'transparent',display:'none'
    })) modal.style.setProperty(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value,'important');
    const shadow = modal.attachShadow({mode:'open'});
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/bolt-visual-editor.css?v=isolated2';
    const stylesReady = new Promise((resolve,reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = () => reject(Error('Não foi possível carregar o editor. Atualize a página e tente novamente.'));
    });
    const dialog = document.createElement('div');
    dialog.id = 'bolt-visual-editor';
    dialog.setAttribute('open','');
    shadow.append(stylesheet,dialog);
    dialog.innerHTML = `<header><div><small>BOLT STUDIO</small><h2></h2></div><div class="visual-actions"><button data-action="undo" disabled>Desfazer</button><button data-action="redo" disabled>Refazer</button><button data-action="reload">Recarregar configurações</button><button data-action="save" class="visual-primary" disabled>Publicar alterações</button><button data-action="close" aria-label="Fechar editor">×</button></div></header><div class="visual-workspace"><aside class="visual-pages"><h3>Ambientes</h3><select aria-label="Ambiente" id="visual-surface"></select><h3>Páginas e seções</h3><div id="visual-pages-list"></div><p class="visual-hint">Os menus do ambiente aberto aparecem aqui. Páginas protegidas exigem o acesso correspondente do cliente.</p><a id="visual-open" target="_blank" rel="noopener">Abrir em outra aba ↗</a></aside><main><div class="visual-toolbar"><button data-action="inspect" aria-pressed="false">Selecionar elemento</button><span>Navegar</span><select id="visual-device" aria-label="Tamanho da prévia"><option value="390">Celular · 390 px</option><option value="768">Tablet · 768 px</option><option value="1280" selected>Desktop · 1280 px</option></select></div><div class="visual-canvas"><iframe title="Prévia editável do cliente" id="visual-frame"></iframe></div></main><aside class="visual-properties"><h3>Propriedades</h3><p id="visual-selection">Ative “Selecionar elemento” e clique na prévia.</p><fieldset id="visual-fields" disabled><label>Texto<textarea id="visual-text" rows="4" maxlength="2000"></textarea></label><small id="visual-text-hint"></small><div class="visual-property-grid">${properties.map(([key,label])=>`<label>${label}<input data-style="${key}" placeholder="${/color/i.test(key)?'#ffffff':'Ex.: 16px'}"></label>`).join('')}</div><label>Alinhamento<select data-style="textAlign"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label><label>Fonte<select data-style="fontFamily"><option value="inherit">Fonte do sistema</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="system-ui, sans-serif">Sistema</option><option value="monospace">Monoespaçada</option></select></label><button data-action="reset" type="button">Restaurar elemento</button></fieldset><p class="visual-hint">A edição de texto fica disponível para títulos e rótulos. Produtos, valores e cadastros são editados nos módulos do cliente.</p></aside></div><footer><span id="visual-status" role="status">Carregando configurações…</span><span id="visual-count"></span></footer>`;
    document.body.append(modal);
    dialog.querySelector('h2').textContent = context.name || context.slug;
    const el = id => dialog.querySelector('#' + id);
    const action = name => dialog.querySelector('[data-action=' + name + ']');
    const frame = el('visual-frame');
    const endpoint = '/api/studio-visual?product=' + context.product + '&slug=' + encodeURIComponent(context.slug);
    let visual = {version:1,pages:{}}, saved = copy(visual), revision = null, history = [], future = [], selected = null, edit = false, ready = false, busy = false;
    let surface = routes[context.product][0][1];
    const status = text => el('visual-status').textContent = text;
    function buttons() {
      action('undo').disabled = busy || !history.length;
      action('redo').disabled = busy || !future.length;
      action('save').disabled = busy || !ready || same(visual,saved);
      el('visual-count').textContent = Object.values(visual.pages).reduce((sum,items)=>sum+items.length,0) + ' elementos personalizados';
    }
    function send(navigate) {
      frame.contentWindow?.postMessage({type:'bolt-visual-config',product:context.product,slug:context.slug,visual,edit,navigate},location.origin);
    }
    function change(next) {
      if (same(next,visual)) return;
      history.push(copy(visual));
      if(history.length>80) history.shift();
      future=[];visual=next;
      send();buttons();status('Alterações em prévia. Publique para aplicar aos clientes.');
    }
    function clearSelection() {
      selected=null;el('visual-fields').disabled=true;
      el('visual-selection').textContent='Selecione um elemento da página aberta.';
    }
    function select(data) {
      selected=data;surface=data.surface;
      el('visual-fields').disabled=!ready||busy;
      el('visual-selection').textContent=data.tag+' · '+data.selector;
      el('visual-text').value=data.text;
      el('visual-text').disabled=!data.editableText;
      el('visual-text-hint').textContent=data.editableText?'':'Selecione um título ou rótulo simples para alterar o texto.';
      dialog.querySelectorAll('[data-style]').forEach(input=>input.value=data.style[input.dataset.style]||'');
    }
    function loadPage(route) {
      clearSelection();
      surface=route[1];
      const url=new URL(route[2],location.origin);
      url.searchParams.set(context.product==='buy'?'tenant':'slug',context.slug);
      url.searchParams.set('product',context.product);
      el('visual-open').href=url.href;
      url.searchParams.set('studioVisual','1');
      if(route[1]==='family')url.searchParams.set('preview','1');
      frame.src=url.href;
      el('visual-pages-list').replaceChildren();
      status('Abrindo '+route[0]+'…');
    }
    routes[context.product].forEach((route,index)=>{
      const option=new Option(route[0],String(index));el('visual-surface').append(option);
    });
    el('visual-surface').onchange=()=>loadPage(routes[context.product][Number(el('visual-surface').value)]);
    el('visual-device').onchange=()=>{frame.style.width=el('visual-device').value+'px'};
    el('visual-device').onchange();
    action('inspect').onclick=()=>{
      edit=!edit;action('inspect').setAttribute('aria-pressed',String(edit));
      dialog.querySelector('.visual-toolbar span').textContent=edit?'Clique para editar':'Navegar';send();
    };
    dialog.querySelectorAll('[data-style]').forEach(input=>input.addEventListener('change',()=>{
      if(!selected||!ready||busy)return;
      const key=input.dataset.style,value=input.value.trim();
      if(value && (!CSS.supports(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value)||/[{};<>\\]|url\s*\(|expression/i.test(value))){status('Valor de estilo inválido. Use uma cor ou medida CSS válida.');return}
      const next=copy(visual), rules=(next.pages[surface] ||= []);
      let rule=rules.find(rule=>rule.selector===selected.selector && rule.view===selected.view);
      if(!rule){rule={selector:selected.selector,view:selected.view,style:{}};rules.push(rule)}
      if(value)rule.style[key]=value;else delete rule.style[key];
      change(next);
    }));
    el('visual-text').onchange=()=>{
      if(!selected?.editableText||!ready||busy)return;
      const next=copy(visual),rules=(next.pages[surface] ||= []);
      let rule=rules.find(rule=>rule.selector===selected.selector && rule.view===selected.view);
      if(!rule){rule={selector:selected.selector,view:selected.view,style:{}};rules.push(rule)}
      rule.original=selected.original;rule.text=el('visual-text').value;change(next);
    };
    action('reset').onclick=()=>{if(!selected)return;const next=copy(visual);next.pages[surface]=(next.pages[surface]||[]).filter(rule=>rule.selector!==selected.selector || rule.view!==selected.view);change(next);clearSelection()};
    action('undo').onclick=()=>{if(!history.length)return;future.push(copy(visual));visual=history.pop();send();buttons();clearSelection()};
    action('redo').onclick=()=>{if(!future.length)return;history.push(copy(visual));visual=future.pop();send();buttons();clearSelection()};
    async function loadSettings() {
      if(busy)return;
      busy=true;buttons();
      try {
        const response=await fetch(endpoint);const data=await response.json();
        if(!response.ok)throw Error(data.error||'Falha ao carregar.');
        visual=data.visual;saved=copy(visual);revision=data.revision;history=[];future=[];ready=true;
        send();status('Configurações carregadas. Navegue pelas páginas ou selecione um elemento.');
      }catch(error){ready=false;status(error.message)}finally{busy=false;buttons()}
    }
    action('reload').onclick=()=>{if(!same(visual,saved)&&!confirm('Descartar a prévia e carregar a versão publicada?'))return;clearSelection();void loadSettings()};
    action('save').onclick=async()=>{
      if(busy||!ready)return;
      busy=true;el('visual-fields').disabled=true;buttons();status('Publicando personalização…');
      try {
        const auth=await window.BOLT_SUPABASE?.auth.getSession();
        const token=auth?.data?.session?.access_token;if(!token)throw Error('Entre novamente no Master.');
        const response=await fetch(endpoint,{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({revision,visual})});
        const data=await response.json();if(!response.ok)throw Error(data.error||'Falha ao publicar.');
        revision=data.revision;saved=copy(data.visual);visual=copy(data.visual);
        status('Personalização publicada para este cliente.');send();
      }catch(error){status(error.message)}finally{busy=false;el('visual-fields').disabled=!selected;buttons()}
    };
    async function receive(event) {
      if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'bolt-family-preview-ready' && context.product === 'class' && new URL(frame.src).pathname === '/family.html') {
        const auth = await window.BOLT_SUPABASE?.auth.getSession();
        if(auth?.data?.session?.access_token)frame.contentWindow.postMessage({type:'bolt-family-preview',token:auth.data.session.access_token},location.origin);
        return;
      }
      if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.product!==context.product||event.data?.slug!==context.slug)return;
      const data=event.data;
      if (data.type === 'bolt-workspace-preview-ready') {
        const auth = await window.BOLT_SUPABASE?.auth.getSession();
        if(auth?.data?.session?.access_token)frame.contentWindow.postMessage({type:'bolt-workspace-preview-token',product:context.product,slug:context.slug,token:auth.data.session.access_token},location.origin);
        return;
      }
      if(data.type==='bolt-visual-ready'){surface=data.surface;send();status('Página pronta para navegação e edição.')}
      if(data.type==='bolt-visual-select')select(data);
      if(data.type==='bolt-visual-pages'){
        const signature=JSON.stringify(data.pages);
        if(el('visual-pages-list').dataset.signature===signature)return;
        el('visual-pages-list').dataset.signature=signature;
        el('visual-pages-list').replaceChildren(...data.pages.map(item=>{
          const button=document.createElement('button');button.textContent=item.label;
          button.onclick=()=>{clearSelection();send(item.selector)};return button;
        }));
      }
    }
    const warn=event=>{if(!same(visual,saved)){event.preventDefault();event.returnValue=''}};
    function close(event) {
      event?.preventDefault();
      if(busy){status('Aguarde a operação em andamento.');return}
      if(!same(visual,saved)&&!confirm('Fechar e descartar as alterações ainda não publicadas?'))return;
      window.removeEventListener('message',receive);window.removeEventListener('beforeunload',warn);
      modal.close();modal.remove();
    }
    action('close').onclick=close;modal.addEventListener('cancel',close);
    window.addEventListener('message',receive);window.addEventListener('beforeunload',warn);
    try { await stylesReady; }
    catch(error) {
      window.removeEventListener('message',receive);
      window.removeEventListener('beforeunload',warn);
      modal.remove(); alert(error.message); return;
    }
    modal.showModal();
    modal.style.setProperty('display','block','important');
    loadPage(routes[context.product][0]);await loadSettings();
  }
  window.BOLT_VISUAL_EDITOR = { mount(host,context) {
    if(!host||host.querySelector('[data-visual-launch]'))return;
    const button=document.createElement('button');button.type='button';button.dataset.visualLaunch='';
    button.className='studio-primary v27-btn';button.textContent='Abrir editor visual de páginas';
    button.onclick=()=>open(context);host.prepend(button);
  }};
})();
