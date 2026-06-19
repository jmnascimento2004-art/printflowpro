'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Check,
  FileQuestion,
  FileText,
  Phone,
  Plus,
  Search,
  User,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import type { Customer } from '@/lib/dummy-data';
import { lookupCNPJ } from '@/lib/cnpj-lookup';
import { warnCaught } from '@/lib/safe-log';
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  validateCEP,
  validateCNPJ
} from '@/lib/utils';

type PersonType = 'fisica' | 'juridica';

const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15';

const inferPersonType = (customer?: Customer | null): PersonType => {
  const savedType = customer?.corporate_additional_info?.person_type;
  if (savedType === 'fisica' || savedType === 'juridica') return savedType;

  const rawDocument = customer?.document?.replace(/\D/g, '') || '';
  return rawDocument.length > 11 || customer?.billing_type === 'faturado' ? 'juridica' : 'fisica';
};

const isCatalogCustomer = (customer: Customer) =>
  customer.id.startsWith('cust-web-') ||
  customer.tags?.some((tag) => tag.toLowerCase().includes('catalogo')) ||
  customer.notes?.toLowerCase().includes('catalogo online');

export default function CustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, orders, quotes } = useDatabase();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isOpeningQuote, setIsOpeningQuote] = useState(false);

  const [personType, setPersonType] = useState<PersonType>('fisica');
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');
  const [lookupStatus, setLookupStatus] = useState('');

  const resetForm = () => {
    setPersonType('fisica');
    setName('');
    setTradeName('');
    setDocument('');
    setStateRegistration('');
    setResponsibleName('');
    setPhone('');
    setWhatsapp('');
    setEmail('');
    setBirthDate('');
    setZipCode('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setState('');
    setNotes('');
    setLookupStatus('');
  };

  const startCreate = () => {
    setSelectedCustomer(null);
    resetForm();
    setIsEditing(true);
  };

  const startEdit = (customer: Customer) => {
    const nextPersonType = inferPersonType(customer);
    const extra = customer.corporate_additional_info || {};

    setSelectedCustomer(customer);
    setPersonType(nextPersonType);
    setName(customer.name || '');
    setTradeName(extra.nome_fantasia || '');
    setDocument(customer.document || '');
    setStateRegistration(extra.inscricao_estadual || '');
    setResponsibleName(extra.responsavel_nome || extra.responsavel_financeiro_nome || '');
    setPhone(customer.phone || '');
    setWhatsapp(extra.whatsapp || customer.phone || '');
    setEmail(customer.email || '');
    setBirthDate(extra.birth_date || '');
    setZipCode(customer.address?.zip_code || '');
    setStreet(customer.address?.street || '');
    setNumber(customer.address?.number || '');
    setComplement(customer.address?.complement || '');
    setNeighborhood(customer.address?.neighborhood || '');
    setCity(customer.address?.city || '');
    setState(customer.address?.state || '');
    setNotes(customer.notes || '');
    setLookupStatus('');
    setIsEditing(true);
  };

  const filteredCustomers = customers.filter((customer) => {
    const extra = customer.corporate_additional_info || {};
    const search = searchQuery.trim().toLowerCase();
    if (!search) return true;

    return [
      customer.name,
      extra.nome_fantasia,
      customer.document,
      customer.phone,
      extra.whatsapp,
      customer.email,
      customer.address?.city
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });

  const getCustomerOrders = (customer: Customer) =>
    orders.filter((order) => order.customer_id === customer.id || order.customer_name === customer.name);

  const getCustomerQuotes = (customer: Customer) =>
    quotes.filter((quote) =>
      quote.customer_id === customer.id ||
      quote.customer_name === customer.name ||
      quote.customer_name === `${customer.name} (Web)`
    );

  const handleNewQuoteForSelectedCustomer = () => {
    if (!selectedCustomer) return;
    setIsOpeningQuote(true);
    router.push(`/quotes?customerId=${encodeURIComponent(selectedCustomer.id)}`);
  };

  const handleDocumentChange = async (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, personType === 'juridica' ? 14 : 11);
    setDocument(personType === 'juridica' ? formatCNPJ(clean) : formatCPF(clean));
    setLookupStatus('');

    if (personType !== 'juridica' || clean.length !== 14) return;

    if (!validateCNPJ(clean)) {
      setLookupStatus('CNPJ invalido.');
      return;
    }

    setLookupStatus('Consultando CNPJ...');

    try {
      const data = await lookupCNPJ(clean);
      setName(data.razaoSocial || data.nomeFantasia || name);
      setTradeName(data.nomeFantasia || data.razaoSocial || tradeName);
      setPhone(data.telefone || phone);
      setWhatsapp(data.telefone || whatsapp);
      setEmail(data.email || email);
      setZipCode(data.cep || zipCode);
      setStreet(data.logradouro || street);
      setNumber(data.numero || number);
      setNeighborhood(data.bairro || neighborhood);
      setCity(data.municipio || city);
      setState(data.uf || state);
      setStateRegistration(data.inscricaoEstadual || stateRegistration);
      setLookupStatus('Dados da empresa preenchidos automaticamente.');
    } catch (error) {
      warnCaught('Erro ao consultar CNPJ do cliente:', error);
      setLookupStatus(error instanceof Error ? error.message : 'Nao foi possivel consultar o CNPJ.');
    }
  };

  const handleZipCodeChange = (value: string) => {
    setZipCode(formatCEP(value));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const rawDocument = document.replace(/\D/g, '');
    if (personType === 'juridica' && !validateCNPJ(rawDocument)) {
      alert('CNPJ invalido. Verifique os digitos e tente novamente.');
      return;
    }

    const rawCEP = zipCode.replace(/\D/g, '');
    if (rawCEP && !validateCEP(rawCEP)) {
      alert('CEP invalido. O CEP deve conter exatamente 8 digitos.');
      return;
    }

    const duplicateDocument = rawDocument && customers.some((customer) =>
      customer.id !== selectedCustomer?.id &&
      customer.document.replace(/\D/g, '') === rawDocument
    );

    if (duplicateDocument) {
      alert('Ja existe um cliente cadastrado com este CPF/CNPJ.');
      return;
    }

    const preservedExtra = selectedCustomer?.corporate_additional_info || {};
    const nextCustomer = {
      name,
      document,
      phone,
      email,
      address: {
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        zip_code: zipCode
      },
      tags: selectedCustomer?.tags?.length ? selectedCustomer.tags : ['Cliente'],
      notes,
      billing_type: selectedCustomer?.billing_type || 'imediato',
      credit_limit: selectedCustomer?.credit_limit || 0,
      credit_used: selectedCustomer?.credit_used || 0,
      payment_terms_days: selectedCustomer?.payment_terms_days || 0,
      credit_status: selectedCustomer?.credit_status || 'aprovado',
      corporate_additional_info: {
        ...preservedExtra,
        person_type: personType,
        whatsapp,
        birth_date: personType === 'fisica' ? birthDate : undefined,
        nome_fantasia: personType === 'juridica' ? tradeName : undefined,
        inscricao_estadual: personType === 'juridica' ? stateRegistration : undefined,
        responsavel_nome: personType === 'juridica' ? responsibleName : undefined,
        responsavel_financeiro_nome: personType === 'juridica'
          ? responsibleName
          : preservedExtra.responsavel_financeiro_nome
      }
    };

    if (selectedCustomer) {
      updateCustomer({
        ...selectedCustomer,
        ...nextCustomer
      });
    } else {
      addCustomer(nextCustomer);
    }

    resetForm();
    setIsEditing(false);
    setSelectedCustomer(null);
  };

  const selectedPersonType = inferPersonType(selectedCustomer);
  const selectedExtra = selectedCustomer?.corporate_additional_info || {};
  const totalCustomers = customers.length;
  const totalLegalCustomers = customers.filter((customer) => inferPersonType(customer) === 'juridica').length;
  const totalIndividualCustomers = totalCustomers - totalLegalCustomers;
  const totalCatalogCustomers = customers.filter(isCatalogCustomer).length;
  const selectedQuotes = selectedCustomer ? getCustomerQuotes(selectedCustomer) : [];
  const selectedOrders = selectedCustomer ? getCustomerOrders(selectedCustomer) : [];
  const selectedTotalSold = selectedOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
  const selectedLastPurchase = selectedOrders
    .map((order) => order.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return (
    <div className="space-y-6 bg-slate-50/60 p-1">
      {!isEditing && (
        <div className="no-print space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Clientes</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Gerencie pessoas físicas e jurídicas cadastradas
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <div className="relative w-full sm:min-w-[320px]">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, documento, telefone ou e-mail"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <button
                onClick={startCreate}
                className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-600/15 transition-all hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" /> Novo Cliente
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total de clientes" value={totalCustomers} icon={<Users className="h-5 w-5" />} />
            <SummaryCard label="Pessoas físicas" value={totalIndividualCustomers} icon={<User className="h-5 w-5" />} />
            <SummaryCard label="Pessoas jurídicas" value={totalLegalCustomers} icon={<Building2 className="h-5 w-5" />} />
            <SummaryCard label="Clientes do catálogo" value={totalCatalogCustomers} icon={<ShoppingBagIcon />} />
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 ${isEditing ? 'mx-auto max-w-4xl' : 'lg:grid-cols-3'}`}>
        <div className={`flex h-[720px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${isEditing ? 'hidden' : ''}`}>
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Lista de clientes</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{filteredCustomers.length} resultado(s)</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-600">
                PF / PJ
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => {
                const type = inferPersonType(customer);
                const extra = customer.corporate_additional_info || {};
                const customerQuotes = getCustomerQuotes(customer);
                const customerOrders = getCustomerOrders(customer);
                const catalogCustomer = isCatalogCustomer(customer);
                return (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setIsEditing(false);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                      selectedCustomer?.id === customer.id
                        ? 'border-blue-500 bg-blue-50 shadow-sm ring-4 ring-blue-500/10'
                        : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-black text-slate-950">{customer.name}</span>
                        {type === 'juridica' && extra.nome_fantasia && (
                          <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{extra.nome_fantasia}</span>
                        )}
                      </div>
                      <PersonBadge type={type} />
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <span className="truncate">{extra.whatsapp || customer.phone || 'Sem telefone'}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {catalogCustomer && <CatalogBadge />}
                      {customerQuotes.length > 0 && <MiniBadge>{customerQuotes.length} orçamento(s)</MiniBadge>}
                      {customerOrders.length > 0 && <MiniBadge>{customerOrders.length} pedido(s)</MiniBadge>}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-6 text-center text-slate-500">
                <Users className="mb-2 h-10 w-10 text-slate-300" />
                <span className="text-xs font-bold">Nenhum cliente encontrado.</span>
              </div>
            )}
          </div>
        </div>

        <div className={`${isEditing ? 'col-span-full' : 'lg:col-span-2'} flex h-[640px] flex-col`}>
          {isEditing ? (
            <form onSubmit={handleSubmit} className="flex h-auto flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-md">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-foreground">
                  <UserPlus className="h-4.5 w-4.5 text-primary" />
                  {selectedCustomer ? 'Editar Cliente' : 'Cadastrar Cliente'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    resetForm();
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/30 p-1">
                <button
                  type="button"
                  onClick={() => setPersonType('fisica')}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-black transition ${
                    personType === 'fisica' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="h-4 w-4" /> Pessoa Física
                </button>
                <button
                  type="button"
                  onClick={() => setPersonType('juridica')}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-black transition ${
                    personType === 'juridica' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Building2 className="h-4 w-4" /> Pessoa Jurídica
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={personType === 'fisica' ? 'Nome completo *' : 'Razão social *'}>
                  <input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
                </Field>

                <Field label={personType === 'fisica' ? 'CPF *' : 'CNPJ *'}>
                  <input
                    required
                    value={document}
                    onChange={(event) => handleDocumentChange(event.target.value)}
                    className={inputClass}
                    placeholder={personType === 'fisica' ? '000.000.000-00' : '00.000.000/0001-00'}
                  />
                  {lookupStatus && (
                    <p className={`mt-1 text-[10px] font-bold ${lookupStatus.includes('preenchidos') ? 'text-emerald-500' : lookupStatus.includes('Consultando') ? 'text-primary' : 'text-rose-500'}`}>
                      {lookupStatus}
                    </p>
                  )}
                </Field>

                {personType === 'juridica' && (
                  <>
                    <Field label="Nome fantasia">
                      <input value={tradeName} onChange={(event) => setTradeName(event.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Inscrição estadual">
                      <input value={stateRegistration} onChange={(event) => setStateRegistration(event.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Responsável">
                      <input value={responsibleName} onChange={(event) => setResponsibleName(event.target.value)} className={inputClass} />
                    </Field>
                  </>
                )}

                {personType === 'fisica' && (
                  <Field label="Data de nascimento">
                    <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className={inputClass} />
                  </Field>
                )}

                <Field label="Telefone *">
                  <input required value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} />
                </Field>
                <Field label="WhatsApp">
                  <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} className={inputClass} />
                </Field>
                <Field label="E-mail">
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
                </Field>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Endereço</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                  <Field label="CEP" className="md:col-span-2">
                    <input value={zipCode} onChange={(event) => handleZipCodeChange(event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Rua" className="md:col-span-4">
                    <input value={street} onChange={(event) => setStreet(event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Número" className="md:col-span-2">
                    <input value={number} onChange={(event) => setNumber(event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Complemento" className="md:col-span-4">
                    <input value={complement} onChange={(event) => setComplement(event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Bairro" className="md:col-span-2">
                    <input value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Cidade" className="md:col-span-2">
                    <input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Estado" className="md:col-span-2">
                    <input value={state} onChange={(event) => setState(event.target.value.toUpperCase().slice(0, 2))} className={inputClass} />
                  </Field>
                </div>
              </div>

              <Field label="Observações">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  className={`${inputClass} min-h-24 resize-none py-2`}
                />
              </Field>

              <div className="mt-1 flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    resetForm();
                  }}
                  className="rounded-xl bg-secondary px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-secondary/80"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90"
                >
                  <Check className="h-4 w-4" /> Salvar Cliente
                </button>
              </div>
            </form>
          ) : selectedCustomer ? (
            <div className="flex h-[720px] flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-gradient-to-br from-white to-blue-50/70 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PersonBadge type={selectedPersonType} />
                      {isCatalogCustomer(selectedCustomer) && <CatalogBadge />}
                    </div>
                    <h2 className="mt-3 line-clamp-2 max-w-[620px] text-2xl font-extrabold leading-tight text-slate-950">{selectedCustomer.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                      <span>{selectedCustomer.document || 'Documento não informado'}</span>
                      <span>Cadastrado em {new Date(selectedCustomer.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:shrink-0 xl:justify-end xl:pt-8">
                    <button
                      onClick={() => startEdit(selectedCustomer)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-blue-600/15 transition-all hover:bg-blue-500"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={handleNewQuoteForSelectedCustomer}
                      disabled={!selectedCustomer || isOpeningQuote}
                      className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-black text-blue-600 transition-all hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Novo Orçamento
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir o cliente ${selectedCustomer.name}?`)) {
                          deleteCustomer(selectedCustomer.id);
                          setSelectedCustomer(null);
                        }
                      }}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-500 transition-all hover:bg-rose-50"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-5">

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <DetailCard title="Contato">
                    <DetailLine label="Telefone" value={selectedCustomer.phone || 'Não informado'} />
                    <DetailLine label="WhatsApp" value={selectedExtra.whatsapp || selectedCustomer.phone || 'Não informado'} />
                    <DetailLine label="E-mail" value={selectedCustomer.email || 'Não informado'} />
                    {selectedPersonType === 'fisica' && selectedExtra.birth_date && (
                      <DetailLine label="Nascimento" value={new Date(selectedExtra.birth_date).toLocaleDateString('pt-BR')} />
                    )}
                  </DetailCard>

                  <DetailCard title="Endereço">
                    <DetailLine label="Resumo" value={formatAddress(selectedCustomer)} />
                    <DetailLine label="Rua" value={selectedCustomer.address?.street || 'Não informada'} />
                    <DetailLine label="Número" value={selectedCustomer.address?.number || 'Não informado'} />
                    <DetailLine label="Bairro" value={selectedCustomer.address?.neighborhood || 'Não informado'} />
                    <DetailLine label="Cidade / UF" value={[selectedCustomer.address?.city, selectedCustomer.address?.state].filter(Boolean).join(' / ') || 'Não informado'} />
                    <DetailLine label="CEP" value={selectedCustomer.address?.zip_code || 'Não informado'} />
                  </DetailCard>
                </div>

                {selectedPersonType === 'juridica' && (
                  <DetailCard title="Pessoa Jurídica">
                    <DetailLine label="Razão social" value={selectedCustomer.name || 'Não informada'} />
                    <DetailLine label="Nome fantasia" value={selectedExtra.nome_fantasia || 'Não informado'} />
                    <DetailLine label="CNPJ" value={selectedCustomer.document || 'Não informado'} />
                    <DetailLine label="Inscrição estadual" value={selectedExtra.inscricao_estadual || 'Não informada'} />
                    <DetailLine label="Responsável" value={selectedExtra.responsavel_nome || selectedExtra.responsavel_financeiro_nome || 'Não informado'} />
                  </DetailCard>
                )}

                {selectedPersonType === 'fisica' && (
                  <DetailCard title="Pessoa Física">
                    <DetailLine label="Nome completo" value={selectedCustomer.name || 'Não informado'} />
                    <DetailLine label="CPF" value={selectedCustomer.document || 'Não informado'} />
                    <DetailLine
                      label="Nascimento"
                      value={selectedExtra.birth_date ? new Date(selectedExtra.birth_date).toLocaleDateString('pt-BR') : 'Não informado'}
                    />
                  </DetailCard>
                )}

                {selectedCustomer.notes && (
                  <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Observações</h5>
                    <FormattedNotes notes={selectedCustomer.notes} />
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-950">Histórico Comercial</h3>
                  <p className="text-xs font-medium text-slate-500">Resumo de orçamentos, pedidos e compras vinculadas</p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Orçamentos vinculados" value={selectedQuotes.length} />
                    <MetricCard label="Pedidos vinculados" value={selectedOrders.length} />
                    <MetricCard label="Total vendido" value={formatCurrency(selectedTotalSold)} />
                    <MetricCard label="Última compra" value={selectedLastPurchase ? new Date(selectedLastPurchase).toLocaleDateString('pt-BR') : 'Sem compras'} />
                  </div>

                <LinkedHistory
                  quotes={getCustomerQuotes(selectedCustomer)}
                  orders={getCustomerOrders(selectedCustomer)}
                  formatCurrency={formatCurrency}
                />
                </div>
              </div>

              <div className="hidden">
                <button
                  onClick={() => startEdit(selectedCustomer)}
                  className="rounded-xl bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-500 hover:bg-blue-500/20"
                >
                  Editar Cliente
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Excluir o cliente ${selectedCustomer.name}?`)) {
                      deleteCustomer(selectedCustomer.id);
                      setSelectedCustomer(null);
                    }
                  }}
                  className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-400 transition-all hover:bg-rose-500/20"
                >
                  Excluir Cliente
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground shadow-sm">
              <FileQuestion className="mb-3 h-14 w-14 text-muted-foreground/35" />
              <h3 className="text-sm font-bold text-foreground">Selecione um cliente</h3>
              <p className="mt-1 max-w-sm text-xs">
                Clique em um cliente da lista para visualizar cadastro, endereço, contatos e histórico vinculado.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ShoppingBagIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function PersonBadge({ type }: { type: PersonType }) {
  const isLegal = type === 'juridica';
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
      isLegal ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100' : 'bg-blue-50 text-blue-600 ring-1 ring-blue-100'
    }`}>
      {isLegal ? 'PJ' : 'PF'}
    </span>
  );
}

function CatalogBadge() {
  return (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
      Catálogo
    </span>
  );
}

function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
      {children}
    </span>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-xs font-black uppercase tracking-wide text-slate-950">{title}</h4>
      <div className="space-y-2 text-xs text-slate-500">{children}</div>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <InfoBlock title={title}>{children}</InfoBlock>;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const noWrapValueLabels = ['Telefone', 'WhatsApp', 'Número', 'Cidade / UF', 'CEP'];
  const valueClassName = noWrapValueLabels.includes(label)
    ? 'whitespace-nowrap'
    : 'break-words';

  return (
    <div className="grid min-h-[44px] grid-cols-[105px_minmax(0,1fr)] items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="pt-0.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`min-w-0 text-left text-xs font-bold leading-relaxed text-slate-800 ${valueClassName}`}>{value}</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function FormattedNotes({ notes }: { notes: string }) {
  const parts = notes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2">
      {parts.map((line, index) => {
        const [label, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        const hasLabel = value.length > 0 && label.length <= 32;
        return (
          <div key={`${line}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {hasLabel ? (
              <>
                <span className="block font-black uppercase tracking-wide text-blue-600">{label}</span>
                <span className="mt-1 block whitespace-pre-wrap font-semibold leading-relaxed text-slate-700">{value}</span>
              </>
            ) : (
              <span className="block whitespace-pre-wrap font-semibold leading-relaxed text-slate-700">{line}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LinkedHistory({
  quotes,
  orders,
  formatCurrency
}: {
  quotes: ReturnType<typeof useDatabase>['quotes'];
  orders: ReturnType<typeof useDatabase>['orders'];
  formatCurrency: (value: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 xl:grid-cols-2">
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
          <FileQuestion className="h-4.5 w-4.5 text-primary" /> Orçamentos ({quotes.length})
        </h4>
        <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
          {quotes.length > 0 ? quotes.map((quote) => (
            <div key={quote.id} className="border-b border-border p-3 last:border-b-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-foreground">#{quote.number}</span>
                <span className="font-black text-primary">{formatCurrency(quote.total_amount)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(quote.created_at).toLocaleDateString('pt-BR')} • {quote.status}
              </p>
            </div>
          )) : (
            <div className="p-5 text-center text-xs text-muted-foreground">Nenhum orçamento vinculado.</div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
          <FileText className="h-4.5 w-4.5 text-primary" /> Pedidos ({orders.length})
        </h4>
        <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
          {orders.length > 0 ? orders.map((order) => (
            <div key={order.id} className="border-b border-border p-3 last:border-b-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-foreground">{order.number}</span>
                <span className="font-black text-primary">{formatCurrency(order.total_amount)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(order.created_at).toLocaleDateString('pt-BR')} • {order.status}
              </p>
            </div>
          )) : (
            <div className="p-5 text-center text-xs text-muted-foreground">Nenhum pedido vinculado.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatAddress(customer: Customer) {
  const address = customer.address;
  if (!address?.street) return 'Endereço não informado';

  return [
    `${address.street}${address.number ? `, ${address.number}` : ''}`,
    address.complement,
    address.neighborhood,
    address.city && address.state ? `${address.city} - ${address.state}` : address.city || address.state,
    address.zip_code ? `CEP ${address.zip_code}` : ''
  ].filter(Boolean).join(' • ');
}
