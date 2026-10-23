import {PaymentLinksCenter} from '@/components/payments/payment-links-center';
export default async function PaymentLinksPage({searchParams}:{searchParams:Promise<{order?:string}>}){return <PaymentLinksCenter orderId={(await searchParams).order}/>;}
