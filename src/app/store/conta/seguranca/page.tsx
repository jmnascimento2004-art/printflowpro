'use client';

import React, { useState } from 'react';
import { LockKeyhole, Save } from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { StoreField, storeInputClass } from '@/components/store/StoreFormFields';
import { useStoreCustomer } from '@/context/store-customer-context';

export default function StoreAccountSecurityPage() {
  const { user, signIn, updatePassword } = useStoreCustomer();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!user?.email) {
      setError('Sessão inválida. Entre novamente para alterar a senha.');
      return;
    }

    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('A nova senha precisa ter pelo menos 8 caracteres, com letras e números.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação precisa ser igual à nova senha.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(user.email, currentPassword);
      await updatePassword(newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Senha alterada com sucesso.');
    } catch (securityError) {
      setError(securityError instanceof Error ? securityError.message : 'Não foi possível alterar a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAccountShell title="Segurança e senha" subtitle="Altere sua senha de acesso com validação da senha atual.">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <LockKeyhole className="h-5 w-5 text-slate-500" />
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            A senha é atualizada diretamente no Supabase Auth. Ela não é salva em tabelas próprias do sistema.
          </p>
        </div>

        <StoreField label="Senha atual">
          <input
            className={storeInputClass}
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </StoreField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StoreField label="Nova senha">
            <input
              className={storeInputClass}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </StoreField>
          <StoreField label="Confirmar nova senha">
            <input
              className={storeInputClass}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </StoreField>
        </div>

        <button type="submit" disabled={submitting} className="pf-button-primary h-12 w-full sm:w-auto sm:px-6">
          <Save className="h-4 w-4" />
          {submitting ? 'Alterando...' : 'Alterar senha'}
        </button>
      </form>
    </StoreAccountShell>
  );
}
