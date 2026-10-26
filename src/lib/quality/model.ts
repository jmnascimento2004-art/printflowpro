export const NC_STATUS = {open:'Aberta',analysis:'Em análise',action_defined:'Ação definida',rework:'Em retrabalho',reinspection:'Aguardando reinspeção',closed:'Encerrada',cancelled:'Cancelada'} as const;
export const SEVERITIES = {low:'Baixa',medium:'Média',high:'Alta',critical:'Crítica'} as const;
export const CATEGORIES = {production_error:'Erro de produção',wrong_material:'Material incorreto',print_defect:'Falha de impressão',wrong_measure:'Medida incorreta',color:'Cor',finishing:'Acabamento',damage:'Avaria',artwork:'Arte',supplier:'Fornecedor',installation:'Instalação',other:'Outro'} as const;
export const ORIGINS = {internal:'Interna',supplier:'Fornecedor',customer:'Cliente',artwork:'Arte',transport:'Transporte',installation:'Instalação',undefined:'Não definida'} as const;
export const SOURCES = {order:'Pedido / item',production:'Produção',purchase:'Compra',receipt:'Recebimento de Compra',outsourcing:'Terceirização',field_service:'Serviço externo'} as const;
export const ACTIONS = {rework:'Retrabalho',reproduction:'Reprodução',substitution:'Substituição',supplier_return:'Devolução ao fornecedor',adjustment:'Ajuste',restricted_acceptance:'Aceite com restrição',no_action:'Sem ação física'} as const;
export const EXECUTIONS = {internal:'Produção interna',outsourced:'Terceirização',field:'Retorno técnico',none:'Registro e conferência'} as const;
export const ACTION_STATUS = {planned:'Planejada',running:'Em execução',done:'Concluída',failed:'Reprovada',superseded:'Substituída por nova versão',cancelled:'Cancelada'} as const;
export const COST_TYPES = {labor:'Mão de obra',machine:'Máquina',outsourcing:'Terceirização',freight:'Frete',field_service:'Retorno técnico',other:'Outro'} as const;
export const ncNumber = (n:number) => `NC-${String(n).padStart(4,'0')}`;
export const activeCase = (n:Nonconformity) => !['closed','cancelled'].includes(n.status);
export const blocksProduction = (n:Nonconformity) => activeCase(n) && (n.severity==='critical'||n.block_completion);

export type ComponentReference = {id:string;product_id:string;name:string;unit:string;quantity:number;basis:string;waste_percent:number;is_optional:boolean;is_outsourced:boolean;stock_controlled:boolean;required?:number};
export type SourceSnapshot = {
 label:string;order_number:string|null;customer_name:string|null;item_name:string|null;supplier_name:string|null;original_quantity:number;order_deadline:string|null;
 details:{width?:number;height?:number;length?:number;configuration_summary?:string;optional_component_ids?:string[]};components:ComponentReference[];
 production:{id:string;status:string;execution_number:number;quantity:number}|null;
 purchase:{id:string;number:number;status:string;receipt_id:string|null;received_at:string|null;item_id:string|null}|null;
 outsourcing:{id:string;number:number;title:string;quantity:number;status:string}|null;
 service:{id:string;number:number;run:number;status:string;order_item_id:string|null;address:Record<string,string>;assigned_profile_id:string|null;team:string[]}|null;
};
export type Nonconformity = {
 id:string;company_id:string;number:number;source_type:keyof typeof SOURCES;source_id:string;order_id:string|null;order_item_id:string|null;product_id:string|null;production_id:string|null;supplier_id:string|null;purchase_id:string|null;purchase_item_id:string|null;receipt_id:string|null;outsourcing_id:string|null;service_id:string|null;
 category:keyof typeof CATEGORIES;severity:keyof typeof SEVERITIES;status:keyof typeof NC_STATUS;problem_origin:keyof typeof ORIGINS;
 description:string;root_cause:string;analysis:string;assigned_profile_id:string|null;responsible_supplier_id:string|null;team:string[];source_snapshot:SourceSnapshot;affected_quantity:number;block_completion:boolean;cost_applicable:boolean;deadline_impact_days:number;cycle:number;action_id:string|null;opened_at:string;closed_at:string|null;created_at:string;created_by:string;updated_at:string;
 can_execute:boolean;can_upload:boolean;cost_version:string|null;has_rework:boolean;action_kind:keyof typeof ACTIONS|null;action_due_date:string|null;action_supplier_id:string|null;
};
export type CorrectiveAction = {
 id:string;company_id:string;nc_id:string;cycle:number;version:number;kind:keyof typeof ACTIONS;execution_mode:keyof typeof EXECUTIONS;state:keyof typeof ACTION_STATUS;quantity:number;assigned_profile_id:string|null;supplier_id:string|null;due_date:string|null;notes:string;result:string;acceptance:string;requires_reinspection:boolean;production_id:string|null;production_run:number|null;production_before:ProductionRow|null;execution_snapshot:ProductionRow|Record<string,unknown>|null;invalidation_reason?:string;outsourcing_id:string|null;return_service_id:string|null;return_run:number|null;started_at:string|null;finished_at:string|null;actor:string;created_at:string;updated_at:string;
};
export type ProductionRow = {id:string;order_id:string;order_item_id:string;product_name:string;quantity:number;status:string;execution_number:number;quality_action_id:string|null;started_at:string|null;finished_at:string|null;updated_at:string};
export type Material = {id:string;nc_id:string;action_id:string;product_id:string;description:string;unit:string;quantity:number;unit_cost?:number;stock_movement_id:string;reversal_movement_id:string|null;created_at:string;reversed_at:string|null;reversal_reason:string|null};
export type QualityCost = {id:string;nc_id:string;action_id:string;kind:keyof typeof COST_TYPES;description:string;planned:number;actual:number|null;effective_actual:number|null;outsourcing_id:string|null;service_id:string|null;service_run:number|null;financial_id:string|null;financial_history:string[];created_at:string;updated_at:string};
export type CostSummary = {planned:number;actual:number|null;partial:boolean;recorded:boolean;required:boolean};
export type Evidence = {id:string;nc_id:string;cycle:number;state:'pending'|'ready'|'removed';path:string;sha256:string;bytes:number;mime:string;caption:string;actor:string;actor_name:string;created_at:string;removed_at:string|null};
export type Reinspection = {id:string;nc_id:string;action_id:string;cycle:number;result:'approved'|'rejected';notes:string;actor:string;actor_name:string;created_at:string};
export type Closure = {id:string;nc_id:string;cycle:number;closed_at:string;actor:string;snapshot:{nc:Nonconformity;action:CorrectiveAction;reinspection:Reinspection|null;team:{id:string;name:string}[];materials:Material[];evidence:Evidence[]};cost_snapshot?:CostSummary&{materials:Material[];costs:QualityCost[]}};
export type QualityEvent = {id:string;nc_id:string;action:string;details:Record<string,unknown>;actor_name:string;created_at:string};
export type QualitySource = {
 company_id:string;profile_id:string;from:string;to:string;timezone:string;report_mode:boolean;
 permissions:{open:boolean;manage:boolean;execute:boolean;close:boolean;reopen:boolean;finance:boolean;reports:boolean;stock:boolean;production:boolean;field_manage:boolean;writable:boolean};
 cases:Nonconformity[];actions:CorrectiveAction[];materials:Material[];costs:QualityCost[];cost_history:{id:string;nc_id:string;cost_id:string;snapshot:Record<string,unknown>;actor:string;created_at:string}[];summaries:Record<string,CostSummary>;current_summary:CostSummary|null;evidence:Evidence[];reinspections:Reinspection[];closures:Closure[];events:QualityEvent[];
 executions:{id:string;production_id:string;execution_number:number;quality_action_id:string|null;snapshot:ProductionRow;recorded_at:string}[];production:ProductionRow[];requirements:ComponentReference[]|null;production_materials:{product_id:string;description:string;quantity:number;unit:string;reversed_at:string|null}[];
 outsourcing:{id:string;number:number;status:string;order_id:string;order_item_id:string;actual_cost:number|null;purchase_order_id:string|null}[];
 returns:{id:string;number:number;status:string;run:number;order_id:string;order_item_id:string|null;completed_at:string|null}[];
 profiles:{id:string;name:string;role:string;can_execute:boolean}[];suppliers:{id:string;name:string}[];products:{id:string;name:string;unit:string;current_stock:number}[];accounts:{id:string;name:string}[];categories:{id:string;name:string}[];transactions:{id:string;status:string;cancelled_at:string|null;amount:number}[];
 cohort:{orders_created:number;orders_with_nc:number};order_value:number|null;
};
export type OriginContext = {source_type:keyof typeof SOURCES;source_id:string;version:string;quantity:number;snapshot:SourceSnapshot;order_id:string|null;order_item_id:string|null;production_id:string|null;purchase_id:string|null;receipt_id:string|null;outsourcing_id:string|null;service_id:string|null;product_id:string|null;supplier_id:string|null;purchase_item_id:string|null};
export type OriginOption = {id:string;label:string;status:string};
export type OriginSearch = {options:OriginOption[];has_more:boolean;offset:number};
export type OriginSelection = {origin:OriginContext;items:{id:string;name:string;quantity:number}[]};
export type QualityLink = {reference_id:string;id:string;number:number;status:Nonconformity['status'];severity:Nonconformity['severity'];blocking:boolean;source_type:Nonconformity['source_type'];source_id:string;order_id:string|null;order_item_id:string|null;description:string;action_id:string|null};
export type QualityExecutionLink={reference_id:string;execution_number:number;quantity:number;quality_action_id:string|null;nc_id:string|null;number:number|null;action_state:CorrectiveAction['state']|null};

export function qualityMetrics(source:QualitySource) {
 const valid=source.cases.filter(n=>n.status!=='cancelled'),pending=valid.filter(activeCase),reworked=valid.filter(n=>n.has_rework);
 const facts=valid.map(n=>source.summaries[n.id]).filter((s):s is CostSummary=>!!s),known=facts.filter(s=>s.recorded&&s.actual!==null);
 const actual=known.length?Math.round(known.reduce((sum,s)=>sum+Number(s.actual),0)*100)/100:null;
 const partial=facts.some(s=>s.partial||s.required&&!s.recorded);
 const reworkFacts=reworked.map(n=>source.summaries[n.id]).filter((s):s is CostSummary=>!!s),reworkKnown=reworkFacts.filter(s=>s.recorded&&s.actual!==null);
 return {total:valid.length,pending:pending.length,open:valid.filter(n=>n.status==='open').length,analysis:valid.filter(n=>n.status==='analysis').length,in_rework:valid.filter(n=>n.status==='rework').length,awaiting_reinspection:valid.filter(n=>n.status==='reinspection').length,critical:pending.filter(n=>n.severity==='critical').length,blocked:pending.filter(blocksProduction).length,reworked:reworked.length,rework_rate:valid.length?reworked.length/valid.length*100:null,rework_actual:reworkKnown.length?Math.round(reworkKnown.reduce((sum,s)=>sum+Number(s.actual),0)*100)/100:null,rework_partial:reworkFacts.some(s=>s.partial||s.required&&!s.recorded),closed:valid.filter(n=>n.status==='closed').length,cancelled:source.cases.length-valid.length,actual,partial,cohort_rate:source.cohort.orders_created?source.cohort.orders_with_nc/source.cohort.orders_created*100:null,cost_impact:actual!==null&&!partial&&source.order_value&&valid.every(n=>!!n.order_id)?actual/source.order_value*100:null};
}
export function qualityReportRows(source:QualitySource,mode='cases'):Record<string,string|number|null>[] {
 const valid=source.cases.filter(n=>n.status!=='cancelled');
 if(['categories','suppliers','products','causes'].includes(mode)) {
  const groups=new Map<string,{label:string;rows:Nonconformity[]}>();
  for(const n of valid){
   const key=mode==='categories'?n.category:mode==='suppliers'?n.supplier_id||'none':mode==='products'?n.product_id||'none':n.root_cause.trim()||'Causa não definida';
   const label=mode==='categories'?CATEGORIES[n.category]:mode==='suppliers'?n.source_snapshot.supplier_name||'Sem fornecedor na origem':mode==='products'?n.product_id?n.source_snapshot.item_name||'Produto vinculado':'Sem produto canônico vinculado':key;
   const group=groups.get(key)||{label,rows:[]};group.rows.push(n);groups.set(key,group);
  }
  return [...groups].map(([key,{label,rows}])=>({Grupo:label,...(['suppliers','products'].includes(mode)?{Vínculo:key==='none'?'Não informado':key}:{}),'NCs válidas':rows.length,Pendentes:rows.filter(activeCase).length,Críticas:rows.filter(n=>activeCase(n)&&n.severity==='critical').length,Retrabalhos:rows.filter(n=>n.has_rework).length,...(source.permissions.finance?{'Custo efetivo informado':rows.some(n=>source.summaries[n.id]?.actual!==null&&source.summaries[n.id]?.recorded)?Math.round(rows.reduce((sum,n)=>sum+Number(source.summaries[n.id]?.actual||0),0)*100)/100:null,'Apurações pendentes':rows.filter(n=>source.summaries[n.id]?.partial||n.cost_applicable&&!source.summaries[n.id]?.recorded).length}:{})}));
 }
 return source.cases.map(n=>({NC:ncNumber(n.number),Abertura:n.opened_at,Origem:SOURCES[n.source_type],Referência:n.source_snapshot.label,Pedido:n.source_snapshot.order_number,Item:n.source_snapshot.item_name,Fornecedor:n.source_snapshot.supplier_name,Categoria:CATEGORIES[n.category],Gravidade:SEVERITIES[n.severity],Estado:NC_STATUS[n.status],Responsabilidade:ORIGINS[n.problem_origin],Descrição:n.description,Causa:n.root_cause||null,'Quantidade afetada':n.affected_quantity,'Ciclo atual':n.cycle,'Retrabalho registrado':n.has_rework?'Sim':'Não','Bloqueia conclusão':blocksProduction(n)?'Sim':'Não','Impacto de prazo (dias)':n.deadline_impact_days,Encerramento:n.closed_at,...(source.permissions.finance?{'Custo efetivo informado':source.summaries[n.id]?.actual??null,'Custo pendente':source.summaries[n.id]?.partial||n.cost_applicable&&!source.summaries[n.id]?.recorded?'Sim':'Não'}:{})}));
}
