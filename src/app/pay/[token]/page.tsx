import {PublicPayment} from '@/components/payments/public-payment';
export const dynamic='force-dynamic';
export const metadata={title:'Link de Pagamento',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function PaymentPage({params}:{params:Promise<{token:string}>}){return <PublicPayment token={(await params).token}/>;}
