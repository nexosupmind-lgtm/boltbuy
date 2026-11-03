/* Images are decoded and recognized locally. Only answers and review records are saved. */
(() => {
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let engine;
 function loadOCR(){
  if(engine)return engine;
  engine=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
   script.integrity='sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED';
   script.crossOrigin='anonymous';
   script.onload=()=>resolve(window.Tesseract);
   script.onerror=()=>{script.remove();engine=null;reject(Error('Leitor de fotos indisponível. Digite as respostas para continuar.'))};
   document.head.append(script);
  });
  return engine;
 }
 async function recognize(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Use uma foto JPG, PNG ou WebP de até 8 MB.');
  const image=await createImageBitmap(file);
  const canvas=document.createElement('canvas');
  try{
   const scale=Math.min(1,2200/Math.max(image.width,image.height));
   canvas.width=Math.max(1,Math.round(image.width*scale));
   canvas.height=Math.max(1,Math.round(image.height*scale));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  }finally{image.close()}
  const ocr=await loadOCR();
  const worker=await ocr.createWorker('eng',1);
  try{return (await worker.recognize(canvas, {rotateAuto:true})).data.text}
  finally{await worker.terminate();canvas.width=canvas.height=1}
 }
 function parse(text,allowBlank=false){
  const matches=String(text).toUpperCase().split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
   const match=line.match(/^(\d{1,3})\s*[-.:)]?\s*([A-E–—-])$/);
   if(!match)throw Error('Confira a leitura. Cada linha deve conter apenas o número e a alternativa, por exemplo 01 A.');
   return match;
  });
  const answers=new Map();
  for(const [,num,raw] of matches){
   const question=Number(num),answer=raw.replace(/[–—]/g,'-');
   if(question<1||answers.has(question)||(!allowBlank&&answer==='-'))throw Error('Revise a numeração e as alternativas. Cada questão deve aparecer uma vez.');
   answers.set(question,answer);
  }
  if(!answers.size||answers.size>200)throw Error('Informe até 200 respostas numeradas, por exemplo 01 A, uma por linha.');
  return answers;
 }
 function calculate(keyText,answerText){
  const key=parse(keyText),answers=parse(answerText,true);
  if(key.size!==answers.size||[...key.keys()].some(q=>!answers.has(q)))throw Error('As duas listas devem ter as mesmas questões. Use “03 -” para uma resposta em branco.');
  const correct=[...key].filter(([q,a])=>answers.get(q)===a).length;
  return {correct,total:key.size,score:Math.round(correct/key.size*100)/10};
 }
 function mount(host,{students,exam,items,grades,enqueue,approve,discard}){
  const section=document.createElement('section');
  section.className='teacher-card';
  section.innerHTML=`<h3>Correção por foto</h3><p>Use listas numeradas (01 A, 02 B). Confira o texto lido da foto antes de enviar para análise. Bolhas e respostas discursivas exigem transcrição.</p>
  <form class="class-review-form">
   <label class="field">Aluno<select name="studentId" required><option value="">Selecione</option>${students.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
   <label class="field">Gabarito oficial<textarea name="key" required maxlength="4000" rows="4" placeholder="01 A"></textarea><input type="file" aria-label="Foto do gabarito oficial" data-ocr="key" accept="image/png,image/jpeg,image/webp"></label>
   <label class="field">Respostas do aluno<textarea name="answers" required maxlength="4000" rows="4" placeholder="01 B"></textarea><input type="file" aria-label="Foto das respostas do aluno" data-ocr="answers" accept="image/png,image/jpeg,image/webp"></label>
   <button class="btn" type="submit">Calcular e enviar para análise</button>
  </form><p role="status" aria-live="polite"></p><h3>Fila de análise</h3><div data-review-list></div>`;
  host.append(section);
  const form=section.querySelector('form'),status=section.querySelector('[role=status]'),list=section.querySelector('[data-review-list]');
  const submit=form.querySelector('button');
  const busy=value=>{submit.disabled=value;section.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=value)};
  for(const input of form.querySelectorAll('[data-ocr]'))input.onchange=async()=>{
   const file=input.files[0];
   if(!file)return;
   busy(true);status.textContent='Lendo foto neste aparelho…';
   try{
    form.elements[input.dataset.ocr].value=(await recognize(file)).slice(0,4000);
    status.textContent='Confira e corrija as alternativas lidas antes de calcular.';
   }catch(error){status.textContent=error.message}
   finally{input.value='';busy(false)}
  };
  form.onsubmit=async event=>{
   event.preventDefault();busy(true);
   try{
    const studentId=form.elements.studentId.value;
    const key=form.elements.key.value,answers=form.elements.answers.value;
    await enqueue({studentId,key,answers,...calculate(key,answers)});
    status.textContent='Nota sugerida incluída na fila.';
    form.elements.answers.value='';form.elements.studentId.value='';render();
   }catch(error){status.textContent=error.message}
   finally{busy(false)}
  };
  function render(){
   const queue=items().filter(item=>item.examId===exam.id);
   list.innerHTML=queue.map(item=>{
    const student=students.find(s=>s.id===item.studentId);
    if(!student)return '';
    const current=grades().find(g=>g.teacherExamId===exam.id&&g.studentId===student.id);
    return `<details class="card"><summary>${esc(student.name)} · ${item.correct}/${item.total} · nota sugerida ${item.score}</summary><p>${current?'Nota já registrada: '+esc(current.score)+'. O lançamento vai substituí-la.':'Nota ainda não lançada.'}</p><details><summary>Conferir respostas</summary><p><strong>Gabarito</strong></p><pre style="white-space:pre-wrap">${esc(item.key)}</pre><p><strong>Aluno</strong></p><pre style="white-space:pre-wrap">${esc(item.answers)}</pre></details>
     <form data-review-id="${esc(item.id)}"><label class="field">Nota revisada<input name="score" required type="number" min="0" max="10" step="0.1" value="${item.score}"></label>
     <label class="field">Período<select name="period">${[1,2,3,4].map(n=>`<option>${n}º Bimestre</option>`).join('')}</select></label>
     <label><input type="checkbox" name="published"> Publicar para a família</label>
     <div class="actions"><button class="btn" type="submit">Confirmar e lançar</button><button class="btn alt" type="button" data-discard>Descartar análise</button></div></form></details>`;
   }).join('')||'<p class="muted">Nenhuma nota aguardando análise.</p>';
   for(const review of list.querySelectorAll('[data-review-id]')){
    review.onsubmit=async event=>{
     event.preventDefault();busy(true);
     try{
      const item=items().find(row=>row.id===review.dataset.reviewId);
      const score=Number(review.elements.score.value);
      await approve(review.dataset.reviewId,{score:Number(review.elements.score.value),period:review.elements.period.value,publishStatus:review.elements.published.checked?'published':'draft'});
      const field=document.getElementById('teacherResults')?.elements.namedItem('grade_'+item?.studentId);
      if(field)field.value=String(score);
      status.textContent='Nota lançada.';render();
     }catch(error){status.textContent=error.message}
     finally{busy(false)}
    };
    review.querySelector('[data-discard]').onclick=async()=>{
     busy(true);
     try{await discard(review.dataset.reviewId);status.textContent='Análise descartada.';render()}
     catch(error){status.textContent=error.message}
     finally{busy(false)}
    };
   }
  }
  render();
 }
 window.BOLT_GRADE_REVIEW={mount,calculate};
})();
