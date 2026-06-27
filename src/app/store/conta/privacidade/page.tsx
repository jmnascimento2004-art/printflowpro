'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Save } from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { StoreField, storeTextareaClass } from '@/components/store/StoreFormFields';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';
import { useStorePrivacy } from '@/context/store-privacy-context';
import { supabase } from '@/lib/supabaseClient';
import {
  COOKIE_POLICY_VERSION,
  DataSubjectRequestType,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  dataSubjectRequestLabels,
  maskEmail
} from '@/lib/privacy';
import { maskDocument } from '@/lib/store-customer';

type ConsentRow = {
  id: string;
  consent_type: string;
  granted: boolean;
  policy_version: string;
  created_at: string;
};

type RequestRow = {
  id: string;
  request_type: DataSubjectRequestType;
  status: string;
  request_details: string;
  requested_at: string;
  response_details?: string | null;
};

const requestTypes = Object.keys(dataSubjectRequestLabels) as DataSubjectRequestType[];

export default function StoreAccountPrivacyPage() {
  const { company } = useDatabase();
  const { customer, user } = useStoreCustomer();
  const {
    cookiePreferences,
    saveCookiePreferences,
    recordConsent
  } = useStorePrivacy();
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [marketingWhatsapp, setMarketingWhatsapp] = useState(false);
  const [requestType, setRequestType] = useState<DataSubjectRequestType>('acesso');
  const [requestDetails, setRequestDetails] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPrivacyData = async () => {
    if (!company.id || !customer?.id) return;

    const [
      { data: consentData, error: consentError },
      { data: requestData, error: requestError }
    ] = await Promise.all([
      supabase
        .from('customer_consents')
        .select('id, consent_type, granted, policy_version, created_at')
        .eq('company_id', company.id)
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('data_subject_requests')
        .select('id, request_type, status, request_details, requested_at, response_details')
        .eq('company_id', company.id)
        .eq('customer_id', customer.id)
        .order('requested_at', { ascending: false })
    ]);

    if (consentError || requestError) {
      const privacyError = consentError || requestError;
      setError(privacyError?.message || 'Não foi possível carregar seus dados de privacidade agora.');
      setConsents([]);
      setRequests([]);
      setMarketingEmail(false);
      setMarketingWhatsapp(false);
      return;
    }

    const nextConsents = (consentData || []) as ConsentRow[];
    setError('');
    setConsents(nextConsents);
    setRequests((requestData || []) as RequestRow[]);
    setMarketingEmail(Boolean(nextConsents.find((item) => item.consent_type === 'marketing_email')?.granted));
    setMarketingWhatsapp(Boolean(nextConsents.find((item) => item.consent_type === 'marketing_whatsapp')?.granted));
  };

  useEffect(() => {
    loadPrivacyData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, customer?.id]);

  const saveMarketing = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await recordConsent('marketing_email', marketingEmail, 'store_account_privacy', PRIVACY_POLICY_VERSION);
      await recordConsent('marketing_whatsapp', marketingWhatsapp, 'store_account_privacy', PRIVACY_POLICY_VERSION);
      await loadPrivacyData();
      setMessage('Preferências de marketing atualizadas.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar suas preferências.');
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async () => {
    if (!company.id || !customer?.id || !user?.id || requestDetails.trim().length < 10) {
      setError('Descreva sua solicitação com pelo menos 10 caracteres.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    const { error: requestError } = await supabase.from('data_subject_requests').insert({
      company_id: company.id,
      customer_id: customer.id,
      auth_user_id: user.id,
      requester_name: customer.name,
      requester_email: customer.email || user.email || null,
      request_type: requestType,
      status: 'recebida',
      request_details: requestDetails.trim(),
      source: 'store_account_privacy'
    });

    if (requestError) {
      setError('Não foi possível registrar a solicitação agora.');
    } else {
      setRequestDetails('');
      setMessage('Solicitação registrada. A loja avaliará o pedido e poderá solicitar confirmação adicional.');
      await loadPrivacyData();
    }
    setSaving(false);
  };

  return (
    <StoreAccountShell
      title="Privacidade"
      subtitle="Gerencie consentimentos, cookies e solicitações relacionadas aos seus dados pessoais."
    >
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-950">Dados básicos cadastrados</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><span className="block text-xs font-bold text-slate-400">Nome</span><strong>{customer?.name || '-'}</strong></div>
          <div><span className="block text-xs font-bold text-slate-400">Documento</span><strong>{maskDocument(customer?.document || '')}</strong></div>
          <div><span className="block text-xs font-bold text-slate-400">E-mail</span><strong>{maskEmail(customer?.email || user?.email || '-')}</strong></div>
          <div><span className="block text-xs font-bold text-slate-400">Telefone</span><strong>{customer?.phone || '-'}</strong></div>
        </div>
        <Link href="/store/conta/perfil" className="mt-4 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700">
          Atualizar dados permitidos
        </Link>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-950">Preferências de marketing</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Comunicações sobre pedido, pagamento, entrega e suporte continuam sendo usadas quando necessárias ao atendimento.
          Campanhas promocionais dependem de consentimento opcional.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={marketingEmail} onChange={(event) => setMarketingEmail(event.target.checked)} />
            E-mail promocional
          </label>
          <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={marketingWhatsapp} onChange={(event) => setMarketingWhatsapp(event.target.checked)} />
            WhatsApp promocional
          </label>
        </div>
        <button onClick={saveMarketing} disabled={saving} className="pf-button-primary mt-4 min-h-10 px-4 text-xs">
          <Save className="h-4 w-4" />
          Salvar preferências
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-950">Cookies</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Versão {COOKIE_POLICY_VERSION}. Analíticos: {cookiePreferences.analytics ? 'aceitos' : 'recusados'}.
          Marketing: {cookiePreferences.marketing ? 'aceito' : 'recusado'}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => saveCookiePreferences({ necessary: true, preferences: false, analytics: false, marketing: false }, 'store_account_privacy')} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700">
            Recusar não essenciais
          </button>
          <button onClick={() => saveCookiePreferences({ necessary: true, preferences: true, analytics: true, marketing: true }, 'store_account_privacy')} className="pf-button-primary min-h-10 px-4 py-2 text-xs">
            Aceitar todos
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-950">Solicitar direitos do titular</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Pedidos de exclusão ou anonimização não apagam automaticamente documentos fiscais, pedidos emitidos ou registros
          necessários por obrigação legal, fiscal, contábil, defesa de direitos ou prevenção à fraude.
        </p>
        <div className="mt-4 grid gap-4">
          <StoreField label="Tipo de solicitação">
            <select className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none" value={requestType} onChange={(event) => setRequestType(event.target.value as DataSubjectRequestType)}>
              {requestTypes.map((type) => <option key={type} value={type}>{dataSubjectRequestLabels[type]}</option>)}
            </select>
          </StoreField>
          <StoreField label="Descrição">
            <textarea className={storeTextareaClass} rows={4} value={requestDetails} onChange={(event) => setRequestDetails(event.target.value)} />
          </StoreField>
          <button onClick={submitRequest} disabled={saving} className="pf-button-primary min-h-11 px-4 text-xs">
            <FileText className="h-4 w-4" />
            Registrar solicitação
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-950">Histórico</h2>
        <div className="mt-4 space-y-3">
          {requests.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400">Nenhuma solicitação registrada.</p>
          ) : requests.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-slate-950">{dataSubjectRequestLabels[item.request_type]}</strong>
                <span className="rounded-full bg-white px-2 py-1 font-black uppercase tracking-wide text-slate-500">{item.status.replace(/_/g, ' ')}</span>
              </div>
              <p className="mt-2 leading-5 text-slate-600">{item.request_details}</p>
              {item.response_details && <p className="mt-2 leading-5 text-emerald-700">{item.response_details}</p>}
            </article>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
          Política de privacidade {PRIVACY_POLICY_VERSION}; termos {TERMS_VERSION}. Últimos consentimentos registrados: {consents.length}.
        </div>
      </section>
    </StoreAccountShell>
  );
}
