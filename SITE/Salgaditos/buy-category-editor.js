(()=> {
 const defaults=['Combos','Salgados','Especiais','Individuais','Doces','Bebidas'];
 window.boltCategoryCompare=(a,b)=>{
   const order=window.BOLT_CATEGORY_ORDER?.length?window.BOLT_CATEGORY_ORDER:defaults;
   const rank=n=>{const i=order.findIndex(v=>v.toLocaleLowerCase('pt-BR')===String(n).toLocaleLowerCase('pt-BR'));return i<0?1000:i};
   return rank(a)-rank(b)||String(a).localeCompare(String(b),'pt-BR');
 };
 const select=document.getElementById('productCategory'),form=document.getElementById('productForm');
 if(!select||!form)return;
 let draft=[],addons=[];
 const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<h3>Categorias do cardápio</h3><p class="hint">Crie categorias e ajuste a sequência usando as setas. A ordem é publicada na loja.</p><div id="bolt-category-list"></div><div class="bolt-category-new"><input id="bolt-category-name" maxlength="60" placeholder="Ex.: Hambúrgueres"><button type="button" class="btn" id="bolt-category-add">Adicionar</button></div><button type="button" class="btn red" id="bolt-category-save">Publicar ordem</button><p role="status" id="bolt-category-status"></p>';
 form.closest('.panel').before(panel);
 const addonPanel=document.createElement('fieldset');addonPanel.className='buy-span bolt-product-addons';addonPanel.innerHTML='<legend>Adicionais do produto</legend><p class="hint">Opções extras por unidade, gratuitas ou pagas. O cliente pode marcar as que quiser.</p><div id="bolt-addon-list"></div><button type="button" class="btn" id="bolt-addon-add">＋ Novo adicional</button>';
 form.querySelector('button[type=submit],button.btn.red').before(addonPanel);
 const current=()=>[...new Set([...(window.BOLT_CATEGORY_ORDER||[]),...load().products.map(p=>p.category).filter(Boolean),...(!window.BOLT_CATEGORIES_CONFIGURED&&!window.BOLT_CATEGORY_ORDER?.length?defaults:[])])];
 function fill(selected=select.value){const names=[...new Set([...draft,...load().products.map(p=>p.category).filter(Boolean)])];select.replaceChildren(...names.map(n=>new Option(n,n)));if(names.includes(selected))select.value=selected;}
 function render(){const list=panel.querySelector('#bolt-category-list');list.replaceChildren();draft.forEach((name,i)=>{const row=document.createElement('div');row.className='bolt-category-row';const title=document.createElement('span');title.textContent=String(i+1).padStart(2,'0')+'  '+name;row.append(title);for(const [delta,txt] of [[-1,'↑'],[1,'↓']]){const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent=txt;b.disabled=i+delta<0||i+delta>=draft.length;b.setAttribute('aria-label',delta<0?'Subir '+name:'Descer '+name);b.onclick=()=>{[draft[i],draft[i+delta]]=[draft[i+delta],draft[i]];render();};row.append(b);}const del=document.createElement('button');del.type='button';del.className='btn small';del.textContent='×';del.disabled=false;del.setAttribute('aria-label','Remover '+name);del.onclick=async()=>{
 const linked=load().products.filter(p=>p.category===name);
 if(!linked.length){draft=draft.filter(n=>n!==name);render();fill();return;}
 const targets=draft.filter(n=>n!==name);
 const dialog=document.createElement('dialog');dialog.className='buy-dialog';
 const form=document.createElement('form');form.innerHTML='<h2>Remover categoria</h2><p data-info></p><label class="field">Mover produtos para<select required></select></label><p role="status"></p><div class="actions"><button type="submit" class="btn red">Mover e remover</button><button type="button" class="btn" data-close>Cancelar</button></div>';
 form.querySelector('[data-info]').textContent='A categoria '+name+' possui '+linked.length+' produto(s). Escolha o novo destino. Nenhum produto será excluído.';
 const destination=form.querySelector('select');destination.add(new Option('Selecione uma categoria',''));
 for(const target of targets)destination.add(new Option(target,target));
 if(!targets.includes('Outros')&&name!=='Outros')destination.add(new Option('Outros','Outros'));
 if(destination.options.length===1){notify('Crie outra categoria antes de remover esta.');return;}
 dialog.append(form);document.body.append(dialog);dialog.onclose=()=>dialog.remove();form.querySelector('[data-close]').onclick=()=>dialog.close();
 form.onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
 const to=destination.value,previous=[...draft];
 await window.BOLT_CATALOG.moveCategory(name,to);
 draft=[...new Set([...previous.filter(n=>n!==name),to])];render();fill(to);
 dialog.close();panel.querySelector('#bolt-category-status').textContent='Produtos movidos. Clique em Publicar ordem para remover a categoria da lista.';
 }catch(err){form.querySelector('[role=status]').textContent=err.message;}finally{b.disabled=false;}};
 dialog.showModal();
 };row.append(del);list.append(row);});}
 function renderAddons(){const list=addonPanel.querySelector('#bolt-addon-list');list.replaceChildren();addons.forEach((a,i)=>{const row=document.createElement('div');row.className='bolt-addon-row';row.innerHTML='<label>Nome<input data-name required maxlength="80" placeholder="Ex.: Bacon"></label><label>Valor (R$)<input data-price required type="number" min="0" step=".01"></label><button type="button" class="btn small">×</button>';const n=row.querySelector('[data-name]'),p=row.querySelector('[data-price]');n.value=a.name;p.value=a.price;n.oninput=()=>a.name=n.value;p.oninput=()=>a.price=Number(p.value);row.querySelector('button').onclick=()=>{addons.splice(i,1);renderAddons();};list.append(row);});}
 addonPanel.querySelector('#bolt-addon-add').onclick=()=>{if(addons.length>=30)return notify('Limite de 30 adicionais.');addons.push({id:crypto.randomUUID(),name:'',price:0});renderAddons();};
 panel.querySelector('#bolt-category-add').onclick=()=>{const input=panel.querySelector('#bolt-category-name'),name=input.value.trim();if(!name||name.toLowerCase()==='todos'||draft.some(n=>n.toLowerCase()===name.toLowerCase()))return notify('Informe uma categoria nova e válida.');if(draft.length>=100)return notify('Limite de 100 categorias.');draft.push(name);input.value='';render();fill(name);};
 panel.querySelector('#bolt-category-save').onclick=async e=>{const b=e.currentTarget,status=panel.querySelector('#bolt-category-status');b.disabled=true;try{const session=(await window.BOLT_SUPABASE.auth.getSession()).data.session;if(!session)throw Error('Entre novamente.');const headers={authorization:'Bearer '+session.access_token,'content-type':'application/json'},url='/api/buy-commerce?tenant='+encodeURIComponent((window.BOLT_ROUTE_TENANT||new URLSearchParams(location.search).get('tenant'))||'salgaditos');const state=await fetch(url+'&action=admin',{headers}),snapshot=await state.json();if(!state.ok)throw Error(snapshot.error);const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({action:'configure',version:snapshot.version,config:{...snapshot.config,categoryOrder:draft,categoriesConfigured:true}})}),result=await response.json();if(!response.ok)throw Error(result.error);window.BOLT_CATEGORY_ORDER=result.config.categoryOrder;window.BOLT_CATEGORIES_CONFIGURED=true;window.dispatchEvent(new CustomEvent('buy-appearance-saved',{detail:{slug:(window.BOLT_ROUTE_TENANT||new URLSearchParams(location.search).get('tenant'))||'salgaditos',...result}}));fill();status.textContent='Categorias publicadas com sucesso.';}catch(err){status.textContent=err.message;}finally{b.disabled=false;}};
 window.BOLT_CATEGORY_EDITOR={refresh:fill,setAddons(values){addons=values.map(a=>({...a}));renderAddons();},getAddons(){return addons.map(a=>({...a}));}};
 window.addEventListener('bolt-catalog-ready',()=>{draft=current();render();fill();});
 draft=current();render();fill();
})();