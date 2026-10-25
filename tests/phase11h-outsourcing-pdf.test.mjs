import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import React from 'react';
import {renderToBuffer} from '@react-pdf/renderer';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {loadTypescript} from './helpers/load-typescript.mjs';
const {OutsourcingPdf}=loadTypescript('src/lib/composition/outsourcing-pdf.tsx');
function fixture(long=false){return {company:{id:'qa',name:'PrintFlow SaaS QA — Documento sintético',document:'12.345.678/0001-95',phone:'(81) 0000-0000',email:'qa@example.test',street:'Rua de Testes',number:'100',city:'Recife',state:'PE'},orders:[{id:'ot-qa',number:10001,supplier_snapshot:{name:'Fornecedor Sintético QA — Acabamento'},technical_snapshot:{order_number:'PED-9911',product_name:'Banner composto QA',details:{width:1.2,height:0.8}},title:'Acabamento e impressão técnica terceirizada',specification:long?Array.from({length:120},(_,i)=>`${i+1}. Conferir acabamento, impressão, cores e medidas reais de 1,20 × 0,80 m. Documento sintético sem operação comercial real.`).join('\n'):'Conferir acabamento e medidas reais. Lona com perda técnica registrada separadamente no consumo da composição.',quantity:1,unit:'unidade',ordered_date:'2026-10-24',due_date:'2026-10-30',status:'confirmed',estimated_cost:25,freight:5,actual_cost:null,dispatched_at:null,materials_sent:false,dispatch_notes:'',notes:'Exclusivamente QA. Não autoriza compra, cobrança ou pagamento real.'}]};}
test('outsourcing PDF contains A4 identity, linked order, real dimensions and contract facts',async()=>{
 const logo=`data:image/png;base64,${(await readFile('public/icons/icon-192x192.png')).toString('base64')}`,buffer=await renderToBuffer(React.createElement(OutsourcingPdf,{source:fixture(),id:'ot-qa',logos:{logo_url:logo}})),pdf=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise;
 assert.equal(pdf.numPages,1);const page=await pdf.getPage(1),viewport=page.getViewport({scale:1});assert.ok(Math.abs(viewport.width-595.28)<1);assert.ok(Math.abs(viewport.height-841.89)<1);
 const text=(await page.getTextContent()).items.filter(i=>'str'in i).map(i=>i.str).join(' ');for(const value of ['OT-10001','Fornecedor Sintético QA','PED-9911','Largura 1.2 m','Altura 0.8 m','30/10/2026','TOTAL PREVISTO','Página 1 de 1','não comprova pagamento'])assert.ok(text.includes(value),value+' · '+text.slice(-180));
 await mkdir('.local-backup/phase11h-proof',{recursive:true});await writeFile('.local-backup/phase11h-proof/outsourcing-a4-qa.pdf',buffer);await pdf.destroy();
});
test('long outsourcing specification wraps into nonempty pages within A4',async()=>{
 const buffer=await renderToBuffer(React.createElement(OutsourcingPdf,{source:fixture(true),id:'ot-qa'})),pdf=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise;assert.ok(pdf.numPages>1);
 for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),text=(await page.getTextContent()).items.filter(i=>'str'in i&&i.str.trim());assert.ok(text.length>3,`page${n} not blank`);for(const i of text){assert.ok(i.transform[4]>=25&&i.transform[4]+i.width<=575,`page${n} width`);assert.ok(i.transform[5]>=15&&i.transform[5]<=820,`page${n} height`);}}
 await pdf.destroy();
});
