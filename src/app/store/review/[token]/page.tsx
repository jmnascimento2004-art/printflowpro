import type {Metadata} from 'next';
import {ReviewForm} from '@/components/store/review-form';
export const metadata:Metadata={title:'Avaliar produto',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}){return <ReviewForm token={(await params).token}/>;}
