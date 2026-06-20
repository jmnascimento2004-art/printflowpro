'use client';

import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { StoreField, storeInputClass } from '@/components/store/StoreFormFields';
import { useStoreCustomer } from '@/context/store-customer-context';
import { maskDocument } from '@/lib/store-customer';

export default function StoreProfilePage() {
  const { customer, updateCustomerProfile } = useStoreCustomer();
  const personType = customer?.corporate_additional_info?.person_type || 'fisica';
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [whatsapp, setWhatsapp] = useState(customer?.corporate_additional_info?.whatsapp || customer?.phone || '');
  const [birthDate, setBirthDate] = useState(customer?.corporate_additional_info?.birth_date || '');
  const [tradeName, setTradeName] = useState(customer?.corporate_additional_info?.nome_fantasia || '');
  const [responsibleName, setResponsibleName] = useState(customer?.corporate_additional_info?.responsavel_nome || '');
  const [contactPreference, setContactPreference] = useState(customer?.corporate_additional_info?.contact_preference || 'whatsapp');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await updateCustomerProfile({
        name,
        phone,
        email: customer?.email,
        corporate_additional_info: {
          ...(customer?.corporate_additional_info || {}),
          whatsapp,
          birth_date: birthDate,
          nome_fantasia: tradeName,
          responsavel_nome: responsibleName,
          contact_preference: contactPreference,
          person_type: personType
        }
      });
      setMessage('Dados atualizados com sucesso.');
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Nao foi possivel atualizar seus dados.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAccountShell title="Minha conta" subtitle="Gerencie seus dados, enderecos e pedidos.">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StoreField label="Tipo de cadastro">
            <input className={storeInputClass} value={personType === 'juridica' ? 'Pessoa Juridica' : 'Pessoa Fisica'} disabled />
          </StoreField>
          <StoreField label={personType === 'juridica' ? 'CNPJ protegido' : 'CPF protegido'}>
            <input className={storeInputClass} value={maskDocument(customer?.document || '')} disabled />
          </StoreField>
        </div>

        <StoreField label={personType === 'juridica' ? 'Razao social' : 'Nome completo'}>
          <input className={storeInputClass} value={name} onChange={(event) => setName(event.target.value)} required />
        </StoreField>

        {personType === 'juridica' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StoreField label="Nome fantasia">
              <input className={storeInputClass} value={tradeName} onChange={(event) => setTradeName(event.target.value)} />
            </StoreField>
            <StoreField label="Responsavel">
              <input className={storeInputClass} value={responsibleName} onChange={(event) => setResponsibleName(event.target.value)} />
            </StoreField>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StoreField label="Telefone">
            <input className={storeInputClass} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </StoreField>
          <StoreField label="WhatsApp">
            <input className={storeInputClass} value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
          </StoreField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {personType === 'fisica' && (
            <StoreField label="Data de nascimento">
              <input className={storeInputClass} type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </StoreField>
          )}
          <StoreField label="Preferencia de contato">
            <select className={storeInputClass} value={contactPreference} onChange={(event) => setContactPreference(event.target.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="telefone">Telefone</option>
            </select>
          </StoreField>
          <StoreField label="E-mail">
            <input className={storeInputClass} value={customer?.email || ''} disabled />
          </StoreField>
        </div>

        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
          Para alterar CPF/CNPJ ou e-mail principal, fale com o atendimento da loja por seguranca.
        </p>

        <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-60 sm:w-auto sm:px-6">
          <Save className="h-4 w-4" />
          {submitting ? 'Salvando...' : 'Salvar alteracoes'}
        </button>
      </form>
    </StoreAccountShell>
  );
}
