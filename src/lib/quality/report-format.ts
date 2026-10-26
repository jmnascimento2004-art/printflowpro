import {dateLabel,purchaseMoney} from '@/lib/purchasing/model';

/** Display uses the operational calendar; CSV keeps the original typed facts. */
export function qualityReportCell(column:string,value:string|number|null|undefined):string {
 if(value===null||value===undefined)return 'Não informado';
 if(column==='Abertura'||column==='Encerramento')return dateLabel(String(value));
 if(typeof value==='number')return column==='Custo efetivo informado'?purchaseMoney(value):value.toLocaleString('pt-BR',{maximumFractionDigits:6});
 return value;
}
