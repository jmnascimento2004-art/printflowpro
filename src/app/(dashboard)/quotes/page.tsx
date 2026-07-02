'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  FileText, 
  Search, 
  Trash2, 
  Check, 
  Download,
  Eye,
  X, 
  PlusCircle,
  Edit2,
  Truck,
  RefreshCw,
  MessageCircle
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Quote, QuoteItem } from '@/lib/dummy-data';
import type { AdditionalService } from '@/lib/dummy-data';
import { AdditionalServicesSection, getAdditionalServicesTotal } from '@/components/commercial/AdditionalServicesSection';
import { QuoteItemModal, type QuoteItemDraft } from '@/components/quotes/QuoteItemModal';
import {
  formatCurrencyInput,
  parseCurrencyInputToNumber,
  formatCEP,
  getPublicImageUrl
} from '@/lib/utils';
import { openWhatsAppWithMessage } from '@/lib/whatsapp-order';
import { calculateRouteDistance } from '@/lib/delivery';
import { warnCaught } from '@/lib/safe-log';
import { PdfPreviewDialog } from '@/components/pdf/pdf-preview-dialog';
import { downloadFileFromUrl } from '@/lib/download';
import {
  formatUnitCurrency
} from '@/lib/pricing';

type DraftQuoteItem = Omit<QuoteItem, 'id' | 'total_price'> & {
  id?: string;
  total_price?: number;
};

type PdfPreviewState = {
  title: string;
  previewDataUrl: string;
  downloadUrl: string;
  directPdfUrl: string;
};

const formatQuoteMoney = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

const getItemConfigurationSnapshot = (item: Pick<QuoteItem, 'details'>) => item.details?.configuration_snapshot;

const getItemConfigurationSummaryLines = (item: Pick<QuoteItem, 'details' | 'quantity' | 'unit_price' | 'total_price'>) => {
  const snapshot = getItemConfigurationSnapshot(item);
  if (!snapshot) return null;

  return {
    options: [snapshot.material, snapshot.size, snapshot.colors, snapshot.finishing].filter(Boolean).join(' • '),
    quantity: `${snapshot.quantity_tier || item.quantity} un`,
    unit: `${formatUnitCurrency(snapshot.unit_price || item.unit_price)}/un`,
    total: formatQuoteMoney(snapshot.total_price || item.total_price)
  };
};

export default function QuotesPage() {
  const { 
    quotes, 
    addQuote, 
    updateQuote,
    deleteQuote, 
    approveQuote, 
    orders,
    customers, 
    products,
    settings,
    company
  } = useDatabase();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [activePrintQuote, setActivePrintQuote] = useState<Quote | null>(null);
  const [selectedPdfPreview, setSelectedPdfPreview] = useState<PdfPreviewState | null>(null);
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
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total_price: it.total_price,
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

  const sendQuoteProposalWhatsApp = (quote: Quote) => {
    const customer = resolveQuoteCustomer(quote);
    const phone = customer?.phone || quote.customer_phone;
    if (!phone) {
      alert('Telefone/WhatsApp do cliente não encontrado. Atualize o cadastro do cliente antes de enviar a proposta.');
      return;
    }

    const quoteForSending: Quote = {
      ...quote,
      status: quote.status === 'rascunho' ? 'pendente' : quote.status
    };
    if (quote.status === 'rascunho') {
      updateQuote(quoteForSending);
    }

    if (typeof window !== 'undefined') {
      window.open(`/api/pdf/quote/${quoteForSending.id}`, '_blank', 'noopener,noreferrer');
    }

    const message = [
      `Olá, ${customer?.name || getQuoteCustomerName(quote)}! Tudo bem?`,
      '',
      `Segue a proposta/orçamento #${quote.number} da ${company?.name || 'CibelePRINT'}.`,
      '',
      `Valor total: ${formatCurrency(quote.total_amount)}`,
      `Validade: ${new Date(quote.valid_until).toLocaleDateString('pt-BR')}`,
      '',
      'Estou enviando o PDF do orçamento para sua conferência.',
      'Por segurança do navegador, o PDF deve ser anexado manualmente nesta conversa.',
      '',
      'Qualquer dúvida, fico à disposição.',
      '',
      `Atenciosamente\n${company?.name || 'CibelePRINT'}`
    ].join('\n');

    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      const opened = openWhatsAppWithMessage(phone, message);
      if (!opened) {
        alert('Não foi possível abrir o WhatsApp. Verifique o telefone do cliente.');
        return;
      }
      alert('O WhatsApp foi aberto com a mensagem pronta. Anexe manualmente o PDF gerado/impresso do orçamento na conversa.');
    }, 250);
  };

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftQuoteItem[]>([]);
  const [additionalServices, setAdditionalServices] = useState<AdditionalService[]>([]);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

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

  // 1. Filter Quotes
  const filteredQuotes = quotes.filter(q => 
    q.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.number.toString().includes(searchQuery) ||
    q.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleOpenNewItemModal = () => {
    setEditingItemIndex(null);
    setIsItemModalOpen(true);
  };

  const handleOpenEditItemModal = (index: number) => {
    setEditingItemIndex(index);
    setIsItemModalOpen(true);
  };

  const handleSaveModalItem = (item: QuoteItemDraft) => {
    setItems(prev => {
      if (editingItemIndex === null) return [...prev, item];
      return prev.map((currentItem, index) => (index === editingItemIndex ? item : currentItem));
    });
    setEditingItemIndex(null);
    setIsItemModalOpen(false);
  };

  const getSubtotal = () => {
    return items.reduce((sum, item) => sum + Number(item.total_price ?? item.quantity * item.unit_price), 0);
  };

  const getServicesTotal = () => getAdditionalServicesTotal(additionalServices);

  const selectedFormCustomer = customers.find((customer) => customer.id === customerId);
  const selectedFormCustomerType = selectedFormCustomer
    ? (selectedFormCustomer.document?.replace(/\D/g, '').length || 0) > 11 || selectedFormCustomer.billing_type === 'faturado'
      ? 'PJ'
      : 'PF'
    : '';
  const editingQuote = editingQuoteId ? quotes.find((quote) => quote.id === editingQuoteId) : null;
  const editingLinkedOrder = editingQuote
    ? orders.find((order) => {
        const quoteNumberPattern = new RegExp(`Or(?:ç|c)amento\\s*#?${editingQuote.number}\\b`, 'i');
        return (
          order.source_quote_id === editingQuote.id ||
          order.source_quote_number === editingQuote.number ||
          editingQuote.linked_order_id === order.id ||
          quoteNumberPattern.test(order.notes || '')
        );
      })
    : null;

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
    setIsItemModalOpen(false);
    setEditingItemIndex(null);
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
      ...it,
      id: it.id || `qi-${idx}-${Date.now()}`,
      total_price: Number(it.total_price ?? it.quantity * it.unit_price)
    }));

    const finalTotal = sub + servicesTotal + deliveryFee - discount;

    const successMessage = status === 'pendente'
      ? 'Proposta salva como enviada.'
      : 'Orçamento salvo com sucesso.';

    if (editingQuoteId) {
      const match = quotes.find(q => q.id === editingQuoteId);
      const nextStatus = match?.status === 'aprovado' ? 'aprovado' : status;
      updateQuote({
        id: editingQuoteId,
        company_id: match?.company_id || 'c1',
        customer_id: client.id,
        customer_name: client.name,
        number: match?.number || 0,
        status: nextStatus,
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

    alert(successMessage);
    resetForm();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const openQuotePdf = (quote: Quote) => {
    setSelectedPdfPreview({
      title: `Orcamento #${quote.number}`,
      previewDataUrl: `/api/pdf-preview-data/quote/${quote.id}`,
      downloadUrl: `/api/pdf/quote/${quote.id}?download=1`,
      directPdfUrl: `/api/pdf/quote/${quote.id}`
    });
  };

  const downloadQuotePdf = async (quote: Quote) => {
    try {
      await downloadFileFromUrl(`/api/pdf/quote/${quote.id}?download=1`, `ORC-${quote.number}.pdf`);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Erro ao baixar PDF do orcamento:', err);
      }
      alert('Nao foi possivel baixar o PDF. Tente novamente.');
    }
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
      {selectedPdfPreview && (
        <PdfPreviewDialog
          open={Boolean(selectedPdfPreview)}
          onOpenChange={(open) => {
            if (!open) setSelectedPdfPreview(null);
          }}
          title={selectedPdfPreview.title}
          previewDataUrl={selectedPdfPreview.previewDataUrl}
          downloadUrl={selectedPdfPreview.downloadUrl}
          directPdfUrl={selectedPdfPreview.directPdfUrl}
        />
      )}

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

              return (
                <>
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Destinat&aacute;rio (Cliente)</h4>
                    <p className="text-sm font-bold mt-1">{customer?.name || getQuoteCustomerName(activePrintQuote)}</p>
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
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[58%]" />
                <col className="w-[15%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead>
                <tr className="bg-black font-bold text-white uppercase">
                  <th className="px-4 py-2.5 rounded-l-lg border-r border-white/40 text-center">QTD</th>
                  <th className="px-4 py-2.5 w-[56%] border-r border-white/40 text-left">Descrição</th>
                  <th className="px-4 py-2.5 text-right border-r border-white/40">UNIT</th>
                  <th className="px-4 py-2.5 text-right rounded-r-lg">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {activePrintQuote.items.length > 0 ? (
                  activePrintQuote.items.map((item) => (
                    (() => {
                      const configLines = getItemConfigurationSummaryLines(item);
                      return (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-0.5 text-center font-bold text-foreground leading-tight">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-0.5 font-semibold text-foreground leading-tight">
                          {item.product_name}
                          {configLines && (
                            <span className="mt-0.5 block text-[9px] font-normal leading-tight text-muted-foreground">
                              Configura&ccedil;&atilde;o: {configLines.options}<br />
                              Tiragem: {configLines.quantity} &bull; Unit&aacute;rio: {configLines.unit} &bull; Total: {configLines.total}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-0.5 text-right text-muted-foreground whitespace-nowrap leading-tight">{formatUnitCurrency(item.unit_price)}</td>
                        <td className="px-4 py-0.5 text-right font-bold text-foreground whitespace-nowrap leading-tight">{formatCurrency(item.total_price)}</td>
                      </tr>
                      );
                    })()
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

          {filteredQuotes.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredQuotes.map((quote) => {
                const itemsSummary = quote.items.length > 0
                  ? quote.items.slice(0, 2).map((item) => `${item.quantity}x ${item.product_name}`).join(', ')
                  : 'Sem produtos informados';
                const hiddenItemsCount = Math.max(0, quote.items.length - 2);
                const servicesCount = quote.additional_services?.length || 0;
                const deliveryLabel =
                  quote.delivery_type === 'motoboy' ? 'Motoboy' :
                  quote.delivery_type === 'carro' ? 'Carro' :
                  quote.delivery_type === 'correios' ? 'Correios' :
                  'Retirada';

                return (
                  <article
                    key={quote.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openQuotePdf(quote)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openQuotePdf(quote);
                    }}
                    className="group flex min-h-[230px] cursor-pointer flex-col rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-foreground">#{quote.number}</h3>
                        <p className="mt-1 line-clamp-2 text-xs font-semibold text-muted-foreground">{getQuoteCustomerName(quote)}</p>
                      </div>
                      <div className="shrink-0">{getStatusBadge(quote.status)}</div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-[11px] font-semibold text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span className="uppercase tracking-wide">Validade</span>
                        <strong className="text-foreground">{new Date(quote.valid_until).toLocaleDateString('pt-BR')}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="uppercase tracking-wide">Entrega</span>
                        <strong className="text-foreground">{deliveryLabel}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="uppercase tracking-wide">Total</span>
                        <strong className="text-primary">{formatCurrency(quote.total_amount)}</strong>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-border bg-secondary/20 p-2">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Itens</span>
                      <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-foreground">
                        {itemsSummary}{hiddenItemsCount > 0 ? ` +${hiddenItemsCount}` : ''}{servicesCount > 0 ? ` | ${servicesCount} serv.` : ''}
                      </p>
                    </div>

                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openQuotePdf(quote);
                        }}
                        className="rounded-lg border border-primary/20 bg-primary/10 p-1.5 text-primary hover:bg-primary/15"
                        title="Visualizar orçamento"
                        aria-label="Visualizar orçamento"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void downloadQuotePdf(quote);
                        }}
                        className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                        title="Baixar PDF"
                        aria-label="Baixar PDF do orçamento"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartEdit(quote);
                        }}
                        className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                        title="Editar orçamento"
                        aria-label="Editar orçamento"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {quote.status !== 'aprovado' && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (confirm('Aprovar este orçamento e gerar o pedido na fila?')) {
                              approveQuote(quote.id);
                            }
                          }}
                          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5 text-emerald-500 hover:bg-emerald-500/25"
                          title="Aprovar orçamento"
                          aria-label="Aprovar orçamento"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          sendQuoteProposalWhatsApp(quote);
                        }}
                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5 text-emerald-600 hover:bg-emerald-500/25"
                        title="Enviar pelo WhatsApp"
                        aria-label="Enviar pelo WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (confirm('Excluir este orçamento?')) {
                            deleteQuote(quote.id);
                          }
                        }}
                        className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-500 hover:bg-rose-500/25"
                        title="Excluir orçamento"
                        aria-label="Excluir orçamento"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-8 text-center text-sm font-semibold text-muted-foreground">
              Nenhum orçamento cadastrado ou correspondente à pesquisa.
            </div>
          )}

          <div className="hidden">
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
                            onClick={() => openQuotePdf(quote)}
                            className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary border border-primary/20"
                            title="Visualizar orçamento"
                            aria-label="Visualizar orçamento"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadQuotePdf(quote)}
                            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                            title="Baixar PDF"
                            aria-label="Baixar PDF do orçamento"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(quote)}
                            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                            title="Editar orçamento"
                            aria-label="Editar orçamento"
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
                              title="Aprovar orçamento"
                              aria-label="Aprovar orçamento"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => sendQuoteProposalWhatsApp(quote)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/25 border border-emerald-500/20"
                            title="Enviar pelo WhatsApp"
                            aria-label="Enviar pelo WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Excluir este orçamento?')) {
                                deleteQuote(quote.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/25 border border-rose-500/20"
                            title="Excluir orçamento"
                            aria-label="Excluir orçamento"
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

          {editingLinkedOrder && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-700">
              Este orçamento possui um pedido vinculado. Ao salvar, o pedido será atualizado com as alterações comerciais, preservando pagamentos e histórico.
            </div>
          )}

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                  <PlusCircle className="h-3.5 w-3.5 text-primary" /> Itens do Orcamento
                </h4>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Adicione produtos cadastrados com preco ajustado ou itens personalizados sem alterar o cadastro original.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenNewItemModal}
                className="pf-button-primary px-4 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar item
              </button>
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
                          {(() => {
                            const configLines = getItemConfigurationSummaryLines({
                              ...item,
                              total_price: Number(item.total_price ?? item.quantity * item.unit_price)
                            });
                            if (!configLines) return null;
                            return (
                              <div className="mt-1 rounded-lg border border-primary/10 bg-primary/5 px-2 py-1 text-[9px] leading-relaxed text-muted-foreground">
                                <span className="block font-bold text-foreground">Configuração: {configLines.options}</span>
                                <span className="block">
                                  Tiragem: {configLines.quantity} • Unitário: {configLines.unit} • Total: {configLines.total}
                                </span>
                              </div>
                            );
                          })()}
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
                        <td className="px-4 py-2 text-right font-bold text-foreground">{formatCurrency(Number(item.total_price ?? item.quantity * item.unit_price))}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenEditItemModal(idx)}
                            className="mr-1 p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                            title="Editar item"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 rounded bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                            title="Remover item"
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
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleSaveQuote('rascunho')}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/85 text-foreground text-xs font-semibold transition-all border border-border"
            >
              Salvar Orçamento
            </button>
            <button
              type="button"
              onClick={() => handleSaveQuote('pendente')}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all"
            >
              Enviar Proposta
            </button>
          </div>
        </div>
      )}
      <QuoteItemModal
        open={isItemModalOpen}
        products={products}
        item={editingItemIndex === null ? null : items[editingItemIndex] || null}
        onClose={() => {
          setIsItemModalOpen(false);
          setEditingItemIndex(null);
        }}
        onSave={handleSaveModalItem}
      />
    </div>
  );
}
