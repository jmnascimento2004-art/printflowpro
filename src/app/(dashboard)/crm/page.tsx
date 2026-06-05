'use client';

import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MapPin, 
  Tag, 
  FileText, 
  ChevronRight, 
  UserPlus, 
  FileQuestion,
  X,
  Check,
  Users,
  Coins
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Customer } from '@/lib/dummy-data';
import { 
  formatCurrencyInput, 
  parseCurrencyInputToNumber, 
  validateCNPJ, 
  validateCEP, 
  formatCNPJ, 
  formatCEP, 
  formatCPF 
} from '@/lib/utils';

export default function CRMPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, orders } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);

  // Form States
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');

  // B2B Faturamento States
  const [billingType, setBillingType] = useState<'imediato' | 'faturado'>('imediato');
  const [creditLimit, setCreditLimit] = useState(0);
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [creditStatus, setCreditStatus] = useState<'aprovado' | 'bloqueado' | 'sob_analise'>('aprovado');
  const [inscricaoEstadual, setInscricaoEstadual] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [finName, setFinName] = useState('');
  const [finPhone, setFinPhone] = useState('');
  const [finEmail, setFinEmail] = useState('');

  // 1. Get all unique tags for filter list
  const allTags = Array.from(new Set(customers.flatMap(c => c.tags || [])));

  // 2. Filter customers based on search and tag
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.document.includes(searchQuery) ||
                          c.phone.includes(searchQuery) ||
                          (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesTag = selectedTag ? c.tags.includes(selectedTag) : true;

    return matchesSearch && matchesTag;
  });

  // 3. Get customer order history
  const getCustomerOrders = (customerName: string) => {
    return orders.filter(o => o.customer_name === customerName);
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // CNPJ & CEP Validation checks
    const rawDoc = document.replace(/\D/g, '');
    if (rawDoc.length > 11 && !validateCNPJ(rawDoc)) {
      alert('Documento CNPJ inválido! Verifique os dígitos e tente novamente.');
      return;
    }

    const rawCEP = zipCode.replace(/\D/g, '');
    if (rawCEP && !validateCEP(rawCEP)) {
      alert('CEP inválido! O CEP deve conter exatamente 8 dígitos.');
      return;
    }

    const tagsArr = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    addCustomer({
      name,
      document,
      phone,
      email,
      address: {
        street,
        number,
        neighborhood,
        city,
        state,
        zip_code: zipCode
      },
      tags: tagsArr.length > 0 ? tagsArr : ['Cliente'],
      notes,
      billing_type: billingType,
      credit_limit: billingType === 'faturado' ? creditLimit : 0,
      credit_used: 0,
      payment_terms_days: billingType === 'faturado' ? paymentTermsDays : 0,
      credit_status: billingType === 'faturado' ? creditStatus : 'aprovado',
      corporate_additional_info: billingType === 'faturado' ? {
        inscricao_estadual: inscricaoEstadual,
        nome_fantasia: nomeFantasia,
        responsavel_financeiro_nome: finName,
        responsavel_financeiro_phone: finPhone,
        responsavel_financeiro_email: finEmail
      } : undefined
    });

    // Reset Form
    setName('');
    setDocument('');
    setPhone('');
    setEmail('');
    setStreet('');
    setNumber('');
    setNeighborhood('');
    setCity('');
    setState('');
    setZipCode('');
    setTagsInput('');
    setNotes('');
    setBillingType('imediato');
    setCreditLimit(0);
    setPaymentTermsDays(30);
    setCreditStatus('aprovado');
    setInscricaoEstadual('');
    setNomeFantasia('');
    setFinName('');
    setFinPhone('');
    setFinEmail('');
    setIsAddingCustomer(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Search and filter controls */}
      <div className={`flex flex-col sm:flex-row gap-4 items-center justify-between no-print ${isAddingCustomer ? 'hidden' : ''}`}>
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar por nome, CPF/CNPJ, WhatsApp ou e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          {/* Tag Filter pills */}
          <div className="flex gap-1.5 overflow-x-auto py-1">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                selectedTag === null 
                  ? 'bg-primary/10 border-primary text-primary' 
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  selectedTag === tag 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsAddingCustomer(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold shadow-md shadow-primary/20 transition-all ml-2 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Main Grid: List vs Details Split */}
      <div className={`grid grid-cols-1 gap-6 ${isAddingCustomer ? 'max-w-3xl mx-auto w-full' : 'lg:grid-cols-3'}`}>
        {/* Customer List Column */}
        <div className={`bg-card border border-border rounded-2xl shadow-sm overflow-hidden h-[600px] flex flex-col lg:col-span-1 ${isAddingCustomer ? 'hidden' : ''}`}>
          <div className="p-4 border-b border-border bg-secondary/20">
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wider">
              Clientes Cadastrados ({filteredCustomers.length})
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setIsAddingCustomer(false);
                  }}
                  className={`w-full p-4 flex flex-col text-left transition-colors hover:bg-secondary/20 ${
                    selectedCustomer?.id === customer.id ? 'bg-primary/5 border-l-4 border-primary' : ''
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className="font-bold text-foreground text-sm">{customer.name}</span>
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                      {customer.document.length > 14 ? 'PJ' : 'PF'}
                    </span>
                  </div>
                  
                  <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" /> {customer.phone}
                  </span>

                  {customer.email && (
                    <span className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Mail className="h-3 w-3 shrink-0" /> {customer.email}
                    </span>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {customer.tags.map(t => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
                <Users className="h-10 w-10 text-muted-foreground/35 mb-2" />
                <span className="text-xs font-semibold">Nenhum cliente encontrado.</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Details or Form Column */}
        <div className={`flex flex-col ${isAddingCustomer ? 'col-span-full h-auto' : 'lg:col-span-2 h-[600px]'}`}>
          {isAddingCustomer ? (
            /* Add Customer Panel */
            <form onSubmit={handleCreateCustomer} className="bg-card border border-border rounded-2xl shadow-md p-6 flex flex-col justify-between gap-4 h-auto animate-in slide-in-from-bottom duration-300">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wider flex items-center gap-1.5">
                    <UserPlus className="h-4.5 w-4.5 text-primary" /> Cadastrar Novo Cliente
                  </h3>
                  <button 
                    type="button" 
                    onClick={() => setIsAddingCustomer(false)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Nome Completo / Razão Social *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: João Silva ou Gráfica Rápida Ltda"
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>

                  {/* CPF/CNPJ */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">CPF ou CNPJ</label>
                    <input
                      type="text"
                      value={document}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/\D/g, '');
                        if (clean.length <= 11) {
                          setDocument(formatCPF(clean));
                        } else {
                          setDocument(formatCNPJ(clean));
                        }
                      }}
                      placeholder="Ex: 000.000.000-00 ou 00.000.000/0001-00"
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>

                  {/* WhatsApp */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">WhatsApp / Telefone *</label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ex: (11) 98765-4321"
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">E-mail</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="cliente@exemplo.com"
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>

                {/* B2B Invoicing & Credit Terms */}
                <div className="space-y-3 border-t border-border pt-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 text-primary" /> Faturamento e Condições de Crédito (B2B)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Tipo de Faturamento</label>
                      <select
                        value={billingType}
                        onChange={(e: any) => setBillingType(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                      >
                        <option value="imediato">Imediato (A vista / Pix / Cartão)</option>
                        <option value="faturado">Faturado (Crédito Corporativo / Net Terms)</option>
                      </select>
                    </div>

                    {billingType === 'faturado' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Limite de Crédito (R$) *</label>
                          <input
                            type="text"
                            value={formatCurrencyInput(creditLimit)}
                            onChange={(e) => setCreditLimit(parseCurrencyInputToNumber(e.target.value))}
                            placeholder="R$ 0,00"
                            className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Prazo de Faturamento</label>
                          <select
                            value={paymentTermsDays}
                            onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 30)}
                            className="w-full px-2.5 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                          >
                            <option value="15">Faturado 15 Dias</option>
                            <option value="30">Faturado 30 Dias</option>
                            <option value="45">Faturado 45 Dias</option>
                            <option value="60">Faturado 60 Dias</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Status do Crédito</label>
                          <select
                            value={creditStatus}
                            onChange={(e: any) => setCreditStatus(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none font-semibold text-emerald-400"
                          >
                            <option value="aprovado">Aprovado (Liberar faturamento)</option>
                            <option value="sob_analise">Sob Análise</option>
                            <option value="bloqueado">Bloqueado</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Nome Fantasia (PJ)</label>
                          <input
                            type="text"
                            value={nomeFantasia}
                            onChange={(e) => setNomeFantasia(e.target.value)}
                            placeholder="Nome Comercial"
                            className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Inscrição Estadual (IE)</label>
                          <input
                            type="text"
                            value={inscricaoEstadual}
                            onChange={(e) => setInscricaoEstadual(e.target.value)}
                            placeholder="Isento ou Número IE"
                            className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                          />
                        </div>

                        <div className="md:col-span-3 border-t border-border/40 pt-2 grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-muted-foreground">Nome Resp. Financeiro</label>
                            <input
                              type="text"
                              value={finName}
                              onChange={(e) => setFinName(e.target.value)}
                              placeholder="Nome do contato"
                              className="w-full px-3 py-1 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-muted-foreground">WhatsApp Financeiro</label>
                            <input
                              type="text"
                              value={finPhone}
                              onChange={(e) => setFinPhone(e.target.value)}
                              placeholder="(11) 99999-9999"
                              className="w-full px-3 py-1 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-muted-foreground">E-mail Financeiro</label>
                            <input
                              type="email"
                              value={finEmail}
                              onChange={(e) => setFinEmail(e.target.value)}
                              placeholder="financeiro@empresa.com"
                              className="w-full px-3 py-1 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Address Section */}
                <div className="space-y-2 border-t border-border pt-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> Endereço de Faturamento / Entrega
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Logradouro (Rua, Av.)</label>
                      <input
                        type="text"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="Rua das Acácias"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Número</label>
                      <input
                        type="text"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder="123"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Bairro</label>
                      <input
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder="Centro"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Cidade</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="São Paulo"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Estado (UF) / CEP</label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          placeholder="SP"
                          maxLength={2}
                          className="w-1/3 px-2 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                        />
                        <input
                          type="text"
                          value={zipCode}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, '');
                            setZipCode(formatCEP(clean));
                          }}
                          placeholder="01000-000"
                          className="w-2/3 px-2 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags and Notes */}
                <div className="space-y-3 border-t border-border pt-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Etiquetas (separadas por vírgula)
                    </label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="Ex: VIP, Revendedor, Fiel, Inadimplente"
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Observações Adicionais</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Detalhes comerciais, restrições ou termos de entrega preferidos do cliente..."
                      rows={2}
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddingCustomer(false)}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1"
                >
                  <Check className="h-4 w-4" /> Salvar Cliente
                </button>
              </div>
            </form>
          ) : selectedCustomer ? (
            /* Selected Customer Profile Dashboard */
            <div className="bg-card border border-border rounded-2xl shadow-sm p-6 overflow-y-auto h-full flex flex-col justify-between">
              <div className="space-y-5">
                {/* Header Profile Name */}
                <div className="flex justify-between items-start border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{selectedCustomer.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      CPF/CNPJ: {selectedCustomer.document || 'Não informado'} • Cadastrado em {new Date(selectedCustomer.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  
                  {/* Quick stats badges */}
                  <div className="flex flex-wrap gap-1">
                    {selectedCustomer.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Details layout grids */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Contacts */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Dados de Contato</h4>
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium text-foreground">{selectedCustomer.phone}</span>
                      </div>
                      {selectedCustomer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-medium text-foreground">{selectedCustomer.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Billing address */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Endereço Registrado</h4>
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div>
                        {selectedCustomer.address.street ? (
                          <>
                            <span className="font-semibold text-foreground">{selectedCustomer.address.street}, {selectedCustomer.address.number}</span>
                            <div className="text-[11px]">{selectedCustomer.address.neighborhood} • {selectedCustomer.address.city} - {selectedCustomer.address.state}</div>
                            <div className="text-[11px]">CEP: {selectedCustomer.address.zip_code}</div>
                          </>
                        ) : (
                          <span className="italic">Nenhum endereço fornecido.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* B2B Billing & Credit Info Section */}
                {selectedCustomer.billing_type === 'faturado' && (
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/25 space-y-3.5 no-print">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-primary uppercase tracking-wider flex items-center gap-1">
                        <Coins className="h-3.5 w-3.5" /> CRÉDITO CORPORATIVO (FATURADO)
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        selectedCustomer.credit_status === 'aprovado' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        selectedCustomer.credit_status === 'sob_analise' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        Crédito: {selectedCustomer.credit_status || 'APROVADO'}
                      </span>
                    </div>

                    {/* Progress Bar of Credit Used */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Crédito Utilizado: <span className="text-foreground font-bold">{formatCurrency(selectedCustomer.credit_used || 0)}</span></span>
                        <span className="text-muted-foreground">Disponível: <span className="text-emerald-500 font-extrabold">{formatCurrency(Math.max(0, (selectedCustomer.credit_limit || 0) - (selectedCustomer.credit_used || 0)))}</span></span>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            ((selectedCustomer.credit_used || 0) / (selectedCustomer.credit_limit || 1)) > 0.8 ? 'bg-rose-500' :
                            ((selectedCustomer.credit_used || 0) / (selectedCustomer.credit_limit || 1)) > 0.5 ? 'bg-amber-500' :
                            'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, ((selectedCustomer.credit_used || 0) / (selectedCustomer.credit_limit || 1)) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                        <span>Limite Total: {formatCurrency(selectedCustomer.credit_limit || 0)}</span>
                        <span>Prazo de Pagamento: {selectedCustomer.payment_terms_days || 30} dias</span>
                      </div>
                    </div>

                    {/* Additional corporate details */}
                    {selectedCustomer.corporate_additional_info && (
                      <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground border-t border-border/40 pt-2.5">
                        <div>
                          <span className="block text-[9px] uppercase font-bold text-muted-foreground/60">Razão Social / Fantasia</span>
                          <span className="font-semibold text-foreground">{selectedCustomer.corporate_additional_info.nome_fantasia || selectedCustomer.name}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] uppercase font-bold text-muted-foreground/60">Inscrição Estadual</span>
                          <span className="font-semibold text-foreground">{selectedCustomer.corporate_additional_info.inscricao_estadual || 'ISENTO'}</span>
                        </div>
                        <div className="col-span-2 bg-secondary/20 p-2 rounded-lg border border-border/40">
                          <span className="block text-[9px] uppercase font-bold text-muted-foreground/60">Responsável Financeiro B2B</span>
                          <div className="flex flex-wrap gap-2 text-foreground font-medium mt-0.5">
                            <span>{selectedCustomer.corporate_additional_info.responsavel_financeiro_nome || '-'}</span>
                            <span>•</span>
                            <span>{selectedCustomer.corporate_additional_info.responsavel_financeiro_phone || '-'}</span>
                            <span>•</span>
                            <span>{selectedCustomer.corporate_additional_info.responsavel_financeiro_email || '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Customer Notes */}
                {selectedCustomer.notes && (
                  <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-1">
                    <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Observações do Vendedor</h5>
                    <p className="text-xs text-foreground font-medium leading-relaxed italic">"{selectedCustomer.notes}"</p>
                  </div>
                )}

                {/* Order History */}
                <div className="space-y-2 border-t border-border pt-4">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-4.5 w-4.5 text-primary" /> Histórico de Pedidos ({getCustomerOrders(selectedCustomer.name).length})
                  </h4>

                  <div className="max-h-56 overflow-y-auto border border-border rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border sticky top-0">
                          <th className="px-4 py-2">Código</th>
                          <th className="px-4 py-2">Data</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {getCustomerOrders(selectedCustomer.name).length > 0 ? (
                          getCustomerOrders(selectedCustomer.name).map((order) => (
                            <tr key={order.id} className="hover:bg-secondary/10">
                              <td className="px-4 py-2.5 font-bold text-foreground">{order.number}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">
                                {new Date(order.created_at).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  order.status === 'finalizado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                  order.status === 'cancelado' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                  'bg-primary/10 text-primary border-primary/20'
                                }`}>
                                  {order.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-foreground">
                                {formatCurrency(order.total_amount)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground italic">
                              Nenhum pedido registrado para este cliente.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
                <button
                  onClick={() => {
                    if (confirm(`Excluir o cliente ${selectedCustomer.name}?`)) {
                      deleteCustomer(selectedCustomer.id);
                      setSelectedCustomer(null);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold transition-all border border-rose-500/20"
                >
                  Excluir Cliente
                </button>
                <button
                  onClick={() => setIsAddingCustomer(false)}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
                >
                  Fechar Perfil
                </button>
              </div>
            </div>
          ) : (
            /* Select Placeholder */
            <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col items-center justify-center text-center p-6 h-full text-muted-foreground">
              <FileQuestion className="h-14 w-14 text-muted-foreground/35 mb-3" />
              <h3 className="font-bold text-foreground text-sm">Selecione um Cliente</h3>
              <p className="text-xs max-w-sm mt-1">
                Clique em um cliente da lista à esquerda para carregar o histórico de pedidos, contatos e observações comerciais.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
