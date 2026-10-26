import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {qualityFailure} from '@/lib/quality/server';
import {renderQualityPdf,type QualityPdfData} from '@/lib/quality/quality-pdf';
import {ncNumber,type QualitySource} from '@/lib/quality/model';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {
  const access=await authenticatePdfRequest(request),client=getAuthenticatedPdfClient(request),p=new URL(request.url).searchParams,id=p.get('id');
  if(!id)throw {code:'22023',message:'Qualidade: Informe a NC.'};
  const {data,error}=await client.rpc('quality_source',{p_id:id});if(error)throw error;
  const source=data as QualitySource,nc=source.cases.find(n=>n.id===id);
  if(!nc)throw {code:'P0002',message:'Qualidade: NC indisponível.'};
  const cycle=Number(p.get('cycle')||nc.cycle);
  if(!Number.isInteger(cycle)||cycle<1)throw {code:'22023',message:'Qualidade: Ciclo inválido.'};
  const closure=source.closures.find(c=>c.cycle===cycle);
  if(!closure&&cycle!==nc.cycle)throw {code:'P0002',message:'Qualidade: Encerramento indisponível.'};
  const issuer=await client.from('companies').select('name,document,phone,email,city,state,logo_url,logo_light,logo_dark').eq('id',access.companyId).single();if(issuer.error)throw issuer.error;
  const files=(closure?.snapshot.evidence||source.evidence.filter(e=>e.cycle===cycle&&e.state!=='pending')).map(e=>({...e,state:source.evidence.find(current=>current.id===e.id)?.state||'removed'}));
  const selected=p.has('evidence')?(p.get('evidence')||'').split(',').filter(Boolean):null;
  if(selected&&(selected.length>25||selected.some(id=>!files.some(e=>e.id===id))))throw {code:'22023',message:'Qualidade: Seleção de evidências inválida.'};
  const evidence:QualityPdfData['evidence']=[];
  for(const file of files.filter(e=>e.state==='removed'||!selected||selected.includes(e.id))) {
   if(file.state==='ready'){const downloaded=await client.storage.from('quality-evidence').download(file.path);if(downloaded.error)throw downloaded.error;evidence.push({...file,image:Buffer.from(await downloaded.data.arrayBuffer())});}
   else evidence.push(file);
  }
  const snapshot=closure?.snapshot;
  const actions=source.actions.filter(a=>a.cycle===cycle&&(!snapshot||a.version<=snapshot.action.version));
  const pdf=await renderQualityPdf({company:issuer.data,nc:snapshot?.nc||nc,cycle,historical:!!closure,team:snapshot?.team||source.profiles.filter(p=>p.id===nc.assigned_profile_id||nc.team.includes(p.id)),actions,reinspections:source.reinspections.filter(r=>r.cycle===cycle),materials:snapshot?.materials||source.materials,...(source.permissions.finance?{summary:closure?.cost_snapshot||source.summaries[nc.id],costs:closure?.cost_snapshot?.costs||source.costs}:{}),evidence,closedBy:source.events.find(e=>e.action==='nc_closed'&&Number(e.details.cycle)===cycle)?.actor_name||'Responsável registrado'},issuer.data);
  return new Response(new Uint8Array(pdf),{headers:{...purchasingHeaders,'Content-Type':'application/pdf','Content-Disposition':`${p.get('download')==='1'?'attachment':'inline'}; filename="${ncNumber(nc.number)}-ciclo-${cycle}.pdf"`}});
 } catch(error) {return qualityFailure(error);}
}
