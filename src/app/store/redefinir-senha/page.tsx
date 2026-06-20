'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { StoreAuthPanel } from '@/components/store/StoreAccountShell';
import { StoreField, storeInputClass } from '@/components/store/StoreFormFields';
import { useStoreCustomer } from '@/context/store-customer-context';

export default function StoreResetPasswordPage() {
  const { updatePassword } = useStoreCustomer();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError('A senha precisa ter pelo menos 8 caracteres, com letras e numeros.');
      return;
    }
    if (password !== confirmPassword) {
      setError('A confirmacao de senha precisa ser igual a nova senha.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      setMessage('Senha atualizada com sucesso. Voce ja pode entrar novamente.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Nao foi possivel atualizar a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAuthPanel title="Redefinir senha" subtitle="Crie uma nova senha segura para sua conta do catalogo.">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}
        <StoreField label="Nova senha">
          <input className={storeInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </StoreField>
        <StoreField label="Confirmar senha">
          <input className={storeInputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </StoreField>
        <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-60">
          <KeyRound className="h-4 w-4" />
          {submitting ? 'Salvando...' : 'Salvar nova senha'}
        </button>
        <Link href="/store/login" className="block text-center text-xs font-bold text-slate-500 hover:text-slate-950">Ir para login</Link>
      </form>
    </StoreAuthPanel>
  );
}
