'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  DollarSign, 
  ChevronRight, 
  X, 
  Check, 
  AlertCircle,
  Printer,
  Ban,
  Download,
  Eye,
  Edit3,
  RefreshCw,
  Plus,
  Trash2
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Order } from '@/lib/dummy-data';
import type { AdditionalService } from '@/lib/dummy-data';
import { AdditionalServicesSection, getAdditionalServicesTotal } from '@/components/commercial/AdditionalServicesSection';
import {
  formatCurrencyInput,
  parseCurrencyInputToNumber,
  generatePixPayload,
  formatCEP,
  getPixWhatsAppPaymentInfo,
  getWhatsAppTimeGreeting
} from '@/lib/utils';
import { calculateRouteDistance } from '@/lib/delivery';
import { warnCaught } from '@/lib/safe-log';
import { formatUnitCurrency } from '@/lib/pricing';
import { isActiveOrder, isCancelledOrder, isProductionActiveOrder, normalizeOrderOperationalStatus } from '@/lib/order-status';
import { areOrderNumbersEquivalent, formatOrderDisplayNumber, getOrderNumberSearchText } from '@/lib/order-number';
import { openWhatsAppUrl, validateWhatsAppPhone } from '@/lib/whatsapp';
import { PdfPreviewDialog } from '@/components/pdf/pdf-preview-dialog';
import { downloadFileFromUrl } from '@/lib/download';
import {
  calculateOrderPaidAmount,
  getActivePaymentTransactions
} from '@/lib/finance-rules';

type PdfPreviewState = {
  title: string;
  previewDataUrl: string;
  downloadUrl: string;
  directPdfUrl: string;
  downloadLabel?: string;
};

export default function OrdersPage() {
  const { 
    orders, 
    updateOrderStatus, 
    payOrder, 
    customers, 
    settings,
    company,
    financial,
    updateOrder,
    products
  } = useDatabase();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedPdfPreview, setSelectedPdfPreview] = useState<PdfPreviewState | null>(null);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentKind, setPaymentKind] = useState<'adiantamento' | 'parcial' | 'saldo' | 'total'>('saldo');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado'>('pix');
  const [paymentDateInput, setPaymentDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [paymentNotesInput, setPaymentNotesInput] = useState('');
  const [showPixCode, setShowPixCode] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const paymentSubmissionRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'todos' | 'orcamento' | 'producao' | 'finalizado' | 'cancelado'>('todos');

  // Edit Order state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editStatus, setEditStatus] = useState<Order['status']>('producao');
  const [editDeadline, setEditDeadline] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTotal, setEditTotal] = useState(0);
  const [editShipping, setEditShipping] = useState(0);
  const [editPaid, setEditPaid] = useState(0);
  const [editItems, setEditItems] = useState<Order['items']>([]);
  const [editAdditionalServices, setEditAdditionalServices] = useState<AdditionalService[]>([]);

  // Delivery states for edit modal
  const [editDeliveryType, setEditDeliveryType] = useState<'retirada' | 'motoboy' | 'carro' | 'correios'>('retirada');
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('');
  const [editDeliveryDistanceInput, setEditDeliveryDistanceInput] = useState('');
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [lastCalculatedAddress, setLastCalculatedAddress] = useState('');

  // Structured Address States for edit modal
  const [editDeliveryStreet, setEditDeliveryStreet] = useState('');
  const [editDeliveryNumber, setEditDeliveryNumber] = useState('');
  const [editDeliveryNeighborhood, setEditDeliveryNeighborhood] = useState('');
  const [editDeliveryCity, setEditDeliveryCity] = useState('');
  const [editDeliveryState, setEditDeliveryState] = useState('');
  const [editDeliveryZipCode, setEditDeliveryZipCode] = useState('');

  const buildOrderOriginAddress = useCallback(() => {
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

  // Helper para decodificar o endereço concatenado salvo no pedido
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

  const handleEditDeliveryCEPChange = async (val: string) => {
    const formatted = formatCEP(val);
    setEditDeliveryZipCode(formatted);
    const clean = formatted.replace(/\D/g, '');

    if (clean.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          if (data.logradouro) setEditDeliveryStreet(data.logradouro);
          if (data.bairro) setEditDeliveryNeighborhood(data.bairro);
          if (data.localidade) setEditDeliveryCity(data.localidade);
          if (data.uf) setEditDeliveryState(data.uf);
        }
      } catch (error) {
        warnCaught('Erro capturado:', error);
      }
    }
  };

  const parseDecimalBR = (value: string | number): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const normalized = value
      .trim()
      .replace(/\s+/g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatDecimalBR = (value: number) => {
    if (!Number.isFinite(value) || value === 0) return '';

    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  const calculateShippingByDistance = useCallback((km: number, deliveryType = editDeliveryType) => {
    if (!['motoboy', 'carro'].includes(deliveryType) || km <= 0) return 0;

    const pricePerKm = deliveryType === 'motoboy'
      ? (settings.delivery_motoboy_price_km || 2.50)
      : (settings.delivery_car_price_km || 4.50);
    const rawFee = km * pricePerKm;
    const minFee = settings.delivery_min_fee || 10.00;
    return Math.round(Math.max(rawFee, minFee) * 100) / 100;
  }, [
    editDeliveryType,
    settings.delivery_car_price_km,
    settings.delivery_min_fee,
    settings.delivery_motoboy_price_km
  ]);

  // Sincroniza subcampos com o endereço de entrega completo para OSRM no pedido
  useEffect(() => {
    if (editDeliveryStreet || editDeliveryNumber || editDeliveryNeighborhood || editDeliveryCity || editDeliveryState || editDeliveryZipCode) {
      const addr = `${editDeliveryStreet}, ${editDeliveryNumber} - ${editDeliveryNeighborhood}, ${editDeliveryCity} - ${editDeliveryState}${editDeliveryZipCode ? `, CEP ${editDeliveryZipCode}` : ''}`;
      setEditDeliveryAddress(addr);
    } else {
      setEditDeliveryAddress('');
    }
  }, [editDeliveryStreet, editDeliveryNumber, editDeliveryNeighborhood, editDeliveryCity, editDeliveryState, editDeliveryZipCode]);

  // Executa o cálculo da rota utilizando OpenStreetMap e OSRM
  const handleCalculateEditRoute = async () => {
    setIsCalculatingRoute(true);
    setRouteError(null);
    try {
      const companyOrigin = buildOrderOriginAddress();

      const dist = await calculateRouteDistance(companyOrigin, editDeliveryAddress);
      setEditDeliveryDistanceInput(formatDecimalBR(dist));
      
      const newShipping = calculateShippingByDistance(dist);
      
      const diff = newShipping - editShipping;
      setEditShipping(newShipping);
      setEditTotal(prev => Math.max(0, prev + diff));
      setLastCalculatedAddress(editDeliveryAddress);
    } catch (err: unknown) {
      warnCaught('Erro capturado:', err);
      setRouteError(err instanceof Error ? err.message : 'Erro ao calcular a distância da rota.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Auto-calcular rota ao alterar o endereço ou tipo de entrega no pedido
  useEffect(() => {
    if (!editDeliveryAddress || editDeliveryAddress.trim().length < 8 || !['motoboy', 'carro'].includes(editDeliveryType)) {
      return;
    }

    if (editDeliveryAddress === lastCalculatedAddress) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsCalculatingRoute(true);
      setRouteError(null);
      try {
        const companyOrigin = buildOrderOriginAddress();

        const dist = await calculateRouteDistance(companyOrigin, editDeliveryAddress);
        setEditDeliveryDistanceInput(formatDecimalBR(dist));
        
        const newShipping = calculateShippingByDistance(dist);
        
        const diff = newShipping - editShipping;
        setEditShipping(newShipping);
        setEditTotal(prev => Math.max(0, prev + diff));
        setLastCalculatedAddress(editDeliveryAddress);
      } catch (err: unknown) {
        warnCaught('Erro capturado:', err);
        setRouteError(err instanceof Error ? err.message : 'Erro ao calcular a distância da rota automaticamente.');
      } finally {
        setIsCalculatingRoute(false);
      }
    }, 1000); // 1s de debounce

    return () => clearTimeout(timer);
  }, [editDeliveryAddress, editDeliveryType, lastCalculatedAddress, buildOrderOriginAddress, editShipping, calculateShippingByDistance]);

  const handleEditDistanceChange = (value: string) => {
    const km = parseDecimalBR(value);
    setEditDeliveryDistanceInput(value);
    const newShipping = calculateShippingByDistance(km);
    
    const diff = newShipping - editShipping;
    setEditShipping(newShipping);
    setEditTotal(prev => Math.max(0, prev + diff));
  };

  const handleEditDeliveryTypeChange = (type: 'retirada' | 'motoboy' | 'carro' | 'correios') => {
    setEditDeliveryType(type);
    if (type === 'retirada') {
      const diff = 0 - editShipping;
      setEditShipping(0);
      setEditTotal(prev => Math.max(0, prev + diff));
      setEditDeliveryDistanceInput('');
      setEditDeliveryAddress('');
      setEditDeliveryStreet('');
      setEditDeliveryNumber('');
      setEditDeliveryNeighborhood('');
      setEditDeliveryCity('');
      setEditDeliveryState('');
      setEditDeliveryZipCode('');
    } else if (type === 'correios') {
      setEditDeliveryDistanceInput('');
    } else if (['motoboy', 'carro'].includes(type)) {
      const newShipping = calculateShippingByDistance(parseDecimalBR(editDeliveryDistanceInput), type);
      
      const diff = newShipping - editShipping;
      setEditShipping(newShipping);
      setEditTotal(prev => Math.max(0, prev + diff));
    }
  };

  const updateEditItem = (
    itemId: string,
    updater: (item: Order['items'][number]) => Order['items'][number],
    changedField?: 'quantity' | 'unit_price' | 'total_price' | 'measure'
  ) => {
    setEditItems((current) =>
      current.map((item) => (item.id === itemId ? recalculateOrderItem(updater(item), changedField) : item))
    );
  };

  const handleEditItemProductChange = (itemId: string, productId: string) => {
    updateEditItem(itemId, (item) => {
      if (!productId) {
        return {
          ...item,
          product_id: '',
          product_name: item.product_name || 'Item manual / personalizado',
          details: {
            ...(item.details || {}),
            item_type: 'manual',
            manual_pricing_type: item.details?.manual_pricing_type || 'unidade'
          }
        };
      }

      const product = products.find((candidate) => candidate.id === productId);
      if (!product) return item;

      const unitPrice = Math.max(0, Number(product.sales_price || product.pricing_details?.calculated_price || item.unit_price || 0));
      const quantity = Math.max(1, Number(item.quantity || 1));

      return {
        ...item,
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unitPrice,
        total_price: Math.round(quantity * unitPrice * 100) / 100,
        details: {
          ...(item.details || {}),
          item_type: 'catalog',
          pricing_type: product.pricing_type,
          manual_pricing_type: normalizeOrderItemPricingType(product.pricing_type),
          pricing_snapshot: {
            ...((item.details?.pricing_snapshot as Record<string, unknown> | undefined) || {}),
            product_id: product.id,
            product_name: product.name,
            base_unit_price: unitPrice
          }
        }
      };
    }, 'unit_price');
  };

  const handleAddEditItem = () => {
    const now = Date.now();
    const newItem: Order['items'][number] = {
      id: `oi-edit-${now}`,
      product_id: '',
      product_name: 'Item manual / personalizado',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      outsourced: false,
      details: {
        item_type: 'manual',
        manual_pricing_type: 'unidade',
        pricing_snapshot: {
          source: 'order_edit',
          size: '',
          quantity: 1,
          unit_price: 0,
          total_price: 0
        }
      }
    };

    setEditItems((current) => [...current, newItem]);
  };

  const handleRemoveEditItem = (itemId: string) => {
    if (editItems.length <= 1) {
      alert('O pedido precisa ter pelo menos um item.');
      return;
    }

    if (!confirm('Tem certeza que deseja remover este item do pedido?')) return;
    setEditItems((current) => current.filter((item) => item.id !== itemId));
  };

  useEffect(() => {
    if (!editingOrder) return;
    const productsTotal = editItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
    const servicesTotal = getAdditionalServicesTotal(editAdditionalServices);
    setEditTotal(Math.max(0, productsTotal + servicesTotal + editShipping));
  }, [editingOrder, editItems, editAdditionalServices, editShipping]);

  const handleOpenEditOrder = (order: Order) => {
    setSelectedOrder(null); // Close details panel if open
    setEditingOrder(order);
    setEditStatus(normalizeOrderOperationalStatus(order));
    setEditDeadline(order.deadline.split('T')[0]);
    setEditNotes(sanitizeDisplayText(order.notes));
    setEditTotal(order.total_amount);
    setEditShipping(order.shipping_cost || 0);
    setEditPaid(getConfirmedPaidAmountForOrder(order));
    setEditItems((order.items || []).map((item) => recalculateOrderItem(item)));
    setEditAdditionalServices(order.additional_services || []);
    setEditDeliveryType(order.delivery_type || 'retirada');
    setEditDeliveryAddress(order.delivery_address || '');
    setEditDeliveryDistanceInput(formatDecimalBR(order.delivery_distance_km || 0));
    setLastCalculatedAddress(order.delivery_address || '');
    
    // Preenche campos estruturados a partir da string salva no pedido
    const parsed = parseDeliveryAddress(order.delivery_address || '');
    setEditDeliveryStreet(parsed.street);
    setEditDeliveryNumber(parsed.number);
    setEditDeliveryNeighborhood(parsed.neighborhood);
    setEditDeliveryCity(parsed.city);
    setEditDeliveryState(parsed.state);
    setEditDeliveryZipCode(parsed.zip);
    
    setRouteError(null);

    if (['motoboy', 'carro'].includes(order.delivery_type || '') && order.delivery_address) {
      const addressToCalculate = order.delivery_address;
      setIsCalculatingRoute(true);

      calculateRouteDistance(buildOrderOriginAddress(), addressToCalculate)
        .then((dist) => {
          const newShipping = calculateShippingByDistance(dist, order.delivery_type || 'retirada');
          const baseTotal = order.total_amount - (order.shipping_cost || 0);

          setEditDeliveryDistanceInput(formatDecimalBR(dist));
          setEditShipping(newShipping);
          setEditTotal(Math.max(0, baseTotal + newShipping));
          setLastCalculatedAddress(addressToCalculate);
        })
        .catch((err: unknown) => {
          warnCaught('Erro capturado:', err);
          setRouteError(err instanceof Error ? err.message : 'Erro ao calcular a distância da rota.');
        })
        .finally(() => setIsCalculatingRoute(false));
    }
  };

  const handleOpenCancelOrder = (order: Order) => {
    if (order.status === 'cancelado') return;

    if (confirm(`Cancelar o pedido ${formatOrderDisplayNumber(order.number)}?`)) {
      updateOrderStatus(order.id, 'cancelado');
    }
  };

  const handleSaveEditOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    if (editItems.length === 0) {
      alert('O pedido precisa ter pelo menos um item.');
      return;
    }

    const productsTotal = editItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
    const servicesTotal = getAdditionalServicesTotal(editAdditionalServices);
    const nextTotal = Math.max(0, productsTotal + servicesTotal + editShipping);
    const paidAmount = editPaid;
    const deliveryDistanceKm = parseDecimalBR(editDeliveryDistanceInput);

    updateOrder({
      ...editingOrder,
      status: editStatus,
      deadline: new Date(editDeadline).toISOString(),
      notes: sanitizeDisplayText(editNotes),
      total_amount: nextTotal,
      shipping_cost: editShipping,
      paid_amount: paidAmount,
      payment_status: getPaymentStatusForTotal(paidAmount, nextTotal),
      items: editItems.map((item) => recalculateOrderItem(item)),
      additional_services: editAdditionalServices,
      delivery_type: editDeliveryType,
      delivery_address: editDeliveryType !== 'retirada' ? editDeliveryAddress : undefined,
      delivery_distance_km: ['motoboy', 'carro'].includes(editDeliveryType) ? deliveryDistanceKm : undefined
    });

    setEditingOrder(null);
  };

  const handlePrintOrderPdf = (order: Order) => {
    setSelectedPdfPreview({
      title: `Pedido ${formatOrderDisplayNumber(order.number)}`,
      previewDataUrl: `/api/pdf-preview-data/order/${order.id}`,
      downloadUrl: `/api/pdf/order/${order.id}?download=1`,
      directPdfUrl: `/api/pdf/order/${order.id}`
    });
  };

  const handleDownloadOrderPdf = async (order: Order) => {
    try {
      await downloadFileFromUrl(`/api/pdf/order/${order.id}?download=1`, `${formatOrderDisplayNumber(order.number)}.pdf`);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Erro ao baixar PDF do pedido:', err);
      }
      alert('Nao foi possivel baixar o PDF. Tente novamente.');
    }
  };

  const getLatestPaidOrderTransaction = (order: Order) => {
    return getActivePaymentTransactions(
      financial.filter((transaction) => transaction.order_id === order.id || areOrderNumbersEquivalent(transaction.order_number, order.number)),
      order
    )
      .sort((a, b) => {
        const dateA = new Date(a.paid_at || a.created_at || 0).getTime();
        const dateB = new Date(b.paid_at || b.created_at || 0).getTime();
        return dateB - dateA;
      })[0] || null;
  };

  const handlePreviewReceipt = (order: Order) => {
    const transaction = getLatestPaidOrderTransaction(order);

    if (!transaction) {
      alert('Nenhum pagamento confirmado encontrado para gerar recibo.');
      return;
    }

    setSelectedPdfPreview({
      title: `Recibo de Pagamento - ${formatOrderDisplayNumber(order.number)}`,
      previewDataUrl: `/api/pdf-preview-data/receipt/${transaction.id}`,
      downloadUrl: `/api/pdf/receipt/${transaction.id}?download=1`,
      directPdfUrl: `/api/pdf/receipt/${transaction.id}`,
      downloadLabel: 'Baixar Recibo'
    });
  };

  const matchesSearchQuery = (o: Order) => {
    const normalizedSearch = searchQuery.toLowerCase();
    return (
      o.customer_name.toLowerCase().includes(normalizedSearch) ||
      getOrderNumberSearchText(o.number).includes(normalizedSearch) ||
      o.status.toLowerCase().includes(normalizedSearch) ||
      o.payment_status.toLowerCase().includes(normalizedSearch) ||
      o.items.some((item) => item.product_name.toLowerCase().includes(normalizedSearch))
    );
  };

  const activeOrders = orders.filter(isActiveOrder);
  const cancelledOrders = orders.filter(isCancelledOrder);

  const getFilteredOrdersByTab = (tab: typeof activeTab) => {
    const baseOrders = tab === 'cancelado' ? cancelledOrders : activeOrders;
    const searchedOrders = baseOrders.filter(matchesSearchQuery);

    switch (tab) {
      case 'orcamento':
        return searchedOrders.filter(o => normalizeOrderOperationalStatus(o) === 'orcamento');
      case 'producao':
        return searchedOrders.filter(isProductionActiveOrder);
      case 'finalizado':
        return searchedOrders.filter(o => ['expedicao', 'entregue', 'finalizado'].includes(o.status));
      case 'cancelado':
        return searchedOrders;
      default:
        return searchedOrders;
    }
  };

  const displayOrders = getFilteredOrdersByTab(activeTab);

  // 2. Register payment handler
  const handleRegisterPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentSubmissionRef.current) return;
    if (!selectedOrder || paymentAmount <= 0) return;
    const confirmedPaidBeforePayment = calculateOrderPaidAmount(selectedOrder, financial);
    const currentPaidBeforePayment = Math.max(Number(selectedOrder.paid_amount || 0), confirmedPaidBeforePayment);
    const currentBalance = Math.max(0, selectedOrder.total_amount - currentPaidBeforePayment);
    if (paymentAmount > currentBalance) {
      alert(`O valor recebido nao pode ser maior que o saldo pendente (${formatCurrency(currentBalance)}).`);
      return;
    }

    if (paymentMethod === 'pix' && !showPixCode) {
      setShowPixCode(true);
      return;
    }

    if (paymentMethod === 'faturado') {
      const client = customers.find(c => c.name === selectedOrder.customer_name);
      if (!client || client.billing_type !== 'faturado') {
        alert('Este cliente não possui permissão de faturamento corporativo!');
        return;
      }
      if (client.credit_status !== 'aprovado') {
        alert('O crédito corporativo deste cliente não está APROVADO!');
        return;
      }
      const creditAvailable = (client.credit_limit || 0) - (client.credit_used || 0);
      if (creditAvailable < paymentAmount) {
        alert(`Crédito indisponível! Limite disponível: ${formatCurrency(creditAvailable)}`);
        return;
      }
    }

    paymentSubmissionRef.current = true;
    setIsSavingPayment(true);

    const newPaid = paymentMethod === 'faturado'
      ? currentPaidBeforePayment
      : Math.min(selectedOrder.total_amount, currentPaidBeforePayment + paymentAmount);
    const updatedSelectedOrder: Order = {
      ...selectedOrder,
      paid_amount: newPaid,
      payment_status: paymentMethod === 'faturado'
        ? 'parcial'
        : newPaid >= selectedOrder.total_amount
          ? 'pago'
          : 'parcial'
    };

    payOrder(selectedOrder.id, paymentAmount, paymentMethod, {
      payment_type: paymentKind,
      paid_at: `${paymentDateInput || new Date().toISOString().split('T')[0]}T12:00:00.000Z`,
      notes: paymentNotesInput
    });
    setSelectedOrder(updatedSelectedOrder);

    setPaymentAmount(0);
    setPaymentKind('saldo');
    setPaymentDateInput(new Date().toISOString().split('T')[0]);
    setPaymentNotesInput('');
    setIsAddingPayment(false);
    setShowPixCode(false);
    setIsSavingPayment(false);
    paymentSubmissionRef.current = false;
  };

  const getPaymentStatusBadge = (status: Order['payment_status']) => {
    const styles = {
      pendente: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      parcial: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      pago: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      reembolsado: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    };

    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${styles[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const getOrderStatusBadge = (status: Order['status']) => {
    const labels: Record<Order['status'], string> = {
      orcamento: 'Orçamento',
      aguardando_aprovacao: 'Aguardando',
      aguardando_pagamento: 'Aguardando',
      producao: 'Produção',
      impressao: 'Impressão',
      acabamento: 'Acabamento',
      expedicao: 'Expedição',
      entregue: 'Entregue',
      finalizado: 'Finalizado',
      cancelado: 'Cancelado',
    };
    
    const colors: Record<Order['status'], string> = {
      orcamento: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      aguardando_aprovacao: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      aguardando_pagamento: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      producao: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      impressao: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      acabamento: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      expedicao: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      entregue: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      finalizado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      cancelado: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };

    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${colors[normalizeOrderOperationalStatus({ status })]}`}>
        {labels[normalizeOrderOperationalStatus({ status })].toUpperCase()}
      </span>
    );
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const sanitizeDisplayText = (value?: string | null) => {
    const cleaned = String(value || '')
      .replace(/\s*\.?\s*(null|undefined)\s*$/i, '')
      .trim();
    if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined') return '';
    return cleaned;
  };

  const getOrderItemSizeLabel = (item: Order['items'][number]) => {
    const configSnapshot = item.details?.configuration_snapshot;
    const pricingSnapshot = item.details?.pricing_snapshot as Record<string, unknown> | undefined;
    const snapshotSize = sanitizeDisplayText(configSnapshot?.size || String(pricingSnapshot?.size || ''));
    if (snapshotSize) return snapshotSize;

    if (item.details?.width && item.details?.height) return `${item.details.width}x${item.details.height}m`;
    if (item.details?.length) return `${item.details.length}m`;
    return '-';
  };

  const getOrderItemOriginLabel = (item: Order['items'][number]) => {
    if (!item.product_id || item.details?.item_type === 'manual') return 'Manual';
    if (item.details?.configuration_snapshot?.sale_mode === 'variant_matrix') return 'Produto / matriz';
    if (item.details?.configuration_snapshot?.sale_mode === 'volume') return 'Produto / volume';
    return 'Produto cadastrado';
  };

  const normalizeOrderItemPricingType = (
    value?: Order['items'][number]['details'] extends infer Details
      ? Details extends { manual_pricing_type?: infer ManualType; pricing_type?: infer PricingType }
        ? ManualType | PricingType
        : never
      : never
  ): NonNullable<Order['items'][number]['details']>['manual_pricing_type'] => {
    if (value === 'm2' || value === 'linear' || value === 'volume' || value === 'manual_value') return value;
    return 'unidade';
  };

  const getManualPricingType = (item: Order['items'][number]) =>
    normalizeOrderItemPricingType(item.details?.manual_pricing_type || item.details?.pricing_type);

  const recalculateOrderItem = (item: Order['items'][number], changedField?: 'quantity' | 'unit_price' | 'total_price' | 'measure') => {
    const pricingType = getManualPricingType(item);
    const quantity = Math.max(0, Number(item.quantity || 0));
    const unitPrice = Math.max(0, Number(item.unit_price || 0));
    const width = Math.max(0, Number(item.details?.width || 0));
    const height = Math.max(0, Number(item.details?.height || 0));
    const length = Math.max(0, Number(item.details?.length || 0));
    let totalPrice = Math.max(0, Number(item.total_price || 0));
    let nextUnitPrice = unitPrice;
    let areaTotal = item.details?.area_total;
    let linearMeters = item.details?.linear_meters;

    if (pricingType === 'm2') {
      areaTotal = Math.max(0, width * height * quantity);
      totalPrice = Math.round(areaTotal * unitPrice * 100) / 100;
    } else if (pricingType === 'linear') {
      linearMeters = Math.max(0, length * quantity);
      totalPrice = Math.round(linearMeters * unitPrice * 100) / 100;
    } else if (pricingType === 'manual_value') {
      nextUnitPrice = quantity > 0 ? Math.round((totalPrice / quantity) * 100) / 100 : totalPrice;
    } else if (changedField === 'total_price') {
      nextUnitPrice = quantity > 0 ? Math.round((totalPrice / quantity) * 100) / 100 : totalPrice;
    } else {
      totalPrice = Math.round(quantity * unitPrice * 100) / 100;
    }

    const size = getOrderItemSizeLabel(item);
    const safeSize = size === '-' ? '' : size;
    const configurationSnapshot = item.details?.configuration_snapshot
      ? {
          ...item.details.configuration_snapshot,
          size: safeSize || item.details.configuration_snapshot.size,
          quantity_tier: quantity,
          unit_price: nextUnitPrice,
          total_price: totalPrice,
          display_label: item.details.configuration_snapshot.display_label || item.product_name
        }
      : safeSize
        ? {
            sale_mode: 'manual_quote_item' as const,
            size: safeSize,
            quantity_tier: quantity,
            unit_price: nextUnitPrice,
            total_price: totalPrice,
            display_label: item.product_name
          }
        : undefined;

    return {
      ...item,
      quantity,
      unit_price: nextUnitPrice,
      total_price: totalPrice,
      details: {
        ...(item.details || {}),
        manual_pricing_type: pricingType,
        area_total: areaTotal,
        linear_meters: linearMeters,
        configuration_snapshot: configurationSnapshot,
        pricing_snapshot: {
          ...((item.details?.pricing_snapshot as Record<string, unknown> | undefined) || {}),
          size: safeSize,
          quantity,
          unit_price: nextUnitPrice,
          total_price: totalPrice
        }
      }
    };
  };

  const getPaymentStatusForTotal = (paidAmount: number, totalAmount: number): Order['payment_status'] => {
    if (paidAmount <= 0) return 'pendente';
    if (paidAmount >= totalAmount) return 'pago';
    return 'parcial';
  };

  const getConfirmedPaidAmountForOrder = (order: Order) => {
    const confirmedTotal = getActivePaymentTransactions(
      financial.filter((transaction) => transaction.order_id === order.id || areOrderNumbersEquivalent(transaction.order_number, order.number)),
      order
    ).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    return confirmedTotal > 0 ? confirmedTotal : Number(order.paid_amount || 0);
  };

  const getOrderItemConfigurationLines = (item: Order['items'][number]) => {
    const snapshot = item.details?.configuration_snapshot;
    if (!snapshot) return null;

    return {
      options: [snapshot.material, snapshot.size, snapshot.colors, snapshot.finishing].filter(Boolean).join(' • '),
      quantity: `${snapshot.quantity_tier || item.quantity} un`,
      unit: `${formatUnitCurrency(snapshot.unit_price || item.unit_price)}/un`,
      total: formatCurrency(snapshot.total_price || item.total_price)
    };
  };

  const isOverdue = (dateStr: string, status: string) => {
    const isPast = new Date(dateStr) < new Date();
    const active = !['entregue', 'finalizado', 'cancelado'].includes(status);
    return isPast && active;
  };

  const sendPixWhatsApp = (order: Order) => {
    const customer = customers.find(c => c.name === order.customer_name);
    const phone = customer?.phone;
    if (!phone) {
      alert("Telefone do cliente não encontrado!");
      return;
    }

    if (!validateWhatsAppPhone(phone)) {
      alert("Cliente sem telefone vÃ¡lido para WhatsApp.");
      return;
    }

    const balance = order.total_amount - order.paid_amount;
    if (balance <= 0) {
      alert("Este pedido já está totalmente quitado!");
      return;
    }

    const pixKey = settings.pix_key || "financeiro@printflowpro.com.br";
    const pixInfo = getPixWhatsAppPaymentInfo({
      key: pixKey,
      keyType: settings.pix_key_type,
      amount: balance,
      merchantName: company?.name || "PrintFlowPRO",
      beneficiaryName: settings.pix_beneficiary_name || company?.name,
      bankName: settings.bank_name
    });

    const greeting = getWhatsAppTimeGreeting();
    const message = `${greeting}, *${order.customer_name}*! 👋\nOlá, tudo bem?\n\nSegue a cobrança do seu pedido *${formatOrderDisplayNumber(order.number)}*:\n\n💰 *Valor a pagar:* *${formatCurrency(balance)}*\n\n🔑 *${pixInfo.label}:*\n${pixInfo.value}${pixInfo.securityText}\n\n✅ Após realizar o pagamento, por favor nos envie o comprovante por aqui.\n\nQualquer dúvida, estamos à disposição! 😊\n\nAtenciosamente,\n*${company?.name || "PrintFlowPRO"}*`;

    const opened = openWhatsAppUrl(phone, message);
    if (!opened) {
      alert("Cliente sem telefone válido para WhatsApp.");
    }
  };

  // Stats Calculations
  const totalOrdersCount = activeOrders.length;
  const pendingPaymentOrdersCount = activeOrders.filter(o => o.payment_status === 'pendente').length;
  const pendingAmount = activeOrders.reduce((sum, o) => sum + Math.max(0, o.total_amount - o.paid_amount), 0);
  const activeProductionCount = activeOrders.filter(isProductionActiveOrder).length;
  const corporateB2BFaturado = customers.reduce((sum, c) => sum + (c.credit_used || 0), 0);

  const selectedOrderPaidAmount = selectedOrder ? getConfirmedPaidAmountForOrder(selectedOrder) : 0;
  const selectedOrderPendingAmount = selectedOrder
    ? Math.max(0, Number(selectedOrder.total_amount || 0) - selectedOrderPaidAmount)
    : 0;

  const selectedOrderTransactions = selectedOrder
    ? getActivePaymentTransactions(
        financial.filter((transaction) => transaction.order_id === selectedOrder.id || areOrderNumbersEquivalent(transaction.order_number, selectedOrder.number)),
        selectedOrder
      )
    : [];
  
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
          downloadLabel={selectedPdfPreview.downloadLabel}
        />
      )}

      {editingOrder ? (
        /* Edit Order Form */
        <div className="mx-auto w-full max-w-6xl bg-card border border-border shadow-md rounded-2xl overflow-hidden p-6 no-print animate-in slide-in-from-bottom duration-300">
          <form onSubmit={handleSaveEditOrder} className="flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3 shrink-0">
              <h3 className="font-bold text-foreground text-sm uppercase flex items-center gap-1.5">
                <Edit3 className="h-4.5 w-4.5 text-primary" /> 
                Editar Pedido: {formatOrderDisplayNumber(editingOrder.number)}
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingOrder(null)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-1 text-xs">
              {/* Client (readonly) */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Cliente</label>
                <input
                  type="text"
                  disabled
                  value={editingOrder.customer_name}
                  placeholder="Cliente do pedido"
                  className="w-full px-3 py-1.5 bg-secondary/35 border border-border rounded-lg text-xs text-muted-foreground font-semibold cursor-not-allowed"
                />
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Status Operacional *</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as typeof editStatus)}
                  required
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="orcamento">Orçamento</option>
                  <option value="aguardando_pagamento">Aguardando</option>
                  <option value="producao">Em Produção</option>
                  <option value="impressao">Impressão</option>
                  <option value="acabamento">Acabamento</option>
                  <option value="expedicao">Expedição</option>
                  <option value="entregue">Entregue</option>
                  <option value="finalizado">Finalizado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              {/* Deadline */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Prazo de Entrega *</label>
                <input
                  type="date"
                  required
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  placeholder="dd/mm/aaaa"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                />
              </div>

              {/* Paid Amount */}
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Total pago registrado</label>
                <div className="w-full rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-500">
                  {formatCurrency(editPaid)}
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground">
                  Use Registrar Pagamento para adicionar baixa sem sobrescrever historico.
                </p>
              </div>

              {/* Opções de Entrega e Frete */}
              <div className="md:col-span-2 rounded-xl border border-border bg-secondary/20 p-3.5 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider">Itens do Pedido</h4>
                    <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                      Edite os itens do pedido sem alterar o produto original nem o historico financeiro.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditItem}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] font-black text-primary hover:bg-primary/15"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar Item
                  </button>
                </div>

                <div className="space-y-3">
                  {editItems.map((item) => {
                    const pricingType = getManualPricingType(item);
                    const itemSize = getOrderItemSizeLabel(item);
                    const itemNotes = sanitizeDisplayText(item.details?.notes);
                    const selectedProductId = item.product_id && products.some((product) => product.id === item.product_id)
                      ? item.product_id
                      : '';

                    return (
                      <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-black text-foreground">{item.product_name || 'Item sem descricao'}</p>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                              Origem: {getOrderItemOriginLabel(item)} | Tamanho: {itemSize || '-'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditItem(item.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/20 px-2.5 py-1.5 text-[10px] font-bold text-rose-500 hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remover
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                          <div className="space-y-1 lg:col-span-3">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground">Produto / modo</label>
                            <select
                              value={selectedProductId}
                              onChange={(event) => handleEditItemProductChange(item.id, event.target.value)}
                              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                            >
                              <option value="">Item manual / personalizado</option>
                              {products.filter((product) => product.active !== false).map((product) => (
                                <option key={product.id} value={product.id}>{product.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1 lg:col-span-4">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground">Descricao do item *</label>
                            <input
                              type="text"
                              required
                              value={item.product_name}
                              onChange={(event) => updateEditItem(item.id, (current) => ({
                                ...current,
                                product_name: event.target.value,
                                details: {
                                  ...(current.details || {}),
                                  configuration_snapshot: current.details?.configuration_snapshot
                                    ? { ...current.details.configuration_snapshot, display_label: event.target.value }
                                    : current.details?.configuration_snapshot
                                }
                              }))}
                              placeholder="Descricao comercial do item"
                              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                            />
                          </div>

                          <div className="space-y-1 lg:col-span-2">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground">Tamanho / Medida</label>
                            <input
                              type="text"
                              value={itemSize === '-' ? '' : itemSize}
                              onChange={(event) => updateEditItem(item.id, (current) => ({
                                ...current,
                                details: {
                                  ...(current.details || {}),
                                  configuration_snapshot: current.details?.configuration_snapshot
                                    ? { ...current.details.configuration_snapshot, size: event.target.value }
                                    : {
                                        sale_mode: 'manual_quote_item',
                                        size: event.target.value,
                                        quantity_tier: current.quantity,
                                        unit_price: current.unit_price,
                                        total_price: current.total_price,
                                        display_label: current.product_name
                                      },
                                  pricing_snapshot: {
                                    ...((current.details?.pricing_snapshot as Record<string, unknown> | undefined) || {}),
                                    size: event.target.value
                                  }
                                }
                              }), 'measure')}
                              placeholder="Ex: 10x15cm"
                              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                            />
                          </div>

                          <div className="space-y-1 lg:col-span-3">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground">Tipo de calculo</label>
                            <select
                              value={pricingType}
                              onChange={(event) => updateEditItem(item.id, (current) => ({
                                ...current,
                                details: {
                                  ...(current.details || {}),
                                  manual_pricing_type: event.target.value as NonNullable<Order['items'][number]['details']>['manual_pricing_type']
                                }
                              }), 'measure')}
                              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                            >
                              <option value="unidade">Unidade</option>
                              <option value="m2">Metro quadrado</option>
                              <option value="linear">Metro linear</option>
                              <option value="volume">Quantidade / lote</option>
                              <option value="manual_value">Valor manual</option>
                            </select>
                          </div>

                          {pricingType === 'm2' && (
                            <>
                              <div className="space-y-1 lg:col-span-2">
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Largura (m)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.details?.width || 0}
                                  onChange={(event) => updateEditItem(item.id, (current) => ({
                                    ...current,
                                    details: { ...(current.details || {}), width: Number(event.target.value) || 0 }
                                  }), 'measure')}
                                  className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                                />
                              </div>
                              <div className="space-y-1 lg:col-span-2">
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Altura (m)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.details?.height || 0}
                                  onChange={(event) => updateEditItem(item.id, (current) => ({
                                    ...current,
                                    details: { ...(current.details || {}), height: Number(event.target.value) || 0 }
                                  }), 'measure')}
                                  className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                                />
                              </div>
                            </>
                          )}

                          {pricingType === 'linear' && (
                            <div className="space-y-1 lg:col-span-2">
                              <label className="text-[9px] font-bold uppercase text-muted-foreground">Comprimento (m)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.details?.length || 0}
                                onChange={(event) => updateEditItem(item.id, (current) => ({
                                  ...current,
                                  details: { ...(current.details || {}), length: Number(event.target.value) || 0 }
                                }), 'measure')}
                                className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                              />
                            </div>
                          )}

                          <div className="space-y-1 lg:col-span-2">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground">Quantidade</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.quantity}
                              onChange={(event) => updateEditItem(item.id, (current) => ({
                                ...current,
                                quantity: Number(event.target.value) || 0
                              }), 'quantity')}
                              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground"
                            />
                          </div>

                          {pricingType !== 'manual_value' && (
                            <div className="space-y-1 lg:col-span-2">
                              <label className="text-[9px] font-bold uppercase text-muted-foreground">Valor unitario</label>
                              <input
                                type="text"
                                value={formatCurrencyInput(item.unit_price)}
                                onChange={(event) => updateEditItem(item.id, (current) => ({
                                  ...current,
                                  unit_price: parseCurrencyInputToNumber(event.target.value)
                                }), 'unit_price')}
                                placeholder="R$ 0,00"
                                className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-bold text-foreground"
                              />
                            </div>
                          )}

                          <div className="space-y-1 lg:col-span-2">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground">Total</label>
                            <input
                              type="text"
                              value={formatCurrencyInput(item.total_price)}
                              onChange={(event) => updateEditItem(item.id, (current) => ({
                                ...current,
                                total_price: parseCurrencyInputToNumber(event.target.value)
                              }), 'total_price')}
                              placeholder="R$ 0,00"
                              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-black text-primary"
                            />
                          </div>

                          <div className="space-y-1 lg:col-span-4">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground">Observacoes do item</label>
                            <input
                              type="text"
                              value={itemNotes}
                              onChange={(event) => updateEditItem(item.id, (current) => ({
                                ...current,
                                details: { ...(current.details || {}), notes: event.target.value }
                              }))}
                              placeholder="Acabamento, instrucoes ou ajuste comercial"
                              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs text-foreground"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2 p-3.5 bg-secondary/25 border border-border rounded-xl space-y-3">
                <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider">Opções de Entrega e Frete</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Meio de Entrega</label>
                    <select
                      value={editDeliveryType}
                      onChange={(e) => handleEditDeliveryTypeChange(e.target.value as typeof editDeliveryType)}
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none font-semibold"
                    >
                      <option value="retirada">Retirada na Gráfica (Grátis)</option>
                      <option value="motoboy">Entrega via Motoboy (Frete por KM)</option>
                      <option value="carro">Entrega via Carro (Frete por KM)</option>
                      <option value="correios">Correios / Transportadora (Valor Fixo)</option>
                    </select>
                  </div>

                  {editDeliveryType !== 'retirada' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Valor do Frete (R$)</label>
                      <input
                        type="text"
                        value={formatCurrencyInput(editShipping)}
                        onChange={(e) => {
                          const newShipping = parseCurrencyInputToNumber(e.target.value);
                          const diff = newShipping - editShipping;
                          setEditShipping(newShipping);
                          setEditTotal(prev => Math.max(0, prev + diff));
                        }}
                        placeholder="0,00"
                        className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none font-bold text-primary"
                      />
                    </div>
                  )}
                </div>

                {editDeliveryType !== 'retirada' && (
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                      {/* CEP */}
                      <div className="col-span-2 sm:col-span-2 space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">CEP *</label>
                        <input
                          type="text"
                          value={editDeliveryZipCode}
                          onChange={(e) => handleEditDeliveryCEPChange(e.target.value)}
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
                          value={editDeliveryStreet}
                          onChange={(e) => setEditDeliveryStreet(e.target.value)}
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
                          value={editDeliveryNumber}
                          onChange={(e) => setEditDeliveryNumber(e.target.value)}
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
                          value={editDeliveryNeighborhood}
                          onChange={(e) => setEditDeliveryNeighborhood(e.target.value)}
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
                          value={editDeliveryCity}
                          onChange={(e) => setEditDeliveryCity(e.target.value)}
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
                          value={editDeliveryState}
                          onChange={(e) => setEditDeliveryState(e.target.value.toUpperCase())}
                          placeholder="SP"
                          maxLength={2}
                          required
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none font-bold text-center"
                        />
                      </div>
                    </div>

                    {['motoboy', 'carro'].includes(editDeliveryType) && (
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 p-3 bg-secondary/20 border border-border rounded-lg text-xs">
                        <div className="grid grid-cols-2 gap-4 flex-1">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Distância Estimada (KM)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editDeliveryDistanceInput}
                              onChange={(e) => handleEditDistanceChange(e.target.value)}
                              className="w-full px-2 py-1 bg-card border border-border rounded-md text-xs font-semibold text-center"
                            />
                          </div>
                          <div className="space-y-0.5 flex flex-col justify-center">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase">Taxa Configurada</span>
                            <span className="font-bold text-[10px] text-foreground font-mono">
                              {editDeliveryType === 'motoboy' 
                                ? `${formatCurrency(settings.delivery_motoboy_price_km || 2.50)} / km`
                                : `${formatCurrency(settings.delivery_car_price_km || 4.50)} / km`
                              }
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isCalculatingRoute || !editDeliveryAddress}
                          onClick={handleCalculateEditRoute}
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

              <div className="md:col-span-2">
                <AdditionalServicesSection
                  services={editAdditionalServices}
                  onChange={setEditAdditionalServices}
                />
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-secondary/20 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total de produtos</span>
                  <span className="font-bold text-foreground">{formatCurrency(editItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total de serviços adicionais</span>
                  <span className="font-bold text-foreground">{formatCurrency(getAdditionalServicesTotal(editAdditionalServices))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="font-bold text-foreground">{formatCurrency(editShipping)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-sm">
                  <span className="font-black text-foreground">Total geral</span>
                  <span className="font-black text-primary">{formatCurrency(editTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total pago</span>
                  <span className="font-bold text-emerald-500">{formatCurrency(editPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo pendente</span>
                  <span className="font-bold text-amber-500">{formatCurrency(Math.max(0, editTotal - editPaid))}</span>
                </div>
              </div>

              {/* Notes */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Observações / Detalhes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Instruções internas ou detalhes do pedido..."
                  rows={3}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1"
              >
                <Check className="h-4 w-4" /> 
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      ) : !selectedOrder ? (
        <>
          {/* 1. Statistics Cards Panel */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 no-print">
            <div className="p-4 bg-card border border-border rounded-2xl shadow-sm text-left">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Total de Pedidos</span>
              <h3 className="text-xl font-bold mt-1 text-foreground">{totalOrdersCount}</h3>
              <span className="text-[9px] text-muted-foreground mt-0.5 block">Registrados no ERP</span>
            </div>

            <div className="p-4 bg-card border border-border rounded-2xl shadow-sm text-left">
              <span className="text-[10px] font-bold text-rose-500 uppercase block">Pedidos Pendentes</span>
              <h3 className="text-xl font-bold mt-1 text-rose-500">{pendingPaymentOrdersCount}</h3>
              <span className="text-[9px] text-muted-foreground mt-0.5 block">Aguardando receber</span>
            </div>

            <div className="p-4 bg-card border border-border rounded-2xl shadow-sm text-left">
              <span className="text-[10px] font-bold text-amber-500 uppercase block">Saldo de Recebíveis</span>
              <h3 className="text-xl font-bold mt-1 text-amber-500">{formatCurrency(pendingAmount)}</h3>
              <span className="text-[9px] text-muted-foreground mt-0.5 block">À vista ou parcelado</span>
            </div>

            <div className="p-4 bg-card border border-border rounded-2xl shadow-sm text-left">
              <span className="text-[10px] font-bold text-purple-500 uppercase block">Em Produção Ativa</span>
              <h3 className="text-xl font-bold mt-1 text-purple-500">{activeProductionCount}</h3>
              <span className="text-[9px] text-muted-foreground mt-0.5 block">Nas filas do galpão</span>
            </div>

            <div className="p-4 bg-card border border-border rounded-2xl shadow-sm text-left">
              <span className="text-[10px] font-bold text-emerald-500 uppercase block">Faturado B2B Utilizado</span>
              <h3 className="text-xl font-bold mt-1 text-emerald-500">{formatCurrency(corporateB2BFaturado)}</h3>
              <span className="text-[9px] text-muted-foreground mt-0.5 block">PJ com limite ativo</span>
            </div>
          </div>

          {/* 2. Header and Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Pesquisar por número do pedido ou cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0 bg-secondary/35 p-1 rounded-xl border border-border text-xs font-semibold">
              <button
                onClick={() => setActiveTab('todos')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'todos' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setActiveTab('orcamento')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'orcamento' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Orçamentos
              </button>
              <button
                onClick={() => setActiveTab('producao')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'producao' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Em Produção
              </button>
              <button
                onClick={() => setActiveTab('finalizado')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'finalizado' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Pronto / Entregue
              </button>
              <button
                onClick={() => setActiveTab('cancelado')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'cancelado' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Cancelados
              </button>
            </div>
          </div>

          {/* 3. Orders Card Grid */}
          {displayOrders.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 no-print sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {displayOrders.map((order) => {
                const overdue = isOverdue(order.deadline, order.status);
                const itemsSummary = order.items.length > 0
                  ? order.items.slice(0, 2).map((item) => `${item.quantity}x ${item.product_name}`).join(', ')
                  : 'Sem itens informados';
                const hiddenItemsCount = Math.max(0, order.items.length - 2);
                const deliveryLabel =
                  order.delivery_type === 'motoboy' ? 'Motoboy' :
                  order.delivery_type === 'carro' ? 'Carro' :
                  order.delivery_type === 'correios' ? 'Correios' :
                  'Retirada';

                return (
                  <article
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handlePrintOrderPdf(order)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') handlePrintOrderPdf(order);
                    }}
                    className={`group flex min-h-[255px] cursor-pointer flex-col rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${
                      order.status === 'cancelado' ? 'border-rose-500/20 bg-rose-500/5 opacity-85' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="line-clamp-1 text-sm font-black text-foreground">{formatOrderDisplayNumber(order.number)}</h3>
                        <p className="mt-1 line-clamp-2 text-xs font-semibold text-muted-foreground">{order.customer_name}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {getOrderStatusBadge(order.status)}
                        {getPaymentStatusBadge(order.payment_status)}
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-border bg-secondary/20 p-2">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Itens</span>
                      <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-foreground">
                        {itemsSummary}{hiddenItemsCount > 0 ? ` +${hiddenItemsCount}` : ''}
                      </p>
                    </div>

                    <div className="mt-3 space-y-1.5 text-[11px] font-semibold text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span className="uppercase tracking-wide">Entrega</span>
                        <strong className={`flex items-center gap-1 ${overdue ? 'text-rose-500' : 'text-foreground'}`}>
                          {overdue && <AlertCircle className="h-3 w-3 shrink-0" />}
                          {new Date(order.deadline).toLocaleDateString('pt-BR')}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="uppercase tracking-wide">Forma</span>
                        <strong className="text-foreground">{deliveryLabel}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="uppercase tracking-wide">Total</span>
                        <strong className="text-primary">{formatCurrency(order.total_amount)}</strong>
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedOrder(order);
                          setIsAddingPayment(false);
                          setShowPixCode(false);
                        }}
                        className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                        title="Detalhes / recebimento"
                        aria-label="Abrir detalhes e recebimento do pedido"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePrintOrderPdf(order);
                        }}
                        className="rounded-lg border border-primary/20 bg-primary/10 p-1.5 text-primary hover:bg-primary/15"
                        title="Visualizar pedido"
                        aria-label="Visualizar pedido"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDownloadOrderPdf(order);
                        }}
                        className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                        title="Baixar PDF"
                        aria-label="Baixar PDF do pedido"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenEditOrder(order);
                        }}
                        className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                        title="Editar pedido"
                        aria-label="Editar pedido"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      {order.payment_status !== 'pago' && order.status !== 'cancelado' && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            sendPixWhatsApp(order);
                          }}
                          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5 text-emerald-500 hover:bg-emerald-500/25"
                          title="Enviar pelo WhatsApp"
                          aria-label="Enviar pedido pelo WhatsApp"
                        >
                          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z" />
                          </svg>
                        </button>
                      )}
                      {order.status !== 'cancelado' && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenCancelOrder(order);
                          }}
                          className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-500 hover:bg-rose-500/20"
                          title="Cancelar pedido"
                          aria-label="Cancelar pedido"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm font-semibold text-muted-foreground no-print">
              Nenhum pedido encontrado.
            </div>
          )}

          <div className="hidden">
            <div className="overflow-x-auto xl:overflow-x-visible">
              <table className="w-full text-left border-collapse text-xs table-auto">
                <thead>
                  <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border whitespace-nowrap">
                    <th className="px-3 py-3 text-left">Número</th>
                    <th className="px-3 py-3 text-left">Cliente</th>
                    <th className="px-3 py-3 text-left">Itens do Pedido</th>
                    <th className="px-3 py-3 text-left">Entrega</th>
                    <th className="px-3 py-3 text-right">Valor Total</th>
                    <th className="px-3 py-3 text-left">Status Op.</th>
                    <th className="px-3 py-3 text-left">Status Fin.</th>
                    <th className="px-3 py-3 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayOrders.length > 0 ? (
                    displayOrders.map((order) => {
                      const overdue = isOverdue(order.deadline, order.status);

                      return (
                        <tr key={order.id} className="hover:bg-secondary/15 transition-colors">
                          <td className="px-3 py-2.5 font-bold text-foreground text-left whitespace-nowrap">{formatOrderDisplayNumber(order.number)}</td>
                          <td className="px-3 py-2.5 font-semibold text-foreground text-left">{order.customer_name}</td>
                          <td className="px-3 py-2.5 text-muted-foreground text-left">
                            {order.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ')}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-left whitespace-nowrap">
                            <div className={`flex items-center gap-1 ${overdue ? 'text-rose-500 font-bold' : 'text-muted-foreground'}`}>
                              {overdue && <AlertCircle className="h-3 w-3 text-rose-500 shrink-0" />}
                              <span>{new Date(order.deadline).toLocaleDateString('pt-BR')}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 font-semibold">
                              {order.delivery_type === 'retirada' && 'Retirada'}
                              {order.delivery_type === 'motoboy' && '🏍️ Motoboy'}
                              {order.delivery_type === 'carro' && '🚗 Carro'}
                              {order.delivery_type === 'correios' && '📦 Correios'}
                              {!order.delivery_type && 'Retirada'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-foreground whitespace-nowrap">{formatCurrency(order.total_amount)}</td>
                          <td className="px-3 py-2.5 text-left whitespace-nowrap">{getOrderStatusBadge(order.status)}</td>
                          <td className="px-3 py-2.5 text-left whitespace-nowrap">{getPaymentStatusBadge(order.payment_status)}</td>
                          <td className="px-3 py-2.5 text-left whitespace-nowrap">
                            <div className="flex items-center justify-start gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setIsAddingPayment(false);
                                  setShowPixCode(false);
                                }}
                                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                title="Detalhes / Recebimento"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditOrder(order)}
                                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                title="Editar Pedido"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintOrderPdf(order)}
                                className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary border border-primary/20"
                                title="Visualizar PDF"
                                aria-label={`Visualizar PDF do pedido ${formatOrderDisplayNumber(order.number)}`}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadOrderPdf(order)}
                                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                title="Baixar PDF"
                                aria-label={`Baixar PDF do pedido ${formatOrderDisplayNumber(order.number)}`}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              {order.payment_status !== 'pago' && (
                                <button
                                  type="button"
                                  onClick={() => sendPixWhatsApp(order)}
                                  className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/25 border border-emerald-500/20"
                                  title="Enviar Cobrança Pix via WhatsApp Web"
                                >
                                  <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground italic">
                        Nenhum pedido encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* 4. Visual Details and Payment in the Central Area */
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5 no-print animate-in fade-in duration-200 text-foreground">
          {/* Header */}
          <div className="rounded-2xl border border-border bg-secondary/15 p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/15"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" /> Voltar para Lista
                </button>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary">Pedido comercial</span>
                  <h3 className="mt-1 text-xl font-black text-foreground">{formatOrderDisplayNumber(selectedOrder.number)}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cliente: <strong className="text-foreground">{selectedOrder.customer_name}</strong> • Data: {new Date(selectedOrder.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-xl xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-3">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Status</span>
                  <span className="mt-1 block text-xs font-black text-foreground">
                    {getOrderStatusBadge(selectedOrder.status)}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Financeiro</span>
                  <div className="mt-1">{getPaymentStatusBadge(selectedOrder.payment_status)}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Total</span>
                  <span className="mt-1 block text-sm font-black text-foreground">{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <span className="block text-[10px] font-bold uppercase text-amber-600">Saldo</span>
                  <span className="mt-1 block text-sm font-black text-amber-600">{formatCurrency(Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount))}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {selectedOrder.payment_status !== 'pago' && (
                <button
                  onClick={() => sendPixWhatsApp(selectedOrder)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow shadow-emerald-600/25"
                  title="Enviar Cobrança Pix via WhatsApp Web"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z" />
                  </svg>
                  <span>Enviar PIX</span>
                </button>
              )}
              <button
                onClick={() => handlePrintOrderPdf(selectedOrder)}
                className="px-3.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold flex items-center gap-1.5 border border-primary/20"
                title="Visualizar PDF"
                aria-label={`Visualizar PDF do pedido ${formatOrderDisplayNumber(selectedOrder.number)}`}
              >
                <Printer className="h-4 w-4" /> Visualizar PDF
              </button>
              <button
                onClick={() => handleDownloadOrderPdf(selectedOrder)}
                className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center gap-1.5 border border-border"
                title="Baixar PDF"
                aria-label={`Baixar PDF do pedido ${formatOrderDisplayNumber(selectedOrder.number)}`}
              >
                <Download className="h-4 w-4" /> Baixar PDF
              </button>
              <button
                onClick={() => handlePreviewReceipt(selectedOrder)}
                className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold flex items-center gap-1.5 shadow shadow-primary/25"
                title="Visualizar recibo de pagamento"
              >
                <Eye className="h-4 w-4" /> Recibo de Pagamento
              </button>
              <button
                onClick={() => handleOpenEditOrder(selectedOrder)}
                className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center gap-1 border border-border"
                title="Editar Pedido"
              >
                <Edit3 className="h-4 w-4" /> Editar Pedido
              </button>
            </div>
          </div>

          {/* Informações de Entrega */}
          <div className="p-4 bg-secondary/20 border border-border rounded-xl space-y-2.5 text-xs">
            <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider">Informações de Entrega e Frete</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground block text-[10px] font-semibold">MEIO DE ENTREGA</span>
                <span className="font-bold text-foreground capitalize">
                  {selectedOrder.delivery_type === 'retirada' && 'Retirada na Gráfica'}
                  {selectedOrder.delivery_type === 'motoboy' && '🏍️ Motoboy'}
                  {selectedOrder.delivery_type === 'carro' && '🚗 Carro'}
                  {selectedOrder.delivery_type === 'correios' && '📦 Correios / Transportadora'}
                  {!selectedOrder.delivery_type && 'Retirada na Gráfica (Padrão)'}
                </span>
              </div>
              {selectedOrder.delivery_type && selectedOrder.delivery_type !== 'retirada' && (
                <div>
                  <span className="text-muted-foreground block text-[10px] font-semibold">TAXA DE FRETE</span>
                  <span className="font-bold text-primary">{formatCurrency(selectedOrder.shipping_cost || 0)}</span>
                </div>
              )}
            </div>
            {selectedOrder.delivery_type && selectedOrder.delivery_type !== 'retirada' && selectedOrder.delivery_address && (
              <div className="pt-2 border-t border-border/40">
                <span className="text-muted-foreground block text-[10px] font-semibold">ENDEREÇO DE ENTREGA</span>
                <span className="font-medium text-foreground">{selectedOrder.delivery_address}</span>
                {['motoboy', 'carro'].includes(selectedOrder.delivery_type) && selectedOrder.delivery_distance_km !== undefined && (
                  <span className="text-muted-foreground text-[10px] block mt-0.5">
                    Distância calculada: <strong>{selectedOrder.delivery_distance_km.toFixed(2)} km</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Items List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider block">Itens Relacionados</h4>
            <div className="divide-y divide-border border border-border rounded-xl bg-secondary/10">
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="p-3.5 text-xs flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-foreground">{item.product_name}</div>
                    {(() => {
                      const configLines = getOrderItemConfigurationLines(item);
                      if (!configLines) return null;
                      return (
                        <div className="mt-1 rounded-lg border border-primary/10 bg-primary/5 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
                          <span className="block font-bold text-foreground">Configuração: {configLines.options}</span>
                          <span className="block">
                            Tiragem: {configLines.quantity} • Unitário: {configLines.unit} • Total: {configLines.total}
                          </span>
                        </div>
                      );
                    })()}
                    {item.details && (item.details.width || item.details.height) && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Medidas: {item.details.width}m {item.details.height ? `x ${item.details.height}m` : 'linear'}
                      </div>
                    )}
                    {item.outsourced && (
                      <span className="mt-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] font-semibold border border-amber-500/10 block w-max">
                        Terceirizado: {item.supplier_name}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-foreground">{item.quantity}x</span>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{formatUnitCurrency(item.unit_price)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(selectedOrder.additional_services || []).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider block">Serviços Adicionais</h4>
              <div className="divide-y divide-border border border-border rounded-xl bg-secondary/10">
                {(selectedOrder.additional_services || []).map((service) => (
                  <div key={service.id} className="p-3.5 text-xs flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-foreground">{service.name}</div>
                      {service.notes && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{service.notes}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-foreground">{service.quantity}x</span>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(service.unit_price)}</div>
                      <div className="text-[10px] font-bold text-primary mt-0.5">{formatCurrency(service.total_price)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Section Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-border pt-4">
            <div className="md:col-span-2 space-y-4">
              <div className="flex justify-between items-center text-xs">
                <h4 className="font-bold text-foreground uppercase tracking-wider">Histórico de Quitação</h4>
                <span className="text-muted-foreground font-semibold">Saldo Devedor: <span className="font-bold text-foreground">{formatCurrency(selectedOrderPendingAmount)}</span></span>
              </div>
              
              <div className="p-4 rounded-xl bg-secondary/20 border border-border text-xs space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card p-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Total do pedido</span>
                    <p className="mt-1 font-black text-foreground">{formatCurrency(selectedOrder.total_amount)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2">
                    <span className="text-[10px] font-bold uppercase text-emerald-600">Total pago</span>
                    <p className="mt-1 font-black text-emerald-500">{formatCurrency(selectedOrderPaidAmount)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2">
                    <span className="text-[10px] font-bold uppercase text-amber-600">Saldo pendente</span>
                    <p className="mt-1 font-black text-amber-500">{formatCurrency(selectedOrderPendingAmount)}</p>
                  </div>
                </div>

                {selectedOrder.payment_status !== 'pago' && !isAddingPayment && (
                  <button
                    onClick={() => {
                      const balance = selectedOrderPendingAmount;
                      setPaymentAmount(balance);
                      setPaymentKind(selectedOrderPaidAmount > 0 ? 'saldo' : 'adiantamento');
                      setPaymentDateInput(new Date().toISOString().split('T')[0]);
                      setPaymentNotesInput('');
                      setIsAddingPayment(true);
                    }}
                    className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow shadow-primary/10 transition-all mt-2"
                  >
                    <DollarSign className="h-4 w-4" /> Registrar Pagamento
                  </button>
                )}

                {isAddingPayment && (
                  <form onSubmit={handleRegisterPayment} className="border-t border-border/60 pt-3 mt-2 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">Valor Recebido (R$)</label>
                        <input
                          type="text"
                          value={formatCurrencyInput(paymentAmount)}
                          onChange={(e) => {
                            const val = parseCurrencyInputToNumber(e.target.value);
                            setPaymentAmount(Math.min(selectedOrderPendingAmount, val));
                          }}
                          placeholder="R$ 0,00"
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-bold text-foreground"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">Tipo</label>
                        <select
                          value={paymentKind}
                          onChange={(e) => setPaymentKind(e.target.value as typeof paymentKind)}
                          className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-semibold"
                        >
                          <option value="adiantamento">Adiantamento</option>
                          <option value="parcial">Parcial</option>
                          <option value="saldo">Saldo</option>
                          <option value="total">Total</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">Meio de Pagamento</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                          className="w-full px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-semibold"
                        >
                          <option value="pix">Pix (QRCode)</option>
                          <option value="cartao_credito">Cartão de Crédito</option>
                          <option value="cartao_debito">Cartão de Débito</option>
                          <option value="boleto">Boleto Bancário</option>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="faturado">Faturado Corporativo (B2B)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">Data do pagamento</label>
                        <input
                          type="date"
                          value={paymentDateInput}
                          onChange={(e) => setPaymentDateInput(e.target.value)}
                          placeholder="dd/mm/aaaa"
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold text-foreground"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground block">Observacao</label>
                      <input
                        type="text"
                        value={paymentNotesInput}
                        onChange={(e) => setPaymentNotesInput(e.target.value)}
                        placeholder="Ex: Pagamento parcial do pedido"
                        className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingPayment(false);
                          setShowPixCode(false);
                          setIsSavingPayment(false);
                          paymentSubmissionRef.current = false;
                        }}
                        disabled={isSavingPayment}
                        className="flex-1 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingPayment}
                        className="flex-1 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 text-xs font-semibold"
                      >
                        {paymentMethod === 'pix' && !showPixCode ? 'Gerar Código Pix' : 'Confirmar Recebimento'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="border-t border-border/60 pt-3">
                  <h5 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Pagamentos registrados</h5>
                  <div className="mt-2 space-y-2">
                    {selectedOrderTransactions.length > 0 ? (
                      selectedOrderTransactions.map((transaction, index) => (
                        <div
                          key={transaction.id || `${transaction.order_id || transaction.order_number || 'payment'}-${transaction.created_at || index}`}
                          className="rounded-lg border border-border bg-card px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-foreground">{transaction.description}</p>
                              <p className="mt-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                {transaction.payment_method.replace('_', ' ')} - {transaction.status === 'pago' ? 'Confirmado' : 'Pendente'}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs font-black text-emerald-500">{formatCurrency(transaction.amount)}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(transaction.paid_at || transaction.due_date || transaction.created_at).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-center text-[11px] font-semibold text-muted-foreground">
                        Nenhum pagamento registrado para este pedido.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {/* B2B Invoiced Credit limit indicators */}
              {paymentMethod === 'faturado' && (() => {
                const clientOfOrder = customers.find(c => c.name === selectedOrder?.customer_name);
                return (
                  <div className="p-4 bg-secondary/30 border border-border rounded-xl space-y-2.5 text-xs w-full">
                    {clientOfOrder ? (
                      <>
                        <div className="flex justify-between items-center font-bold pb-1.5 border-b border-border/40">
                          <span className="text-muted-foreground">Faturamento B2B:</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            clientOfOrder.billing_type === 'faturado' ? 'bg-primary/10 text-primary' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {clientOfOrder.billing_type === 'faturado' ? 'HABILITADO' : 'NÃO HABILITADO'}
                          </span>
                        </div>
                        {clientOfOrder.billing_type === 'faturado' ? (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between">
                              <span>Limite Disponível:</span>
                              <span className="font-extrabold text-emerald-500">
                                {formatCurrency(Math.max(0, (clientOfOrder.credit_limit || 0) - (clientOfOrder.credit_used || 0)))}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Prazo acordado:</span>
                              <span className="font-bold">{clientOfOrder.payment_terms_days || 30} dias</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Situação do Crédito:</span>
                              <span className={`font-black uppercase ${
                                clientOfOrder.credit_status === 'aprovado' ? 'text-emerald-500' : 'text-rose-500'
                              }`}>
                                {clientOfOrder.credit_status || 'APROVADO'}
                              </span>
                            </div>
                            {clientOfOrder.credit_status !== 'aprovado' && (
                              <div className="text-rose-500 font-bold bg-rose-500/10 p-2 rounded text-[10px] flex items-center gap-1 mt-1">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Crédito do cliente bloqueado/sob análise!
                              </div>
                            )}
                            {(clientOfOrder.credit_limit || 0) - (clientOfOrder.credit_used || 0) < paymentAmount && (
                              <div className="text-rose-500 font-bold bg-rose-500/10 p-2 rounded text-[10px] flex items-center gap-1 mt-1">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> O valor excede o limite disponível!
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-rose-500 font-bold bg-rose-500/10 p-2 rounded text-[10px] flex items-center gap-1 mt-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Habilite o faturamento corporativo no cadastro de clientes.
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-rose-500">Cliente não localizado no cadastro de clientes.</span>
                    )}
                  </div>
                );
              })()}

              {/* Pix Dynamic QR Code */}
              {paymentMethod === 'pix' && showPixCode && (() => {
                const pixPayload = generatePixPayload(settings.pix_key, paymentAmount);
                return (
                  <div className="p-3 bg-card border border-primary/20 rounded-xl flex flex-col items-center justify-center text-center space-y-2 border-dashed">
                    <div className="h-32 w-32 bg-white p-2 rounded-lg flex items-center justify-center shadow-sm border border-border">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(pixPayload)}`}
                        alt="PIX QR Code"
                        className="h-28 w-28"
                      />
                    </div>
                    
                    <div className="text-[10px] text-muted-foreground w-full">
                      <span className="font-bold text-foreground">Copia e Cola:</span>
                      <textarea
                        readOnly
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                        value={pixPayload}
                        className="w-full text-[8px] font-mono bg-secondary/50 p-1 rounded border border-border resize-none text-foreground text-center focus:outline-none mt-1"
                        rows={3}
                      />
                      <p className="text-[7px] text-emerald-400 mt-1">Clique para selecionar e copiar o código Pix.</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
