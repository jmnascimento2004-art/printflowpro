'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { StoreAuthPanel } from '@/components/store/StoreAccountShell';
import { StoreField, storeInputClass } from '@/components/store/StoreFormFields';
import { useStoreCustomer } from '@/context/store-customer-context';

export default function StoreLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useStoreCustomer();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await signIn(email, password);
      router.push(params.get('redirect') || '/store/conta');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Nao foi possivel entrar. Confira e-mail e senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAuthPanel
      title="Entrar na sua conta"
      subtitle="Acompanhe pedidos, salve enderecos e finalize orcamentos com seus dados preenchidos."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}

        <StoreField label="E-mail">
          <input className={storeInputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </StoreField>

        <StoreField label="Senha">
          <input className={storeInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </StoreField>

        <button
          type="submit"
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" />
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="flex flex-col gap-2 text-center text-xs font-bold text-slate-500 sm:flex-row sm:justify-between">
          <Link href="/store/recuperar-senha" className="hover:text-slate-900">Esqueci minha senha</Link>
          <Link href="/store/cadastro" className="hover:text-slate-900">Criar conta</Link>
        </div>
      </form>
    </StoreAuthPanel>
  );
}
