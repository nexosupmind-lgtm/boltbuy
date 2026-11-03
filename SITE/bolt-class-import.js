/* Read Excel locally. Only reviewed records are sent to the workspace. */
(() => {
 const limit=8*1024*1024;
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const str=value=>String(value??'').trim().slice(0,2000);
 const esc=value=>str(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function xml(raw){
  if(/<!DOCTYPE/i.test(raw))throw Error('XML inválido na planilha.');
  const doc=new DOMParser().parseFromString(raw,'application/xml');
  if(doc.querySelector('parsererror')||doc.doctype)throw Error('XML inválido na planilha.');
  return doc;
 }
 const elements=(node,name)=>[...node.querySelectorAll('*')].filter(element=>element.localName.split(':').pop()===name);
 async function readWorkbook(file){
  if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>limit)throw Error('Escolha um Excel .xlsx de até 8 MB.');
  const data=new Uint8Array(await file.arrayBuffer()),view=new DataView(data.buffer);
  let end=data.length-22;
  while(end>=Math.max(0,data.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
  if(end<Math.max(0,data.length-65557))throw Error('Arquivo Excel inválido.');
  const entries=new Map(),count=view.getUint16(end+10,true);
  if(count>2000)throw Error('Planilha grande demais.');
  let pos=view.getUint32(end+16,true);
  for(let i=0;i<count;i++){
   if(view.getUint32(pos,true)!==0x02014b50)throw Error('Arquivo Excel inválido.');
   const nameLength=view.getUint16(pos+28,true);
   const name=new TextDecoder().decode(data.subarray(pos+46,pos+46+nameLength));
   entries.set(name,{method:view.getUint16(pos+10,true),compressed:view.getUint32(pos+20,true),size:view.getUint32(pos+24,true),offset:view.getUint32(pos+42,true)});
   pos+=46+nameLength+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
  }
  let expanded=0;
  async function get(name){
   const entry=entries.get(name);
   if(!entry||entry.size>limit)throw Error('Aba ausente ou acima do limite de leitura.');
   const off=entry.offset;
   if(view.getUint32(off,true)!==0x04034b50)throw Error('Arquivo Excel inválido.');
   const start=off+30+view.getUint16(off+26,true)+view.getUint16(off+28,true);
   const bytes=data.subarray(start,start+entry.compressed);
   if(bytes.length!==entry.compressed)throw Error('Arquivo Excel incompleto.');
   if(entry.method!==0&&entry.method!==8)throw Error('Compactação não suportada.');
   const source=new Blob([bytes]).stream();
   const reader=(entry.method===8?source.pipeThrough(new DecompressionStream('deflate-raw')):source).getReader();
   const decoder=new TextDecoder();
   let content='';
   try{for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    expanded+=value.byteLength;
    if(expanded>16*1024*1024)throw Error('A planilha descompactada ultrapassa 16 MB.');
    content+=decoder.decode(value,{stream:true});
   }}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
   return xml(content+decoder.decode());
  }
  const workbook=await get('xl/workbook.xml'),rels=await get('xl/_rels/workbook.xml.rels');
  const targets=new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  const shared=entries.has('xl/sharedStrings.xml')?elements(await get('xl/sharedStrings.xml'),'si').map(node=>elements(node,'t').map(t=>t.textContent).join('')):[];
  const sheets=Object.create(null);
  const nodes=elements(workbook,'sheet');
  if(nodes.length>40)throw Error('Use até 40 abas por planilha.');
  for(const sheet of nodes){
   const name=normalize(sheet.getAttribute('name'));
   if(!recognized.has(name)){sheets[name]=null;continue}
   const path=targets.get(sheet.getAttributeNS?.('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id'))||'';
   const target=path.startsWith('/')?path.slice(1):'xl/'+path;
   if(!/^xl\/worksheets\/[^/]+\.xml$/.test(target))throw Error('Caminho de aba inválido.');
   const rows=elements(await get(target),'row').map(row=>{
    const cells=[];
    for(const cell of elements(row,'c')){
     const ref=cell.getAttribute('r')?.match(/^[A-Z]{1,3}/)?.[0];
     if(!ref)continue;
     let index=0;for(const letter of ref)index=index*26+letter.charCodeAt(0)-64;
     if(index>128)continue;
     const value=elements(cell,'v')[0]?.textContent||'';
     cells[index-1]=str(cell.getAttribute('t')==='s'?shared[Number(value)]:elements(cell,'is')[0]?.textContent??value);
    }
    return cells;
   }).filter(row=>row.some(Boolean));
   const header=rows.shift()||[];
   sheets[name]=rows.map(row=>Object.fromEntries(header.flatMap((label,i)=>label?[[normalize(label),row[i]||'']]:[])));
  }
  return sheets;
 }

 const recognized=new Set(['escola','turmas','disciplinas','professores','colaboradores','alunos','responsaveis','matriculas','alocacao docente','frequencia','notas','tarefas','avaliacoes','comunicados','calendario','agenda','mensalidades','biblioteca']);
 const defaults=['students','staff','classes','attendance','grades','finance','family','messages','calendar','reports','enrollments','subjects','schedule','assessments','tasks','library','documents','contracts','expenses','incidents','meetings','transport','inventory','support','audit'];
 const collections=['students','staff','classes','attendance','grades','finance','messages','calendar','enrollments','subjects','tasks','assessments','library','teacherAssignments'];
 const value=(row,...names)=>names.map(name=>str(row[normalize(name)])).find(Boolean)||'';
 const number=value=>Number(String(value).replace(',','.'));
 function date(value){
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)return value;
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(value))return date(value.split('/').reverse().join('-'));
  if(/^\d{5}$/.test(value)&&Number(value)>20000&&Number(value)<80000)return new Date(Date.UTC(1899,11,30)+Number(value)*86400000).toISOString().slice(0,10);
  return '';
 }
 function planImport(bundle,sheets){
  const client=bundle.client;
  const data=structuredClone(bundle.data||{version:2,schools:[{id:client.id,slug:client.slug,name:client.name,modules:[...defaults]}],plans:[],logs:[]});
  const s=data.schools?.[0];
  if(data.schools?.length!==1||s?.id!==client.id||s.slug!==client.slug)throw Error('O arquivo não pôde ser associado a esta escola.');
  for(const key of collections)s[key]??=[];
  const counts={},issues=[],aliases=new Map();
  const rows=name=>sheets[name]||[];
  const get=(row,...names)=>value(row,...names);
  const enabled=key=>!bundle.entitlements||bundle.entitlements.includes(key);
  const keyFor=(sheet,key)=>'import_'+normalize(sheet+' '+key).replace(/ /g,'_');
  const find=(collection,code,name)=>aliases.get(collection+'|'+code)||s[collection].find(r=>code&&(r.sourceId===code||r.id===code))?.id||(()=>{
   const matches=s[collection].filter(r=>name&&normalize(r.name)===normalize(name));
   return matches.length===1?matches[0].id:'';
  })();
  function consume(sheet,key,convert,feature=key){
   if(!rows(sheet).length)return;
   if(!enabled(feature)){issues.push(sheet+' · módulo indisponível no plano.');return}
   rows(sheet).forEach((row,index)=>{
    const record=convert(row);
    if(!record){issues.push(sheet+' · linha '+(index+2)+' ignorada por dados ou vínculos incompletos.');return}
    const list=Array.isArray(record)?record:[record];
    for(const entry of list){
     const id=keyFor(sheet,entry.importKey);
     const existing=s[key].find(r=>r.id===id||entry.natural&&entry.natural(r));
     if(entry.sourceId)aliases.set(key+'|'+entry.sourceId,existing?.id||id);
     if(existing){counts[sheet]??={added:0,skipped:0,examples:[]};counts[sheet].skipped++;continue}
     const {importKey,natural,...fields}=entry;
     s[key].push({id,...fields});
     counts[sheet]??={added:0,skipped:0,examples:[]};
     counts[sheet].added++;
     const label=fields.name||fields.title||fields.assessment||fields.date||fields.due;
     if(label&&counts[sheet].examples.length<3)counts[sheet].examples.push(label);
    }
   });
  }
  const schoolFields={cidade:'city',municipio:'city',cnpj:'cnpj',email:'email',telefone:'phone',endereco:'address',cep:'zip',estado:'state'};
  for(const row of rows('escola')){
   const field=schoolFields[normalize(get(row,'Campo'))],v=get(row,'Valor');
   if(field&&v&&!s[field]){s[field]=v;counts.escola??={added:0,skipped:0,examples:[]};counts.escola.added++;counts.escola.examples.push(get(row,'Campo'))}
  }
  if(rows('escola').length)issues.push('Escola · nome comercial e identidade visual são gerenciados no Studio. Campos de contato vazios podem ser preenchidos.');
  for(const sheet of ['professores','colaboradores'])consume(sheet,'staff',r=>{
   const name=get(r,'Nome','Nome completo'),sourceId=get(r,'ID'),email=get(r,'E-mail','E-mail fictício');
   return name&&{importKey:sourceId||email||name,sourceId,name,email,role:sheet==='professores'?'Professor':get(r,'Cargo','Função')||'Outro',phone:get(r,'Telefone'),subject:get(r,'Disciplina principal'),department:get(r,'Setor'),status:get(r,'Situação'),natural:x=>email?normalize(x.email)===normalize(email):normalize(x.name)===normalize(name)};
  });
  consume('turmas','classes',r=>{
   const name=get(r,'Turma','Nome','Turma / Série'),sourceId=get(r,'ID'),year=get(r,'Ano letivo');
   return name&&{importKey:sourceId||name+' '+year,sourceId,name,year,grade:get(r,'Ano escolar'),shift:get(r,'Turno'),room:get(r,'Sala'),schedule:get(r,'Horário'),capacity:get(r,'Capacidade'),teacherId:find('staff','',get(r,'Professor regente')),natural:x=>normalize(x.name)===normalize(name)&&(!year||String(x.year)===year)};
  });
  consume('disciplinas','subjects',r=>{
   const name=get(r,'Disciplina','Nome'),sourceId=get(r,'ID','Código');
   return name&&{importKey:sourceId||name,sourceId,name,code:sourceId,weeklyWorkload:get(r,'Carga semanal (aulas)'),workload:get(r,'Carga horária anual'),natural:x=>normalize(x.name)===normalize(name)};
  });
  const guardianById=new Map(),guardianByStudent=new Map();
  for(const row of rows('responsaveis')){
   const id=get(row,'ID'),student=get(row,'ID aluno');
   if(id&&!guardianById.has(id))guardianById.set(id,row);
   if(student&&!guardianByStudent.has(student))guardianByStudent.set(student,row);
  }
  consume('alunos','students',r=>{
   const name=get(r,'Nome','Nome completo'),sourceId=get(r,'ID aluno','ID','Matrícula'),birth=date(get(r,'Nascimento','Data de nascimento'));
   const classCode=get(r,'ID turma'),className=get(r,'Turma');
   const classId=find('classes',classCode,className);
   const g=guardianById.get(get(r,'ID responsável'))||guardianByStudent.get(sourceId)||{};
   if(!name||!birth||((classCode||className)&&!classId))return null;
   return {importKey:sourceId||name+' '+birth,sourceId,name,birth,classId,registration:sourceId,gender:get(r,'Sexo','Gênero'),status:get(r,'Situação')||'Ativo',enrollmentDate:date(get(r,'Matrícula em','Data da matrícula')),guardian:get(r,'Responsável')||get(g,'Nome'),phone:get(r,'Telefone')||get(g,'Telefone'),guardianEmail:get(g,'E-mail','E-mail fictício'),address:get(g,'Endereço'),healthNotes:get(r,'Saúde / observações'),natural:x=>!!sourceId&&x.registration===sourceId||normalize(x.name)===normalize(name)&&x.birth===birth};
  });
  const student=r=>find('students',get(r,'ID aluno'),get(r,'Aluno'));
  const group=r=>find('classes',get(r,'ID turma'),get(r,'Turma'));
  consume('matriculas','enrollments',r=>{
   const studentId=student(r),classId=group(r),day=date(get(r,'Data','Data da matrícula')),year=get(r,'Ano letivo');
   return studentId&&classId&&day&&{importKey:get(r,'ID matrícula','ID')||[studentId,classId,year].join(' '),studentId,classId,year,date:day,status:get(r,'Situação')||'Ativa',notes:get(r,'Condição','Observações'),natural:x=>x.studentId===studentId&&x.classId===classId&&String(x.year)===year};
  });
  consume('alocacao docente','teacherAssignments',r=>{
   const classId=group(r),subjectId=find('subjects',get(r,'ID disciplina'),get(r,'Disciplina')),teacherId=find('staff',get(r,'ID professor'),get(r,'Professor'));
   return classId&&subjectId&&teacherId&&{importKey:[classId,subjectId,teacherId].join(' '),classId,subjectId,teacherId,natural:x=>x.classId===classId&&x.subjectId===subjectId&&x.teacherId===teacherId};
  },'classes');
  consume('frequencia','attendance',r=>{
   const studentId=student(r),classId=group(r)||s.students.find(x=>x.id===studentId)?.classId,day=date(get(r,'Data'));
   const status=({presente:'P',p:'P',falta:'F',faltou:'F',ausente:'F',f:'F'})[normalize(get(r,'Presença','Situação'))];
   return studentId&&classId&&day&&status&&{importKey:[studentId,classId,day].join(' '),studentId,classId,date:day,status,natural:x=>x.studentId===studentId&&x.classId===classId&&x.date===day};
  });
  consume('notas','grades',r=>{
   const studentId=student(r),subject=get(r,'Disciplina'),term=get(r,'Bimestre','Período'),period=/^[1-4]$/.test(term)?term+'º Bimestre':term;
   if(!studentId||!subject||!period)return null;
   const entries=Object.entries(r).filter(([key,v])=>v&&(key==='nota'||/^avaliacao \d+$/.test(key))).map(([key,v])=>{
    const assessment=key==='nota'?get(r,'Avaliação')||'Avaliação':key.replace('avaliacao','Avaliação');
    return {importKey:[studentId,subject,period,assessment].join(' '),studentId,subject,period,assessment,score:number(v),weight:1,publishStatus:'draft',natural:x=>x.studentId===studentId&&normalize(x.subject)===normalize(subject)&&x.period===period&&normalize(x.assessment)===normalize(assessment)};
   });
   return entries.length&&entries.every(x=>Number.isFinite(x.score)&&x.score>=0&&x.score<=10)?entries:null;
  });
  consume('mensalidades','finance',r=>{
   const studentId=student(r),due=date(get(r,'Vencimento')),raw=get(r,'Valor (R$)','Valor'),amount=number(raw),description=get(r,'Descrição')||'Mensalidade';
   return studentId&&due&&raw&&Number.isFinite(amount)&&amount>=0&&{importKey:get(r,'ID')||[studentId,due,description].join(' '),studentId,due,amount,description,status:get(r,'Situação')||'Pendente',natural:x=>x.studentId===studentId&&x.due===due&&normalize(x.description)===normalize(description)};
  });
  for(const [sheet,key] of [['tarefas','tasks'],['avaliacoes','assessments'],['comunicados','messages'],['calendario','calendar'],['agenda','calendar'],['biblioteca','library']])consume(sheet,key,r=>{
   const title=get(r,'Título','Evento','Livro','Tipo','Descrição'),day=date(get(r,'Data','Entrega')),classId=group(r);
   if(!title||(get(r,'ID turma','Turma')&&!classId)||(['calendar','assessments','tasks'].includes(key)&&!day))return null;
   if(key==='messages'&&get(r,'Público')&&!['todos','todas as turmas','geral'].includes(normalize(get(r,'Público'))))return null;
   const common={importKey:get(r,'ID')||[title,day,classId].join(' '),title,date:day,natural:x=>normalize(x.title)===normalize(title)&&x.date===day&&(x.classId||'')===classId};
   if(key==='library')return {...common,code:get(r,'ID','Tombo'),author:get(r,'Autor'),quantity:get(r,'Exemplares'),available:get(r,'Disponíveis'),status:'Disponível'};
   const subjectId=find('subjects',get(r,'ID disciplina'),get(r,'Disciplina'));
   const description=get(r,'Descrição','Conteúdo');
   if(key==='tasks')return {...common,classId,subjectId,kind:'Tarefa',details:description};
   if(key==='assessments')return {...common,classId,subjectId,kind:'Prova',notes:description,weight:1};
   return {...common,classId,description,content:get(r,'Mensagem')};
  });
  if(counts.comunicados?.added||counts.calendario?.added||counts.agenda?.added)issues.push('Comunicados gerais e agenda importados ficam disponíveis no Portal da Família. Notas importadas ficam em rascunho.');
  if(rows('responsaveis').length)issues.push('Responsáveis · dados incorporados aos novos alunos vinculados. Acessos ao portal são criados separadamente.');
  for(const [name,rows] of Object.entries(sheets))if(rows===null)issues.push(name+' · aba ignorada.');
  const added=Object.values(counts).reduce((sum,item)=>sum+item.added,0);
  return {data,counts,issues,added};
 }

 function mount(root,client,master){
  const section=document.createElement('section');
  section.className='v27-card';
  section.innerHTML='<h3>Alimentar escola por planilha</h3><p data-import-school></p><p>Leia várias abas do Excel, confira a prévia e importe os dados. A planilha é lida no navegador e descartada depois da análise.</p><label>Planilha .xlsx <input type="file" accept=".xlsx" data-class-file></label><p role="status"></p><div data-class-preview></div><button type="button" class="v27-btn" disabled>Confirmar importação</button>';
  section.querySelector('[data-import-school]').textContent='Destino: '+client.name;
  root.append(section);
  const input=section.querySelector('input'),status=section.querySelector('[role=status]'),preview=section.querySelector('[data-class-preview]'),button=section.querySelector('button');
  const url='/api/commercial-workspace?'+new URLSearchParams({product:'class',slug:client.slug,studio:'import'});
  let plan=null,revision=0;
  async function request(method,body){
   const sb=await master();
   const token=(await sb.auth.getSession()).data?.session?.access_token;
   if(!token)throw Error('Entre novamente no Master.');
   const result=await fetch(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const json=await result.json();
   if(!result.ok)throw Error(result.status===409?'A escola foi alterada. Selecione a planilha novamente para revisar a importação.':json.error||'Falha ao acessar a escola.');
   return json;
  }
  input.onchange=async()=>{
   const file=input.files[0];
   if(!file)return;
   input.disabled=true;button.disabled=true;plan=null;preview.replaceChildren();status.textContent='Lendo abas e conferindo vínculos…';
   try{
    const [bundle,sheets]=await Promise.all([request('GET'),readWorkbook(file)]);
    plan=planImport(bundle,sheets);revision=bundle.revision;
    preview.innerHTML='<ul>'+Object.entries(plan.counts).map(([name,count])=>'<li>'+esc(name)+' · '+count.added+' novos, '+count.skipped+' já existentes'+(count.examples.length?' <small>('+count.examples.map(esc).join(', ')+')</small>':'')+'</li>').join('')+'</ul>'+ (plan.issues.length?'<details><summary>'+plan.issues.length+' observações</summary><ul>'+plan.issues.slice(0,100).map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul></details>':'');
    status.textContent=plan.added?plan.added+' alterações prontas para revisão. Cadastros existentes serão preservados.':'Nenhum registro novo reconhecido.';
    button.disabled=!plan.added;
   }catch(error){status.textContent=error.message}
   finally{input.value='';input.disabled=false}
  };
  button.onclick=async()=>{
   if(!plan?.added||!section.isConnected)return;
   input.disabled=true;button.disabled=true;
   try{
    await request('PUT',{data:plan.data,revision});
    status.textContent='Importação concluída. Apenas os registros foram gravados.';
    plan=null;
   }catch(error){status.textContent=error.message;plan=null}
   finally{input.disabled=false}
  };
 }
 window.BOLT_CLASS_IMPORT={mount,planImport,readWorkbook};
})();
