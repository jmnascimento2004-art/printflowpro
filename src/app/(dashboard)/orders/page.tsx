'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  DollarSign, 
  ChevronRight, 
  X, 
  Check, 
  AlertCircle,
  Printer,
  Eye,
  Edit3,
  RefreshCw
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
  getPublicImageUrl,
  getWhatsAppTimeGreeting
} from '@/lib/utils';
import { calculateRouteDistance } from '@/lib/delivery';
import { warnCaught } from '@/lib/safe-log';

export default function OrdersPage() {
  const { 
    orders, 
    updateOrderStatus, 
    payOrder, 
    customers, 
    products, 
    settings,
    company,
    financial,
    updateOrder
  } = useDatabase();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activePrintOrder, setActivePrintOrder] = useState<Order | null>(null);
  const [activePrintMode, setActivePrintMode] = useState<'order' | 'receipt'>('receipt');
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentKind, setPaymentKind] = useState<'adiantamento' | 'parcial' | 'saldo' | 'total'>('saldo');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado'>('pix');
  const [paymentDateInput, setPaymentDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [paymentNotesInput, setPaymentNotesInput] = useState('');
  const [showPixCode, setShowPixCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'todos' | 'orcamento' | 'producao' | 'finalizado' | 'cancelado'>('todos');

  // Edit Order state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editStatus, setEditStatus] = useState<Order['status']>('producao');
  const [editDeadline, setEditDeadline] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTotal, setEditTotal] = useState(0);
  const [editShipping, setEditShipping] = useState(0);
  const [editPaid, setEditPaid] = useState(0);
  const [editAdditionalServices, setEditAdditionalServices] = useState<AdditionalService[]>([]);

  // Delivery states for edit modal
  const [editDeliveryType, setEditDeliveryType] = useState<'retirada' | 'motoboy' | 'carro' | 'correios'>('retirada');
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('');
  const [editDeliveryDistanceKm, setEditDeliveryDistanceKm] = useState(0);
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
      setEditDeliveryDistanceKm(dist);
      
      const pricePerKm = editDeliveryType === 'motoboy' 
        ? (settings.delivery_motoboy_price_km || 2.50)
        : (settings.delivery_car_price_km || 4.50);
      
      const rawFee = dist * pricePerKm;
      const minFee = settings.delivery_min_fee || 10.00;
      const newShipping = Math.round(Math.max(rawFee, minFee) * 100) / 100;
      
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
        setEditDeliveryDistanceKm(dist);
        
        const pricePerKm = editDeliveryType === 'motoboy' 
          ? (settings.delivery_motoboy_price_km || 2.50)
          : (settings.delivery_car_price_km || 4.50);
        
        const rawFee = dist * pricePerKm;
        const minFee = settings.delivery_min_fee || 10.00;
        const newShipping = Math.round(Math.max(rawFee, minFee) * 100) / 100;
        
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
  }, [editDeliveryAddress, editDeliveryType, lastCalculatedAddress, settings, buildOrderOriginAddress, editShipping]);

  const handleEditDistanceChange = (km: number) => {
    setEditDeliveryDistanceKm(km);
    const pricePerKm = editDeliveryType === 'motoboy' 
      ? (settings.delivery_motoboy_price_km || 2.50)
      : (settings.delivery_car_price_km || 4.50);
    const rawFee = km * pricePerKm;
    const minFee = settings.delivery_min_fee || 10.00;
    const newShipping = Math.round(Math.max(rawFee, minFee) * 100) / 100;
    
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
      setEditDeliveryDistanceKm(0);
      setEditDeliveryAddress('');
      setEditDeliveryStreet('');
      setEditDeliveryNumber('');
      setEditDeliveryNeighborhood('');
      setEditDeliveryCity('');
      setEditDeliveryState('');
      setEditDeliveryZipCode('');
    } else if (type === 'correios') {
      setEditDeliveryDistanceKm(0);
    } else if (['motoboy', 'carro'].includes(type)) {
      const pricePerKm = type === 'motoboy' 
        ? (settings.delivery_motoboy_price_km || 2.50)
        : (settings.delivery_car_price_km || 4.50);
      const rawFee = editDeliveryDistanceKm * pricePerKm;
      const minFee = settings.delivery_min_fee || 10.00;
      const newShipping = Math.round(Math.max(rawFee, minFee) * 100) / 100;
      
      const diff = newShipping - editShipping;
      setEditShipping(newShipping);
      setEditTotal(prev => Math.max(0, prev + diff));
    }
  };

  const handleOpenEditOrder = (order: Order) => {
    setSelectedOrder(null); // Close details panel if open
    setEditingOrder(order);
    setEditStatus(order.status);
    setEditDeadline(order.deadline.split('T')[0]);
    setEditNotes(order.notes || '');
    setEditTotal(order.total_amount);
    setEditShipping(order.shipping_cost || 0);
    setEditPaid(order.paid_amount || 0);
    setEditAdditionalServices(order.additional_services || []);
    setEditDeliveryType(order.delivery_type || 'retirada');
    setEditDeliveryAddress(order.delivery_address || '');
    setEditDeliveryDistanceKm(order.delivery_distance_km || 0);
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
          const pricePerKm = order.delivery_type === 'motoboy'
            ? (settings.delivery_motoboy_price_km || 2.50)
            : (settings.delivery_car_price_km || 4.50);
          const rawFee = dist * pricePerKm;
          const minFee = settings.delivery_min_fee || 10.00;
          const newShipping = Math.round(Math.max(rawFee, minFee) * 100) / 100;
          const baseTotal = order.total_amount - (order.shipping_cost || 0);

          setEditDeliveryDistanceKm(dist);
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

  const handleSaveEditOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    const productsTotal = editingOrder.items.reduce((sum, item) => sum + item.total_price, 0);
    const servicesTotal = getAdditionalServicesTotal(editAdditionalServices);
    const nextTotal = Math.max(0, productsTotal + servicesTotal + editShipping);

    if (editStatus !== editingOrder.status) {
      updateOrderStatus(editingOrder.id, editStatus);
    }

    updateOrder({
      ...editingOrder,
      status: editStatus,
      deadline: new Date(editDeadline).toISOString(),
      notes: editNotes,
      total_amount: nextTotal,
      shipping_cost: editShipping,
      paid_amount: Math.min(editingOrder.paid_amount || 0, nextTotal),
      payment_status: (editingOrder.paid_amount || 0) >= nextTotal ? 'pago' : (editingOrder.paid_amount || 0) > 0 ? 'parcial' : 'pendente',
      additional_services: editAdditionalServices,
      delivery_type: editDeliveryType,
      delivery_address: editDeliveryType !== 'retirada' ? editDeliveryAddress : undefined,
      delivery_distance_km: ['motoboy', 'carro'].includes(editDeliveryType) ? editDeliveryDistanceKm : undefined
    });

    setEditingOrder(null);
  };

  const handlePrintOrderPdf = (order: Order) => {
    setActivePrintMode('order');
    setActivePrintOrder(order);
  };

  const handlePrintReceipt = (order: Order) => {
    setActivePrintMode('receipt');
    setActivePrintOrder(order);
  };

  // React Effect to handle direct A4 printing
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (activePrintOrder) {
      window.print();
      setActivePrintOrder(null);
    }
  }, [activePrintOrder]);

  // 1. Filter and tab orders list
  const filteredOrders = orders.filter(o => 
    o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFilteredOrdersByTab = (tab: typeof activeTab) => {
    switch (tab) {
      case 'orcamento':
        return filteredOrders.filter(o => ['orcamento', 'aguardando_aprovacao', 'aguardando_pagamento'].includes(o.status));
      case 'producao':
        return filteredOrders.filter(o => ['producao', 'impressao', 'acabamento'].includes(o.status));
      case 'finalizado':
        return filteredOrders.filter(o => ['expedicao', 'entregue', 'finalizado'].includes(o.status));
      case 'cancelado':
        return filteredOrders.filter(o => o.status === 'cancelado');
      default:
        return filteredOrders;
    }
  };

  const displayOrders = getFilteredOrdersByTab(activeTab);

  // 2. Register payment handler
  const handleRegisterPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || paymentAmount <= 0) return;
    const currentBalance = Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount);
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

    const newPaid = paymentMethod === 'faturado'
      ? selectedOrder.paid_amount
      : Math.min(selectedOrder.total_amount, selectedOrder.paid_amount + paymentAmount);
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
      aguardando_aprovacao: 'Aguardando Aprov.',
      aguardando_pagamento: 'Aguardando Pag.',
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
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${colors[status]}`}>
        {labels[status].toUpperCase()}
      </span>
    );
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
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

    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 11 || cleanPhone.length === 10
      ? `55${cleanPhone}`
      : cleanPhone;

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
    const logoUrl = getPublicImageUrl(company?.logo_light || company?.logo_url || company?.logo_dark);
    const logoLine = logoUrl ? `\n\n🏢 Logo da empresa: ${logoUrl}` : '';
    const greeting = getWhatsAppTimeGreeting();

    const message = `${greeting}, *${order.customer_name}*! 👋\nOlá, tudo bem?\n\nSegue a cobrança do seu pedido *${order.number}*:\n\n💰 *Valor a pagar:* *${formatCurrency(balance)}*\n\n🔑 *${pixInfo.label}:*\n${pixInfo.value}${pixInfo.securityText}\n\n✅ Após realizar o pagamento, por favor nos envie o comprovante por aqui.${logoLine}\n\nQualquer dúvida, estamos à disposição! 😊\n\nAtenciosamente,\n*${company?.name || "PrintFlowPRO"}*`;

    const encodedText = encodeURIComponent(message);
    const url = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
    if (typeof window === 'undefined') return;
    window.open(url, '_blank');
  };

  // Stats Calculations
  const totalOrdersCount = orders.length;
  const pendingPaymentOrdersCount = orders.filter(o => o.payment_status === 'pendente').length;
  const pendingAmount = orders.reduce((sum, o) => sum + (o.total_amount - o.paid_amount), 0);
  const activeProductionCount = orders.filter(o => ['producao', 'impressao', 'acabamento'].includes(o.status)).length;
  const corporateB2BFaturado = customers.reduce((sum, c) => sum + (c.credit_used || 0), 0);

  // Compute variables for the printed receipt template
  const receiptNumber = activePrintOrder ? `REC-${activePrintOrder.number.replace('ORD-', '')}-${Date.now().toString().slice(-4)}` : '';
  const activePrintCustomer = activePrintOrder
    ? customers.find(c => c.id === activePrintOrder.customer_id || c.name === activePrintOrder.customer_name)
    : null;
  const customerDoc = activePrintCustomer?.document || '000.000.000-00';
  const customerContactLine = [
    activePrintCustomer?.phone ? `Telefone: ${activePrintCustomer.phone}` : '',
    activePrintCustomer?.email ? `E-mail: ${activePrintCustomer.email}` : ''
  ].filter(Boolean).join(' | ');
  const customerAddressLine = activePrintCustomer?.address
    ? [
        activePrintCustomer.address.street && activePrintCustomer.address.number ? `${activePrintCustomer.address.street}, ${activePrintCustomer.address.number}` : activePrintCustomer.address.street,
        activePrintCustomer.address.neighborhood,
        activePrintCustomer.address.city && activePrintCustomer.address.state ? `${activePrintCustomer.address.city} - ${activePrintCustomer.address.state}` : activePrintCustomer.address.city,
        activePrintCustomer.address.zip_code ? `CEP ${activePrintCustomer.address.zip_code}` : ''
      ].filter(Boolean).join(' - ')
    : '';
  const paymentType = activePrintOrder ? (activePrintOrder.paid_amount >= activePrintOrder.total_amount ? 'Total' : activePrintOrder.paid_amount > 0 ? 'Parcial / Entrada' : 'Pendente') : '';
  // Find payment info from latest transaction
  const orderTx = activePrintOrder ? financial.find(f => f.order_id === activePrintOrder.id || f.order_number === activePrintOrder.number) : null;
  const paymentMethodName = orderTx ? orderTx.payment_method.replace('_', ' ').toUpperCase() : 'PIX';
  const paymentDate = orderTx ? new Date(orderTx.created_at).toLocaleDateString('pt-BR') : (activePrintOrder ? new Date(activePrintOrder.created_at).toLocaleDateString('pt-BR') : '');
  const paymentNotes = orderTx?.description || (activePrintOrder ? activePrintOrder.notes : '') || 'Nenhuma observação registrada.';
  const printGrossProductsTotal = activePrintOrder
    ? activePrintOrder.items.reduce((sum, item) => sum + item.total_price, 0)
    : 0;
  const printServicesTotal = activePrintOrder
    ? getAdditionalServicesTotal(activePrintOrder.additional_services)
    : 0;
  const printDiscountAmount = activePrintOrder
    ? Math.max(0, printGrossProductsTotal + printServicesTotal + (activePrintOrder.shipping_cost || 0) - activePrintOrder.total_amount)
    : 0;
  const selectedOrderTransactions = selectedOrder
    ? financial.filter((transaction) => transaction.order_id === selectedOrder.id || transaction.order_number === selectedOrder.number)
    : [];
  
  const companyName = company?.name || 'PrintFlowPRO - ERP SAAS';
  const companyDocument = company?.document || '12.345.678/0001-90';
  const companyLogo = company?.logo_light || company?.logo_url || company?.logo_dark || '';
  const companyAddressLine = [
    company?.street && company?.number ? `${company.street}, ${company.number}` : '',
    company?.neighborhood,
    company?.city && company?.state ? `${company.city} - ${company.state}` : '',
    company?.cep ? `CEP ${company.cep}` : ''
  ].filter(Boolean).join(' - ');
  const showCompanyAddressOnPrint = settings.footer_show_address !== false;
  const companyContactLine = [
    company?.phone ? `Contato: ${company.phone}` : '',
    company?.email ? `E-mail: ${company.email}` : ''
  ].filter(Boolean).join(' | ');
  const printDocumentTitle = activePrintMode === 'receipt' ? 'RECIBO DE PAGAMENTO' : 'PEDIDO COMERCIAL';
  const printDocumentNumber = activePrintMode === 'receipt' ? receiptNumber : activePrintOrder?.number;
  const issueDate = new Date().toLocaleString('pt-BR');
  const getPrintItemDescription = (item: Order['items'][number]) => {
    const registeredProduct = products.find((product) => product.id === item.product_id);
    return item.product_name?.trim() || registeredProduct?.name || item.details?.notes || 'Produto / servico';
  };
  return (
    <div className="space-y-6">
      {editingOrder ? (
        /* Edit Order Form */
        <div className="max-w-2xl mx-auto bg-card border border-border shadow-md rounded-2xl overflow-hidden p-6 no-print w-full animate-in slide-in-from-bottom duration-300">
          <form onSubmit={handleSaveEditOrder} className="flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3 shrink-0">
              <h3 className="font-bold text-foreground text-sm uppercase flex items-center gap-1.5">
                <Edit3 className="h-4.5 w-4.5 text-primary" /> 
                Editar Pedido: {editingOrder.number}
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
                  <option value="aguardando_aprovacao">Aguardando Aprovação</option>
                  <option value="aguardando_pagamento">Aguardando Pagamento</option>
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

              {/* Total Amount */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Valor Total do Pedido (R$) *</label>
                <input
                  type="text"
                  required
                  value={formatCurrencyInput(editTotal)}
                  onChange={(e) => setEditTotal(parseCurrencyInputToNumber(e.target.value))}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none font-bold"
                />
              </div>

              {/* Paid Amount */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Total pago registrado</label>
                <div className="w-full rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-500">
                  {formatCurrency(editPaid)}
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground">
                  Use Registrar Pagamento para adicionar baixa sem sobrescrever historico.
                </p>
              </div>

              {/* Opções de Entrega e Frete */}
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
                              type="number"
                              step="0.01;any"
                              min="0"
                              value={editDeliveryDistanceKm}
                              onChange={(e) => handleEditDistanceChange(Number(e.target.value) || 0)}
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
                  onChange={(services) => {
                    setEditAdditionalServices(services);
                    if (editingOrder) {
                      const productsTotal = editingOrder.items.reduce((sum, item) => sum + item.total_price, 0);
                      setEditTotal(Math.max(0, productsTotal + getAdditionalServicesTotal(services) + editShipping));
                    }
                  }}
                />
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-secondary/20 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total de produtos</span>
                  <span className="font-bold text-foreground">{formatCurrency(editingOrder.items.reduce((sum, item) => sum + item.total_price, 0))}</span>
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

          {/* 3. Orders List Table */}
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden no-print">
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
                          <td className="px-3 py-2.5 font-bold text-foreground text-left whitespace-nowrap">{order.number}</td>
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
                                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                title="Gerar PDF do Pedido"
                              >
                                <Printer className="h-3.5 w-3.5" />
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-4 gap-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Ficha de Faturamento & Detalhes: {selectedOrder.number}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cliente: {selectedOrder.customer_name} • Data: {new Date(selectedOrder.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
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
                className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center gap-1.5 border border-border"
                title="Gerar PDF do Pedido"
              >
                <Printer className="h-4 w-4" /> Gerar PDF do Pedido
              </button>
              <button
                onClick={() => handlePrintReceipt(selectedOrder)}
                className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold flex items-center gap-1.5 shadow shadow-primary/25"
                title="Imprimir Recibo"
              >
                <Printer className="h-4 w-4" /> Imprimir Recibo
              </button>
              <button
                onClick={() => handleOpenEditOrder(selectedOrder)}
                className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center gap-1 border border-border"
                title="Editar Pedido"
              >
                <Edit3 className="h-4 w-4" /> Editar Pedido
              </button>
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center gap-1 border border-border"
              >
                <ChevronRight className="h-4 w-4 rotate-180" /> Voltar para Lista
              </button>
            </div>
          </div>

          {/* Order Status and Payment Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-secondary/35 border border-border rounded-xl">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Status do Pedido</span>
              <div className="font-bold text-xs text-foreground mt-1 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {selectedOrder.status.toUpperCase().replace('_', ' ')}
              </div>
            </div>
            <div className="p-3 bg-secondary/35 border border-border rounded-xl">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Status do Pagamento</span>
              <div className="mt-1">{getPaymentStatusBadge(selectedOrder.payment_status)}</div>
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
                    <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(item.unit_price)}</div>
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
                <span className="text-muted-foreground font-semibold">Saldo Devedor: <span className="font-bold text-foreground">{formatCurrency(selectedOrder.total_amount - selectedOrder.paid_amount)}</span></span>
              </div>
              
              <div className="p-4 rounded-xl bg-secondary/20 border border-border text-xs space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card p-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Total do pedido</span>
                    <p className="mt-1 font-black text-foreground">{formatCurrency(selectedOrder.total_amount)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2">
                    <span className="text-[10px] font-bold uppercase text-emerald-600">Total pago</span>
                    <p className="mt-1 font-black text-emerald-500">{formatCurrency(selectedOrder.paid_amount)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2">
                    <span className="text-[10px] font-bold uppercase text-amber-600">Saldo pendente</span>
                    <p className="mt-1 font-black text-amber-500">{formatCurrency(Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount))}</p>
                  </div>
                </div>

                {selectedOrder.payment_status !== 'pago' && !isAddingPayment && (
                  <button
                    onClick={() => {
                      const balance = Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount);
                      setPaymentAmount(balance);
                      setPaymentKind(selectedOrder.paid_amount > 0 ? 'saldo' : 'adiantamento');
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
                            setPaymentAmount(Math.min(Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount), val));
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
                        }}
                        className="flex-1 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-semibold"
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
                      selectedOrderTransactions.map((transaction) => (
                        <div key={transaction.id} className="rounded-lg border border-border bg-card px-3 py-2">
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

      {/* 5. Hidden printable container for Order print document (A4 Layout) */}
      {activePrintOrder && (
        <div className="hidden print:block p-8 text-black bg-white max-w-xl mx-auto border border-zinc-200 rounded-lg text-xs leading-relaxed" id="printable-order-area">
          {/* Company Header */}
          <div className="border-b border-zinc-300 pb-4 mb-4 flex justify-between items-start gap-6">
            <div className="flex flex-col items-start gap-1.5 max-w-[70%]">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="h-14 w-40 object-contain object-left"
                />
              )}
              {!companyLogo && (
                <h2 className="text-sm font-bold uppercase tracking-wider leading-tight">{companyName}</h2>
              )}
              <div className="space-y-0.5">
                <p className="text-[10px] text-zinc-600">CNPJ: {companyDocument}</p>
                {showCompanyAddressOnPrint && companyAddressLine && <p className="text-[9px] text-zinc-600 max-w-xs">{companyAddressLine}</p>}
                {companyContactLine && <p className="text-[9px] text-zinc-600 max-w-xs">{companyContactLine}</p>}
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-xs font-extrabold uppercase bg-zinc-950 text-white px-2.5 py-1 rounded">
                {printDocumentTitle}
              </h1>
              <p className="text-[10px] text-zinc-500 mt-1 font-mono">N.: {printDocumentNumber}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-[10px] bg-zinc-50 p-2 border border-zinc-200 rounded-md">
              <p><strong>N. do Pedido:</strong> {activePrintOrder.number}</p>
              <p><strong>Data de Emissao:</strong> {new Date(activePrintOrder.created_at).toLocaleDateString('pt-BR')}</p>
            </div>

            <div className="space-y-1 text-[10px] border border-zinc-200 rounded-md p-2">
              <strong>Dados do Cliente Final:</strong>
              <div className="grid grid-cols-2 gap-2 text-zinc-700">
                <p><strong>Cliente:</strong> {activePrintOrder.customer_name}</p>
                <p><strong>CPF/CNPJ:</strong> {customerDoc}</p>
                {customerContactLine && <p className="col-span-2"><strong>Contato:</strong> {customerContactLine}</p>}
                {customerAddressLine && <p className="col-span-2"><strong>Endereco:</strong> {customerAddressLine}</p>}
              </div>
            </div>
            
            {activePrintMode === 'receipt' ? (
              <p>
                Recebemos de <strong>{activePrintOrder.customer_name}</strong>, CPF/CNPJ <strong>{customerDoc}</strong>, o valor de <strong>{formatCurrency(activePrintOrder.paid_amount)}</strong>, referente ao Pedido <strong>{activePrintOrder.number}</strong>.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <p><strong>Status do Pedido:</strong> {activePrintOrder.status.replaceAll('_', ' ').toUpperCase()}</p>
                <p><strong>Status do Pagamento:</strong> {activePrintOrder.payment_status.toUpperCase()}</p>
              </div>
            )}
            
            {activePrintMode === 'receipt' && (
              <div className="space-y-1">
                <strong>Tipo de Pagamento:</strong>
                <p className="pl-4">{paymentType}</p>
                <p className="text-[10px] text-zinc-500 pl-4">(Parcial / Entrada / Total)</p>
              </div>
            )}
            
            <div className="space-y-1">
              <strong>Produtos:</strong>
              <div className="mt-1 overflow-x-auto">
                <table className="print-items-table w-full text-left border-collapse text-[10px] border border-zinc-300">
                  <thead>
                    <tr className="bg-black border-b border-black font-bold text-[9px] uppercase text-white">
                      <th className="px-2 py-1.5 text-center border-r border-white/40 w-10">QTD</th>
                      <th className="px-2 py-1.5 border-r border-white/40">DESCRICAO</th>
                      <th className="px-2 py-1.5 text-right border-r border-white/40 w-24">UNIT</th>
                      <th className="px-2 py-1.5 text-right w-24">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePrintOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-2 py-0.5 text-center border-r border-zinc-200 font-mono leading-tight">{item.quantity}</td>
                        <td className="px-2 py-0.5 border-r border-zinc-200 leading-tight">
                          <span className="font-semibold">{getPrintItemDescription(item)}</span>
                          {item.details?.notes && (
                            <span className="block text-[8px] text-zinc-500 font-normal italic mt-px leading-tight">
                              Obs: {item.details.notes}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-0.5 text-right border-r border-zinc-200 font-mono leading-tight">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="px-2 py-0.5 text-right font-mono font-semibold leading-tight">
                          {formatCurrency(item.total_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {(activePrintOrder.additional_services || []).length > 0 && (
              <div className="space-y-1">
                <strong>Serviços Adicionais:</strong>
                <div className="mt-1 overflow-x-auto">
                  <table className="print-items-table w-full text-left border-collapse text-[10px] border border-zinc-300">
                    <thead>
                      <tr className="bg-black border-b border-black font-bold text-[9px] uppercase text-white">
                        <th className="px-2 py-1.5 text-center border-r border-white/40 w-10">QTD</th>
                        <th className="px-2 py-1.5 border-r border-white/40">DESCRICAO</th>
                        <th className="px-2 py-1.5 text-right border-r border-white/40 w-24">UNIT</th>
                        <th className="px-2 py-1.5 text-right w-24">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activePrintOrder.additional_services || []).map((service) => (
                        <tr key={service.id}>
                          <td className="px-2 py-0.5 text-center border-r border-zinc-200 font-mono leading-tight">{service.quantity}</td>
                          <td className="px-2 py-0.5 border-r border-zinc-200 leading-tight">
                            <span className="font-semibold">{service.name}</span>
                            {service.notes && (
                              <span className="block text-[8px] text-zinc-500 font-normal italic mt-px leading-tight">
                                Obs: {service.notes}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-0.5 text-right border-r border-zinc-200 font-mono leading-tight">{formatCurrency(service.unit_price)}</td>
                          <td className="px-2 py-0.5 text-right font-mono font-semibold leading-tight">{formatCurrency(service.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            <div className="space-y-1 bg-zinc-50 p-3 border border-zinc-200 rounded-md">
              <div className="flex justify-between">
                <span>Valor Bruto dos Produtos:</span>
                <span className="font-bold">{formatCurrency(printGrossProductsTotal)}</span>
              </div>
              {(activePrintOrder.additional_services || []).length > 0 && (
                <div className="flex justify-between">
                  <span>Total Serviços Adicionais:</span>
                  <span className="font-bold">{formatCurrency(printServicesTotal)}</span>
                </div>
              )}
              {printDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Desconto Concedido:</span>
                  <span className="font-bold">{formatCurrency(printDiscountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Valor Total do Pedido:</span>
                <span className="font-bold">{formatCurrency(activePrintOrder.total_amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>{activePrintMode === 'receipt' ? 'Valor Pago nesta Transacao:' : 'Valor Pago:'}</span>
                <span className="font-bold">{formatCurrency(activePrintOrder.paid_amount)}</span>
              </div>
              <div className="flex justify-between text-rose-500 font-semibold border-t border-zinc-200 pt-1 mt-1">
                <span>Saldo Pendente:</span>
                <span className="font-bold">{formatCurrency(Math.max(0, activePrintOrder.total_amount - activePrintOrder.paid_amount))}</span>
              </div>
            </div>
            
            {activePrintMode === 'receipt' && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-1">
                  <strong>Forma de Pagamento:</strong>
                  <p className="pl-2">{paymentMethodName}</p>
                </div>
                <div className="space-y-1">
                  <strong>Data do Pagamento:</strong>
                  <p className="pl-2">{paymentDate}</p>
                </div>
              </div>
            )}

            {activePrintOrder.delivery_type && activePrintOrder.delivery_type !== 'retirada' && (
              <div className="space-y-1 border-t border-zinc-200 pt-2 text-[10px]">
                <strong>Informacoes de Entrega:</strong>
                <div className="pl-2 grid grid-cols-2 gap-2 text-zinc-700">
                  <p><strong>Tipo:</strong> {activePrintOrder.delivery_type === 'motoboy' ? 'Motoboy' : activePrintOrder.delivery_type === 'carro' ? 'Carro' : 'Correios / Transportadora'}</p>
                  <p><strong>Valor do Frete:</strong> {formatCurrency(activePrintOrder.shipping_cost || 0)}</p>
                  {activePrintOrder.delivery_address && (
                    <p className="col-span-2"><strong>Endereco:</strong> {activePrintOrder.delivery_address} {activePrintOrder.delivery_distance_km ? <span>({activePrintOrder.delivery_distance_km.toFixed(2)} km)</span> : ''}</p>
                  )}
                </div>
              </div>
            )}
            
            <div className="space-y-1 border-t border-zinc-200 pt-2">
              <strong>Observacoes:</strong>
              <p className="pl-2 italic">&quot;{paymentNotes}&quot;</p>
            </div>
            
            {activePrintMode === 'receipt' && (
              <p className="text-center font-semibold pt-4">
                Declaramos para os devidos fins que o valor acima foi recebido e registrado em nosso sistema.
              </p>
            )}

            {/* Space to prevent text overlap with the fixed footer */}
            <div className="h-16 print:block hidden" />

            {/* Footer with receipt issue time and company name, fixed to bottom on paper */}
            <div 
              className="hidden print:flex border-t border-zinc-300 pt-3 flex-row justify-between items-center text-[9px] text-zinc-500 font-mono"
              style={{ position: 'fixed', bottom: '20mm', left: '20mm', right: '20mm' }}
            >
              <span className="font-bold">{companyName}</span>
              <span>Impresso em: {issueDate} | {receiptNumber}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
