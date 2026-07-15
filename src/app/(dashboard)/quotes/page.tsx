'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, 
  FileText, 
  Eye,
  Search, 
  Trash2, 
  Check, 
  Printer, 
  Download,
  X, 
  PlusCircle,
  Edit2,
  MessageCircle,
  Truck,
  RefreshCw,
  LayoutGrid,
  List
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Quote, QuoteItem } from '@/lib/dummy-data';
import type { AdditionalService } from '@/lib/dummy-data';
import { AdditionalServicesSection, getAdditionalServicesTotal } from '@/components/commercial/AdditionalServicesSection';
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
  findVariantPricingMatrixRow,
  formatUnitCurrency,
  getNormalizedVariantPricingMatrix,
  getNormalizedVolumePricing,
  getVariantPricingOptions,
  normalizeCombinationKey,
  NormalizedVolumePriceTier
} from '@/lib/pricing';

type ItemConfigurationSnapshot = NonNullable<QuoteItem['details']>['configuration_snapshot'];

type MatrixSelectionField = 'material' | 'size' | 'colors' | 'finishing';
type DraftQuoteItem = Omit<QuoteItem, 'id' | 'total_price'> & {
  id?: string;
  total_price?: number;
};

const MANUAL_QUOTE_ITEM_ID = '__manual_quote_item__';

type ManualQuotePricingType = 'unidade' | 'm2' | 'linear' | 'volume';

const manualQuotePricingOptions: Array<{ value: ManualQuotePricingType; label: string; unitLabel: string }> = [
  { value: 'unidade', label: 'Unidade', unitLabel: 'Preço unitário' },
  { value: 'm2', label: 'Metro quadrado (m²)', unitLabel: 'Preço por m²' },
  { value: 'linear', label: 'Metro linear', unitLabel: 'Preço por metro linear' },
  { value: 'volume', label: 'Quantidade / Volume', unitLabel: 'Preço unitário' }
];

const manualQuotePricingLabels: Record<ManualQuotePricingType, string> = {
  unidade: 'Unidade',
  m2: 'Metro quadrado (m²)',
  linear: 'Metro linear',
  volume: 'Quantidade / Volume'
};

const roundQuoteNumber = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

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

const buildConfigurationLabel = (snapshot: ItemConfigurationSnapshot) => {
  if (!snapshot) return '';
  return [
    snapshot.material,
    snapshot.size,
    snapshot.colors,
    snapshot.finishing,
    `${snapshot.quantity_tier} un`
  ].filter(Boolean).join(' | ');
};

const getItemConfigurationSnapshot = (item: Pick<QuoteItem, 'details'>) => item.details?.configuration_snapshot;

const getItemConfigurationSummaryLines = (item: Pick<QuoteItem, 'details' | 'quantity' | 'unit_price' | 'total_price'>) => {
  if (item.details?.item_type === 'manual') {
    const manualType = item.details.manual_pricing_type || 'unidade';
    const unitLabel = manualType === 'm2'
      ? 'Preço m²'
      : manualType === 'linear'
        ? 'Preço metro'
        : 'Unitário';
    const metric = item.details.configuration_summary || manualQuotePricingLabels[manualType] || 'Item manual';

    return {
      options: metric,
      quantity: `${item.quantity} un`,
      unit: `${unitLabel}: ${formatUnitCurrency(item.unit_price)}`,
      total: formatQuoteMoney(item.total_price || item.quantity * item.unit_price)
    };
  }

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
    customers, 
    products,
    settings,
    company
  } = useDatabase();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [isCreating, setIsCreating] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [approvingQuoteId, setApprovingQuoteId] = useState<string | null>(null);
  const [activePrintQuote, setActivePrintQuote] = useState<Quote | null>(null);
  const [selectedPdfPreview, setSelectedPdfPreview] = useState<PdfPreviewState | null>(null);
  const [requestedCustomerId, setRequestedCustomerId] = useState('');
  const [customerPrefillMessage, setCustomerPrefillMessage] = useState('');

  const handleApproveQuote = async (quoteId: string) => {
    if (approvingQuoteId) return;
    setApprovingQuoteId(quoteId);
    try {
      await approveQuote(quoteId);
    } finally {
      setApprovingQuoteId(null);
    }
  };

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
    if (quote.status === 'aprovado') {
      alert('Este orçamento já foi convertido em pedido e não pode mais ser editado. Faça os ajustes no pedido correspondente.');
      return;
    }
    const resolvedQuote = withResolvedCustomer(quote);
    setEditingQuoteId(resolvedQuote.id);
    setCustomerId(resolvedQuote.customer_id);
    setDiscount(resolvedQuote.discount);
    setDiscountMode('fixed');
    setDiscountPercentage(0);
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
  const [discountMode, setDiscountMode] = useState<'fixed' | 'percentage'>('fixed');
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftQuoteItem[]>([]);
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
      setCustomerPrefillMessage('O cliente informado no link não foi encontrado. Selecione outro cliente para continuar.');
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
  const [manualItemDescription, setManualItemDescription] = useState('');
  const [manualPricingType, setManualPricingType] = useState<ManualQuotePricingType>('unidade');
  const [manualUnitPrice, setManualUnitPrice] = useState(0);
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [selectedMatrixSize, setSelectedMatrixSize] = useState('');
  const [selectedMatrixColors, setSelectedMatrixColors] = useState('');
  const [selectedFinishing, setSelectedFinishing] = useState('');

  const getProductVolumeTiers = (prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    return getNormalizedVolumePricing(prod).sort((a, b) => a.min_qty - b.min_qty);
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const isManualQuoteItem = selectedProductId === MANUAL_QUOTE_ITEM_ID;
  const manualItemQuantity = Math.max(1, itemQty);
  const manualItemWidth = Math.max(0, itemWidth);
  const manualItemHeight = Math.max(0, itemHeight);
  const manualItemLinearMeters = Math.max(0, itemWidth);
  const manualItemUnitPrice = Math.max(0, manualUnitPrice);
  const manualItemAreaTotal = manualPricingType === 'm2'
    ? roundQuoteNumber(manualItemWidth * manualItemHeight * manualItemQuantity)
    : 0;
  const manualItemTotal = manualPricingType === 'm2'
    ? roundQuoteNumber(manualItemAreaTotal * manualItemUnitPrice)
    : manualPricingType === 'linear'
      ? roundQuoteNumber(manualItemLinearMeters * manualItemQuantity * manualItemUnitPrice)
      : roundQuoteNumber(manualItemQuantity * manualItemUnitPrice);
  const manualUnitPriceLabel = manualQuotePricingOptions.find((option) => option.value === manualPricingType)?.unitLabel || 'Preço unitário';
  const selectedVariantPricingRows = useMemo(() => (
    getNormalizedVariantPricingMatrix(selectedProduct)
  ), [selectedProduct]);
  const hasVariantPricingMatrix = selectedVariantPricingRows.length > 0;
  const matrixSelection = useMemo(() => ({
    material: selectedMaterial,
    size: selectedMatrixSize,
    colors: selectedMatrixColors,
    finishing: selectedFinishing
  }), [selectedMaterial, selectedMatrixSize, selectedMatrixColors, selectedFinishing]);
  const selectedMatrixRow = useMemo(() => (
    hasVariantPricingMatrix ? findVariantPricingMatrixRow(selectedVariantPricingRows, matrixSelection) : null
  ), [hasVariantPricingMatrix, selectedVariantPricingRows, matrixSelection]);
  const effectiveQuantityTiers: NormalizedVolumePriceTier[] = useMemo(() => {
    if (hasVariantPricingMatrix) return selectedMatrixRow?.tiers || [];
    return getNormalizedVolumePricing(selectedProduct).sort((a, b) => a.min_qty - b.min_qty);
  }, [hasVariantPricingMatrix, selectedMatrixRow, selectedProduct]);
  const selectedQuantityTier = effectiveQuantityTiers.find((tier) => tier.min_qty === itemQty) || effectiveQuantityTiers[0] || null;
  const requiresTierSelection = Boolean(selectedProductId && effectiveQuantityTiers.length > 0);
  const matrixMaterialOptions = getVariantPricingOptions(selectedVariantPricingRows, 'material');
  const matrixSizeOptions = getVariantPricingOptions(selectedVariantPricingRows, 'size', { material: selectedMaterial });
  const matrixColorOptions = getVariantPricingOptions(selectedVariantPricingRows, 'colors', { material: selectedMaterial, size: selectedMatrixSize });
  const matrixFinishingOptions = getVariantPricingOptions(selectedVariantPricingRows, 'finishing', matrixSelection);

  const applyMatrixRow = (row: ReturnType<typeof findVariantPricingMatrixRow>) => {
    setSelectedMaterial(row?.material || '');
    setSelectedMatrixSize(row?.size || '');
    setSelectedMatrixColors(row?.colors || '');
    setSelectedFinishing(row?.finishing || '');
    setItemQty(row?.tiers[0]?.min_qty || 1);
  };

  const initializeProductConfiguration = (productId: string) => {
    if (productId === MANUAL_QUOTE_ITEM_ID) {
      setSelectedMaterial('');
      setSelectedMatrixSize('');
      setSelectedMatrixColors('');
      setSelectedFinishing('');
      setItemQty(1);
      setItemWidth(1.0);
      setItemHeight(1.0);
      return;
    }

    const product = products.find(p => p.id === productId);
    const rows = getNormalizedVariantPricingMatrix(product);
    if (rows.length > 0) {
      applyMatrixRow(rows[0]);
      return;
    }

    setSelectedMaterial('');
    setSelectedMatrixSize('');
    setSelectedMatrixColors('');
    setSelectedFinishing('');
    setItemQty(getNormalizedVolumePricing(product)[0]?.min_qty || 1);
  };

  const handleMatrixOptionSelect = (field: MatrixSelectionField, value: string) => {
    const nextSelection = {
      material: field === 'material' ? value : selectedMaterial,
      size: field === 'size' ? value : selectedMatrixSize,
      colors: field === 'colors' ? value : selectedMatrixColors,
      finishing: field === 'finishing' ? value : selectedFinishing
    };
    const matchingRow = selectedVariantPricingRows.find((row) => (
      (!nextSelection.material || normalizeCombinationKey(row.material) === normalizeCombinationKey(nextSelection.material)) &&
      (!nextSelection.size || normalizeCombinationKey(row.size) === normalizeCombinationKey(nextSelection.size)) &&
      (!nextSelection.colors || normalizeCombinationKey(row.colors) === normalizeCombinationKey(nextSelection.colors)) &&
      (!nextSelection.finishing || normalizeCombinationKey(row.finishing) === normalizeCombinationKey(nextSelection.finishing))
    )) || selectedVariantPricingRows[0] || null;

    applyMatrixRow(matchingRow);
  };

  // 1. Filter Quotes
  const filteredQuotes = [...quotes]
    .filter(q =>
      q.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.number.toString().includes(searchQuery) ||
      q.status.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => Number(b.number || 0) - Number(a.number || 0));
  const pendingQuotesCount = quotes.filter(quote => quote.status === 'pendente').length;
  const approvedQuotesCount = quotes.filter(quote => quote.status === 'aprovado').length;
  const draftQuotesCount = quotes.filter(quote => quote.status === 'rascunho').length;
  const quotesTotalAmount = quotes.reduce((sum, quote) => sum + (quote.total_amount || 0), 0);

  // 2. Dynamic Price calculation for item addition
  const getProductPriceInfo = (prodId: string, qty = itemQty) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return { price: 0, type: 'unidade', volumeTier: null, hasVolumePricing: false };

    const volumeTiers = prodId === selectedProductId ? effectiveQuantityTiers : getProductVolumeTiers(prodId);
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
    if (isManualQuoteItem) {
      const description = manualItemDescription.trim();
      const quantity = manualItemQuantity;
      const unitPrice = manualItemUnitPrice;

      if (!description) {
        alert('Informe a descrição do item avulso/manual.');
        return;
      }

      if (unitPrice <= 0) {
        alert('Informe o preço unitário do item avulso/manual.');
        return;
      }

      if (manualPricingType === 'm2' && (manualItemWidth <= 0 || manualItemHeight <= 0)) {
        alert('Informe largura e altura maiores que zero para o item por metro quadrado.');
        return;
      }

      if (manualPricingType === 'linear' && manualItemLinearMeters <= 0) {
        alert('Informe o comprimento em centímetros para o item por metro linear.');
        return;
      }

      const manualSummary = manualPricingType === 'm2'
        ? `${Number((manualItemWidth * 100).toFixed(3))}cm x ${Number((manualItemHeight * 100).toFixed(3))}cm - ${quantity} un - ${manualItemAreaTotal.toFixed(2)} m²`
        : manualPricingType === 'linear'
          ? `${Number((manualItemLinearMeters * 100).toFixed(3))} cm - ${quantity} un`
          : `${quantity} un`;
      const displayName = `${description} — ${manualSummary}`;

      const newItem: DraftQuoteItem = {
        product_id: '',
        product_name: displayName,
        quantity,
        unit_price: unitPrice,
        total_price: manualItemTotal,
        details: {
          width: manualPricingType === 'm2' ? manualItemWidth : undefined,
          height: manualPricingType === 'm2' ? manualItemHeight : undefined,
          length: manualPricingType === 'linear' ? manualItemLinearMeters : undefined,
          pricing_type: manualPricingType === 'volume' ? 'unidade' : manualPricingType,
          item_type: 'manual',
          manual_pricing_type: manualPricingType,
          area_total: manualPricingType === 'm2' ? manualItemAreaTotal : undefined,
          linear_meters: manualPricingType === 'linear' ? manualItemLinearMeters : undefined,
          configuration_summary: `${manualQuotePricingLabels[manualPricingType]} - ${manualSummary}`,
          pricing_snapshot: {
            item_type: 'manual',
            pricing_type: manualPricingType,
            description,
            quantity,
            width: manualPricingType === 'm2' ? manualItemWidth : undefined,
            height: manualPricingType === 'm2' ? manualItemHeight : undefined,
            area_total: manualPricingType === 'm2' ? manualItemAreaTotal : undefined,
            linear_meters: manualPricingType === 'linear' ? manualItemLinearMeters : undefined,
            unit_price: unitPrice,
            total_price: manualItemTotal
          },
          notes: 'Item manual adicionado ao orçamento sem alterar o catálogo de produtos.'
        }
      };

      setItems(prev => [...prev, newItem]);
      setSelectedProductId('');
      setManualItemDescription('');
      setManualPricingType('unidade');
      setManualUnitPrice(0);
      setItemQty(1);
      setItemWidth(1.0);
      setItemHeight(1.0);
      return;
    }

    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    const volumeTiers = requiresTierSelection ? effectiveQuantityTiers : getProductVolumeTiers(selectedProductId);
    const minAllowedQty = volumeTiers[0]?.min_qty || 1;
    const configuredTier = requiresTierSelection ? selectedQuantityTier : null;
    if (requiresTierSelection && !configuredTier) return;

    const normalizedQty = configuredTier?.min_qty || Math.max(itemQty, minAllowedQty);
    const originalQty = itemQty;
    if (normalizedQty !== originalQty) setItemQty(normalizedQty);

    const { price, volumeTier } = configuredTier
      ? { price: configuredTier.price, volumeTier: configuredTier }
      : getProductPriceInfo(selectedProductId, normalizedQty);
    const configurationSnapshot = volumeTier ? {
      sale_mode: hasVariantPricingMatrix ? 'variant_matrix' as const : 'volume' as const,
      material: hasVariantPricingMatrix ? selectedMatrixRow?.material || selectedMaterial : undefined,
      size: hasVariantPricingMatrix ? selectedMatrixRow?.size || selectedMatrixSize : undefined,
      colors: hasVariantPricingMatrix ? selectedMatrixRow?.colors || selectedMatrixColors : undefined,
      finishing: hasVariantPricingMatrix ? selectedMatrixRow?.finishing || selectedFinishing : undefined,
      quantity_tier: volumeTier.min_qty,
      unit_price: volumeTier.price,
      total_price: volumeTier.total,
      display_label: buildConfigurationLabel({
        sale_mode: hasVariantPricingMatrix ? 'variant_matrix' : 'volume',
        material: hasVariantPricingMatrix ? selectedMatrixRow?.material || selectedMaterial : undefined,
        size: hasVariantPricingMatrix ? selectedMatrixRow?.size || selectedMatrixSize : undefined,
        colors: hasVariantPricingMatrix ? selectedMatrixRow?.colors || selectedMatrixColors : undefined,
        finishing: hasVariantPricingMatrix ? selectedMatrixRow?.finishing || selectedFinishing : undefined,
        quantity_tier: volumeTier.min_qty,
        unit_price: volumeTier.price,
        total_price: volumeTier.total,
        display_label: ''
      })
    } : undefined;
    const selectedOptions = configurationSnapshot && hasVariantPricingMatrix
      ? [
          configurationSnapshot.material ? { name: configurationSnapshot.material, option_name: configurationSnapshot.material, group_name: 'Material', price_delta: 0, additional_days: 0 } : null,
          configurationSnapshot.size ? { name: configurationSnapshot.size, option_name: configurationSnapshot.size, group_name: 'Tamanho', price_delta: 0, additional_days: 0 } : null,
          configurationSnapshot.colors ? { name: configurationSnapshot.colors, option_name: configurationSnapshot.colors, group_name: 'Cores', price_delta: 0, additional_days: 0 } : null,
          configurationSnapshot.finishing ? { name: configurationSnapshot.finishing, option_name: configurationSnapshot.finishing, group_name: 'Acabamento', price_delta: 0, additional_days: 0 } : null
        ].filter(Boolean) as NonNullable<QuoteItem['details']>['selected_options']
      : undefined;

    const newItem = {
      product_id: prod.id,
      product_name: prod.name,
      quantity: normalizedQty,
      unit_price: price,
      details: {
        width: prod.pricing_type === 'm2' || prod.pricing_type === 'linear' ? itemWidth : undefined,
        height: prod.pricing_type === 'm2' ? itemHeight : undefined,
        selected_options: selectedOptions,
        pricing_type: prod.pricing_type,
        configuration_summary: configurationSnapshot?.display_label,
        configuration_snapshot: configurationSnapshot,
        notes: volumeTier
          ? `Faixa de preço aplicada: a partir de ${volumeTier.min_qty} un (${formatUnitCurrency(volumeTier.price)} / un, ${formatCurrency(volumeTier.total)} total).`
          : ''
      }
    };

    setItems(prev => [...prev, newItem]);
    
    // Reset Row Inputs
    setSelectedProductId('');
    setItemQty(1);
    setItemWidth(1.0);
    setItemHeight(1.0);
    setManualItemDescription('');
    setManualPricingType('unidade');
    setManualUnitPrice(0);
    setSelectedMaterial('');
    setSelectedMatrixSize('');
    setSelectedMatrixColors('');
    setSelectedFinishing('');
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const getSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.total_price ?? item.quantity * item.unit_price), 0);
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
    setDiscountMode('fixed');
    setDiscountPercentage(0);
    setValidUntil('');
    setNotes('');
    setItems([]);
    setAdditionalServices([]);
    setSelectedProductId('');
    setItemQty(1);
    setItemWidth(1.0);
    setItemHeight(1.0);
    setManualItemDescription('');
    setManualPricingType('unidade');
    setManualUnitPrice(0);
    setSelectedMaterial('');
    setSelectedMatrixSize('');
    setSelectedMatrixColors('');
    setSelectedFinishing('');
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
      total_price: it.total_price ?? it.quantity * it.unit_price
    }));

    const grossTotal = sub + servicesTotal + deliveryFee;
    const calculatedDiscount = discountMode === 'percentage'
      ? grossTotal * Math.min(100, Math.max(0, discountPercentage)) / 100
      : Math.min(grossTotal, Math.max(0, discount));
    const effectiveDiscount = Math.round(calculatedDiscount * 100) / 100;
    const finalTotal = Math.max(0, grossTotal - effectiveDiscount);

    const successMessage = status === 'pendente'
      ? 'Proposta salva como enviada.'
      : 'Orçamento salvo com sucesso.';

    if (editingQuoteId) {
      const match = quotes.find(q => q.id === editingQuoteId);
      updateQuote({
        id: editingQuoteId,
        company_id: match?.company_id || 'c1',
        customer_id: client.id,
        customer_name: client.name,
        number: match?.number || 0,
        status,
        total_amount: finalTotal,
        discount: effectiveDiscount,
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
        discount: effectiveDiscount,
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
      title: `Orçamento #${quote.number}`,
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
      alert('Não foi possível baixar o PDF. Tente novamente.');
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
        <div className="space-y-4 no-print">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm"><span className="text-[10px] font-bold uppercase text-muted-foreground">Total de orçamentos</span><h3 className="mt-1 text-xl font-black text-foreground">{quotes.length}</h3><p className="mt-0.5 text-[9px] text-muted-foreground">Registrados no ERP</p></div>
            <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm"><span className="text-[10px] font-bold uppercase text-amber-500">Pendentes</span><h3 className="mt-1 text-xl font-black text-amber-500">{pendingQuotesCount}</h3><p className="mt-0.5 text-[9px] text-muted-foreground">Aguardando decisão</p></div>
            <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm"><span className="text-[10px] font-bold uppercase text-emerald-500">Aprovados</span><h3 className="mt-1 text-xl font-black text-emerald-500">{approvedQuotesCount}</h3><p className="mt-0.5 text-[9px] text-muted-foreground">Convertidos em pedido</p></div>
            <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm"><span className="text-[10px] font-bold uppercase text-primary">Valor orçado</span><h3 className="mt-1 text-xl font-black text-primary">{formatCurrency(quotesTotalAmount)}</h3><p className="mt-0.5 text-[9px] text-muted-foreground">{draftQuotesCount} em rascunho</p></div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
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
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all shrink-0"
              >
                <Plus className="h-4 w-4" /> Criar Orçamento
              </button>
              <div className="flex rounded-lg border border-border bg-card p-1" aria-label="Modo de visualização">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`rounded-md p-1.5 ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
                  title="Visualizar em cards"
                  aria-label="Visualizar orçamentos em cards"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
                  title="Visualizar em lista"
                  aria-label="Visualizar orçamentos em lista"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {filteredQuotes.length > 0 ? (
            <div className={`${viewMode === 'cards' ? 'grid' : 'hidden'} grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`}>
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
                    onClick={() => handleStartEdit(quote)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleStartEdit(quote);
                      }
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
                        disabled={quote.status === 'aprovado'}
                        className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                        title={quote.status === 'aprovado' ? 'Orçamento convertido: edite no pedido' : 'Editar orçamento'}
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
                              void handleApproveQuote(quote.id);
                            }
                          }}
                          disabled={approvingQuoteId !== null}
                          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5 text-emerald-500 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className={`${viewMode === 'cards' ? 'block' : 'hidden'} px-3 py-8 text-center text-sm font-semibold text-muted-foreground`}>
              Nenhum orçamento cadastrado ou correspondente à pesquisa.
            </div>
          )}

          <div className={viewMode === 'list' ? 'block overflow-x-auto' : 'hidden'}>
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
                            title="Visualizar PDF"
                            aria-label={`Visualizar PDF do orçamento ${quote.number}`}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadQuotePdf(quote)}
                            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                            title="Baixar PDF"
                            aria-label={`Baixar PDF do orçamento ${quote.number}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(quote)}
                            disabled={quote.status === 'aprovado'}
                            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border disabled:cursor-not-allowed disabled:opacity-35"
                            title={quote.status === 'aprovado' ? 'Orçamento convertido: edite no pedido' : 'Editar orçamento'}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          
                          {quote.status !== 'aprovado' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Aprovar este orçamento e gerar o pedido na fila?')) {
                                  void handleApproveQuote(quote.id);
                                }
                              }}
                              disabled={approvingQuoteId !== null}
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/25 border border-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Aprovar e Converter em Pedido"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => sendQuoteProposalWhatsApp(quote)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/25 border border-emerald-500/20"
                            title="Enviar proposta via WhatsApp Web"
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
                  <span className="block whitespace-nowrap font-bold text-slate-800">{selectedFormCustomer.document || 'Não informado'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Telefone</span>
                  <span className="block whitespace-nowrap font-bold text-slate-800">{selectedFormCustomer.phone || 'Não informado'}</span>
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
                    initializeProductConfiguration(nextProductId);
                  }}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs focus:outline-none text-foreground"
                >
                  <option value="">Selecione...</option>
                  <option value={MANUAL_QUOTE_ITEM_ID}>Produto avulso / Item manual</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.pricing_type} - {formatCurrency(p.sales_price)})
                    </option>
                  ))}
                </select>
              </div>

              {isManualQuoteItem && (
                <>
                  <div className="md:col-span-3 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">Tipo de cálculo</label>
                    <select
                      value={manualPricingType}
                      onChange={(e) => setManualPricingType(e.target.value as ManualQuotePricingType)}
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs focus:outline-none text-foreground"
                    >
                      {manualQuotePricingOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-5 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">Descrição do item</label>
                    <input
                      type="text"
                      value={manualItemDescription}
                      onChange={(e) => setManualItemDescription(e.target.value)}
                      placeholder="Ex: Produto avulso teste"
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs focus:outline-none text-foreground"
                    />
                  </div>

                  {manualPricingType === 'm2' && (
                    <>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-semibold text-muted-foreground">Largura (cm)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={Number((itemWidth * 100).toFixed(3))}
                          onChange={(e) => setItemWidth(Math.max(0.1, parseFloat(e.target.value) || 0.1) / 100)}
                          className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                        />
                      </div>

                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-semibold text-muted-foreground">Altura (cm)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={Number((itemHeight * 100).toFixed(3))}
                          onChange={(e) => setItemHeight(Math.max(0.1, parseFloat(e.target.value) || 0.1) / 100)}
                          className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                        />
                      </div>
                    </>
                  )}

                  {manualPricingType === 'linear' && (
                    <div className="md:col-span-3 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Comprimento (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={Number((itemWidth * 100).toFixed(3))}
                        onChange={(e) => setItemWidth(Math.max(0.1, parseFloat(e.target.value) || 0.1) / 100)}
                        className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                      />
                    </div>
                  )}

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">Quantidade</label>
                    <input
                      type="number"
                      min={1}
                      value={itemQty}
                      onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">{manualUnitPriceLabel}</label>
                    <input
                      type="text"
                      value={formatCurrencyInput(manualUnitPrice)}
                      onChange={(e) => setManualUnitPrice(parseCurrencyInputToNumber(e.target.value))}
                      placeholder="R$ 0,00"
                      className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-right font-bold text-foreground"
                    />
                  </div>

                  <div className="md:col-span-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[10px] font-bold text-primary">
                    {manualPricingType === 'm2' && (
                      <span className="block text-muted-foreground">Área total: {manualItemAreaTotal.toFixed(2)} m²</span>
                    )}
                    {manualPricingType === 'linear' && (
                      <span className="block text-muted-foreground">Metragem total: {(manualItemLinearMeters * manualItemQuantity).toFixed(2)} m</span>
                    )}
                    <span className="block">Total: {formatCurrency(manualItemTotal)}</span>
                  </div>
                </>
              )}

              {/* Dynamic Dimension Inputs */}
              {selectedProductId && !isManualQuoteItem && ['m2', 'linear'].includes(getProductPriceInfo(selectedProductId).type) && (
                <>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">Largura / Compr. (cm)</label>
                    <input
                      type="number"
                      step="0.1"
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
                        step="0.1"
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
              {!requiresTierSelection && !isManualQuoteItem && (
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    value={itemQty}
                    onChange={(e) => {
                      setItemQty(Math.max(1, parseInt(e.target.value) || 1));
                    }}
                    className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none text-center"
                  />
                </div>
              )}

              {selectedProductId && !isManualQuoteItem && hasVariantPricingMatrix && (
                <div className="md:col-span-12 rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <h5 className="text-xs font-black uppercase tracking-wide text-foreground">Configure o produto</h5>
                    <p className="text-[11px] text-muted-foreground">
                      Escolha a combinação cadastrada para liberar as tiragens e preços disponíveis.
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Material', field: 'material' as const, value: selectedMaterial, options: matrixMaterialOptions },
                      { label: 'Tamanho', field: 'size' as const, value: selectedMatrixSize, options: matrixSizeOptions },
                      { label: 'Cores', field: 'colors' as const, value: selectedMatrixColors, options: matrixColorOptions },
                      { label: 'Acabamento', field: 'finishing' as const, value: selectedFinishing, options: matrixFinishingOptions }
                    ].filter((group) => group.options.length > 0).map((group) => (
                      <div key={group.label} className="rounded-lg border border-border bg-secondary/20 p-2.5">
                        <span className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">{group.label}</span>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {group.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => handleMatrixOptionSelect(group.field, option)}
                              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition-all ${
                                normalizeCombinationKey(group.value) === normalizeCombinationKey(option)
                                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/10'
                                  : 'border-border bg-card text-foreground hover:border-primary/50'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!selectedMatrixRow && (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                      Essa combinação não possui preço cadastrado. Escolha outra opção.
                    </div>
                  )}
                </div>
              )}

              {selectedProductId && !isManualQuoteItem && requiresTierSelection && (
                <div className="md:col-span-12 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-foreground space-y-2">
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wide text-foreground">Faixas de quantidade</h5>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Clique na tiragem cadastrada. A quantidade, o unitário e o total serão aplicados ao item.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {effectiveQuantityTiers.map((tier) => (
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
                        <span className="block">A partir de {tier.min_qty} un</span>
                        <span className="block">{formatUnitCurrency(tier.price)} / un</span>
                        <span className="block text-[9px] opacity-80">{formatCurrency(tier.total)} total</span>
                      </button>
                    ))}
                  </div>
                  {selectedQuantityTier ? (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold">
                        Faixa aplicada: a partir de {selectedQuantityTier.min_qty} un
                      </span>
                      <span className="font-bold text-primary">
                        {formatUnitCurrency(selectedQuantityTier.price)} / un
                        {' | '}
                        {formatCurrency(selectedQuantityTier.total)} total
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-amber-600">
                        Este produto possui tabela por quantidade, mas a quantidade informada ainda não atingiu a primeira faixa.
                      </span>
                      <span className="font-bold text-foreground">
                        Preço base: {formatUnitCurrency(getProductPriceInfo(selectedProductId).price)} / un
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
                          {(() => {
                            const configLines = getItemConfigurationSummaryLines({
                              ...item,
                              total_price: item.total_price ?? item.quantity * item.unit_price
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
                              Medidas: {Number(((item.details.width || 0) * 100).toFixed(3))} cm {item.details.height ? `x ${Number((item.details.height * 100).toFixed(3))} cm` : 'linear'}
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
                        <td className="px-4 py-2 text-right font-bold text-foreground">{formatCurrency(item.total_price ?? item.quantity * item.unit_price)}</td>
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
                  <label className="text-[10px] font-bold text-muted-foreground">Desconto</label>
                  <div className="grid grid-cols-[82px_1fr] gap-2">
                    <select
                      value={discountMode}
                      onChange={(e) => setDiscountMode(e.target.value as 'fixed' | 'percentage')}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-bold text-foreground focus:outline-none"
                      aria-label="Tipo de desconto"
                    >
                      <option value="fixed">R$</option>
                      <option value="percentage">%</option>
                    </select>
                    {discountMode === 'fixed' ? (
                      <input
                        type="text"
                        value={formatCurrencyInput(discount)}
                        onChange={(e) => setDiscount(parseCurrencyInputToNumber(e.target.value))}
                        className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-right text-xs font-bold text-emerald-500 focus:outline-none"
                        aria-label="Desconto em reais"
                      />
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={discountPercentage || ''}
                          onChange={(e) => setDiscountPercentage(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                          className="w-full rounded-lg border border-border bg-card px-2 py-1.5 pr-7 text-right text-xs font-bold text-emerald-500 focus:outline-none"
                          aria-label="Desconto em porcentagem"
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-500">%</span>
                      </div>
                    )}
                  </div>
                  {discountMode === 'percentage' && discountPercentage > 0 && (
                    <p className="text-right text-[9px] font-semibold text-muted-foreground">
                      Equivale a {formatCurrency((getSubtotal() + getServicesTotal() + deliveryFee) * discountPercentage / 100)}
                    </p>
                  )}
                </div>
                <div className="flex justify-between items-center border-t border-border pt-3 mt-3 font-bold text-sm">
                  <span className="text-foreground">Total Líquido:</span>
                  <span className="text-primary text-base font-extrabold">
                    {formatCurrency(Math.max(0, getSubtotal() + getServicesTotal() + deliveryFee - (discountMode === 'percentage' ? (getSubtotal() + getServicesTotal() + deliveryFee) * discountPercentage / 100 : discount)))}
                  </span>
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
    </div>
  );
}
