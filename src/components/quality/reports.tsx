'use client';
import {useState} from 'react';
import {exportCsv} from '@/lib/reports/report-model';
import {qualityMetrics,qualityReportRows,type QualitySource} from '@/lib/quality/model';
import {purchaseMoney} from '@/lib/purchasing/model';
import {Empty,Field,purchaseField as field} from '@/components/purchasing/shared';

export function QualityReports({source}:{source:QualitySource}) {
 const [mode,setMode]=useState('cases'),[page,setPage]=useState(0);
 if(!source.permissions.reports||!source.report_mode)return <p role="alert">Relatórios indisponíveis para este plano ou perfil.</p>;
 const rows=qualityReportRows(source,mode),columns=Object.keys(rows[0]||{}),metrics=qualityMetrics(source);
 function download() {
  const csv=exportCsv(rows,columns.map(key=>[key,key])),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`qualidade-${mode}-${source.from}-${source.to}.csv`;anchor.click();URL.revokeObjectURL(url);
 }
 return <section className="space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Relatório de Qualidade"><select className={field} value={mode} onChange={e=>{setMode(e.target.value);setPage(0);}}><option value="cases">NCs e retrabalhos</option><option value="categories">Categorias</option><option value="suppliers">Fornecedores de origem</option><option value="products">Produtos</option><option value="causes">Causas registradas</option></select></Field><button className="pf-button-secondary" disabled={!rows.length} onClick={download}>Exportar CSV</button></div>
  <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
   <p>Período de abertura da NC: {source.from} a {source.to}, em {source.timezone}. Estados e ciclo atual são consultados agora. Canceladas aparecem no relatório detalhado e são excluídas dos agrupamentos e taxas.</p>
   <p>Retrabalho: NC válida com pelo menos uma ação de retrabalho/reprodução iniciada ÷ NCs válidas abertas no período. {metrics.reworked}/{metrics.total}{metrics.rework_rate===null?' · sem base':` · ${metrics.rework_rate.toFixed(1)}%`}.</p>
   <p>Pedidos com NC na coorte: Pedidos criados no período, de qualquer estado, com ao menos uma NC válida aberta no mesmo período ÷ Pedidos criados no período. {source.cohort.orders_with_nc}/{source.cohort.orders_created}{metrics.cohort_rate===null?' · sem base':` · ${metrics.cohort_rate.toFixed(1)}%`}.</p>
   <p>Recorrência mostra contagens pelos vínculos e pelas causas literalmente registradas. Não estima causalidade nem atribui uma nota ao fornecedor.</p>
   {source.permissions.finance&&<p>Custo informado: {metrics.actual===null?'não informado':purchaseMoney(metrics.actual)}{metrics.partial?' · apuração pendente':''}. Encerradas preservam o valor do fechamento atual; reabertura é explícita. Impacto comercial compara custo adicional informado ao valor atual dos Pedidos afetados, sem estimar margem líquida ou alterar a DRE.</p>}
  </div>
  {!rows.length?<Empty>Nenhuma NC neste período.</Empty>:<div className="max-w-full overflow-x-auto rounded-xl border"><table className="w-full text-left text-xs"><thead className="bg-muted/50"><tr>{columns.map(c=><th key={c} className="whitespace-nowrap px-3 py-3">{c}</th>)}</tr></thead><tbody>{rows.slice(page*50,page*50+50).map((row,index)=><tr key={index} className="border-t">{columns.map(c=><td key={c} className="min-w-28 max-w-72 break-words px-3 py-3 align-top">{row[c]===null||row[c]===undefined?'Não informado':String(row[c])}</td>)}</tr>)}</tbody></table></div>}
  <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{rows.length} linhas · Página {page+1}</span><div className="flex gap-2"><button className="pf-button-secondary" disabled={!page} onClick={()=>setPage(v=>v-1)}>Anterior</button><button className="pf-button-secondary" disabled={(page+1)*50>=rows.length} onClick={()=>setPage(v=>v+1)}>Próxima</button></div></div>
 </section>;
}
