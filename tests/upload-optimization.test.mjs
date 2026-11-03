import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function harness(encodedSize){
 const window={},sizes=[];
 const canvas={getContext:()=>({drawImage(_bitmap,_x,_y,w,h){sizes.push([w,h])}}),toBlob(callback){callback(new Blob([new Uint8Array(encodedSize)],{type:'image/webp'}))}};
 vm.runInNewContext(readFileSync(new URL('../SITE/bolt-upload-optimize.js',import.meta.url),'utf8'),{
  window,Blob,File,DataView,document:{createElement:()=>canvas},createImageBitmap:async()=>({width:2400,height:1200,close(){}})
 });
 return {optimize:window.BOLT_UPLOAD.image,sizes};
}

test('large photos are resized and the upload filename and MIME match the result',async()=>{
 const {optimize,sizes}=harness(400);
 const file=new File([new Uint8Array(2000)],'logo.png',{type:'image/png'});
 const result=await optimize(file,{maxEdge:1200,maxBytes:500});
 assert.equal(result.name,'logo.webp');
 assert.equal(result.type,'image/webp');
 assert.equal(result.size,400);
 assert.deepEqual(sizes[0],[1200,600]);
});

test('small originals are retained when encoding would increase the file size',async()=>{
 const {optimize}=harness(600);
 const file=new File([new Uint8Array(200)],'logo.png',{type:'image/png'});
 assert.equal(await optimize(file,{maxBytes:500}),file);
 await assert.rejects(optimize(new File(['x'],'doc.xlsx',{type:'application/octet-stream'})),/JPG, PNG ou WebP/);
});
