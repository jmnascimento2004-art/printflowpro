import {Suspense} from 'react';
import {ProductComposition} from '@/components/composition/product-editor';
export default function Page(){return <Suspense fallback={<p>Carregando composição…</p>}><ProductComposition/></Suspense>;}
