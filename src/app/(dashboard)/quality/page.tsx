import {Suspense} from 'react';
import {QualityCenter} from '@/components/quality/quality-center';
export default function QualityPage(){return <Suspense fallback={<p>Carregando Qualidade…</p>}><QualityCenter/></Suspense>;}
