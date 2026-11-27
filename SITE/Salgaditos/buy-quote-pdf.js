// A4 vector PDF, generated locally. Optional JPEG logo; no remote PDF service.
const bytes = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 255));
const ascii = (s) =>
  String(s ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x20-\xff\n]/g, "");
const literal = (s) =>
  ascii(s)
    .replace(/[\\()]/g, "\\$&")
    .replace(/[\r\n]/g, " ");
const currency = (n) =>
  Number(n)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/\u00a0/g, " ");
const wrap = (text, width, size) => {
  const result = [];
  for (const paragraph of ascii(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if ((line + " " + word).length * size * 0.53 > width && line) {
        result.push(line);
        line = "";
      }
      if (word.length * size * 0.53 > width) {
        const max = Math.floor(width / (size * 0.53));
        for (let i = 0; i < word.length; i += max)
          result.push(word.slice(i, i + max));
      } else line += (line ? " " : "") + word;
    }
    if (line) result.push(line);
  }
  return result;
};
export function quotePDF(quote, store, logo) {
  const W = 595.28,
    H = 841.89,
    margin = 36,
    objects = [],
    pages = [];
  const reserve = () => {
    objects.push(null);
    return objects.length;
  };
  const put = (value) => {
    objects.push(value);
    return objects.length;
  };
  const catalog = reserve(),
    pagesId = reserve();
  const regular = put(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ),
    bold = put(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
  let logoId;
  if (logo?.data?.length && logo.width && logo.height)
    logoId = put([
      bytes(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`,
      ),
      logo.data,
      bytes("\nendstream"),
    ]);
  const navy=[.015,.065,.19], blue=[0,.30,.86], cyan=[0,.61,.98], pale=[.88,.94,.99], ink=[.025,.07,.16], gray=[.30,.35,.41], white=[1,1,1];
  const m=32,w=W-2*m, bodies=[];
  let commands="",y=0;
  const text=(s,x,t,size=11,b=false,c=ink)=>{commands+="BT /"+(b?"B":"R")+" "+size+" Tf "+c.join(" ")+" rg 1 0 0 1 "+x+" "+(H-t)+" Tm ("+literal(s)+") Tj ET\n";};
  const rect=(x,t,w,h,c)=>{commands+=c.join(" ")+" rg "+x+" "+(H-t-h)+" "+w+" "+h+" re f\n";};
  const poly=(pts,c)=>{commands+=c.join(" ")+" rg "+pts.map(([x,t],i)=>x+" "+(H-t)+(i?" l":" m")).join(" ")+" h f\n";};
  const round=(x,t,w,h,r,c)=>{r=Math.min(r,w/2,h/2);const k=.55228475*r,a=H-t,b=a-h;commands+=c.join(" ")+" rg "+[x+r,a,"m",x+w-r,a,"l",x+w-r+k,a,x+w,a-r+k,x+w,a-r,"c",x+w,b+r,"l",x+w,b+r-k,x+w-r+k,b,x+w-r,b,"c",x+r,b,"l",x+r-k,b,x,b+r-k,x,b+r,"c",x,a-r,"l",x,a-r+k,x+r-k,a,x+r,a,"c","h f"].join(" ")+"\n";};
  const fit=(s,x,t,max,size,b=false,c=ink)=>text(s,x,t,Math.min(size,max/Math.max(1,ascii(s).length*.57)),b,c);
  const line=(x1,t1,x2,t2,c=blue,sw=1.5)=>{commands+=c.join(" ")+" RG "+sw+" w "+x1+" "+(H-t1)+" m "+x2+" "+(H-t2)+" l S\n";};
  const icon=(kind,x,t,c=blue)=>{const l=(a,b,d,e)=>line(x+a,t+b,x+d,t+e,c,1.6);
    if(kind==="calendar"){round(x,t+3,19,17,3,c);round(x+2,t+6,15,12,1,white);l(5,0,5,6);l(14,0,14,6);l(2,9,17,9);}
    else if(kind==="person"){round(x,t,28,30,7,blue);round(x+10,t+5,8,8,4,white);round(x+6,t+15,16,9,4,white);}
    else if(kind==="service"){l(2,15,20,15);l(0,18,22,18);l(4,15,4,9);l(18,15,18,9);l(4,9,8,5);l(18,9,14,5);l(8,5,14,5);l(11,3,11,11);}
    else if(kind==="drink"){l(3,5,19,5);l(5,5,7,19);l(17,5,15,19);l(7,19,15,19);l(11,5,14,0);}
    else if(kind==="pizza"){l(2,19,10,2);l(10,2,21,12);l(21,12,2,19);l(7,12,9,14);l(12,8,14,10);}
    else if(kind==="phone"){l(5,3,2,7);l(2,7,5,14);l(5,14,12,20);l(12,20,18,20);l(18,20,21,16);l(21,16,15,12);l(15,12,12,15);l(12,15,7,10);l(7,10,10,7);l(10,7,5,3);}
    else if(kind==="pin"){round(x+3,t,15,16,7,c);poly([[x+4,t+11],[x+17,t+11],[x+10.5,t+22]],c);round(x+8,t+4,5,5,2.5,white);}
    else {l(1,6,11,1);l(11,1,21,6);l(21,6,11,12);l(11,12,1,6);l(1,6,1,17);l(1,17,11,22);l(11,22,21,17);l(21,17,21,6);l(11,12,11,22);}
  };
  const section=(n,label,t)=>{round(m+2,t,32,23,6,blue);text(n,m+10,t+16,13,true,white);text(label,m+46,t+18,19,true,navy);};
  const date=new Date(quote.date||Date.now()).toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"});
  const items=Array.isArray(quote.items)?quote.items:[];
  const isLabor=i=>/^m[aã]o de obra$/i.test(String(i.name).trim());
  function begin(first=false){
    if(commands)bodies.push(commands);
    commands="";
    rect(0,0,W,151,navy);
    for(let i=0;i<40;i++)rect(i*W/40,0,W/40+.1,9,[0,.58-i*.009,.96-i*.005]);
    poly([[W-28,9],[W,9],[W,49],[W-58,89],[W-80,89]],[.025,.19,.43]);
    poly([[W,38],[W,78],[W-36,137],[W-62,137]],cyan);
    rect(0,146,W,6,blue);
    if(logoId){const scale=Math.min(176/logo.width,126/logo.height);commands+="q "+logo.width*scale+" 0 0 "+logo.height*scale+" "+(128-logo.width*scale/2)+" "+(H-77-logo.height*scale/2)+" cm /Logo Do Q\n";}
    else fit(store.name||"LOJA",m,84,190,24,true,white);
    line(240,37,240,121,[.65,.73,.84],.8);
    fit(String(store.name||"").toUpperCase(),277,64,250,26,true,white);
    text("P R O P O S T A   C O M E R C I A L",278,85,10,true,white);
    icon("calendar",279,98,cyan);fit(date,308,112,235,14,true,white);
    text("DOCUMENTO Nº "+String(quote.id||"").slice(0,8).toUpperCase(),m+7,177,11,true,blue);
    text(first?"Seu orçamento":"Seu orçamento - continuação",m+6,217,first?35:24,true,navy);
    round(m+7,229,50,5,2.5,blue);
    text("Produtos e serviços para o seu evento.",m+7,255,14,false,ink);
    y=277;
    if(first){
      const nameLines=wrap(quote.customer||"",180,14),eventLines=wrap(quote.event||"Não informado",170,12);
      const h=Math.max(92,59+nameLines.length*16,69+eventLines.length*14);
      round(m,y,w,h,16,pale);
      icon("person",m+20,y+25);
      text("PREPARADO PARA",m+68,y+25,10,true,blue);
      nameLines.forEach((v,i)=>text(v,m+68,y+45+i*16,14,true));
      fit(quote.phone||"",m+68,y+48+nameLines.length*16,180,12,false,gray);
      line(W/2,y+17,W/2,y+h-17,[.52,.65,.80],.8);
      icon("calendar",W/2+40,y+12);
      text("EVENTO / ENTREGA",W/2+77,y+19,10,true,blue);
      eventLines.forEach((v,i)=>text(v,W/2+77,y+35+i*14,12,true));
      const vt=y+39+eventLines.length*14;
      icon("calendar",W/2+40,vt-4);
      text("VÁLIDO ATÉ",W/2+77,vt+4,10,true,blue);
      text(quote.validUntil?quote.validUntil.split("-").reverse().join("/"):"Não informado",W/2+77,vt+20,13,true);
      y+=h+22;
    }
  }
  function tableHead(){
    section("01","Itens do orçamento",y);
    text(String(items.length).padStart(2,"0")+" ITENS",W-93,y+18,10,false,gray);
    y+=37;
    round(m,y,w,30,7,navy);
    text("DESCRIÇÃO",m+27,y+20,12,true,white);
    text("QTD.",quote.showPrices?365:W-88,y+20,11,true,white);
    if(quote.showPrices){text("UNIT.",423,y+20,10,true,white);text("VALOR",500,y+20,10,true,white);}
    y+=33;
  }
  begin(true);tableHead();
  for(const [idx,item] of items.entries()){
    const labor=isLabor(item),name=String(item.name||""),kind=labor?"service":/pizza/i.test(name)?"pizza":/coca|guaran|refri|bebida|suco/i.test(name)?"drink":"box";
    const lines=wrap(name,quote.showPrices?242:370,12),h=Math.max(39,lines.length*14+24);
    if(y+h>745){begin();tableHead();}
    round(m,y,w,h,8,idx%2?[.95,.97,.99]:[.91,.95,.98]);
    round(m+20,y+4,34,31,8,[.82,.90,.98]);
    icon(kind,m+26,y+8,navy);
    lines.forEach((v,i)=>text(v,m+74,y+15+i*14,12,true));
    text(labor?"SERVIÇO":"PRODUTO",m+74,y+16+lines.length*14,9,false,gray);
    text(String(item.qty).padStart(2,"0"),quote.showPrices?372:W-83,y+24,13,true);
    if(quote.showPrices){fit(currency(item.price),410,y+23,76,10);fit(currency(item.price*item.qty),490,y+23,68,10,true);}
    y+=h+4;
  }
  const address=wrap(store.address||"Consulte a loja",220,11);
  const bottomH=Math.max(123,98+address.length*14);
  if(y+22+bottomH>752)begin();
  y+=22;
  section("02","Retirada na loja",y);
  icon("pin",m+2,y+34,navy);
  address.forEach((v,i)=>text(v,m+33,y+46+i*14,11));
  const phoneY=y+53+address.length*14;
  round(m,phoneY,220,43,9,blue);
  round(m+1,phoneY+1,218,41,8,[.95,.98,1]);
  icon("phone",m+13,phoneY+10,blue);
  text("FALE COM A LOJA",m+54,phoneY+15,9,true,blue);
  fit(store.phone||"Consulte a loja",m+54,phoneY+33,158,15,true);
  line(294,y+12,294,y+bottomH-6,[.76,.82,.89],.8);
  round(314,y,W-314-m,bottomH,16,cyan);
  round(314,y+4,W-314-m,bottomH-8,15,navy);
  text("TOTAL DO ORÇAMENTO",338,y+31,12,true,white);
  fit(currency(quote.total),338,y+75,W-338-m-10,37,true,white);
  icon("box",338,y+85,cyan);
  fit(items.some(isLabor)?"Produtos + mão de obra":"Produtos e serviços",365,y+101,182,12,false,[.83,.9,.98]);
  y+=bottomH+18;
  if(quote.notes){
    const lines=wrap(quote.notes,w-16,10);
    for(let i=0;i<lines.length;i++){
      if(i===0||y+15>745){if(y+38>745)begin();text("OBSERVAÇÕES E CONDIÇÕES",m,y+12,10,true,blue);y+=25;}
      text(lines[i],m,y+10,10);y+=14;
    }
  }
  if(commands)bodies.push(commands);
  for(let p=0;p<bodies.length;p++){
    commands=bodies[p];
    line(m,761,W-m,761,[.73,.79,.86],.8);
    fit(String(store.name||"").toUpperCase(),m+4,784,126,11,true,navy);
    text("/",m+134,784,13,true,blue);
    text("ORÇAMENTO COMERCIAL",m+149,784,10,false,gray);
    text(String(p+1).padStart(2,"0")+" / "+String(bodies.length).padStart(2,"0"),W-68,784,10,false,gray);
    rect(0,814,W,28,navy);
    poly([[0,814],[81,814],[60,842],[0,842]],blue);
    poly([[22,814],[82,814],[61,842],[10,842]],cyan);
    const content=bytes(commands),stream=put([bytes("<< /Length "+content.length+" >>\nstream\n"),content,bytes("\nendstream")]);
    pages.push(put("<< /Type /Page /Parent "+pagesId+" 0 R /MediaBox [0 0 "+W+" "+H+"] /Resources << /Font << /R "+regular+" 0 R /B "+bold+" 0 R >> "+(logoId?"/XObject << /Logo "+logoId+" 0 R >>":"")+" >> /Contents "+stream+" 0 R >>"));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((id) => id + " 0 R").join(" ")}] >>`;
  const chunks = [bytes("%PDF-1.4\n%âãÏÓ\n")],
    offsets = [0];
  let length = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(length);
    const value = Array.isArray(objects[i]) ? objects[i] : [bytes(objects[i])],
      parts = [bytes(`${i + 1} 0 obj\n`), ...value, bytes("\nendobj\n")];
    for (const part of parts) {
      chunks.push(part);
      length += part.length;
    }
  }
  const xref = length;
  chunks.push(
    bytes(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n ")
        .join(
          "\n",
        )}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`,
    ),
  );
  const output = new Uint8Array(chunks.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
