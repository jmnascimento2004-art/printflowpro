import {Suspense} from 'react';
import {ProductionNeeds} from '@/components/composition/production-needs';
export default function Page(){return <Suspense fallback={<p>Carregando componentes…</p>}><ProductionNeeds/></Suspense>;}
