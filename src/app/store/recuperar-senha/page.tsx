'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { StoreAuthPanel } from '@/components/store/StoreAccountShell';
import { StoreField, storeInputClass } from '@/components/store/StoreFormFields';
import { useStoreCustomer } from '@/context/store-customer-context';

export default function StoreRecoverPasswordPage() {
  const { sendPasswordReset } = useStoreCustomer();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await sendPasswordReset(email);
      setMessage('Enviamos um link de redefinição para seu e-mail.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Não foi possível enviar a recuperação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAuthPanel title="Recuperar senha" subtitle="Informe seu e-mail para receber um link seguro de redefinição.">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}
        <StoreField label="E-mail">
          <input className={storeInputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </StoreField>
        <button type="submit" disabled={submitting} className="pf-button-primary h-12 w-full">
          <Mail className="h-4 w-4" />
          {submitting ? 'Enviando...' : 'Enviar link'}
        </button>
        <Link href="/store/login" className="block text-center text-xs font-bold text-slate-500 hover:text-slate-950">Voltar ao login</Link>
      </form>
    </StoreAuthPanel>
  );
}
