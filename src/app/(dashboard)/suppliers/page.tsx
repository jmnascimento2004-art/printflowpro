import {Suspense} from 'react';
import {PurchasingCenter} from '@/components/purchasing/center';
export default function SuppliersPage(){return <Suspense fallback={<p className="p-6">Carregando Fornecedores…</p>}><PurchasingCenter view="suppliers"/></Suspense>;}
