'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { StoreAuthPanel } from '@/components/store/StoreAccountShell';
import { StoreField, storeInputClass } from '@/components/store/StoreFormFields';
import { useStoreCustomer } from '@/context/store-customer-context';
import { StoreCustomerType, StoreSignupInput, validateStoreSignup } from '@/lib/store-customer';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/lib/privacy';
import { sanitizeStoreRedirect, STORE_ROUTES } from '@/lib/store-routes';
import { formatCNPJ, formatCPF } from '@/lib/utils';

export default function StoreSignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = sanitizeStoreRedirect(params.get('redirect'));
  const { signUp } = useStoreCustomer();
  const [form, setForm] = useState<StoreSignupInput>({
    name: '',
    customerType: 'fisica',
    document: '',
    email: '',
    phone: '',
    password: '',
    tradeName: '',
    birthDate: '',
    contactPreference: 'whatsapp',
    privacyAccepted: false,
    termsAccepted: false,
    marketingEmailAccepted: false,
    marketingWhatsappAccepted: false
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setValue = <K extends keyof StoreSignupInput>(key: K, value: StoreSignupInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleDocument = (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, form.customerType === 'fisica' ? 11 : 14);
    setValue('document', form.customerType === 'fisica' ? formatCPF(clean) : formatCNPJ(clean));
  };

  const handleTypeChange = (nextType: StoreCustomerType) => {
    setForm((current) => ({ ...current, customerType: nextType, document: '' }));
  };

  const createSignupSuccessUrl = () => {
    const successParams = new URLSearchParams();
    if (form.email.trim()) successParams.set('email', form.email.trim().toLowerCase());
    if (redirect) successParams.set('redirect', redirect);
    const query = successParams.toString();
    return query ? `${STORE_ROUTES.signupSuccess}?${query}` : STORE_ROUTES.signupSuccess;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const validation = validateStoreSignup(form);
    if (validation) {
      setError(validation);
      return;
    }

    if (form.password !== confirmPassword) {
      setError('A confirmacao de senha precisa ser igual a senha informada.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp(form);
      if (result === 'confirmed') {
        router.push(redirect || STORE_ROUTES.account);
      } else {
        router.replace(createSignupSuccessUrl());
      }
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Nao foi possivel criar sua conta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAuthPanel
      title="Crie sua conta"
      subtitle="Cadastre-se para acompanhar seus pedidos, salvar seus dados e comprar com mais facilidade."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {(['fisica', 'juridica'] as StoreCustomerType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={`h-10 rounded-lg text-xs font-black ${form.customerType === type ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
            >
              {type === 'fisica' ? 'Pessoa Fisica' : 'Pessoa Juridica'}
            </button>
          ))}
        </div>

        <StoreField label={form.customerType === 'fisica' ? 'Nome completo' : 'Razao social'}>
          <input className={storeInputClass} value={form.name} onChange={(event) => setValue('name', event.target.value)} required />
        </StoreField>

        {form.customerType === 'juridica' && (
          <StoreField label="Nome fantasia">
            <input className={storeInputClass} value={form.tradeName} onChange={(event) => setValue('tradeName', event.target.value)} />
          </StoreField>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StoreField label={form.customerType === 'fisica' ? 'CPF' : 'CNPJ'}>
            <input className={storeInputClass} value={form.document} onChange={(event) => handleDocument(event.target.value)} required />
          </StoreField>
          <StoreField label="Telefone / WhatsApp">
            <input className={storeInputClass} value={form.phone} onChange={(event) => setValue('phone', event.target.value)} required />
          </StoreField>
        </div>

        <StoreField label="E-mail">
          <input className={storeInputClass} type="email" value={form.email} onChange={(event) => setValue('email', event.target.value)} required />
        </StoreField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StoreField label="Senha">
            <input className={storeInputClass} type="password" value={form.password} onChange={(event) => setValue('password', event.target.value)} required />
          </StoreField>
          <StoreField label="Confirmar senha">
            <input className={storeInputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </StoreField>
        </div>

        <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
          <input type="checkbox" checked={form.privacyAccepted} onChange={(event) => setValue('privacyAccepted', event.target.checked)} className="mt-1" />
          <span>
            Li e aceito a <Link href={STORE_ROUTES.publicPrivacy} className="font-black text-slate-950 underline-offset-4 hover:underline">Politica de Privacidade</Link> para cadastro,
            pedidos, entrega e atendimento. Versao {PRIVACY_POLICY_VERSION}.
          </span>
        </label>

        <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
          <input type="checkbox" checked={form.termsAccepted} onChange={(event) => setValue('termsAccepted', event.target.checked)} className="mt-1" />
          <span>
            Li e aceito os <Link href="/store/termos" className="font-black text-slate-950 underline-offset-4 hover:underline">Termos de Uso</Link> do catalogo online.
            Versao {TERMS_VERSION}.
          </span>
        </label>

        <label className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
          <input type="checkbox" checked={form.marketingEmailAccepted} onChange={(event) => setValue('marketingEmailAccepted', event.target.checked)} className="mt-1" />
          Quero receber ofertas e campanhas por e-mail. Opcional, sem bloquear cadastro ou compra.
        </label>

        <label className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
          <input type="checkbox" checked={form.marketingWhatsappAccepted} onChange={(event) => setValue('marketingWhatsappAccepted', event.target.checked)} className="mt-1" />
          Quero receber ofertas e campanhas por WhatsApp. Opcional e revogavel.
        </label>

        <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-60">
          <UserPlus className="h-4 w-4" />
          {submitting ? 'Criando conta...' : 'Criar minha conta'}
        </button>

        <p className="text-center text-xs font-bold text-slate-500">
          Ja tem conta? <Link href={STORE_ROUTES.login} className="text-slate-950">Entrar</Link>
        </p>
      </form>
    </StoreAuthPanel>
  );
}
