'use client';

import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  FileQuestion,
  FileText,
  Mail,
  MapPin,
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

export default function CustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, orders, quotes } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditing, setIsEditing] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between no-print ${isEditing ? 'hidden' : ''}`}>
        <div className="relative w-full sm:max-w-lg">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar por nome, CPF/CNPJ, telefone, WhatsApp ou e-mail..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-xl border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          onClick={startCreate}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Novo Cliente
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${isEditing ? 'mx-auto max-w-4xl' : 'lg:grid-cols-3'}`}>
        <div className={`flex h-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${isEditing ? 'hidden' : ''}`}>
          <div className="border-b border-border bg-secondary/20 p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Clientes Cadastrados ({filteredCustomers.length})
            </h3>
          </div>

          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => {
                const type = inferPersonType(customer);
                const extra = customer.corporate_additional_info || {};
                return (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setIsEditing(false);
                    }}
                    className={`flex w-full flex-col p-4 text-left transition-colors hover:bg-secondary/20 ${
                      selectedCustomer?.id === customer.id ? 'border-l-4 border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">{customer.name}</span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
                        {type === 'juridica' ? 'PJ' : 'PF'}
                      </span>
                    </div>
                    {type === 'juridica' && extra.nome_fantasia && (
                      <span className="mt-0.5 text-xs text-muted-foreground">{extra.nome_fantasia}</span>
                    )}
                    <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" /> {extra.whatsapp || customer.phone || 'Sem telefone'}
                    </span>
                    {customer.email && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" /> {customer.email}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <Users className="mb-2 h-10 w-10 text-muted-foreground/35" />
                <span className="text-xs font-semibold">Nenhum cliente encontrado.</span>
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
            <div className="flex h-full flex-col justify-between overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
                      {selectedPersonType === 'juridica' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{selectedCustomer.name}</h3>
                    {selectedPersonType === 'juridica' && selectedExtra.nome_fantasia && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{selectedExtra.nome_fantasia}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Documento: {selectedCustomer.document || 'Não informado'} • Cadastrado em {new Date(selectedCustomer.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InfoBlock title="Contato">
                    <InfoLine icon={<Phone className="h-3.5 w-3.5" />} value={`Telefone: ${selectedCustomer.phone || '-'}`} />
                    <InfoLine icon={<Phone className="h-3.5 w-3.5" />} value={`WhatsApp: ${selectedExtra.whatsapp || selectedCustomer.phone || '-'}`} />
                    <InfoLine icon={<Mail className="h-3.5 w-3.5" />} value={selectedCustomer.email || 'E-mail não informado'} />
                    {selectedPersonType === 'fisica' && selectedExtra.birth_date && (
                      <InfoLine icon={<Calendar className="h-3.5 w-3.5" />} value={`Nascimento: ${new Date(selectedExtra.birth_date).toLocaleDateString('pt-BR')}`} />
                    )}
                  </InfoBlock>

                  <InfoBlock title="Endereço">
                    <InfoLine icon={<MapPin className="h-3.5 w-3.5" />} value={formatAddress(selectedCustomer)} />
                  </InfoBlock>
                </div>

                {selectedPersonType === 'juridica' && (
                  <InfoBlock title="Dados da empresa">
                    <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <span>Inscrição estadual: <strong className="text-foreground">{selectedExtra.inscricao_estadual || 'Não informada'}</strong></span>
                      <span>Responsável: <strong className="text-foreground">{selectedExtra.responsavel_nome || selectedExtra.responsavel_financeiro_nome || 'Não informado'}</strong></span>
                    </div>
                  </InfoBlock>
                )}

                {selectedCustomer.notes && (
                  <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Observações</h5>
                    <p className="mt-1 whitespace-pre-line text-xs font-medium leading-relaxed text-foreground">&quot;{selectedCustomer.notes}&quot;</p>
                  </div>
                )}

                <LinkedHistory
                  quotes={getCustomerQuotes(selectedCustomer)}
                  orders={getCustomerOrders(selectedCustomer)}
                  formatCurrency={formatCurrency}
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
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

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-secondary/20 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h4>
      <div className="space-y-1.5 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function InfoLine({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span className="font-medium text-foreground">{value}</span>
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
