/* Reduce images before they enter Storage, JSON or local caches. */
(() => {
 const types=new Set(['image/jpeg','image/png','image/webp']);
 async function animated(file){
  if(file.type==='image/jpeg')return false;
  const data=new DataView(await file.arrayBuffer());
  if(file.type==='image/webp'){
   return data.byteLength>20&&data.getUint32(12)===0x56503858&&(data.getUint8(20)&2)!==0;
  }
  for(let offset=8;offset+12<=data.byteLength;){
   const type=data.getUint32(offset+4);
   if(type===0x6163544c)return true; // acTL
   if(type===0x49444154)return false; // IDAT
   offset+=12+data.getUint32(offset);
  }
  return false;
 }
 async function image(file,{maxEdge=1600,maxBytes=1200000}={}){
  if(!file||!types.has(file.type))throw Error('Escolha uma imagem JPG, PNG ou WebP.');
  if(!file.size||file.size>20*1024*1024)throw Error('Escolha uma imagem de até 20 MB.');
  if(await animated(file)){
   if(file.size<=maxBytes)return file;
   throw Error('A imagem animada ultrapassa o limite. Envie uma versão menor.');
  }
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('Não foi possível abrir a imagem.')});
  const canvas=document.createElement('canvas');
  try{
   const context=canvas.getContext('2d');
   let scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
   for(let attempt=0;attempt<5;attempt++){
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',attempt<2?.86:.77));
    if(blob&&blob.size<=maxBytes&&blob.size<file.size){
     const ext=blob.type==='image/webp'?'webp':blob.type==='image/jpeg'?'jpg':'png';
     return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.'+ext,{type:blob.type});
    }
    scale*=.75;
   }
   if(file.size<=maxBytes)return file;
   throw Error('Não foi possível reduzir a imagem ao limite deste campo.');
  }finally{bitmap.close();canvas.width=canvas.height=1}
 }
 async function dataURL(file,options){
  const result=await image(file,options);
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(Error('Falha ao ler a imagem.'));
   reader.readAsDataURL(result);
  });
 }
 window.BOLT_UPLOAD={image,dataURL};
})();
