import {FiscalCenter} from '@/components/fiscal/fiscal-center';
export default async function FiscalPage({searchParams}:{searchParams:Promise<{order?:string}>}){return <FiscalCenter orderId={(await searchParams).order}/>;}
