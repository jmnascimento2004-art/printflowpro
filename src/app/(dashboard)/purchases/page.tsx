import {Suspense} from 'react';
import {PurchasingCenter} from '@/components/purchasing/center';
export default function PurchasesPage(){return <Suspense fallback={<p className="p-6">Carregando Compras…</p>}><PurchasingCenter/></Suspense>;}
