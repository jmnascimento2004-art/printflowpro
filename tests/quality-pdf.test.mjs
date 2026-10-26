import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {pdfData,summary} from './fixtures/quality.mjs';
const {renderQualityPdf}=loadTypescript('src/lib/quality/quality-pdf.tsx');
export async function readQualityPdf(bytes){const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});try{const pdf=await task.promise;let text='';for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),content=await page.getTextContent();text+=content.items.map(i=>i.str).join(' ')+'\n';}return {text,pages:pdf.numPages};}finally{await task.destroy();}}
test('technical quality PDF has no cost values; cancelled records never claim approved closure',async()=>{
 const bytes=await renderQualityPdf({...pdfData,nc:{...pdfData.nc,status:'cancelled',closed_at:'2026-10-25T14:00:00Z'}});const {text}=await readQualityPdf(bytes);assert.match(text,/NC-0012/);assert.match(text,/não representa encerramento aprovado/);assert.doesNotMatch(text,/Previsto:|Efetivo:|R\$/);assert.match(text,/duas unidades/);
});
test('quality PDF preserves long analysis, selected image, failed action reason and historical costs',async()=>{
 const image=await sharp({create:{width:600,height:220,channels:3,background:'#dbeafe'}}).png().toBuffer();
 const bytes=await renderQualityPdf({...pdfData,historical:true,nc:{...pdfData.nc,description:'TextoExtremamenteLongoSemEspaços'.repeat(8),analysis:'Conferência técnica sintética. '.repeat(140),status:'closed',closed_at:'2026-10-25T14:00:00Z'},summary,actions:[{...pdfData.actions[0],state:'failed',invalidation_reason:'Recebimento revertido com motivo auditado.'}],evidence:[{id:'image',mime:'image/png',state:'ready',caption:'Foto sintética selecionada',created_at:'2026-10-25T13:00:00Z',actor_name:'Técnico QA',image}],closedBy:'Responsável QA'});
 const {text,pages}=await readQualityPdf(bytes);assert.ok(pages>1);assert.match(text,/Foto sintética selecionada/);assert.match(text,/Recebimento revertido/);assert.match(text,/Custos preservados/);assert.match(text,/12,00/);assert.match(text,/Responsável QA/);assert.ok(bytes.length>3000);
});
