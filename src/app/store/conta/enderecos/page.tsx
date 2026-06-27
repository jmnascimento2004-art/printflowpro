'use client';

import React, { useState } from 'react';
import { MapPin, Plus, Save, Star, Trash2 } from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { StoreField, storeInputClass, storeTextareaClass } from '@/components/store/StoreFormFields';
import { useStoreCustomer } from '@/context/store-customer-context';
import { StoreCustomerAddress } from '@/lib/store-customer';
import { formatCEP } from '@/lib/utils';

const emptyForm: Partial<StoreCustomerAddress> = {
  label: 'Casa',
  recipient_name: '',
  zip_code: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  reference: '',
  is_default: false
};

export default function StoreAddressesPage() {
  const { customer, addresses, saveAddress, deleteAddress, setDefaultAddress } = useStoreCustomer();
  const [form, setForm] = useState<Partial<StoreCustomerAddress>>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setValue = <K extends keyof StoreCustomerAddress>(key: K, value: StoreCustomerAddress[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm({ ...emptyForm, recipient_name: customer?.name || '' });
    setEditing(false);
  };

  const lookupCep = async (value: string) => {
    const formatted = formatCEP(value);
    setValue('zip_code', formatted);
    const clean = formatted.replace(/\D/g, '');
    if (clean.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setForm((current) => ({
          ...current,
          street: data.logradouro || current.street,
          neighborhood: data.bairro || current.neighborhood,
          city: data.localidade || current.city,
          state: data.uf || current.state
        }));
      }
    } catch {
      // CEP autocomplete is progressive enhancement.
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await saveAddress(form);
      setMessage('Endereço salvo com sucesso.');
      resetForm();
    } catch (addressError) {
      setError(addressError instanceof Error ? addressError.message : 'Não foi possível salvar o endereço.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreAccountShell title="Endereços" subtitle="Cadastre endereços para preencher o checkout mais rápido.">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <button
            type="button"
            onClick={resetForm}
            className="pf-button-primary min-h-12 w-full xl:hidden"
          >
            <Plus className="h-4 w-4" />
            Adicionar novo endereço
          </button>

          {addresses.length > 0 ? addresses.map((address) => (
            <div key={address.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-black text-slate-950">{address.label}</h2>
                    {address.is_default && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">Principal</span>}
                  </div>
                  <div className="mt-2 space-y-1 text-sm font-semibold leading-6 text-slate-600">
                    <p>{address.recipient_name || customer?.name}</p>
                    <p>{address.street}, {address.number}{address.complement ? ` - ${address.complement}` : ''}</p>
                    <p>{address.neighborhood}</p>
                    <p>{address.city}/{address.state} - CEP {address.zip_code}</p>
                    {address.reference && <p className="text-xs text-slate-400">Ref.: {address.reference}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDefaultAddress(address.id)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-black text-slate-500">
                    <Star className="h-3.5 w-3.5" />
                    Principal
                  </button>
                  <button type="button" onClick={() => { setForm(address); setEditing(true); }} className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-black text-slate-500">
                    Editar
                  </button>
                  <button type="button" onClick={() => deleteAddress(address.id)} className="flex h-9 items-center justify-center rounded-lg border border-rose-200 px-2 text-rose-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <MapPin className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-500">Nenhum endereço cadastrado.</p>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase text-slate-950">{editing ? 'Editar endereço' : 'Novo endereço'}</h2>
            <button type="button" onClick={resetForm} className="flex items-center gap-1 text-xs font-black text-slate-500">
              <Plus className="h-4 w-4" />
              Adicionar novo endereço
            </button>
          </div>
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}

          <StoreField label="Apelido">
            <select className={storeInputClass} value={form.label || 'Casa'} onChange={(event) => setValue('label', event.target.value)}>
              <option>Casa</option>
              <option>Trabalho</option>
              <option>Empresa</option>
              <option>Outro</option>
            </select>
          </StoreField>

          <StoreField label="Destinatário">
            <input className={storeInputClass} value={form.recipient_name || ''} onChange={(event) => setValue('recipient_name', event.target.value)} required />
          </StoreField>

          <StoreField label="CEP">
            <input className={storeInputClass} value={form.zip_code || ''} onChange={(event) => lookupCep(event.target.value)} required />
          </StoreField>

          <StoreField label="Rua">
            <input className={storeInputClass} value={form.street || ''} onChange={(event) => setValue('street', event.target.value)} required />
          </StoreField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StoreField label="Número">
              <input className={storeInputClass} value={form.number || ''} onChange={(event) => setValue('number', event.target.value)} required />
            </StoreField>
            <StoreField label="Complemento">
              <input className={storeInputClass} value={form.complement || ''} onChange={(event) => setValue('complement', event.target.value)} />
            </StoreField>
          </div>

          <StoreField label="Bairro">
            <input className={storeInputClass} value={form.neighborhood || ''} onChange={(event) => setValue('neighborhood', event.target.value)} required />
          </StoreField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_90px]">
            <StoreField label="Cidade">
              <input className={storeInputClass} value={form.city || ''} onChange={(event) => setValue('city', event.target.value)} required />
            </StoreField>
            <StoreField label="UF">
              <input className={storeInputClass} value={form.state || ''} onChange={(event) => setValue('state', event.target.value.toUpperCase())} maxLength={2} required />
            </StoreField>
          </div>

          <StoreField label="Referência">
            <textarea className={storeTextareaClass} value={form.reference || ''} onChange={(event) => setValue('reference', event.target.value)} />
          </StoreField>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <input type="checkbox" checked={Boolean(form.is_default)} onChange={(event) => setValue('is_default', event.target.checked)} />
            Definir como endereço principal
          </label>

          <button type="submit" disabled={submitting} className="pf-button-primary h-12 w-full">
            <Save className="h-4 w-4" />
            {submitting ? 'Salvando...' : 'Salvar endereço'}
          </button>
        </form>
      </div>
    </StoreAccountShell>
  );
}
