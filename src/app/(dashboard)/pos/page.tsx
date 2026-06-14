'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Trash2,
  DollarSign,
  User,
  ShoppingBag,
  CreditCard,
  QrCode,
  FileText,
  Briefcase,
  History,
  Lock,
  Unlock,
  PlusCircle,
  MinusCircle,
  TrendingUp,
  AlertCircle,
  Check,
  Printer,
  ChevronRight,
  UserPlus
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { OrderItem } from '@/lib/dummy-data';
import { lookupCNPJ } from '@/lib/cnpj-lookup';
import { warnCaught } from '@/lib/safe-log';
import { 
  formatCurrencyInput, 
  parseCurrencyInputToNumber, 
  validateCNPJ, 
  validateCEP, 
  formatCNPJ, 
  formatCEP, 
  formatCPF, 
  generatePixPayload,
  getProductUnitPrice,
  stripRichTextHtml
} from '@/lib/utils';

export default function POSPage() {
  const {
    products,
    customers,
    categories,
    activeSession,
    sessions,
    registerTransactions,
    openRegister,
    closeRegister,
    addRegisterTransaction,
    addOrderFromPOS,
    addCustomer,
    settings
  } = useDatabase();

  const [activeTab, setActiveTab] = useState<'pdv' | 'caixa' | 'historico'>('pdv');

  // POS State
  const [cart, setCart] = useState<Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    pricing_type: string;
    details?: {
      width?: number;
      height?: number;
      notes?: string;
    };
  }>>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('guest');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado'>('dinheiro');

  // Checkout Dialog State
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [justCompletedOrder, setJustCompletedOrder] = useState<any>(null);

  // Modal configure dimension for m2/linear products
  const [configuringProduct, setConfiguringProduct] = useState<any>(null);
  const [customWidth, setCustomWidth] = useState<number>(1);
  const [customHeight, setCustomHeight] = useState<number>(1);
  const [customNotes, setCustomNotes] = useState<string>('');

  // Daily Cash Register Dialog States
  const [isOpeningRegister, setIsOpeningRegister] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<number>(100);
  const [openingNotes, setOpeningNotes] = useState('');

  const [isClosingRegister, setIsClosingRegister] = useState(false);
  const [countedCash, setCountedCash] = useState<number>(0);
  const [closingNotes, setClosingNotes] = useState('');

  const [isAddingAdjustment, setIsAddingAdjustment] = useState<false | 'suprimento' | 'sangria'>(false);
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjDescription, setAdjDescription] = useState<string>('');

  // Fast Customer Creation State
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustDoc, setNewCustDoc] = useState('');
  const [newCustCnpjStatus, setNewCustCnpjStatus] = useState('');
  const [newCustAddress, setNewCustAddress] = useState({
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: ''
  });

  // 1. Auto-trigger print ticket when order completed
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (justCompletedOrder) {
      window.print();
      setJustCompletedOrder(null);
    }
  }, [justCompletedOrder]);

  // POS Calculations
  const getSubtotal = () => {
    return cart.reduce((sum, item) => {
      const factor = (item.pricing_type === 'm2' && item.details)
        ? (item.details.width || 1) * (item.details.height || 1)
        : (item.pricing_type === 'linear' && item.details)
          ? (item.details.width || 1)
          : 1;
      return sum + item.unit_price * factor * item.quantity;
    }, 0);
  };

  const getCartTotal = () => {
    return Math.max(0, getSubtotal() - discountAmount);
  };

  // Categories extraction sorted hierarchically
  const getSortedCategories = () => {
    const sorted: typeof categories = [];
    const parents = categories.filter(c => !c.parent_id);
    parents.forEach(p => {
      sorted.push(p);
      const children = categories.filter(c => c.parent_id === p.id);
      sorted.push(...children);
    });
    categories.forEach(c => {
      if (!sorted.some(sc => sc.id === c.id)) {
        sorted.push(c);
      }
    });
    return sorted;
  };

  const categoriesList = [
    'todos',
    ...getSortedCategories().map(c => c.id),
    ...Array.from(new Set(products.map(p => p.category_id)))
      .filter(id => id && !categories.some(c => c.id === id))
  ];

  const getCategoryName = (catId: string) => {
    if (catId === 'todos') return 'Todos';
    const match = categories.find(c => c.id === catId);
    if (match) {
      if (match.parent_id) {
        const parent = categories.find(p => p.id === match.parent_id);
        return parent ? `${parent.name} > ${match.name}` : match.name;
      }
      return match.name;
    }
    return catId.replace('cat-', 'Categoria ');
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    const selectedCategoryIds = selectedCategory === 'todos'
      ? []
      : [selectedCategory, ...categories.filter(c => c.parent_id === selectedCategory).map(c => c.id)];

    const matchesCategory = selectedCategory === 'todos' || selectedCategoryIds.includes(p.category_id);
    return matchesSearch && matchesCategory;
  });

  const getSelectedCustomer = () => {
    if (selectedCustomerId === 'guest') {
      return { id: 'guest', name: 'Consumidor Final', document: '000.000.000-00', phone: '-', email: '-', billing_type: 'imediato' } as any;
    }
    return customers.find(c => c.id === selectedCustomerId);
  };

  // Handlers
  const handleAddProductClick = (prod: any) => {
    if (prod.pricing_type === 'm2' || prod.pricing_type === 'linear') {
      setConfiguringProduct(prod);
      setCustomWidth(1);
      setCustomHeight(1);
      setCustomNotes('');
    } else {
      addToCart(prod, 1);
    }
  };

  const addToCart = (prod: any, quantity: number, details?: any) => {
    setCart(prev => {
      // Find if item already exists with matching product and dimensions
      const matchIdx = prev.findIndex(item =>
        item.product_id === prod.id &&
        JSON.stringify(item.details) === JSON.stringify(details)
      );

      if (matchIdx > -1) {
        const next = [...prev];
        const newQty = next[matchIdx].quantity + quantity;
        next[matchIdx].quantity = newQty;
        next[matchIdx].unit_price = getProductUnitPrice(prod, newQty);
        return next;
      }

      return [...prev, {
        product_id: prod.id,
        product_name: prod.name,
        quantity,
        unit_price: getProductUnitPrice(prod, quantity),
        pricing_type: prod.pricing_type,
        details
      }];
    });
  };

  const handleDimensionConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuringProduct) return;

    addToCart(configuringProduct, 1, {
      width: customWidth,
      height: configuringProduct.pricing_type === 'm2' ? customHeight : undefined,
      notes: customNotes
    });

    setConfiguringProduct(null);
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const total = getCartTotal();
    const customer = getSelectedCustomer();

    if (!customer) return;

    if (paymentMethod === 'faturado') {
      if (customer.id === 'guest') {
        alert('Venda Faturada (Crédito) não pode ser registrada para Consumidor Final!');
        return;
      }
      if (customer.billing_type !== 'faturado') {
        alert('Este cliente não está habilitado para faturamento corporativo!');
        return;
      }
      if (customer.credit_status !== 'aprovado') {
        alert('O crédito corporativo deste cliente não está Aprovado!');
        return;
      }
      const available = (customer.credit_limit || 0) - (customer.credit_used || 0);
      if (available < total) {
        alert(`Crédito Insuficiente! Limite disponível: ${formatCurrency(available)}`);
        return;
      }
    }

    // Call Context API
    const newOrd = addOrderFromPOS({
      customer_id: customer.id,
      customer_name: customer.name,
      items: cart.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity * (
          (item.pricing_type === 'm2' && item.details)
            ? (item.details.width || 1) * (item.details.height || 1)
            : (item.pricing_type === 'linear' && item.details)
              ? (item.details.width || 1)
              : 1
        ),
        details: item.details
      })),
      discount: discountAmount,
      paid_amount: paymentMethod === 'dinheiro' ? Math.min(total, amountPaid) : total,
      payment_method: paymentMethod,
      notes: checkoutNotes
    });

    // Clear cart and triggers receipt preview
    setCart([]);
    setDiscountAmount(0);
    setIsCheckingOut(false);
    setCheckoutNotes('');
    setAmountPaid(0);

    // Save order data for printer effect
    setJustCompletedOrder(newOrd);
  };

  const handleCreateCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName) return;

    const rawDoc = newCustDoc.replace(/\D/g, '');
    if (rawDoc && rawDoc.length > 11 && !validateCNPJ(rawDoc)) {
      alert('Documento CNPJ inválido! Verifique os dígitos e tente novamente.');
      return;
    }

    const created = addCustomer({
      name: newCustName,
      phone: newCustPhone,
      email: newCustEmail,
      document: newCustDoc || '000.000.000-00',
      address: newCustAddress,
      tags: ['PDV-Balcão'],
      notes: 'Cadastrado diretamente pelo Caixa/PDV.'
    });

    setSelectedCustomerId(created.id);
    setIsCreatingCustomer(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustEmail('');
    setNewCustDoc('');
    setNewCustCnpjStatus('');
    setNewCustAddress({ street: '', number: '', neighborhood: '', city: '', state: '', zip_code: '' });
  };

  const handleNewCustomerDocumentChange = async (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, 14);
    const formatted = clean.length <= 11 ? formatCPF(clean) : formatCNPJ(clean);
    setNewCustDoc(formatted);
    setNewCustCnpjStatus('');

    if (clean.length !== 14) return;

    if (!validateCNPJ(clean)) {
      setNewCustCnpjStatus('CNPJ invalido.');
      return;
    }

    setNewCustCnpjStatus('Consultando CNPJ...');

    try {
      const data = await lookupCNPJ(clean);
      setNewCustName(data.razaoSocial || data.nomeFantasia || newCustName);
      setNewCustPhone(data.telefone || newCustPhone);
      setNewCustEmail(data.email || newCustEmail);
      setNewCustAddress({
        street: data.logradouro,
        number: data.numero,
        neighborhood: data.bairro,
        city: data.municipio,
        state: data.uf,
        zip_code: data.cep,
      });
      setNewCustCnpjStatus('Dados da empresa preenchidos automaticamente.');
    } catch (error) {
      warnCaught('Erro ao consultar CNPJ no PDV:', error);
      setNewCustCnpjStatus(error instanceof Error ? error.message : 'Nao foi possivel consultar o CNPJ.');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getSessionName = (sessionId: string) => {
    const oldestFirst = [...sessions].reverse();
    const idx = oldestFirst.findIndex(s => s.id === sessionId);
    return idx >= 0 ? `Sessão #${idx + 1}` : 'Sessão';
  };

  // Helper to extract session details
  const getSessionTransactions = (sessionId: string) => {
    return registerTransactions.filter(t => t.session_id === sessionId);
  };

  const getSessionCashTotal = (session: typeof activeSession) => {
    if (!session) return 0;
    const transactions = getSessionTransactions(session.id);
    const suprimentos = transactions.filter(t => t.type === 'suprimento').reduce((sum, t) => sum + t.amount, 0);
    const sangrias = transactions.filter(t => t.type === 'sangria').reduce((sum, t) => sum + t.amount, 0);
    const vendasDinheiro = transactions.filter(t => t.type === 'venda' && t.payment_method === 'dinheiro').reduce((sum, t) => sum + t.amount, 0);
    return session.opening_balance + suprimentos + vendasDinheiro - sangrias;
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* 1. Header with Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-card border border-border p-4 rounded-2xl gap-4 no-print shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/10 text-primary flex items-center justify-center rounded-xl border border-primary/20">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">PDV & Fluxo de Caixa</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Terminal de balcão rápido e fechamento financeiro do dia</p>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-secondary/35 p-1 rounded-xl border border-border text-xs font-semibold">
          <button
            onClick={() => setActiveTab('pdv')}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'pdv' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShoppingBag className="h-4 w-4" /> Vendas (PDV)
          </button>
          <button
            onClick={() => setActiveTab('caixa')}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'caixa' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Briefcase className="h-4 w-4" /> Caixa do Dia
            {activeSession ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'historico' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="h-4 w-4" /> Histórico
          </button>
        </div>
      </div>

      {/* 2. Content Sections based on Tabs */}
      
      {/* ---------------------------------------------------- */}
      {/* TAB 1: PDV (Vendas) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'pdv' && (
        <div className="no-print">
          {!activeSession ? (
            /* Warning if cash register is closed */
            <div className="bg-card border border-border p-8 rounded-2xl text-center space-y-4 max-w-lg mx-auto shadow-sm">
              <div className="h-16 w-16 bg-rose-500/10 text-rose-500 flex items-center justify-center rounded-2xl border border-rose-500/20 mx-auto">
                <Lock className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold">O Caixa está Fechado</h3>
              <p className="text-xs text-muted-foreground">
                Para registrar novas vendas no PDV e receber pagamentos, é necessário abrir o caixa físico informando o saldo inicial do dia.
              </p>
              <button
                onClick={() => {
                  setOpeningBalance(100);
                  setOpeningNotes('');
                  setActiveTab('caixa');
                }}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow shadow-primary/25 hover:bg-primary/95 transition-all"
              >
                Abrir Caixa do Dia
              </button>
            </div>
          ) : (
            /* POS Main Grid */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Products Grid */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-card border border-border p-3.5 rounded-2xl shadow-sm space-y-3">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Pesquisar SKU ou nome de produto..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-secondary/20 border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {categoriesList.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all whitespace-nowrap ${
                          selectedCategory === cat
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground'
                        }`}
                      >
                        {getCategoryName(cat).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Catalog Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map(prod => (
                      <button
                        key={prod.id}
                        onClick={() => handleAddProductClick(prod)}
                        className="p-3.5 bg-card border border-border rounded-2xl hover:border-primary/50 text-left transition-all flex flex-col justify-between min-h-44 group hover:shadow-sm overflow-hidden"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex gap-1 flex-wrap min-w-0">
                              <span className="text-[8px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono font-bold max-w-[105px] truncate">
                                {prod.sku}
                              </span>
                              {prod.volume_pricing && prod.volume_pricing.length > 0 && (
                                <span className="text-[8px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1 py-0.5 rounded font-bold">
                                  ATACADO
                                </span>
                              )}
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-primary/10 text-primary border border-primary/10 shrink-0">
                              {prod.pricing_type.toUpperCase()}
                            </span>
                          </div>
                          <h4 className="font-bold text-xs text-foreground mt-2 line-clamp-2 min-h-[2rem] group-hover:text-primary transition-colors">
                            {prod.name}
                          </h4>
                          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">{stripRichTextHtml(prod.description)}</p>
                        </div>
                        <div className="flex justify-between items-end mt-3 gap-2">
                          <span className="text-xs font-extrabold text-foreground min-w-0 leading-tight">
                            {formatCurrency(prod.sales_price)}
                            {prod.pricing_type === 'm2' && <span className="text-[9px] text-muted-foreground font-medium">/m²</span>}
                            {prod.pricing_type === 'linear' && <span className="text-[9px] text-muted-foreground font-medium">/m.lin</span>}
                          </span>
                          <span className="h-7 w-7 rounded-lg bg-secondary group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground flex items-center justify-center transition-all shrink-0">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full py-12 text-center text-muted-foreground italic text-xs bg-card border border-border rounded-2xl shadow-sm">
                      Nenhum produto cadastrado ou ativo neste filtro.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Checkout Cart */}
              <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4 text-xs">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <ShoppingBag className="h-4.5 w-4.5 text-primary" /> Carrinho de Compras
                  </h3>
                  <span className="px-2 py-0.5 bg-secondary text-foreground text-[10px] font-bold rounded-full">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)} item(ns)
                  </span>
                </div>

                {/* Selected customer or Guest */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Identificar Cliente</label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setIsCreatingCustomer(true)}
                        className="text-[10px] text-primary hover:underline font-bold flex items-center gap-0.5"
                      >
                        <UserPlus className="h-3 w-3" /> Novo
                      </button>
                      <button
                        onClick={() => setSelectedCustomerId('guest')}
                        className="text-[10px] text-muted-foreground hover:text-foreground font-bold"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-xl text-xs text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="guest">Consumidor Final (Venda Rápida de Balcão)</option>
                    {customers.map(cust => (
                      <option key={cust.id} value={cust.id}>
                        {cust.name} {cust.billing_type === 'faturado' ? '- FATURADO B2B' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cart list */}
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {cart.length > 0 ? (
                    cart.map((item, idx) => {
                      const sizeFactor = (item.pricing_type === 'm2' && item.details)
                        ? (item.details.width || 1) * (item.details.height || 1)
                        : (item.pricing_type === 'linear' && item.details)
                          ? (item.details.width || 1)
                          : 1;
                      
                      const lineTotal = item.unit_price * sizeFactor * item.quantity;

                      return (
                        <div key={idx} className="p-3 bg-secondary/15 border border-border rounded-xl flex justify-between items-start gap-4">
                          <div className="space-y-0.5">
                            <div className="font-bold text-foreground line-clamp-1">{item.product_name}</div>
                            
                            {/* Render dimensions details */}
                            {item.details && (item.details.width || item.details.height) && (
                              <div className="text-[9px] text-muted-foreground">
                                Medidas: {item.details.width}m {item.details.height ? `x ${item.details.height}m` : 'linear'} ({sizeFactor.toFixed(2)} m²)
                              </div>
                            )}
                            {item.details?.notes && (
                              <div className="text-[9px] text-slate-400 italic font-medium">"{item.details.notes}"</div>
                            )}

                            <div className="text-[10px] text-muted-foreground font-medium">
                              {formatCurrency(item.unit_price)} x {item.quantity}
                            </div>
                          </div>
                          
                          <div className="text-right shrink-0 space-y-1.5">
                            <span className="font-bold text-foreground text-xs block">{formatCurrency(lineTotal)}</span>
                            
                            <div className="flex items-center gap-2">
                              {/* Quantity triggers */}
                              <button
                                onClick={() => {
                                  setCart(prev => prev.map((c, i) => {
                                    if (i === idx) {
                                      const newQty = Math.max(1, c.quantity - 1);
                                      const prod = products.find(p => p.id === c.product_id);
                                      const uPrice = prod ? getProductUnitPrice(prod, newQty) : c.unit_price;
                                      return { ...c, quantity: newQty, unit_price: uPrice };
                                    }
                                    return c;
                                  }));
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <MinusCircle className="h-4 w-4" />
                              </button>
                              <span className="font-bold text-xs font-mono">{item.quantity}</span>
                              <button
                                onClick={() => {
                                  setCart(prev => prev.map((c, i) => {
                                    if (i === idx) {
                                      const newQty = c.quantity + 1;
                                      const prod = products.find(p => p.id === c.product_id);
                                      const uPrice = prod ? getProductUnitPrice(prod, newQty) : c.unit_price;
                                      return { ...c, quantity: newQty, unit_price: uPrice };
                                    }
                                    return c;
                                  }));
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <PlusCircle className="h-4 w-4" />
                              </button>
                              
                              <button
                                onClick={() => {
                                  setCart(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="text-rose-500 hover:text-rose-400 ml-1.5"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-muted-foreground italic border border-dashed border-border rounded-xl">
                      O carrinho está vazio. Adicione produtos ao lado.
                    </div>
                  )}
                </div>

                {/* Subtotals & Discounts */}
                {cart.length > 0 && (
                  <div className="border-t border-border pt-3 space-y-2 font-medium">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal:</span>
                      <span className="text-foreground font-bold">{formatCurrency(getSubtotal())}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Desconto (R$):</span>
                      <input
                        type="text"
                        value={formatCurrencyInput(discountAmount)}
                        onChange={(e) => {
                          const val = parseCurrencyInputToNumber(e.target.value);
                          setDiscountAmount(Math.min(getSubtotal(), val));
                        }}
                        placeholder="R$ 0,00"
                        className="w-24 px-2 py-1 bg-secondary/40 border border-border rounded-lg text-right font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="flex justify-between text-sm font-black border-t border-border/60 pt-2">
                      <span className="text-foreground">Total Líquido:</span>
                      <span className="text-primary text-base font-extrabold">{formatCurrency(getCartTotal())}</span>
                    </div>

                    {/* Checkout launch button */}
                    <button
                      onClick={() => {
                        setPaymentMethod('dinheiro');
                        setAmountPaid(getCartTotal());
                        setIsCheckingOut(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold shadow-md shadow-primary/20 transition-all mt-3"
                    >
                      <DollarSign className="h-4 w-4" /> Finalizar & Receber Pagamento
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: CAIXA DO DIA */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'caixa' && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6 no-print">
          {!activeSession ? (
            /* Open register form */
            <div className="max-w-md mx-auto text-center space-y-5 py-6">
              <div className="h-14 w-14 bg-primary/10 text-primary flex items-center justify-center rounded-2xl border border-primary/20 mx-auto">
                <Unlock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Abertura de Caixa Físico</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Informe o valor em dinheiro contido na gaveta física (fundo de troco) para iniciar a sessão diária.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openRegister(openingBalance, openingNotes);
                  setIsOpeningRegister(false);
                }}
                className="space-y-4 text-left"
              >
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-muted-foreground block">Fundo de Troco Inicial (R$)</label>
                  <input
                    type="text"
                    value={formatCurrencyInput(openingBalance)}
                    onChange={(e) => setOpeningBalance(parseCurrencyInputToNumber(e.target.value))}
                    className="w-full px-3 py-2 bg-secondary/35 border border-border rounded-xl text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>
                
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-muted-foreground block">Observações de Abertura (Opcional)</label>
                  <textarea
                    rows={2}
                    value={openingNotes}
                    onChange={(e) => setOpeningNotes(e.target.value)}
                    placeholder="Ex: Fundo de troco com notas baixas e moedas."
                    className="w-full px-3 py-2 bg-secondary/35 border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow hover:bg-primary/95 transition-all"
                >
                  Confirmar e Abrir Caixa
                </button>
              </form>
            </div>
          ) : (
            /* Open register controls */
            <div className="space-y-6">
              {/* Session header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-4 gap-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase rounded-md animate-pulse">
                      Caixa Aberto
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">{getSessionName(activeSession.id)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Aberto por: <strong>{activeSession.opened_by}</strong> - Início: {new Date(activeSession.opened_at).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => {
                      setAdjAmount(0);
                      setAdjDescription('');
                      setIsAddingAdjustment('suprimento');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold border border-border"
                  >
                    Suprimento (+)
                  </button>
                  <button
                    onClick={() => {
                      setAdjAmount(0);
                      setAdjDescription('');
                      setIsAddingAdjustment('sangria');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold border border-border"
                  >
                    Sangria (-)
                  </button>
                  <button
                    onClick={() => {
                      setCountedCash(getSessionCashTotal(activeSession));
                      setClosingNotes('');
                      setIsClosingRegister(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/15"
                  >
                    Fechar Caixa
                  </button>
                </div>
              </div>

              {/* Session Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-3.5 bg-secondary/20 border border-border rounded-xl text-left text-xs">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Fundo de Abertura</span>
                  <h4 className="text-base font-bold mt-1 text-foreground">{formatCurrency(activeSession.opening_balance)}</h4>
                </div>

                <div className="p-3.5 bg-secondary/20 border border-border rounded-xl text-left text-xs">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase block">Vendas Dinheiro</span>
                  <h4 className="text-base font-bold mt-1 text-emerald-500">
                    {formatCurrency(
                      getSessionTransactions(activeSession.id)
                        .filter(t => t.type === 'venda' && t.payment_method === 'dinheiro')
                        .reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </h4>
                </div>

                <div className="p-3.5 bg-secondary/20 border border-border rounded-xl text-left text-xs">
                  <span className="text-[10px] font-bold text-blue-500 uppercase block">Suprimentos / Entradas</span>
                  <h4 className="text-base font-bold mt-1 text-blue-500">
                    {formatCurrency(
                      getSessionTransactions(activeSession.id)
                        .filter(t => t.type === 'suprimento')
                        .reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </h4>
                </div>

                <div className="p-3.5 bg-secondary/20 border border-border rounded-xl text-left text-xs">
                  <span className="text-[10px] font-bold text-rose-500 uppercase block">Sangrias / Retiradas</span>
                  <h4 className="text-base font-bold mt-1 text-rose-500">
                    {formatCurrency(
                      getSessionTransactions(activeSession.id)
                        .filter(t => t.type === 'sangria')
                        .reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </h4>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/25 rounded-xl text-left text-xs col-span-2 md:col-span-1">
                  <span className="text-[10px] font-bold text-primary uppercase block">Dinheiro em Caixa</span>
                  <h4 className="text-lg font-black mt-0.5 text-primary">{formatCurrency(getSessionCashTotal(activeSession))}</h4>
                </div>
              </div>

              {/* Additional payment methods stats */}
              <div className="flex flex-wrap gap-3.5 bg-secondary/10 p-3 rounded-xl border border-border text-[11px] font-semibold">
                <span className="text-muted-foreground uppercase text-[10px] flex items-center gap-1">Outros Recebimentos:</span>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Pix:</span>
                  <span className="text-foreground">
                    {formatCurrency(
                      getSessionTransactions(activeSession.id)
                        .filter(t => t.type === 'venda' && t.payment_method === 'pix')
                        .reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 border-l border-border pl-3.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Cartões:</span>
                  <span className="text-foreground">
                    {formatCurrency(
                      getSessionTransactions(activeSession.id)
                        .filter(t => t.type === 'venda' && ['cartao_credito', 'cartao_debito'].includes(t.payment_method))
                        .reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 border-l border-border pl-3.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Boleto:</span>
                  <span className="text-foreground">
                    {formatCurrency(
                      getSessionTransactions(activeSession.id)
                        .filter(t => t.type === 'venda' && t.payment_method === 'boleto')
                        .reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 border-l border-border pl-3.5">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  <span className="text-muted-foreground">Faturado B2B:</span>
                  <span className="text-foreground">
                    {formatCurrency(
                      getSessionTransactions(activeSession.id)
                        .filter(t => t.type === 'venda' && t.payment_method === 'faturado')
                        .reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Transactions Timeline */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider block">Movimentações do Caixa Atual</h4>
                <div className="bg-secondary/10 border border-border rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                        <th className="px-4 py-2.5">Horário</th>
                        <th className="px-4 py-2.5">Operação</th>
                        <th className="px-4 py-2.5">Descrição</th>
                        <th className="px-4 py-2.5">Forma</th>
                        <th className="px-4 py-2.5 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {getSessionTransactions(activeSession.id).length > 0 ? (
                        getSessionTransactions(activeSession.id).map(trans => {
                          const badges = {
                            abertura: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
                            suprimento: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                            sangria: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                            venda: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                            fechamento: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          };

                          return (
                            <tr key={trans.id} className="hover:bg-secondary/5">
                              <td className="px-4 py-2.5 text-muted-foreground font-mono">
                                {new Date(trans.created_at).toLocaleTimeString('pt-BR')}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold border uppercase ${badges[trans.type]}`}>
                                  {trans.type}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-foreground font-semibold">{trans.description}</td>
                              <td className="px-4 py-2.5 text-muted-foreground uppercase text-[9px] font-mono">
                                {trans.payment_method}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-bold ${
                                ['sangria', 'fechamento'].includes(trans.type) ? 'text-rose-500' : 'text-foreground'
                              }`}>
                                {formatCurrency(trans.amount)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground italic">
                            Nenhuma transação efetuada nesta sessão.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: HISTÓRICO DE CAIXAS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'historico' && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4 no-print text-xs">
          <h3 className="text-sm font-bold">Histórico de Fechamentos de Caixa</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Sessões encerradas e auditoria financeira das quebras ou sobras</p>

          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                  <th className="px-4 py-2.5">Sessão</th>
                  <th className="px-4 py-2.5">Abertura</th>
                  <th className="px-4 py-2.5">Encerramento</th>
                  <th className="px-4 py-2.5">Fundo Inicial</th>
                  <th className="px-4 py-2.5 text-right">Esperado Caixa</th>
                  <th className="px-4 py-2.5 text-right">Contado (Físico)</th>
                  <th className="px-4 py-2.5 text-right">Diferença</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.length > 0 ? (
                  sessions.map(s => {
                    const diff = s.difference || 0;
                    return (
                      <tr key={s.id} className="hover:bg-secondary/5">
                        <td className="px-4 py-3 font-semibold text-foreground">{getSessionName(s.id)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(s.opened_at).toLocaleDateString('pt-BR')}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.closed_at ? new Date(s.closed_at).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">{formatCurrency(s.opening_balance)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(s.expected_cash)}</td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {s.actual_cash !== undefined ? formatCurrency(s.actual_cash) : '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-extrabold ${
                          diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-rose-500 font-bold' : 'text-muted-foreground'
                        }`}>
                          {s.status === 'fechado' ? (
                            diff > 0 ? `+ ${formatCurrency(diff)}` : diff < 0 ? `- ${formatCurrency(Math.abs(diff))}` : 'Sem quebra'
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold border ${
                            s.status === 'aberto'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse'
                              : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                          }`}>
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">
                      Nenhum fechamento registrado no banco.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* POPUP: CONFIGURAR DIMENSÕES DO PRODUTO (m2 / linear) */}
      {/* ---------------------------------------------------- */}
      {configuringProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto flex justify-center items-start p-4 text-xs no-print">
          <div className="bg-card border border-border p-5 rounded-2xl w-full max-w-sm my-auto space-y-4 shadow-xl text-foreground">
            <h3 className="text-sm font-bold text-foreground">Medidas Personalizadas</h3>
            <p className="text-[10px] text-muted-foreground">
              O produto <strong>{configuringProduct.name}</strong> é cobrado por {configuringProduct.pricing_type === 'm2' ? 'Metro Quadrado (m²)' : 'Metro Linear'}. Informe as medidas do trabalho:
            </p>

            <form onSubmit={handleDimensionConfirm} className="space-y-4 text-left font-medium">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Largura / Compr. (cm)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={Number((customWidth * 100).toFixed(2))}
                    onChange={(e) => setCustomWidth(Math.max(1, parseFloat(e.target.value) || 1) / 100)}
                    className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs font-bold text-foreground"
                    required
                  />
                </div>
                
                {configuringProduct.pricing_type === 'm2' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground">Altura (cm)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={Number((customHeight * 100).toFixed(2))}
                      onChange={(e) => setCustomHeight(Math.max(1, parseFloat(e.target.value) || 1) / 100)}
                      className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs font-bold text-foreground"
                      required
                    />
                  </div>
                )}
              </div>

              {configuringProduct.pricing_type === 'm2' && (
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold bg-secondary/20 p-2 rounded-lg border border-border/50">
                  <span>Área Total Calculada:</span>
                  <span className="text-foreground text-xs">{(customWidth * customHeight).toFixed(2)} m²</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Acabamento / Observações do Item</label>
                <input
                  type="text"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Ex: Ilhós a cada 50cm, solda nas bordas."
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfiguringProduct(null)}
                  className="flex-1 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold"
                >
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: CHECKOUT DE RECEBIMENTO */}
      {/* ---------------------------------------------------- */}
      {isCheckingOut && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-start p-4 text-xs no-print">
          <div className="bg-card border border-border p-5 rounded-2xl w-full max-w-md my-auto max-h-[90vh] flex flex-col shadow-xl text-foreground text-left">
            <h3 className="text-sm font-bold border-b border-border pb-2 flex items-center gap-1 shrink-0">
              <DollarSign className="h-4.5 w-4.5 text-emerald-500" /> Detalhes de Pagamento do PDV
            </h3>

            <div className="p-3 bg-secondary/20 rounded-xl border border-border flex justify-between items-center text-xs shrink-0 my-3">
              <span className="text-muted-foreground">Total da Compra:</span>
              <span className="text-lg font-black text-primary">{formatCurrency(getCartTotal())}</span>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="flex-1 flex flex-col overflow-hidden font-medium">
              <div className="flex-1 overflow-y-auto space-y-4 pr-1.5 pb-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground">Meio de Pagamento</label>
                    <select
                      value={paymentMethod}
                      onChange={(e: any) => {
                        setPaymentMethod(e.target.value);
                        if (e.target.value !== 'dinheiro') {
                          setAmountPaid(getCartTotal());
                        }
                      }}
                      className="w-full px-2.5 py-2 bg-secondary/35 border border-border rounded-xl text-xs text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="dinheiro">Dinheiro (Espécie)</option>
                      <option value="pix">Pix (QRCode)</option>
                      <option value="cartao_credito">Cartão de Crédito</option>
                      <option value="cartao_debito">Cartão de Débito</option>
                      <option value="boleto">Boleto Bancário</option>
                      <option value="faturado">Faturado Corporativo (B2B)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground">
                      {paymentMethod === 'dinheiro' ? 'Valor Recebido (R$)' : 'Valor Pago (R$)'}
                    </label>
                    <input
                      type="text"
                      disabled={paymentMethod !== 'dinheiro'}
                      value={formatCurrencyInput(amountPaid)}
                      onChange={(e) => setAmountPaid(parseCurrencyInputToNumber(e.target.value))}
                      className="w-full px-2.5 py-2 bg-secondary/35 border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Dynamic change (troco) calculator */}
                {paymentMethod === 'dinheiro' && amountPaid > getCartTotal() && (
                  <div className="flex justify-between items-center text-[10px] text-emerald-500 font-extrabold bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                    <span>Troco da Gaveta:</span>
                    <span className="text-sm font-black">{formatCurrency(amountPaid - getCartTotal())}</span>
                  </div>
                )}

                {/* Credit check PJ indicator */}
                {paymentMethod === 'faturado' && (() => {
                  const matchCust = getSelectedCustomer();
                  const available = matchCust ? ((matchCust.credit_limit || 0) - (matchCust.credit_used || 0)) : 0;
                  const total = getCartTotal();

                  return (
                    <div className="p-3 bg-secondary/20 border border-border rounded-xl space-y-1.5 text-[10px]">
                      <div className="flex justify-between items-center font-bold pb-1 border-b border-border/30">
                        <span>Limite Disponível:</span>
                        <span className={available >= total ? 'text-emerald-500' : 'text-rose-500'}>{formatCurrency(available)}</span>
                      </div>
                      {matchCust?.id === 'guest' ? (
                        <div className="text-rose-500 font-bold bg-rose-500/10 p-1.5 rounded">
                          Consumidor Final não é elegível para faturamento corporativo!
                        </div>
                      ) : matchCust?.billing_type !== 'faturado' ? (
                        <div className="text-rose-500 font-bold bg-rose-500/10 p-1.5 rounded">
                          Cliente corporativo não está habilitado para Faturar no CRM!
                        </div>
                      ) : available < total ? (
                        <div className="text-rose-500 font-bold bg-rose-500/10 p-1.5 rounded">
                          Limite de crédito insuficiente para faturar esta venda!
                        </div>
                      ) : (
                        <div className="text-emerald-500 font-bold bg-emerald-500/10 p-1.5 rounded">
                          Faturamento liberado (Prazo de {matchCust.payment_terms_days || 30} dias)
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Pix Dynamic Payload & QR Code */}
                {paymentMethod === 'pix' && (() => {
                  const pixPayload = generatePixPayload(settings.pix_key, getCartTotal());
                  return (
                    <div className="p-3 bg-card border border-primary/20 border-dashed rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                      <div className="h-44 w-44 bg-white p-2 rounded-lg flex items-center justify-center border border-border">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(pixPayload)}`}
                          alt="PIX QR Code"
                          className="h-40 w-40"
                        />
                      </div>
                      <div className="w-full text-center space-y-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">Pix Copia e Cola:</span>
                        <textarea
                          readOnly
                          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                          value={pixPayload}
                          className="w-full text-[9px] font-mono bg-secondary/50 p-1.5 rounded border border-border resize-none text-foreground text-center focus:outline-none"
                          rows={3}
                        />
                        <p className="text-[8px] text-emerald-400">Clique para selecionar e copiar o código Pix.</p>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Observações / Internas do Pedido</label>
                  <input
                    type="text"
                    value={checkoutNotes}
                    onChange={(e) => setCheckoutNotes(e.target.value)}
                    placeholder="Ex: Entrega rápida motoboy ou Retirada na matriz."
                    className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-border mt-2 shrink-0 font-semibold">
                <button
                  type="button"
                  onClick={() => setIsCheckingOut(false)}
                  className="flex-1 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={paymentMethod === 'faturado' && (getSelectedCustomer()?.id === 'guest' || getSelectedCustomer()?.billing_type !== 'faturado' || ((getSelectedCustomer()?.credit_limit || 0) - (getSelectedCustomer()?.credit_used || 0)) < getCartTotal())}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 text-xs shadow-md shadow-emerald-600/20 disabled:opacity-40"
                >
                  Registrar e Imprimir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: SUPRIMENTO / SANGRIA */}
      {/* ---------------------------------------------------- */}
      {isAddingAdjustment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto flex justify-center items-start p-4 text-xs no-print">
          <div className="bg-card border border-border p-5 rounded-2xl w-full max-w-sm my-auto space-y-4 shadow-xl text-foreground text-left">
            <h3 className="text-sm font-bold border-b border-border pb-2 capitalize flex items-center gap-1 text-foreground">
              <PlusCircle className={`h-4.5 w-4.5 ${isAddingAdjustment === 'suprimento' ? 'text-blue-500' : 'text-rose-500'}`} />
              Registrar {isAddingAdjustment} de Caixa
            </h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addRegisterTransaction(isAddingAdjustment, adjAmount, adjDescription);
                setIsAddingAdjustment(false);
              }}
              className="space-y-4 font-medium"
            >
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Valor em Dinheiro (R$)</label>
                <input
                  type="text"
                  value={formatCurrencyInput(adjAmount)}
                  onChange={(e) => setAdjAmount(parseCurrencyInputToNumber(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Motivo / Descrição</label>
                <input
                  type="text"
                  value={adjDescription}
                  onChange={(e) => setAdjDescription(e.target.value)}
                  placeholder={isAddingAdjustment === 'suprimento' ? 'Ex: Troco inicial extra enviado pelo banco.' : 'Ex: Retirada para pagamento motoboy.'}
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingAdjustment(false)}
                  className="flex-1 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold shadow"
                >
                  Gravar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: FECHAMENTO DE CAIXA */}
      {/* ---------------------------------------------------- */}
      {isClosingRegister && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto flex justify-center items-start p-4 text-xs no-print">
          <div className="bg-card border border-border p-5 rounded-2xl w-full max-w-sm my-auto space-y-4 shadow-xl text-foreground text-left">
            <h3 className="text-sm font-bold border-b border-border pb-2 flex items-center gap-1 text-rose-500">
              <Lock className="h-4.5 w-4.5" /> Encerramento de Turno
            </h3>

            <div className="p-3 bg-secondary/20 border border-border rounded-xl space-y-1.5 font-medium">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fundo Inicial:</span>
                <span className="text-foreground">{formatCurrency(activeSession.opening_balance)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-muted-foreground">Dinheiro Esperado:</span>
                <span className="text-foreground">{formatCurrency(getSessionCashTotal(activeSession))}</span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                closeRegister(countedCash, closingNotes);
                setIsClosingRegister(false);
              }}
              className="space-y-4 font-medium"
            >
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Dinheiro Contado na Gaveta (R$)</label>
                <input
                  type="text"
                  value={formatCurrencyInput(countedCash)}
                  onChange={(e) => setCountedCash(parseCurrencyInputToNumber(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              {/* Sobra ou Quebra indicator */}
              {(() => {
                const diff = countedCash - getSessionCashTotal(activeSession);
                if (diff === 0) return null;
                return (
                  <div className={`p-2.5 rounded-lg border text-[10px] font-bold ${
                    diff > 0 
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                      : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                  }`}>
                    {diff > 0 ? `SOBRA DE CAIXA: + ${formatCurrency(diff)}` : `QUEBRA DE CAIXA (FALTA): - ${formatCurrency(Math.abs(diff))}`}
                  </div>
                );
              })()}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Observações / Justificativas</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Justifique eventuais sobras ou quebras do caixa."
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsClosingRegister(false)}
                  className="flex-1 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-500 text-xs font-semibold shadow-md shadow-rose-600/25"
                >
                  Confirmar Fechamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: CADASTRAR CLIENTE RAPIDINHO */}
      {/* ---------------------------------------------------- */}
      {isCreatingCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto flex justify-center items-start p-4 text-xs no-print">
          <div className="bg-card border border-border p-5 rounded-2xl w-full max-w-sm my-auto space-y-4 shadow-xl text-foreground text-left">
            <h3 className="text-sm font-bold border-b border-border pb-2 flex items-center gap-1">
              <UserPlus className="h-4.5 w-4.5 text-primary" /> Cadastro Expresso de Cliente
            </h3>

            <form onSubmit={handleCreateCustomerSubmit} className="space-y-3 font-medium">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Nome Completo / Razão Social</label>
                <input
                  type="text"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Telefone</label>
                <input
                  type="text"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">E-mail</label>
                <input
                  type="email"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  placeholder="contato@cliente.com"
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">CPF / CNPJ</label>
                <input
                  type="text"
                  value={newCustDoc}
                  onChange={(e) => handleNewCustomerDocumentChange(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full px-2.5 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {newCustCnpjStatus && (
                  <p className={`text-[9px] font-bold ${newCustCnpjStatus.includes('preenchidos') ? 'text-emerald-500' : newCustCnpjStatus.includes('Consultando') ? 'text-primary' : 'text-rose-500'}`}>
                    {newCustCnpjStatus}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingCustomer(false)}
                  className="flex-1 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold"
                >
                  Cadastrar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 80mm THERMAL RECEIPT EMULATOR (PRINT ONLY) */}
      {/* ---------------------------------------------------- */}
      {justCompletedOrder && (
        <div className="hidden print:block p-4 font-mono text-[10px] text-black bg-white" id="printable-pos-receipt">
          <div className="text-center space-y-1 border-b border-dashed border-black pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide">PrintFlowPRO ERP</h2>
            <p>CNPJ: 12.345.678/0001-90</p>
            <p>Rua de Produção Gráfica, 100</p>
            <p>Tel: (11) 3333-5555</p>
            <p className="font-bold border-t border-dashed border-black mt-2 pt-1">CUPOM NÃO FISCAL</p>
            <p>Pedido: <span className="font-bold">{justCompletedOrder.number}</span></p>
            <p>Data: {new Date(justCompletedOrder.created_at).toLocaleString('pt-BR')}</p>
          </div>

          <div className="border-b border-dashed border-black py-2 space-y-1.5">
            <p><strong>Cliente:</strong> {justCompletedOrder.customer_name}</p>
            <p><strong>Operador:</strong> Caixa Balcão</p>
          </div>

          <div className="print-items-list border-b border-dashed border-black py-1.5 space-y-1">
            <div className="flex justify-between font-bold border-b border-dashed border-black pb-1">
              <span>Item / Qtd</span>
              <span className="text-right">Total</span>
            </div>
            
            {justCompletedOrder.items.map((item: any, idx: number) => {
              const hasDimensions = item.details && (item.details.width || item.details.height);
              return (
                <div key={idx} className="space-y-px leading-tight">
                  <div className="flex justify-between gap-2">
                    <span>{item.quantity}x {item.product_name}</span>
                    <span className="text-right">{formatCurrency(item.total_price)}</span>
                  </div>
                  {hasDimensions && (
                    <div className="text-[9px] text-gray-500 pl-2 leading-tight">
                      Medida: {item.details.width}m {item.details.height ? `x ${item.details.height}m` : 'linear'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="py-2.5 space-y-1.5 font-bold">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(justCompletedOrder.total_amount)}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Desconto:</span>
              <span>R$ 0,00</span>
            </div>
            <div className="flex justify-between text-base border-t border-dashed border-black pt-1.5 font-black">
              <span>TOTAL DO CUPOM:</span>
              <span>{formatCurrency(justCompletedOrder.total_amount)}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-black pt-3 text-center space-y-1">
            <p className="font-bold">OBRIGADO PELA PREFERÊNCIA!</p>
            <p>Conserve este recibo para retirada do material</p>
            <p className="text-[8px] mt-2 text-gray-400">Desenvolvido por PrintFlowPRO</p>
          </div>
        </div>
      )}
    </div>
  );
}
