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
      setError('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
      return;
    }
    if (password !== confirmPassword) {
      setError('A confirmação de senha precisa ser igual à nova senha.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      setMessage('Senha atualizada com sucesso. Você já pode entrar novamente.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Não foi possível atualizar a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAuthPanel title="Redefinir senha" subtitle="Crie uma nova senha segura para sua conta do catálogo.">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}
        <StoreField label="Nova senha">
          <input className={storeInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </StoreField>
        <StoreField label="Confirmar senha">
          <input className={storeInputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </StoreField>
        <button type="submit" disabled={submitting} className="pf-button-primary h-12 w-full">
          <KeyRound className="h-4 w-4" />
          {submitting ? 'Salvando...' : 'Salvar nova senha'}
        </button>
        <Link href="/store/login" className="block text-center text-xs font-bold text-slate-500 hover:text-slate-950">Ir para login</Link>
      </form>
    </StoreAuthPanel>
  );
}
