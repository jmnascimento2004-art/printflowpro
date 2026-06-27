'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  FileText, 
  Search, 
  Trash2, 
  Check, 
  Printer, 
  X, 
  PlusCircle,
  Edit2,
  Truck,
  RefreshCw
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Quote, QuoteItem } from '@/lib/dummy-data';
import type { AdditionalService } from '@/lib/dummy-data';
import { AdditionalServicesSection, getAdditionalServicesTotal } from '@/components/commercial/AdditionalServicesSection';
import {
  formatCurrencyInput,
  parseCurrencyInputToNumber,
  formatCEP,
  getPixWhatsAppPaymentInfo,
  getPublicImageUrl,
  getWhatsAppTimeGreeting
} from '@/lib/utils';
import { calculateRouteDistance } from '@/lib/delivery';
import { warnCaught } from '@/lib/safe-log';
import { formatUnitCurrency } from '@/lib/pricing';

export default function QuotesPage() {
  const { 
    quotes, 
    addQuote, 
    updateQuote,
    deleteQuote, 
    approveQuote, 
    customers, 
    products,
    settings,
    company
  } = useDatabase();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [activePrintQuote, setActivePrintQuote] = useState<Quote | null>(null);
  const [requestedCustomerId, setRequestedCustomerId] = useState('');
  const [customerPrefillMessage, setCustomerPrefillMessage] = useState('');

  const resolveQuoteCustomer = (quote: Quote) => {
    const webName = quote.customer_name.replace(/\s+\(Web\)$/i, '').trim();
    return customers.find(c =>
      c.id === quote.customer_id ||
      c.name === quote.customer_name ||
      c.name === webName
    );
  };

  const getQuoteCustomerName = (quote: Quote) => {
    return resolveQuoteCustomer(quote)?.name || quote.customer_name.replace(/\s+\(Web\)$/i, '').trim() || quote.customer_name;
  };

  const withResolvedCustomer = (quote: Quote): Quote => {
    const customer = resolveQuoteCustomer(quote);
    if (!customer) return quote;

    return {
      ...quote,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: quote.customer_phone || customer.phone
    };
  };

  const withPrintableItems = (quote: Quote): Quote => {
    if (quote.items && quote.items.length > 0) return quote;

    const match = quotes.find((item) => item.id === quote.id || item.number === quote.number);
    if (match?.items?.length) return { ...quote, items: match.items };

    try {
      const storedQuotes = JSON.parse(window.localStorage.getItem('printflow_quotes') || '[]') as Quote[];
      const stored = storedQuotes.find((item) => item.id === quote.id || item.number === quote.number);
      if (stored?.items?.length) return { ...quote, items: stored.items };
    } catch {
      // Keep the quote as-is when browser storage is unavailable or malformed.
    }

    return quote;
  };

  const preparePrintQuote = (quote: Quote) => withPrintableItems(withResolvedCustomer(quote));

  const buildAddressLine = (address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  }) => {
    if (!address) return '';
    const streetLine = [address.street, address.number].filter(Boolean).join(', ');
    const districtLine = [address.neighborhood, address.city].filter(Boolean).join(' - ');
    const stateLine = [address.state, address.zip_code ? `CEP ${address.zip_code}` : ''].filter(Boolean).join(' - ');
    return [streetLine, districtLine, stateLine].filter(Boolean).join(', ');
  };

  const buildCompanyRegisteredAddress = () => {
    const structuredAddress = buildAddressLine({
      street: company?.street,
      number: company?.number,
      neighborhood: company?.neighborhood,
      city: company?.city,
      state: company?.state,
      zip_code: company?.cep
    });

    return structuredAddress || settings.company_address || '';
  };

  const shouldShowCompanyAddress = settings.footer_show_address !== false;
  const companyLogoUrl = getPublicImageUrl(company?.logo_light || company?.logo_url || company?.logo_dark || company?.favicon);
  const companyDisplayName = company?.name?.trim() || 'Empresa';

  const handleStartEdit = (quote: Quote) => {
    const resolvedQuote = withResolvedCustomer(quote);
    setEditingQuoteId(resolvedQuote.id);
    setCustomerId(resolvedQuote.customer_id);
    setDiscount(resolvedQuote.discount);
    setValidUntil(resolvedQuote.valid_until);
    setNotes(resolvedQuote.notes || '');
    setAdditionalServices(resolvedQuote.additional_services || []);
    setItems(resolvedQuote.items.map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      details: it.details
    })));
    setDeliveryType(resolvedQuote.delivery_type || 'retirada');
    setDeliveryAddress(resolvedQuote.delivery_address || '');
    setDeliveryDistanceKm(resolvedQuote.delivery_distance_km || 0);
    setDeliveryFee(resolvedQuote.delivery_fee || 0);
    setLastCalculatedAddress(resolvedQuote.delivery_address || '');
    
    // Preenche campos estruturados a partir da string salva
    const parsed = parseDeliveryAddress(resolvedQuote.delivery_address || '');
    setDeliveryStreet(parsed.street);
    setDeliveryNumber(parsed.number);
    setDeliveryNeighborhood(parsed.neighborhood);
    setDeliveryCity(parsed.city);
    setDeliveryState(parsed.state);
    setDeliveryZipCode(parsed.zip);
    
    setIsCreating(true);
  };

  const sendPixWhatsApp = (quote: Quote) => {
    const customer = resolveQuoteCustomer(quote);
    const phone = customer?.phone;
    if (!phone) {
      alert("Telefone do cliente não encontrado!");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 11 || cleanPhone.length === 10
      ? `55${cleanPhone}`
      : cleanPhone;

    const pixKey = settings.pix_key || "financeiro@printflowpro.com.br";
    const amount = quote.total_amount;
    const pixInfo = getPixWhatsAppPaymentInfo({
      key: pixKey,
      keyType: settings.pix_key_type,
      amount,
      merchantName: company?.name || "PrintFlowPRO",
      beneficiaryName: settings.pix_beneficiary_name || company?.name,
      bankName: settings.bank_name
    });
    const logoUrl = getPublicImageUrl(company?.logo_light || company?.logo_url || company?.logo_dark);
    const logoLine = logoUrl ? `\n\n🏢 Logo da empresa: ${logoUrl}` : '';
    const greeting = getWhatsAppTimeGreeting();

    const message = `${greeting}, *${customer?.name || getQuoteCustomerName(quote)}*! 👋\nOlá, tudo bem?\n\nSegue a cobrança do seu orçamento *#${quote.number}*:\n\n💰 *Valor total:* *${formatCurrency(amount)}*\n\n🔑 *${pixInfo.label}:*\n${pixInfo.value}${pixInfo.securityText}\n\n✅ Após realizar o pagamento, por favor nos envie o comprovante por aqui.${logoLine}\n\nQualquer dúvida, estamos à disposição! 😊\n\nAtenciosamente,\n*${company?.name || "PrintFlowPRO"}*`;

    const encodedText = encodeURIComponent(message);
    const url = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
    if (typeof window === 'undefined') return;
    window.open(url, '_blank');
  };

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Omit<QuoteItem, 'id' | 'total_price'>[]>([]);
  const [additionalServices, setAdditionalServices] = useState<AdditionalService[]>([]);

  // Delivery Form States
  const [deliveryType, setDeliveryType] = useState<'retirada' | 'motoboy' | 'carro' | 'correios'>('retirada');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [lastCalculatedAddress, setLastCalculatedAddress] = useState('');

  // Structured Address States
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryZipCode, setDeliveryZipCode] = useState('');

  const buildQuoteOriginAddress = useCallback(() => {
    const hasRegisteredAddress = Boolean(
      company?.street?.trim() &&
      company?.number?.trim() &&
      company?.neighborhood?.trim() &&
      company?.city?.trim() &&
      company?.state?.trim()
    );

    return hasRegisteredAddress
      ? `${company.street}, ${company.number} - ${company.neighborhood}, ${company.city} - ${company.state}${company.cep ? `, CEP ${company.cep}` : ''}`
      : settings.company_address;
  }, [
    company?.street,
    company?.number,
    company?.neighborhood,
    company?.city,
    company?.state,
    company?.cep,
    settings.company_address
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextCustomerId = params.get('customerId')?.trim() || '';
    if (nextCustomerId) {
      setRequestedCustomerId(nextCustomerId);
      setIsCreating(true);
    }
  }, []);

  useEffect(() => {
    if (!requestedCustomerId) return;

    const selectedClient = customers.find((customer) => customer.id === requestedCustomerId);
    if (selectedClient) {
      setEditingQuoteId(null);
      setCustomerId(selectedClient.id);
      setCustomerPrefillMessage('');
      return;
    }

    if (customers.length > 0) {
      setCustomerId('');
      setCustomerPrefillMessage('Cliente informado no link nao foi encontrado. Selecione outro cliente para continuar.');
    }
  }, [requestedCustomerId, customers]);

  // Helper para decodificar o endereço concatenado salvo
  const parseDeliveryAddress = (addrStr: string) => {
    const defaultVals = { street: '', number: '', neighborhood: '', city: '', state: '', zip: '' };
    if (!addrStr) return defaultVals;

    try {
      const matchWithCep = addrStr.match(/^([^,]+),\s*([^-]+)-\s*([^,]+),\s*([^-]+)-\s*([^,]+),\s*CEP\s*(\d{5}-\d{3})/);
      if (matchWithCep) {
        return {
          street: matchWithCep[1].trim(),
          number: matchWithCep[2].trim(),
          neighborhood: matchWithCep[3].trim(),
          city: matchWithCep[4].trim(),
          state: matchWithCep[5].trim(),
          zip: matchWithCep[6].trim()
        };
      }
      
      const matchWithoutCep = addrStr.match(/^([^,]+),\s*([^-]+)-\s*([^,]+),\s*([^-/]+)\/([A-Z]{2})/);
      if (matchWithoutCep) {
        return {
          street: matchWithoutCep[1].trim(),
          number: matchWithoutCep[2].trim(),
          neighborhood: matchWithoutCep[3].trim(),
          city: matchWithoutCep[4].trim(),
          state: matchWithoutCep[5].trim(),
          zip: ''
        };
      }
    } catch (e) {
      warnCaught('Erro capturado:', e);
    }
    
    return { ...defaultVals, street: addrStr };
  };

  const handleDeliveryCEPChange = async (val: string) => {
    const formatted = formatCEP(val);
    setDeliveryZipCode(formatted);
    const clean = formatted.replace(/\D/g, '');

    if (clean.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          if (data.logradouro) setDeliveryStreet(data.logradouro);
          if (data.bairro) setDeliveryNeighborhood(data.bairro);
          if (data.localidade) setDeliveryCity(data.localidade);
          if (data.uf) setDeliveryState(data.uf);
        }
      } catch (error) {
        warnCaught('Erro capturado:', error);
      }
    }
  };

  // Sincroniza subcampos com o endereço de entrega completo para OSRM
  useEffect(() => {
    if (deliveryStreet || deliveryNumber || deliveryNeighborhood || deliveryCity || deliveryState || deliveryZipCode) {
      const addr = `${deliveryStreet}, ${deliveryNumber} - ${deliveryNeighborhood}, ${deliveryCity} - ${deliveryState}${deliveryZipCode ? `, CEP ${deliveryZipCode}` : ''}`;
      setDeliveryAddress(addr);
    } else {
      setDeliveryAddress('');
    }
  }, [deliveryStreet, deliveryNumber, deliveryNeighborhood, deliveryCity, deliveryState, deliveryZipCode]);

  // Busca e preenche o endereço do cliente ao selecioná-lo
  useEffect(() => {
    if (customerId) {
      const client = customers.find(c => c.id === customerId);
      if (client && client.address) {
        setDeliveryStreet(client.address.street || '');
        setDeliveryNumber(client.address.number || '');
        setDeliveryNeighborhood(client.address.neighborhood || '');
        setDeliveryCity(client.address.city || '');
        setDeliveryState(client.address.state || '');
        setDeliveryZipCode(formatCEP(client.address.zip_code || ''));
      } else {
        setDeliveryStreet('');
        setDeliveryNumber('');
        setDeliveryNeighborhood('');
        setDeliveryCity('');
        setDeliveryState('');
        setDeliveryZipCode('');
      }
    } else {
      setDeliveryStreet('');
      setDeliveryNumber('');
      setDeliveryNeighborhood('');
      setDeliveryCity('');
      setDeliveryState('');
      setDeliveryZipCode('');
    }
  }, [customerId, customers]);

  // Executa o cálculo da rota utilizando OpenStreetMap e OSRM
  const handleCalculateRoute = async () => {
    setIsCalculatingRoute(true);
    setRouteError(null);
    try {
      const companyOrigin = buildQuoteOriginAddress();
        
      const dist = await calculateRouteDistance(companyOrigin, deliveryAddress);
      setDeliveryDistanceKm(dist);
      
      const pricePerKm = deliveryType === 'motoboy' 
        ? (settings.delivery_motoboy_price_km || 2.50)
        : (settings.delivery_car_price_km || 4.50);
      
      const rawFee = dist * pricePerKm;
      const minFee = settings.delivery_min_fee || 10.00;
      setDeliveryFee(Math.round(Math.max(rawFee, minFee) * 100) / 100);
      setLastCalculatedAddress(deliveryAddress);
    } catch (err: unknown) {
      warnCaught('Erro capturado:', err);
      setRouteError(err instanceof Error ? err.message : 'Erro ao calcular a distância da rota.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Auto-calcular rota ao alterar o endereço ou tipo de entrega
  useEffect(() => {
    if (!deliveryAddress || deliveryAddress.trim().length < 8 || !['motoboy', 'carro'].includes(deliveryType)) {
      return;
    }

    if (deliveryAddress === lastCalculatedAddress) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsCalculatingRoute(true);
      setRouteError(null);
      try {
        const companyOrigin = buildQuoteOriginAddress();

        const dist = await calculateRouteDistance(companyOrigin, deliveryAddress);
        setDeliveryDistanceKm(dist);
        
        const pricePerKm = deliveryType === 'motoboy' 
          ? (settings.delivery_motoboy_price_km || 2.50)
          : (settings.delivery_car_price_km || 4.50);
        
        const rawFee = dist * pricePerKm;
        const minFee = settings.delivery_min_fee || 10.00;
        setDeliveryFee(Math.round(Math.max(rawFee, minFee) * 100) / 100);
        setLastCalculatedAddress(deliveryAddress);
      } catch (err: unknown) {
        warnCaught('Erro capturado:', err);
        setRouteError(err instanceof Error ? err.message : 'Erro ao calcular a distância da rota automaticamente.');
      } finally {
        setIsCalculatingRoute(false);
      }
    }, 1000); // 1s de debounce

    return () => clearTimeout(timer);
  }, [deliveryAddress, deliveryType, lastCalculatedAddress, settings, buildQuoteOriginAddress]);

  const handleDistanceChange = (km: number) => {
    setDeliveryDistanceKm(km);
    const pricePerKm = deliveryType === 'motoboy' 
      ? (settings.delivery_motoboy_price_km || 2.50)
      : (settings.delivery_car_price_km || 4.50);
    const rawFee = km * pricePerKm;
    const minFee = settings.delivery_min_fee || 10.00;
    setDeliveryFee(Math.round(Math.max(rawFee, minFee) * 100) / 100);
  };

  // Item Form State (Temporary row inputs)
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemWidth, setItemWidth] = useState(1.0);
  const [itemHeight, setItemHeight] = useState(1.0);

  const getProductVolumeTiers = (prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    return [...(prod?.volume_pricing || [])].sort((a, b) => a.min_qty - b.min_qty);
  };

  // 1. Filter Quotes
  const filteredQuotes = quotes.filter(q => 
    q.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.number.toString().includes(searchQuery)
  );

  // 2. Dynamic Price calculation for item addition
  const getProductPriceInfo = (prodId: string, qty = itemQty) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return { price: 0, type: 'unidade', volumeTier: null, hasVolumePricing: false };

    const volumeTiers = getProductVolumeTiers(prodId);
    const volumeTier = [...volumeTiers].reverse().find(tier => qty >= tier.min_qty) || null;
    const baseUnitPrice = volumeTier?.price ?? prod.sales_price;
    let price = baseUnitPrice;

    if (prod.pricing_type === 'm2') {
      price = baseUnitPrice * itemWidth * itemHeight;
    } else if (prod.pricing_type === 'linear') {
      price = baseUnitPrice * itemWidth;
    }

    return {
      price,
      type: prod.pricing_type,
      volumeTier,
      hasVolumePricing: volumeTiers.length > 0
    };
  };

  const handleAddItem = () => {
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    const volumeTiers = getProductVolumeTiers(selectedProductId);
    const minAllowedQty = volumeTiers[0]?.min_qty || 1;
    const normalizedQty = Math.max(itemQty, minAllowedQty);
    const originalQty = itemQty;
    if (normalizedQty !== originalQty) setItemQty(normalizedQty);

    const { price, volumeTier } = getProductPriceInfo(selectedProductId, normalizedQty);

    const newItem = {
      product_id: prod.id,
      product_name: prod.name,
      quantity: normalizedQty,
      unit_price: price,
      details: {
        width: prod.pricing_type === 'm2' || prod.pricing_type === 'linear' ? itemWidth : undefined,
        height: prod.pricing_type === 'm2' ? itemHeight : undefined,
        notes: volumeTier
          ? `Faixa de preco aplicada: a partir de ${volumeTier.min_qty} un (${formatUnitCurrency(volumeTier.price)} / un).`
          : ''
      }
    };

    setItems(prev => [...prev, newItem]);
    
    // Reset Row Inputs
    setSelectedProductId('');
    setItemQty(1);
    setItemWidth(1.0);
    setItemHeight(1.0);
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const getSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const getServicesTotal = () => getAdditionalServicesTotal(additionalServices);

  const selectedFormCustomer = customers.find((customer) => customer.id === customerId);
  const selectedFormCustomerType = selectedFormCustomer
    ? (selectedFormCustomer.document?.replace(/\D/g, '').length || 0) > 11 || selectedFormCustomer.billing_type === 'faturado'
      ? 'PJ'
      : 'PF'
    : '';

  const resetForm = () => {
    setIsCreating(false);
    setEditingQuoteId(null);
    setCustomerId('');
    setRequestedCustomerId('');
    setCustomerPrefillMessage('');
    setDiscount(0);
    setValidUntil('');
    setNotes('');
    setItems([]);
    setAdditionalServices([]);
    setSelectedProductId('');
    setItemQty(1);
    setItemWidth(1.0);
    setItemHeight(1.0);
    setDeliveryType('retirada');
    setDeliveryAddress('');
    setDeliveryDistanceKm(0);
    setDeliveryFee(0);
    setRouteError(null);
    setLastCalculatedAddress('');
    setDeliveryStreet('');
    setDeliveryNumber('');
    setDeliveryNeighborhood('');
    setDeliveryCity('');
    setDeliveryState('');
    setDeliveryZipCode('');
  };

  const handleSaveQuote = (status: 'rascunho' | 'pendente') => {
    const client = customers.find(c => c.id === customerId);
    if (!client) {
      alert('Por favor, selecione o cliente.');
      return;
    }
    if (items.length === 0) {
      alert('Adicione pelo menos um item ao orçamento.');
      return;
    }

    const sub = getSubtotal();
    const servicesTotal = getServicesTotal();
    const finalItems: QuoteItem[] = items.map((it, idx) => ({
      id: `qi-${idx}-${Date.now()}`,
      ...it,
      total_price: it.quantity * it.unit_price
    }));

    const finalTotal = sub + servicesTotal + deliveryFee - discount;

    if (editingQuoteId) {
      const match = quotes.find(q => q.id === editingQuoteId);
      updateQuote({
        id: editingQuoteId,
        company_id: match?.company_id || 'c1',
        customer_id: client.id,
        customer_name: client.name,
        number: match?.number || 0,
        status: match?.status || status,
        total_amount: finalTotal,
        discount,
        valid_until: validUntil || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes,
        items: finalItems,
        additional_services: additionalServices,
        created_at: match?.created_at || new Date().toISOString(),
        delivery_type: deliveryType,
        delivery_address: deliveryType !== 'retirada' ? deliveryAddress : undefined,
        delivery_distance_km: ['motoboy', 'carro'].includes(deliveryType) ? deliveryDistanceKm : undefined,
        delivery_fee: deliveryType !== 'retirada' ? deliveryFee : 0
      });
    } else {
      addQuote({
        customer_id: client.id,
        customer_name: client.name,
        status,
        total_amount: finalTotal,
        discount,
        valid_until: validUntil || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes,
        items: finalItems,
        additional_services: additionalServices,
        delivery_type: deliveryType,
        delivery_address: deliveryType !== 'retirada' ? deliveryAddress : undefined,
        delivery_distance_km: ['motoboy', 'carro'].includes(deliveryType) ? deliveryDistanceKm : undefined,
        delivery_fee: deliveryType !== 'retirada' ? deliveryFee : 0
      });
    }

    resetForm();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (activePrintQuote) {
      window.print();
      setActivePrintQuote(null);
    }
  }, [activePrintQuote]);

  const getStatusBadge = (status: Quote['status']) => {
    const styles = {
      rascunho: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      pendente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      aprovado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      reprovado: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${styles[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Hidden printable container for Quote print document */}
      {activePrintQuote && (
        <div className="hidden print:block p-8 space-y-6 text-foreground bg-white" id="printable-quote-area">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-border pb-6">
            <div className="max-w-[62%]">
              {companyLogoUrl ? (
                <img
                  src={companyLogoUrl}
                  alt={companyDisplayName}
                  className="h-16 max-w-[260px] object-contain object-left mb-2"
                />
              ) : (
                <h2 className="text-base font-bold tracking-tight text-primary">{companyDisplayName}</h2>
              )}
              {!companyLogoUrl && <p className="text-xs text-muted-foreground mt-0.5 font-semibold">{companyDisplayName}</p>}
              {company?.document && <p className="text-xs text-muted-foreground">CNPJ: {company.document}</p>}
              {company?.phone && <p className="text-xs text-muted-foreground">Telefone: {company.phone}</p>}
              {company?.email && <p className="text-xs text-muted-foreground">E-mail: {company.email}</p>}
              {shouldShowCompanyAddress && buildCompanyRegisteredAddress() && (
                <p className="text-xs text-muted-foreground">Endere&ccedil;o: {buildCompanyRegisteredAddress()}</p>
              )}
            </div>
            <div className="text-right">
              <h3 className="text-lg font-bold">ORÇAMENTO #{activePrintQuote.number}</h3>
              <p className="text-xs text-muted-foreground">Emissão: {new Date(activePrintQuote.created_at).toLocaleDateString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">Validade: {new Date(activePrintQuote.valid_until).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          {/* Client Info */}
          <div className="grid grid-cols-2 gap-6 bg-secondary/25 p-4 rounded-xl border border-border">
            {(() => {
              const customer = resolveQuoteCustomer(activePrintQuote);
              const customerAddress = buildAddressLine(customer?.address);
              const customerPhone = customer?.phone || activePrintQuote.customer_phone;
              const customerEmail = customer?.email;
              const customerDocument = customer?.document;

              return (
                <>
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Destinat&aacute;rio (Cliente)</h4>
                    <p className="text-sm font-bold mt-1">{customer?.name || getQuoteCustomerName(activePrintQuote)}</p>
                    {customerDocument && <p className="text-xs text-muted-foreground mt-0.5">CPF/CNPJ: {customerDocument}</p>}
                    {customerPhone && <p className="text-xs text-muted-foreground">Telefone: {customerPhone}</p>}
                    {customerEmail && <p className="text-xs text-muted-foreground">E-mail: {customerEmail}</p>}
                    {customerAddress && <p className="text-xs text-muted-foreground">Endere&ccedil;o: {customerAddress}</p>}
                  </div>
                  <div className="text-right">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Status da Proposta</h4>
                    <div className="mt-1">{getStatusBadge(activePrintQuote.status)}</div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Items Table */}
          <div className="border border-border rounded-xl overflow-hidden bg-white">
            <h4 className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-foreground bg-secondary/20">Produtos</h4>
            <table className="print-items-table w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-black font-bold text-white uppercase">
                  <th className="px-4 py-2.5 w-[10%] rounded-l-lg border-r border-white/40 text-center">QTD</th>
                  <th className="px-4 py-2.5 w-[56%] border-r border-white/40 text-left">Descrição</th>
                  <th className="px-4 py-2.5 text-right w-[16%] border-r border-white/40">UNIT</th>
                  <th className="px-4 py-2.5 text-right w-[18%] rounded-r-lg">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {activePrintQuote.items.length > 0 ? (
                  activePrintQuote.items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-0.5 text-center font-bold text-foreground leading-tight">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-0.5 font-semibold text-foreground leading-tight">
                          {item.product_name}
                        </td>
                        <td className="px-4 py-0.5 text-right text-muted-foreground whitespace-nowrap leading-tight">{formatUnitCurrency(item.unit_price)}</td>
                        <td className="px-4 py-0.5 text-right font-bold text-foreground whitespace-nowrap leading-tight">{formatCurrency(item.total_price)}</td>
                      </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground italic">Nenhum produto informado neste orçamento.</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t border-border bg-secondary/10 text-xs">
                {(activePrintQuote.additional_services || []).length > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-1 text-right font-semibold text-muted-foreground">Total Serviços</td>
                    <td className="px-4 py-1 text-right font-bold text-foreground">{formatCurrency(getAdditionalServicesTotal(activePrintQuote.additional_services))}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="px-4 py-1 text-right font-semibold text-muted-foreground">Total Produtos</td>
                  <td className="px-4 py-1 text-right font-bold text-foreground">{formatCurrency(activePrintQuote.items.reduce((sum, item) => sum + item.total_price, 0))}</td>
                </tr>
                {activePrintQuote.delivery_type && activePrintQuote.delivery_type !== 'retirada' && (
                  <tr>
                    <td colSpan={3} className="px-4 py-1 text-right font-semibold text-muted-foreground">Taxa de Entrega ({activePrintQuote.delivery_type.toUpperCase()})</td>
                    <td className="px-4 py-1 text-right font-bold text-foreground">{formatCurrency(activePrintQuote.delivery_fee || 0)}</td>
                  </tr>
                )}
                {activePrintQuote.discount > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-1 text-right font-semibold text-emerald-600">Desconto</td>
                    <td className="px-4 py-1 text-right font-bold text-emerald-600">-{formatCurrency(activePrintQuote.discount)}</td>
                  </tr>
                )}
                <tr className="border-t border-border bg-white">
                  <td colSpan={3} className="px-4 py-2 text-right text-sm font-extrabold text-foreground">Total Líquido</td>
                  <td className="px-4 py-2 text-right text-base font-extrabold text-primary">{formatCurrency(activePrintQuote.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {(activePrintQuote.additional_services || []).length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden bg-white">
              <h4 className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-foreground bg-secondary/20">Serviços Adicionais</h4>
              <table className="print-items-table w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-black font-bold text-white uppercase">
                    <th className="px-4 py-2.5 w-[10%] rounded-l-lg border-r border-white/40 text-center">QTD</th>
                    <th className="px-4 py-2.5 w-[56%] border-r border-white/40 text-left">Descrição</th>
                    <th className="px-4 py-2.5 text-right w-[16%] border-r border-white/40">UNIT</th>
                    <th className="px-4 py-2.5 text-right w-[18%] rounded-r-lg">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {(activePrintQuote.additional_services || []).map((service) => (
                    <tr key={service.id} className="align-top">
                      <td className="px-4 py-0.5 text-center font-bold text-foreground leading-tight">{service.quantity}</td>
                      <td className="px-4 py-0.5 font-semibold text-foreground leading-tight">
                        {service.name}
                        {service.notes && <div className="text-[9px] text-muted-foreground">{service.notes}</div>}
                      </td>
                      <td className="px-4 py-0.5 text-right text-muted-foreground whitespace-nowrap leading-tight">{formatCurrency(service.unit_price)}</td>
                      <td className="px-4 py-0.5 text-right font-bold text-foreground whitespace-nowrap leading-tight">{formatCurrency(service.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legal notes */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2">
            <h4 className="font-bold text-foreground text-[10px] uppercase">Observações Legais</h4>
            <p>• Os preços apresentados têm validade estrita conforme a data informada.</p>
            <p>• Prazo médio de produção de 5 a 7 dias úteis após confirmação do layout.</p>
            {activePrintQuote.notes && (
              <div className="p-3 bg-secondary/20 rounded-lg text-foreground font-medium mt-3 border border-border">
                Obs: &quot;{activePrintQuote.notes}&quot;
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-12 border-t border-border/50 text-center text-[10px] text-muted-foreground">
            <div className="space-y-1">
              <div className="border-b border-border/70 w-3/4 mx-auto h-0" />
              <span>Responsável Técnico</span>
            </div>
            <div className="space-y-1">
              <div className="border-b border-border/70 w-3/4 mx-auto h-0" />
              <span>Assinatura do Cliente (Aprovação)</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Quote Views */}
      {!isCreating ? (
        /* Quotes list */
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden no-print">
          <div className="p-5 border-b border-border bg-secondary/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filtrar por número ou cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-card border border-border rounded-xl text-xs focus:outline-none text-foreground"
              />
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all shrink-0"
            >
              <Plus className="h-4 w-4" /> Criar Orçamento
            </button>
          </div>

          <div className="overflow-x-auto xl:overflow-x-visible">
            <table className="w-full text-left border-collapse text-xs table-auto">
              <thead>
                <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border whitespace-nowrap">
                  <th className="px-3 py-3 text-left">Número</th>
                  <th className="px-3 py-3 text-left">Cliente</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Validade</th>
                  <th className="px-3 py-3 text-right">Valor Líquido</th>
                  <th className="px-3 py-3 text-left">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredQuotes.length > 0 ? (
                  filteredQuotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-foreground text-left whitespace-nowrap">#{quote.number}</td>
                      <td className="px-3 py-2.5 font-semibold text-muted-foreground text-left">{getQuoteCustomerName(quote)}</td>
                      <td className="px-3 py-2.5 text-left whitespace-nowrap">{getStatusBadge(quote.status)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-left whitespace-nowrap">
                        {new Date(quote.valid_until).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-foreground whitespace-nowrap">{formatCurrency(quote.total_amount)}</td>
                      <td className="px-3 py-2.5 text-left whitespace-nowrap">
                        <div className="flex items-center justify-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActivePrintQuote(preparePrintQuote(quote))}
                            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                            title="Imprimir PDF"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(quote)}
                            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                            title="Editar Orçamento"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          
                          {quote.status !== 'aprovado' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Aprovar este orçamento e gerar o pedido na fila?')) {
                                  approveQuote(quote.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/25 border border-emerald-500/20"
                              title="Aprovar e Converter em Pedido"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => sendPixWhatsApp(quote)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/25 border border-emerald-500/20"
                            title="Enviar Cobrança Pix via WhatsApp Web"
                          >
                            <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Excluir este orçamento?')) {
                                deleteQuote(quote.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/25 border border-rose-500/20"
                            title="Excluir Orçamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground italic">
                      Nenhum orçamento cadastrado ou correspondente à pesquisa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Create Quote Form Builder */
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5 no-print">
          <div className="flex justify-between items-center border-b border-border pb-3">
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="h-4.5 w-4.5 text-primary" /> {editingQuoteId ? "Editar Orçamento Comercial" : "Novo Orçamento Comercial"}
            </h3>
            <button 
              onClick={resetForm}
              className="p-1 rounded hover:bg-secondary text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Customer select */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Cliente *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-medium"
              >
                <option value="">Selecione...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Validity date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Data de Validade</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
              />
            </div>
          </div>

          {customerPrefillMessage && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
              {customerPrefillMessage}
            </div>
          )}

          {selectedFormCustomer && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-500">Cliente selecionado</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">ID</span>
                  <span className="block truncate font-bold text-slate-800">{selectedFormCustomer.id}</span>
                </div>
                <div className="min-w-0 lg:col-span-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Nome</span>
                  <span className="block break-words font-bold text-slate-800">{selectedFormCustomer.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</span>
                  <span className="block whitespace-nowrap font-bold text-slate-800">{selectedFormCustomerType}</span>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">CPF/CNPJ</span>
                  <span className="block whitespace-nowrap font-bold text-slate-800">{selectedFormCustomer.document || 'Nao informado'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Telefone</span>
                  <span className="block whitespace-nowrap font-bold text-slate-800">{selectedFormCustomer.phone || 'Nao informado'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Item Adder Section */}
          <div className="border border-border rounded-xl p-4 space-y-4 bg-secondary/15">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
              <PlusCircle className="h-3.5 w-3.5 text-primary" /> Adicionar Produtos ao Orçamento
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Product select */}
              <div className="md:col-span-4 space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Produto / Serviço</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    const nextProductId = e.target.value;
                    setSelectedProductId(nextProductId);
                    const firstTier = getProductVolumeTiers(nextProductId)[0];
                    setItemQty(firstTier?.min_qty || 1);
                  }}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs focus:outline-none text-foreground"
                >
                  <option value="">Selecione...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.pricing_type} - {formatCurrency(p.sales_price)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Dimension Inputs */}
              {selectedProductId && ['m2', 'linear'].includes(getProductPriceInfo(selectedProductId).type) && (
                <>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">Largura / Compr. (cm)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={Number((itemWidth * 100).toFixed(2))}
                      onChange={(e) => setItemWidth(Math.max(1, parseFloat(e.target.value) || 1) / 100)}
                      className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                    />
                  </div>
                  {getProductPriceInfo(selectedProductId).type === 'm2' && (
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Altura (cm)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={Number((itemHeight * 100).toFixed(2))}
                        onChange={(e) => setItemHeight(Math.max(1, parseFloat(e.target.value) || 1) / 100)}
                        className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Quantity */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Quantidade</label>
                <input
                  type="number"
                  min={getProductVolumeTiers(selectedProductId)[0]?.min_qty || 1}
                  value={itemQty}
                  onChange={(e) => {
                    const minQty = getProductVolumeTiers(selectedProductId)[0]?.min_qty || 1;
                    setItemQty(Math.max(minQty, parseInt(e.target.value) || minQty));
                  }}
                  className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                />
              </div>

              {selectedProductId && getProductPriceInfo(selectedProductId).hasVolumePricing && (
                <div className="md:col-span-12 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-foreground space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {getProductVolumeTiers(selectedProductId).map((tier) => (
                      <button
                        key={tier.min_qty}
                        type="button"
                        onClick={() => setItemQty(tier.min_qty)}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                          itemQty === tier.min_qty
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-card text-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        {tier.min_qty} un - {formatUnitCurrency(tier.price)} / un
                      </button>
                    ))}
                  </div>
                  {getProductPriceInfo(selectedProductId).volumeTier ? (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold">
                        Faixa aplicada: a partir de {getProductPriceInfo(selectedProductId).volumeTier?.min_qty} un
                      </span>
                      <span className="font-bold text-primary">
                        {formatUnitCurrency(getProductPriceInfo(selectedProductId).volumeTier?.price || 0)} / un
                        {' | '}
                        {formatCurrency(getProductPriceInfo(selectedProductId).price * itemQty)} total
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-amber-600">
                        Este produto possui tabela por quantidade, mas a quantidade informada ainda nao atingiu a primeira faixa.
                      </span>
                      <span className="font-bold text-foreground">
                        Preco base: {formatUnitCurrency(getProductPriceInfo(selectedProductId).price)} / un
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold transition-all"
                >
                  Incluir Item
                </button>
              </div>
            </div>

            {/* Added Items table */}
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-secondary/40 font-bold border-b border-border text-foreground">
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-center">Quant.</th>
                    <th className="px-4 py-2 text-right">Preço Unit.</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.length > 0 ? (
                    items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2">
                          <div className="font-semibold">{item.product_name}</div>
                          {item.details && (item.details.width || item.details.height) && (
                            <div className="text-[9px] text-muted-foreground">
                              Medidas: {item.details.width}m {item.details.height ? `x ${item.details.height}m` : 'linear'}
                            </div>
                          )}
                          {item.details?.notes && (
                            <div className="text-[9px] text-primary font-semibold">
                              {item.details.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center font-semibold text-muted-foreground">{item.quantity}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{formatUnitCurrency(item.unit_price)}</td>
                        <td className="px-4 py-2 text-right font-bold text-foreground">{formatCurrency(item.quantity * item.unit_price)}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 rounded bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground italic">
                        Nenhum item adicionado ainda. Preencha os campos acima para incluir itens.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <AdditionalServicesSection
            services={additionalServices}
            onChange={setAdditionalServices}
          />

          {/* Form Bottom: Discount and Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="md:col-span-2 space-y-4">
              {/* Opções de Entrega & Frete */}
              <div className="bg-secondary/15 border border-border p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-2">
                  <Truck className="h-4 w-4 text-primary" /> Opções de Entrega e Frete
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Tipo de Entrega</label>
                    <select
                      value={deliveryType}
                      onChange={(e) => {
                        const val = e.target.value as typeof deliveryType;
                        setDeliveryType(val);
                        if (val === 'retirada') {
                          setDeliveryFee(0);
                          setDeliveryDistanceKm(0);
                        } else if (val === 'correios') {
                          setDeliveryFee(0);
                          setDeliveryDistanceKm(0);
                        } else {
                          const pricePerKm = val === 'motoboy' 
                            ? (settings.delivery_motoboy_price_km || 2.50)
                            : (settings.delivery_car_price_km || 4.50);
                          const rawFee = deliveryDistanceKm * pricePerKm;
                          const minFee = settings.delivery_min_fee || 10.00;
                          setDeliveryFee(deliveryDistanceKm > 0 ? Math.round(Math.max(rawFee, minFee) * 100) / 100 : 0);
                        }
                      }}
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                    >
                      <option value="retirada">Retirada na Gráfica (Grátis)</option>
                      <option value="motoboy">Entrega via Motoboy (Frete por KM)</option>
                      <option value="carro">Entrega via Carro (Frete por KM)</option>
                      <option value="correios">Correios / Transportadora (Valor Fixo)</option>
                    </select>
                  </div>

                  {deliveryType !== 'retirada' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Valor do Frete Cobrado (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={deliveryFee}
                        onChange={(e) => setDeliveryFee(Number(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none font-bold text-primary"
                      />
                    </div>
                  )}
                </div>

                {deliveryType !== 'retirada' && (
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                      {/* CEP */}
                      <div className="col-span-2 sm:col-span-2 space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">CEP *</label>
                        <input
                          type="text"
                          value={deliveryZipCode}
                          onChange={(e) => handleDeliveryCEPChange(e.target.value)}
                          placeholder="00000-000"
                          required
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none font-semibold"
                        />
                      </div>

                      {/* Rua */}
                      <div className="col-span-2 sm:col-span-3 space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">Rua / Logradouro *</label>
                        <input
                          type="text"
                          value={deliveryStreet}
                          onChange={(e) => setDeliveryStreet(e.target.value)}
                          placeholder="Rua, Av, etc."
                          required
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
                        />
                      </div>

                      {/* Número */}
                      <div className="col-span-2 sm:col-span-1 space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">Número *</label>
                        <input
                          type="text"
                          value={deliveryNumber}
                          onChange={(e) => setDeliveryNumber(e.target.value)}
                          placeholder="Ex: 123"
                          required
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none font-semibold"
                        />
                      </div>

                      {/* Bairro */}
                      <div className="col-span-2 sm:col-span-2 space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">Bairro *</label>
                        <input
                          type="text"
                          value={deliveryNeighborhood}
                          onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                          placeholder="Bairro"
                          required
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
                        />
                      </div>

                      {/* Cidade */}
                      <div className="col-span-2 sm:col-span-3 space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">Cidade *</label>
                        <input
                          type="text"
                          value={deliveryCity}
                          onChange={(e) => setDeliveryCity(e.target.value)}
                          placeholder="Cidade"
                          required
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
                        />
                      </div>

                      {/* UF */}
                      <div className="col-span-2 sm:col-span-1 space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">UF *</label>
                        <input
                          type="text"
                          value={deliveryState}
                          onChange={(e) => setDeliveryState(e.target.value.toUpperCase())}
                          placeholder="SP"
                          maxLength={2}
                          required
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none font-bold text-center"
                        />
                      </div>
                    </div>

                    {['motoboy', 'carro'].includes(deliveryType) && (
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 p-3 bg-secondary/20 border border-border rounded-lg text-xs">
                        <div className="grid grid-cols-2 gap-4 flex-1">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Distância Estimada (KM)</label>
                            <input
                              type="number"
                              step="0.01;any"
                              min="0"
                              value={deliveryDistanceKm}
                              onChange={(e) => handleDistanceChange(Number(e.target.value) || 0)}
                              className="w-full px-2 py-1 bg-card border border-border rounded-md text-xs font-semibold text-center"
                            />
                          </div>
                          <div className="space-y-0.5 flex flex-col justify-center">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase">Taxa Configurada</span>
                            <span className="font-bold text-[10px] text-foreground">
                              {deliveryType === 'motoboy' 
                                ? `${formatCurrency(settings.delivery_motoboy_price_km || 2.50)} / km`
                                : `${formatCurrency(settings.delivery_car_price_km || 4.50)} / km`
                              }
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isCalculatingRoute || !deliveryAddress}
                          onClick={handleCalculateRoute}
                          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs self-stretch sm:self-auto disabled:opacity-50"
                        >
                          {isCalculatingRoute ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin" /> Calculando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3" /> Calcular Rota
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {routeError && (
                      <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-[10px] font-semibold">
                        {routeError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Observações Técnicas / Comerciais da Proposta</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Condições de pagamento, frete, detalhes de gabarito e acabamento..."
                  rows={3}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground resize-none"
                />
              </div>
            </div>

            <div className="bg-secondary/10 border border-border p-4 rounded-xl space-y-4">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border pb-1">Valores Finais</h4>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Total de produtos:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(getSubtotal())}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Total de serviços adicionais:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(getServicesTotal())}</span>
                </div>
                {deliveryType !== 'retirada' && (
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Taxa de Entrega ({deliveryType.toUpperCase()}):</span>
                    <span className="font-semibold text-primary">{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Desconto Fixo (R$)</label>
                  <input
                    type="text"
                    value={formatCurrencyInput(discount)}
                    onChange={(e) => setDiscount(parseCurrencyInputToNumber(e.target.value))}
                    className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-right focus:outline-none font-bold text-emerald-500"
                  />
                </div>
                <div className="flex justify-between items-center border-t border-border pt-3 mt-3 font-bold text-sm">
                  <span className="text-foreground">Total Líquido:</span>
                  <span className="text-primary text-base font-extrabold">{formatCurrency(getSubtotal() + getServicesTotal() + deliveryFee - discount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions buttons */}
          <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleSaveQuote('rascunho')}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/85 text-foreground text-xs font-semibold transition-all border border-border"
            >
              Salvar Rascunho
            </button>
            <button
              onClick={() => handleSaveQuote('pendente')}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all"
            >
              Enviar Proposta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
