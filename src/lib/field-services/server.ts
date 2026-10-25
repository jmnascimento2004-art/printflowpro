import 'server-only';
import {NextResponse} from 'next/server';
import {purchasingFailure,purchasingHeaders} from '@/lib/purchasing/server';
export function fieldFailure(error:unknown){const e=error as {code?:string;message?:string};if(['22023','40001','42501','P0002','54000'].includes(e.code||'')&&/^(Serviço|Sem permissão|Billing:)/.test(e.message||''))return NextResponse.json({error:e.message},{status:e.code==='42501'?403:e.code==='40001'?409:e.code==='P0002'?404:400,headers:purchasingHeaders});return purchasingFailure(error);}
