import {Suspense} from 'react';
import {FieldCenter} from '@/components/field-services/field-center';
export default function FieldServicesPage(){return <Suspense fallback={<p>Carregando serviços externos…</p>}><FieldCenter/></Suspense>;}
