'use client';

import Link from 'next/link';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { StoreAuthPanel } from '@/components/store/StoreAccountShell';
import { sanitizeStoreRedirect, STORE_ROUTES, withStoreRedirect } from '@/lib/store-routes';

export default function StoreSignupSuccessPage() {
  const params = useSearchParams();
  const email = params.get('email')?.trim() || '';
  const redirect = sanitizeStoreRedirect(params.get('redirect'));
  const loginHref = withStoreRedirect(STORE_ROUTES.login, redirect || STORE_ROUTES.account);

  return (
    <StoreAuthPanel
      title="Conta criada"
      subtitle="Seu cadastro foi recebido. Confirme o e-mail para liberar o acesso a area do cliente."
    >
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-left">
          <div className="flex gap-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-black text-emerald-800">Confira seu e-mail</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-emerald-700">
                {email
                  ? `Enviamos a confirmacao para ${email}. Depois de confirmar, entre para acessar sua conta.`
                  : 'Enviamos a confirmacao para o e-mail cadastrado. Depois de confirmar, entre para acessar sua conta.'}
              </p>
            </div>
          </div>
        </div>

        <Link
          href={loginHref}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white"
        >
          Ir para login
        </Link>

        <Link href={STORE_ROUTES.home} className="inline-flex text-xs font-black text-slate-500 hover:text-slate-950">
          Voltar ao catalogo
        </Link>
      </div>
    </StoreAuthPanel>
  );
}
