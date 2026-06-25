'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { DataSubjectRequestType, dataSubjectRequestLabels } from '@/lib/privacy';
import { StoreField, storeInputClass, storeTextareaClass } from '@/components/store/StoreFormFields';

const requestTypes = Object.keys(dataSubjectRequestLabels) as DataSubjectRequestType[];

export default function StorePrivacyRequestPage() {
  const { company } = useDatabase();
  const [form, setForm] = useState({
    name: '',
    email: '',
    identityHint: '',
    requestType: 'acesso' as DataSubjectRequestType,
    details: '',
    confirmation: false
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/store/privacy-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, companyId: company.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel registrar sua solicitacao.');
      setMessage(data.message || 'Solicitacao registrada.');
      setForm({
        name: '',
        email: '',
        identityHint: '',
        requestType: 'acesso',
        details: '',
        confirmation: false
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nao foi possivel registrar sua solicitacao.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/store/privacidade" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Voltar para privacidade
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Solicitacao de privacidade</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Envie uma solicitacao para {company.name || 'a loja'}. A resposta pode exigir confirmacao segura de identidade
            e nao informaremos por este formulario se determinado CPF ou e-mail possui cadastro.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}

          <StoreField label="Nome">
            <input className={storeInputClass} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </StoreField>

          <StoreField label="E-mail para retorno">
            <input className={storeInputClass} type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
          </StoreField>

          <StoreField label="CPF/CNPJ parcialmente mascarado ou identificador seguro">
            <input
              className={storeInputClass}
              value={form.identityHint}
              onChange={(event) => setForm((current) => ({ ...current, identityHint: event.target.value }))}
              placeholder="Ex: ultimos 4 digitos ou outro dado combinado com a loja"
            />
          </StoreField>

          <StoreField label="Tipo de solicitacao">
            <select
              className={storeInputClass}
              value={form.requestType}
              onChange={(event) => setForm((current) => ({ ...current, requestType: event.target.value as DataSubjectRequestType }))}
            >
              {requestTypes.map((type) => (
                <option key={type} value={type}>{dataSubjectRequestLabels[type]}</option>
              ))}
            </select>
          </StoreField>

          <StoreField label="Descricao">
            <textarea
              className={storeTextareaClass}
              value={form.details}
              onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))}
              rows={5}
              required
            />
          </StoreField>

          <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
            <input
              type="checkbox"
              checked={form.confirmation}
              onChange={(event) => setForm((current) => ({ ...current, confirmation: event.target.checked }))}
              className="mt-1"
              required
            />
            Confirmo que as informacoes enviadas sao verdadeiras e entendo que a loja pode solicitar confirmacao segura
            de identidade antes de responder ou entregar dados pessoais.
          </label>

          <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-60">
            <Send className="h-4 w-4" />
            {submitting ? 'Enviando...' : 'Enviar solicitacao'}
          </button>
        </form>
      </div>
    </main>
  );
}
