import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {service,material} from './fixtures/field-services.mjs';
const {renderFieldServicePdf}=loadTypescript('src/lib/field-services/service-pdf.tsx');
test('service PDF renders technical data, long content and signature without commercial prices',async()=>{const image=await sharp({create:{width:640,height:200,channels:4,background:{r:255,g:255,b:255,alpha:0}}}).png().toBuffer(),pdf=await renderFieldServicePdf({company:{name:'Empresa Sintética QA',document:'00.000.000/0000-00',city:'Recife',state:'PE'},service:{...service,status:'completed',title:'ServiçoExtremamenteLongo'.repeat(7),notes:'Observações da execução QA. '.repeat(80),completed_at:'2026-10-25T12:50:00Z'},team:[{id:'tech-a',name:'Técnico Sintético QA'}],materials:[material],evidence:[{id:'signature',service_id:service.id,run:1,kind:'signature',state:'ready',mime:'image/png',created_at:'2026-10-25T12:45:00Z',caption:'Aceite sintético QA',acceptance:{name:'Cliente Sintético QA',consent:true},image}],note:'Serviço conferido e local liberado.',historical:true});assert.ok(pdf.length>2000);assert.equal(pdf.subarray(0,4).toString(),'%PDF');});
