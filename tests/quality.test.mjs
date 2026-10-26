import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {source,nc,summary} from './fixtures/quality.mjs';
const {qualityMetrics,qualityReportRows,blocksProduction}=loadTypescript('src/lib/quality/model.ts');
test('quality metrics use declared populations, exclude cancelled cases and block only unresolved rules',()=>{
 const input={...source,cases:[nc,{...nc,id:'closed',status:'closed'},{...nc,id:'cancelled',status:'cancelled'}],summaries:{'nc-a':summary,closed:{...summary,actual:0},cancelled:{...summary,actual:999}}};
 const m=qualityMetrics(input);assert.equal(m.total,2);assert.equal(m.pending,1);assert.equal(m.critical,1);assert.equal(m.actual,12);assert.equal(m.cancelled,1);assert.equal(m.cohort_rate,10);assert.equal(m.rework_rate,100);assert.equal(blocksProduction({...nc,status:'closed'}),false);assert.equal(blocksProduction({...nc,severity:'low',block_completion:false}),false);
});
test('unknown costs and zero observations remain distinct; zero denominators never become rates',()=>{
 const empty={...source,cases:[],summaries:{},cohort:{orders_created:0,orders_with_nc:0},order_value:0};assert.equal(qualityMetrics(empty).actual,null);assert.equal(qualityMetrics(empty).cohort_rate,null);assert.equal(qualityMetrics(empty).rework_rate,null);
 const unknown={...source,summaries:{[nc.id]:{...summary,actual:null,partial:true}}};assert.equal(qualityMetrics(unknown).actual,null);assert.equal(qualityMetrics(unknown).cost_impact,null);
 const zero={...source,summaries:{[nc.id]:{...summary,actual:0}}};assert.equal(qualityMetrics(zero).actual,0);assert.equal(qualityMetrics(zero).cost_impact,0);
});
test('supplier recurrence groups canonical identities rather than equal display names',()=>{
 const input={...source,cases:[nc,{...nc,id:'nc-b',supplier_id:'supplier-b'}]};const rows=qualityReportRows(input,'suppliers');assert.equal(rows.length,2);assert.equal(rows[0].Grupo,rows[1].Grupo);assert.notEqual(rows[0]['Vínculo'],rows[1]['Vínculo']);assert.equal(rows[0]['NCs válidas'],1);
});
test('reports mask money without finance permission and do not infer margin across unrelated origins',()=>{
 const original=structuredClone(source);const masked={...source,permissions:{...source.permissions,finance:false}};for(const mode of ['cases','suppliers','products','categories','causes'])assert.ok(qualityReportRows(masked,mode).every(row=>!Object.keys(row).some(k=>/Custo|Apurações/.test(k))));
 assert.equal(qualityMetrics({...source,cases:[{...nc,order_id:null}]}).cost_impact,null);assert.deepEqual(source,original);
});
