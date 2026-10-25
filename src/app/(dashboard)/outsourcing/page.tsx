import {Suspense} from 'react';
import {OutsourcingCenter} from '@/components/composition/outsourcing-center';
export default function Page(){return <Suspense fallback={<p>Carregando terceirizações…</p>}><OutsourcingCenter/></Suspense>;}
