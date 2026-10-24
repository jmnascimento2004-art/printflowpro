const safeMessages=new Set([
 'Billing: Assinatura em modo somente leitura. Seus dados e exportações estão preservados.',
 'Billing: Recurso indisponível no plano. Consulte Plano e Assinatura.',
 'Billing: Operação concorrente. Atualize e tente novamente.',
]);
export function billingErrorMessage(error){
 if(!error||!['42501','40001'].includes(error.code)||typeof error.message!=='string')return null;
 return safeMessages.has(error.message)||/^Billing: Limite de [1-9][0-9]{0,5} (usuários ativos|produtos) do plano atingido\. Consulte Plano e Assinatura\.$/.test(error.message)?error.message:null;
}
