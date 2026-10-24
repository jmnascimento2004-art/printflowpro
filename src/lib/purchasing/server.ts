import 'server-only';
import {NextResponse} from 'next/server';
export const purchasingHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export function purchasingFailure(error:unknown){
 const e=error as {status?:number;code?:string;message?:string};
 const status=e.status===401?401:/^Payload/.test(e.message||'')?413:e.code==='42501'?403:e.code==='40001'?409:e.code==='P0002'?404:['22023','54000','23514','23505','23503','22P02','22007','22008','23502','22003'].includes(e.code||'')?400:500;
 const friendly=status===401?'Entre novamente para continuar.':status===413?'Arquivo ou comando acima do limite permitido.':status===403?'Sem permissão para esta operação.':status===409?'O registro mudou. Atualize os dados antes de tentar novamente.':status===404?'Registro indisponível para sua empresa.':status===400?'Confira os campos, as parcelas, a unidade e o estado do registro.':'Não foi possível concluir a operação. Tente novamente.';
 const safe=['22023','40001','P0002','42501','54000'].includes(e.code||'')&&/^(Sem permissão|Recebimento |Reversão |Contas a pagar |Cancelamento |Billing:|Selecione |Informe |Quantidade |Fornecedor |Produto |Descrição |Registro |Solicitação |Compra |Somente |Transição |Reverta |Estorne |Confirme |A soma |Total |Documento |Chave |Mais de |Arquivo |Controle|Falha |Estoque |Dados |Comando|Operação)/.test(e.message||'');
 return NextResponse.json({error:safe?e.message:friendly},{status,headers:purchasingHeaders});
}
