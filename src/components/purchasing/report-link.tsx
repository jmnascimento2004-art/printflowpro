'use client';
import Link from 'next/link';
import {useAuth} from '@/context/auth-context';
import {useDatabase} from '@/context/database-context';
import {canAccessModule} from '@/lib/module-permissions';
function PurchasingLink({href,label}:{href:string;label:string}){const {activeProfile}=useAuth(),{rolePermissions}=useDatabase();return activeProfile&&canAccessModule(activeProfile.role,'/purchases',rolePermissions)?<Link href={href} className="pf-button-secondary">{label}</Link>:null;}
export function PurchasingReportLink(){return <PurchasingLink href="/purchases?view=reports" label="Relatórios de Compras"/>;}
export function PurchasingStockLink(){return <PurchasingLink href="/purchases?view=low" label="Compras e reposição de estoque"/>;}
