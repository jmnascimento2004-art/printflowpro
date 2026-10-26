import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {pdfData,summary} from './fixtures/quality.mjs';
const {renderQualityPdf}=loadTypescript('src/lib/quality/quality-pdf.tsx');
export async function readQualityPdf(bytes){const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});try{const pdf=await task.promise;const pageTexts=[];for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),content=await page.getTextContent();pageTexts.push(content.items.map(i=>i.str).join(' '));}return {text:pageTexts.join('\n'),pages:pdf.numPages,pageTexts};}finally{await task.destroy();}}
test('technical quality PDF has no cost values; cancelled records never claim approved closure',async()=>{
 const bytes=await renderQualityPdf({...pdfData,nc:{...pdfData.nc,status:'cancelled',closed_at:'2026-10-25T14:00:00Z'}});const {text}=await readQualityPdf(bytes);assert.match(text,/NC-0012/);assert.match(text,/não representa encerramento aprovado/);assert.doesNotMatch(text,/Previsto:|Efetivo:|R\$/);assert.match(text,/duas unidades/);
});
test('quality PDF preserves long analysis, selected image, failed action reason and historical costs',async()=>{
 const image=await sharp({create:{width:600,height:220,channels:3,background:'#dbeafe'}}).png().toBuffer();
 const bytes=await renderQualityPdf({...pdfData,historical:true,nc:{...pdfData.nc,description:'TextoExtremamenteLongoSemEspaços'.repeat(8),analysis:'Conferência técnica sintética. '.repeat(140),status:'closed',closed_at:'2026-10-25T14:00:00Z'},summary,actions:[{...pdfData.actions[0],state:'failed',invalidation_reason:'Recebimento revertido com motivo auditado.'}],evidence:[{id:'image',mime:'image/png',state:'ready',caption:'Foto sintética selecionada',created_at:'2026-10-25T13:00:00Z',actor_name:'Técnico QA',image}],closedBy:'Responsável QA'});
 const {text,pages}=await readQualityPdf(bytes);assert.ok(pages>1);assert.match(text,/Foto sintética selecionada/);assert.match(text,/Recebimento revertido/);assert.match(text,/Custos preservados/);assert.match(text,/12,00/);assert.match(text,/Responsável QA/);assert.ok(bytes.length>3000);
});
test('quality materials heading remains on the page containing its first material at a real closure boundary',async()=>{
 const nc={...pdfData.nc,number:1,status:'closed',closed_at:'2026-10-26T02:18:47Z',description:'Fixture sintética QA11J: duas unidades do lote de dez apresentam falha de impressão. Sem operação real.',analysis:'Conferência QA: duas unidades afetadas; oito preservadas. Corrigir somente o lote afetado e consumir material adicional explicitamente.',root_cause:'Configuração de impressão sintética fora do padrão do lote.',source_snapshot:{label:'PED-0004 · Composto Sintético QA11J 20261025',customer_name:'Cliente Sintético QA11H 20261024',item_name:'Composto Sintético QA11J 20261025',details:{}}};
 const bytes=await renderQualityPdf({...pdfData,company:{name:'PrintFlow SaaS QA 20261023',email:'qa@example.test'},nc,historical:true,team:[{id:'qa',name:'JOMAR'}],actions:[{...pdfData.actions[0],kind:'reproduction',due_date:'2026-10-27',notes:'Reproduzir somente as duas unidades afetadas, preservando o Pedido de dez e o consumo original. Confirmar 4,2 unidades de material adicional real da fixture.',result:'Duas unidades sintéticas reproduzidas e conferidas; oito unidades originais preservadas. Material adicional de 4,2 unidades confirmado no Estoque.'}],materials:[{id:'material',description:'Material Adicional Sintético QA11J 20261025',quantity:4.2,unit:'unidade',reversed_at:null}],closedBy:'JOMAR'});
 const {pageTexts}=await readQualityPdf(bytes);const heading=pageTexts.findIndex(t=>t.includes('Materiais adicionais')),material=pageTexts.findIndex(t=>t.includes('Material Adicional Sintético QA11J'));assert.ok(heading>=0);assert.equal(heading,material,'heading cannot remain alone at the end of the preceding page');
});
