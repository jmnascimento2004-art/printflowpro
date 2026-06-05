'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Key, 
  DollarSign, 
  Users, 
  Coins, 
  Building2, 
  FileText, 
  RefreshCw, 
  Check, 
  Layers,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  X,
  Upload,
  RotateCcw,
  Search,
  ShieldAlert,
  Shield,
  Mail,
  Phone,
  LayoutGrid,
  ShoppingBag,
  Calculator,
  Wrench,
  Truck,
  ExternalLink
} from 'lucide-react';
import { useDatabase, DEFAULT_ROLE_PERMISSIONS } from '@/context/database-context';
import { useAuth } from '@/context/auth-context';
import { validateCNPJ, formatCNPJ, validateCEP, formatCEP, formatCurrencyInput, parseCurrencyInputToNumber } from '@/lib/utils';
import { DUMMY_COMPANY, UserProfile } from '@/lib/dummy-data';

const SYSTEM_MODULES = [
  { path: '/dashboard', label: 'Dashboard', desc: 'Resumo geral, estatísticas de vendas, status de produção e fluxo financeiro simplificado.' },
  { path: '/pos', label: 'PDV / Caixa', desc: 'Vendas rápidas presenciais, abertura e fechamento de caixa, sangrias e suprimentos.' },
  { path: '/crm', label: 'CRM Clientes', desc: 'Gestão da carteira de clientes, histórico de compras e contatos.' },
  { path: '/products', label: 'Produtos e Serviços', desc: 'Catálogo de materiais, serviços de impressão, acabamentos e preços base.' },
  { path: '/quotes', label: 'Orçamentos', desc: 'Geração de propostas comerciais e conversão em pedidos de venda.' },
  { path: '/pricing', label: 'Precificação / Calculadora', desc: 'Simulador avançado de custos de impressão, m² e margens.' },
  { path: '/orders', label: 'Pedidos / OS', desc: 'Controle de ordens de serviço, faturamento e fluxo de status.' },
  { path: '/production', label: 'Fila de Produção', desc: 'Quadro Kanban de ordens de serviço em impressão, acabamento e arte.' },
  { path: '/financial', label: 'Financeiro', desc: 'Lançamentos de contas a pagar e receber, DRE dinâmico e movimentações.' },
  { path: '/stock', label: 'Estoque / Insumos', desc: 'Controle de bobinas, chapas, tintas e alertas de estoque mínimo.' },
  { path: '/shipment', label: 'Expedição / Entregas', desc: 'Roteirização de entregas, motoboy, transportadoras e retiradas.' },
  { path: '/resale', label: 'Módulo Revenda', desc: 'Integração de pedidos e compras de parceiros terceirizados.' },
  { path: '/settings', label: 'Configurações Gráfica', desc: 'Dados da empresa, formas de pagamento, banners e personalizações.' }
];

const getModuleIcon = (path: string) => {
  switch (path) {
    case '/dashboard': return <LayoutGrid className="h-4.5 w-4.5 text-indigo-500" />;
    case '/pos': return <ShoppingBag className="h-4.5 w-4.5 text-emerald-500" />;
    case '/crm': return <Users className="h-4.5 w-4.5 text-sky-500" />;
    case '/employees': return <Users className="h-4.5 w-4.5 text-violet-500" />;
    case '/products': return <Layers className="h-4.5 w-4.5 text-amber-500" />;
    case '/quotes': return <FileText className="h-4.5 w-4.5 text-rose-500" />;
    case '/pricing': return <Calculator className="h-4.5 w-4.5 text-fuchsia-500" />;
    case '/orders': return <LayoutGrid className="h-4.5 w-4.5 text-blue-500" />;
    case '/production': return <Wrench className="h-4.5 w-4.5 text-orange-500" />;
    case '/financial': return <DollarSign className="h-4.5 w-4.5 text-emerald-500" />;
    case '/stock': return <Layers className="h-4.5 w-4.5 text-slate-500" />;
    case '/shipment': return <Truck className="h-4.5 w-4.5 text-cyan-500" />;
    case '/resale': return <ExternalLink className="h-4.5 w-4.5 text-purple-500" />;
    case '/settings': return <Settings className="h-4.5 w-4.5 text-slate-400" />;
    default: return <Shield className="h-4.5 w-4.5 text-primary" />;
  }
};

export default function SettingsPage() {
  const { activeProfile } = useAuth();
  const { 
    settings, 
    updateSettings, 
    resetDatabase, 
    company, 
    updateCompany,
    pickupPoints, 
    addPickupPoint, 
    updatePickupPoint, 
    deletePickupPoint,
    banners,
    addBanner,
    deleteBanner,
    profiles,
    addProfile,
    updateProfile,
    deleteProfile,
    rolePermissions,
    updateRolePermissions
  } = useDatabase();

  const [activeTab, setActiveTab] = useState<'empresa' | 'catalogo' | 'financas' | 'coleta' | 'funcionarios' | 'sistema'>('empresa');

  const [pixKey, setPixKey] = useState(settings.pix_key || 'financeiro@printflowpro.com.br');
  const [pixKeyType, setPixKeyType] = useState(settings.pix_key_type || 'email');
  const [bankName, setBankName] = useState(settings.bank_name || 'Banco Sicoob');

  // Company Form State
  const [compName, setCompName] = useState(company.name || '');
  const [compDocument, setCompDocument] = useState(company.document || '');
  const [compLogoLight, setCompLogoLight] = useState(company.logo_light || '');
  const [compLogoDark, setCompLogoDark] = useState(company.logo_dark || '');
  const [compFavicon, setCompFavicon] = useState(company.favicon || '');
  const [compThemeColor, setCompThemeColor] = useState(company.theme_color || 'emerald');
  const [compPhone, setCompPhone] = useState(company.phone || '');
  const [compEmail, setCompEmail] = useState(company.email || '');
  const [compCEP, setCompCEP] = useState(company.cep || '');
  const [compStreet, setCompStreet] = useState(company.street || '');
  const [compNumber, setCompNumber] = useState(company.number || '');
  const [compNeighborhood, setCompNeighborhood] = useState(company.neighborhood || '');
  const [compCity, setCompCity] = useState(company.city || '');
  const [compState, setCompState] = useState(company.state || '');

  // Social networks & policies states
  const [compInstagram, setCompInstagram] = useState(company.instagram_url || '');
  const [compFacebook, setCompFacebook] = useState(company.facebook_url || '');
  const [compYoutube, setCompYoutube] = useState(company.youtube_url || '');
  const [compRefundPolicy, setCompRefundPolicy] = useState(company.refund_policy || '');

  // Benefit cards states
  const [benefits1Title, setBenefits1Title] = useState(company.card_benefits_1_title || 'Até 4x Sem Juros');
  const [benefits1Subtitle, setBenefits1Subtitle] = useState(company.card_benefits_1_subtitle || 'Parcela mínima de R$ 300,00 nos cartões Visa/Master.');
  const [benefits1Active, setBenefits1Active] = useState(company.card_benefits_1_active !== false);

  const [benefits2Title, setBenefits2Title] = useState(company.card_benefits_2_title || 'Desconto no PIX');
  const [benefits2Subtitle, setBenefits2Subtitle] = useState(company.card_benefits_2_subtitle || 'Ganhe 5% de desconto automático em pagamentos à vista.');
  const [benefits2Active, setBenefits2Active] = useState(company.card_benefits_2_active !== false);

  const [benefits3Title, setBenefits3Title] = useState(company.card_benefits_3_title || 'Frete para todo Brasil');
  const [benefits3Subtitle, setBenefits3Subtitle] = useState(company.card_benefits_3_subtitle || 'Despacho via Correios ou Transportadora com código de rastreamento.');
  const [benefits3Active, setBenefits3Active] = useState(company.card_benefits_3_active !== false);

  const [benefits4Title, setBenefits4Title] = useState(company.card_benefits_4_title || 'Pontos de Coleta');
  const [benefits4Subtitle, setBenefits4Subtitle] = useState(company.card_benefits_4_subtitle || 'Retire sem custos em qualquer um de nossos balcões autorizados.');
  const [benefits4Active, setBenefits4Active] = useState(company.card_benefits_4_active !== false);

  // Payments / Delivery / Security toggles
  const [payVisa, setPayVisa] = useState(company.show_payments_visa !== false);
  const [payMastercard, setPayMastercard] = useState(company.show_payments_mastercard !== false);
  const [payElo, setPayElo] = useState(company.show_payments_elo !== false);
  const [payHipercard, setPayHipercard] = useState(company.show_payments_hipercard !== false);
  const [payDiners, setPayDiners] = useState(company.show_payments_diners !== false);
  const [payAmex, setPayAmex] = useState(company.show_payments_amex !== false);
  const [payBoleto, setPayBoleto] = useState(company.show_payments_boleto !== false);
  const [payTransferencia, setPayTransferencia] = useState(company.show_payments_transferencia !== false);
  const [payPix, setPayPix] = useState(company.show_payments_pix !== false);

  const [delSedex, setDelSedex] = useState(company.show_delivery_sedex !== false);
  const [delPac, setDelPac] = useState(company.show_delivery_pac !== false);
  const [delCorreios, setDelCorreios] = useState(company.show_delivery_correios !== false);
  const [delJadlog, setDelJadlog] = useState(company.show_delivery_jadlog !== false);
  const [delMotoboy, setDelMotoboy] = useState(company.show_delivery_motoboy !== false);

  const [secLetsencrypt, setSecLetsencrypt] = useState(company.show_security_letsencrypt !== false);
  const [secGoogle, setSecGoogle] = useState(company.show_security_google !== false);

  // Payment badge images state
  const [imgVisa, setImgVisa] = useState(company.img_payments_visa || '');
  const [imgMastercard, setImgMastercard] = useState(company.img_payments_mastercard || '');
  const [imgElo, setImgElo] = useState(company.img_payments_elo || '');
  const [imgHipercard, setImgHipercard] = useState(company.img_payments_hipercard || '');
  const [imgDiners, setImgDiners] = useState(company.img_payments_diners || '');
  const [imgAmex, setImgAmex] = useState(company.img_payments_amex || '');
  const [imgBoleto, setImgBoleto] = useState(company.img_payments_boleto || '');
  const [imgTransferencia, setImgTransferencia] = useState(company.img_payments_transferencia || '');
  const [imgPix, setImgPix] = useState(company.img_payments_pix || '');

  // Delivery badge images state
  const [imgSedex, setImgSedex] = useState(company.img_delivery_sedex || '');
  const [imgPac, setImgPac] = useState(company.img_delivery_pac || '');
  const [imgCorreios, setImgCorreios] = useState(company.img_delivery_correios || '');
  const [imgJadlog, setImgJadlog] = useState(company.img_delivery_jadlog || '');
  const [imgMotoboy, setImgMotoboy] = useState(company.img_delivery_motoboy || '');

  // Security badge images state
  const [imgLetsencrypt, setImgLetsencrypt] = useState(company.img_security_letsencrypt || '');
  const [imgGoogle, setImgGoogle] = useState(company.img_security_google || '');

  const [cnpjError, setCnpjError] = useState(false);
  const [cepError, setCepError] = useState(false);

  // Configurações de Frete Local por Quilometragem
  const [companyAddress, setCompanyAddress] = useState(settings.company_address || 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100');
  const [deliveryMotoboyPriceKm, setDeliveryMotoboyPriceKm] = useState(settings.delivery_motoboy_price_km || 2.50);
  const [deliveryCarPriceKm, setDeliveryCarPriceKm] = useState(settings.delivery_car_price_km || 4.50);
  const [deliveryMinFee, setDeliveryMinFee] = useState(settings.delivery_min_fee || 10.00);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'light' | 'dark' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (type === 'light') setCompLogoLight(base64String);
      else if (type === 'dark') setCompLogoDark(base64String);
      else if (type === 'favicon') setCompFavicon(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleBadgeUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const renderBadgeConfigItem = (
    label: string,
    isEnabled: boolean,
    setEnabled: (val: boolean) => void,
    imgVal: string,
    setImgVal: (val: string) => void,
    defaultSvg: string
  ) => {
    return (
      <div className="flex flex-col p-3 bg-secondary/10 border border-border rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold select-none text-foreground">
            <input 
              type="checkbox" 
              checked={isEnabled} 
              onChange={(e) => setEnabled(e.target.checked)} 
              className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 bg-secondary" 
            />
            <span>{label}</span>
          </label>
        </div>
        
        {isEnabled && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-24 bg-white border border-border flex items-center justify-center overflow-hidden rounded-none p-1 shadow-sm shrink-0">
                {imgVal ? (
                  <img src={imgVal} className="h-full w-full object-contain select-none rounded-none" alt={label} />
                ) : (
                  <span className="text-[9px] text-muted-foreground italic font-semibold">Sem Imagem</span>
                )}
              </div>
              
              <div className="flex flex-col gap-1 w-full">
                <label className="flex items-center justify-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors text-center shadow-md shadow-emerald-600/5">
                  <Upload className="h-3 w-3" />
                  <span>Upload JPG/PNG</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleBadgeUpload(e, setImgVal)} 
                  />
                </label>
                
                {imgVal !== defaultSvg && (
                  <button
                    type="button"
                    onClick={() => setImgVal(defaultSvg)}
                    className="flex items-center justify-center gap-1 px-2.5 py-1 bg-secondary hover:bg-secondary/80 text-muted-foreground border border-border rounded-lg text-[10px] font-bold transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Redefinir</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleCNPJChange = async (val: string) => {
    const formatted = formatCNPJ(val);
    setCompDocument(formatted);
    const clean = formatted.replace(/\D/g, '');

    if (clean.length === 14) {
      const isValid = validateCNPJ(clean);
      setCnpjError(!isValid);

      if (isValid) {
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
          if (res.ok) {
            const data = await res.json();
            setCompName(data.razao_social || data.nome_fantasia || '');
            if (data.telefone) {
              setCompPhone(data.telefone);
            }
            if (data.email) {
              setCompEmail(data.email);
            }
            if (data.cep) {
              setCompCEP(formatCEP(data.cep));
            }
            if (data.logradouro) {
              setCompStreet(data.logradouro);
            }
            if (data.numero) {
              setCompNumber(data.numero);
            }
            if (data.bairro) {
              setCompNeighborhood(data.bairro);
            }
            if (data.municipio) {
              setCompCity(data.municipio);
            }
            if (data.uf) {
              setCompState(data.uf);
            }
          }
        } catch (e) {
          console.error('Failed to lookup CNPJ from BrasilAPI', e);
        }
      }
    } else {
      setCnpjError(false);
    }
  };

  const handleCEPChange = async (val: string) => {
    const formatted = formatCEP(val);
    setCompCEP(formatted);
    const clean = formatted.replace(/\D/g, '');

    if (clean.length === 8) {
      const isValid = validateCEP(clean);
      setCepError(!isValid);

      if (isValid) {
        try {
          const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
          const data = await res.json();
          if (!data.erro) {
            setCompStreet(data.logradouro || '');
            setCompNeighborhood(data.bairro || '');
            setCompCity(data.localidade || '');
            setCompState(data.uf || '');
          } else {
            setCepError(true);
          }
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      setCepError(false);
    }
  };

  // CRUD Local State for Pickup Points
  const [isAdding, setIsAdding] = useState(false);
  const [editingPoint, setEditingPoint] = useState<any | null>(null);

  const [pointName, setPointName] = useState('');
  const [pointStreet, setPointStreet] = useState('');
  const [pointNumber, setPointNumber] = useState('');
  const [pointNeighborhood, setPointNeighborhood] = useState('');
  const [pointCity, setPointCity] = useState('');
  const [pointState, setPointState] = useState('');
  const [pointHoursWeek, setPointHoursWeek] = useState('');
  const [pointHoursSat, setPointHoursSat] = useState('');
  const [pointActive, setPointActive] = useState(true);
  const [taxRate, setTaxRate] = useState(settings.tax_rate !== undefined && settings.tax_rate !== null ? settings.tax_rate : 6.0);
  const [commissionRate, setCommissionRate] = useState(settings.commission_rate !== undefined && settings.commission_rate !== null ? settings.commission_rate : 5.0);

  // Storefront Header & Footer Customization State
  const [topBarHours, setTopBarHours] = useState(settings.top_bar_hours || 'Segunda à Sexta: 8h às 12h / 13h30 às 18h');
  const [topBarShowPickup, setTopBarShowPickup] = useState(settings.top_bar_show_pickup !== false);
  const [topBarPhone, setTopBarPhone] = useState(settings.top_bar_phone || '(51) 98765-4321');
  const [footerShowAddress, setFooterShowAddress] = useState(settings.footer_show_address !== false);
  const [footerHoursMessage, setFooterHoursMessage] = useState(settings.footer_hours_message || '*Atendimento presencial com hora marcada*');
  const [footerHoursWeek, setFooterHoursWeek] = useState(settings.footer_hours_week || '8h às 12h / 13h30 às 18h');
  const [footerHoursSat, setFooterHoursSat] = useState(settings.footer_hours_sat || 'Segunda à Sexta-feira');
  const [footerHoursSatTime, setFooterHoursSatTime] = useState(settings.footer_hours_sat_time || 'Fechado');
  const [footerHoursSatDesc, setFooterHoursSatDesc] = useState(settings.footer_hours_sat_desc || 'Sábado');

  const [saasEnabled, setSaasEnabled] = useState(settings.saas_enabled !== undefined ? settings.saas_enabled : true);
  const [nfeEnabled, setNfeEnabled] = useState(settings.nfe_enabled || false);
  const [aiEnabled, setAiEnabled] = useState(settings.ai_enabled || false);

  // Banner Form State
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerLink, setBannerLink] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [isAddingBanner, setIsAddingBanner] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  // Safeguard: redirect if not admin and on funcionarios tab
  useEffect(() => {
    if (activeTab === 'funcionarios' && activeProfile?.role !== 'admin') {
      setActiveTab('empresa');
    }
  }, [activeTab, activeProfile]);

  // Auto-sync company origin address from company fields
  useEffect(() => {
    if (compStreet || compNumber || compNeighborhood || compCity || compState || compCEP) {
      setCompanyAddress(`${compStreet}, ${compNumber} - ${compNeighborhood}, ${compCity} - ${compState}${compCEP ? `, CEP ${compCEP}` : ''}`);
    }
  }, [compStreet, compNumber, compNeighborhood, compCity, compState, compCEP]);

  // Employee-related state variables
  const [empSearchTerm, setEmpSearchTerm] = useState('');
  const [empSelectedRole, setEmpSelectedRole] = useState('all');
  const [empIsModalOpen, setEmpIsModalOpen] = useState(false);
  const [empEditingProfile, setEmpEditingProfile] = useState<UserProfile | null>(null);
  
  const [empFormName, setEmpFormName] = useState('');
  const [empFormEmail, setEmpFormEmail] = useState('');
  const [empFormPhone, setEmpFormPhone] = useState('');
  const [empFormRole, setEmpFormRole] = useState<'admin' | 'gerente' | 'financeiro' | 'vendas' | 'producao' | 'estoque' | 'arte_finalista'>('vendas');
  const [empFormActive, setEmpFormActive] = useState(true);
  const [activePermissionsTab, setActivePermissionsTab] = useState<'employees' | 'permissions'>('employees');
  const [tempPermissions, setTempPermissions] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (rolePermissions && Object.keys(rolePermissions).length > 0) {
      setTempPermissions(rolePermissions);
    } else {
      setTempPermissions(DEFAULT_ROLE_PERMISSIONS);
    }
  }, [rolePermissions]);

  const handleEmpCheckboxChange = (path: string, roleKey: string) => {
    if (roleKey === 'admin') return;
    setTempPermissions(prev => {
      const currentRoles = prev[path] || [];
      let updatedRoles;
      if (currentRoles.includes(roleKey)) {
        updatedRoles = currentRoles.filter(r => r !== roleKey);
      } else {
        updatedRoles = [...currentRoles, roleKey];
      }
      return {
        ...prev,
        [path]: updatedRoles
      };
    });
  };

  const handleEmpSavePermissions = () => {
    updateRolePermissions(tempPermissions);
  };

  const openEmpAddModal = () => {
    setEmpEditingProfile(null);
    setEmpFormName('');
    setEmpFormEmail('');
    setEmpFormPhone('');
    setEmpFormRole('vendas');
    setEmpFormActive(true);
    setEmpIsModalOpen(true);
  };

  const openEmpEditModal = (profile: UserProfile) => {
    setEmpEditingProfile(profile);
    setEmpFormName(profile.name);
    setEmpFormEmail(profile.email);
    setEmpFormPhone(profile.phone || '');
    setEmpFormRole(profile.role as any);
    setEmpFormActive(profile.active);
    setEmpIsModalOpen(true);
  };

  const handleEmpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empFormName.trim() || !empFormEmail.trim()) {
      alert('Nome e E-mail são obrigatórios!');
      return;
    }

    if (empEditingProfile) {
      updateProfile({
        ...empEditingProfile,
        name: empFormName,
        email: empFormEmail,
        phone: empFormPhone,
        role: empFormRole,
        active: empFormActive
      });
      setNotification('Funcionário atualizado com sucesso!');
    } else {
      addProfile({
        name: empFormName,
        email: empFormEmail,
        phone: empFormPhone,
        role: empFormRole,
        active: empFormActive
      });
      setNotification('Funcionário cadastrado com sucesso!');
    }
    
    setEmpIsModalOpen(false);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleEmpDelete = (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir o funcionário "${name}"?`)) {
      deleteProfile(id);
      setNotification('Funcionário excluído com sucesso!');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleBannerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setBannerImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleAddBannerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerImage) {
      alert('Selecione uma imagem para o banner!');
      return;
    }

    addBanner({
      image_url: bannerImage,
      title: bannerTitle || undefined,
      subtitle: bannerSubtitle || undefined,
      link: bannerLink || undefined
    });

    setBannerTitle('');
    setBannerSubtitle('');
    setBannerLink('');
    setBannerImage('');
    setIsAddingBanner(false);
    setNotification('Banner adicionado com sucesso!');
    setTimeout(() => setNotification(null), 3000);
  };

  // CRUD handlers for Pickup Points
  const handleAddPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pointName.trim() || !pointStreet.trim() || !pointNumber.trim() || !pointNeighborhood.trim() || !pointCity.trim() || !pointState.trim() || !pointHoursWeek.trim()) return;

    addPickupPoint({
      name: pointName,
      street: pointStreet,
      number: pointNumber,
      neighborhood: pointNeighborhood,
      city: pointCity,
      state: pointState,
      hours_week: pointHoursWeek,
      hours_sat: pointHoursSat || 'Fechado',
      active: pointActive,
      address: `${pointStreet}, ${pointNumber} - ${pointNeighborhood}`,
      hours: `Seg-Sex: ${pointHoursWeek}${pointHoursSat ? ` | Sáb: ${pointHoursSat}` : ''}`
    });

    setPointName('');
    setPointStreet('');
    setPointNumber('');
    setPointNeighborhood('');
    setPointCity('');
    setPointState('');
    setPointHoursWeek('');
    setPointHoursSat('');
    setPointActive(true);
    setIsAdding(false);

    setNotification('Ponto de coleta cadastrado com sucesso!');
    setTimeout(() => setNotification(null), 3000);
  };

  const startEditing = (point: any) => {
    setEditingPoint(point);
    setPointName(point.name);
    setPointStreet(point.street || '');
    setPointNumber(point.number || '');
    setPointNeighborhood(point.neighborhood || '');
    setPointCity(point.city);
    setPointState(point.state);
    setPointHoursWeek(point.hours_week || '');
    setPointHoursSat(point.hours_sat || '');
    setPointActive(point.active);
    setIsAdding(false);
  };

  const handleUpdatePoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPoint) return;
    if (!pointName.trim() || !pointStreet.trim() || !pointNumber.trim() || !pointNeighborhood.trim() || !pointCity.trim() || !pointState.trim() || !pointHoursWeek.trim()) return;

    updatePickupPoint({
      id: editingPoint.id,
      company_id: editingPoint.company_id,
      name: pointName,
      street: pointStreet,
      number: pointNumber,
      neighborhood: pointNeighborhood,
      city: pointCity,
      state: pointState,
      hours_week: pointHoursWeek,
      hours_sat: pointHoursSat || 'Fechado',
      active: pointActive,
      address: `${pointStreet}, ${pointNumber} - ${pointNeighborhood}`,
      hours: `Seg-Sex: ${pointHoursWeek}${pointHoursSat ? ` | Sáb: ${pointHoursSat}` : ''}`
    });

    setEditingPoint(null);
    setPointName('');
    setPointStreet('');
    setPointNumber('');
    setPointNeighborhood('');
    setPointCity('');
    setPointState('');
    setPointHoursWeek('');
    setPointHoursSat('');
    setPointActive(true);

    setNotification('Ponto de coleta atualizado com sucesso!');
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeletePoint = (id: string) => {
    if (confirm('Tem certeza que deseja remover este ponto de coleta?')) {
      deletePickupPoint(id);
      setNotification('Ponto de coleta removido com sucesso!');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanCNPJ = compDocument.replace(/\D/g, '');
    if (cleanCNPJ && !validateCNPJ(cleanCNPJ)) {
      setCnpjError(true);
      alert('CNPJ inválido! Verifique o número digitado.');
      return;
    }

    const cleanCEP = compCEP.replace(/\D/g, '');
    if (cleanCEP && !validateCEP(cleanCEP)) {
      setCepError(true);
      alert('CEP inválido! Verifique o número de CEP.');
      return;
    }

    updateSettings({
      pix_key: pixKey,
      pix_key_type: pixKeyType,
      bank_name: bankName,
      tax_rate: Number(taxRate),
      commission_rate: Number(commissionRate),
      top_bar_hours: topBarHours,
      top_bar_show_pickup: topBarShowPickup,
      top_bar_phone: topBarPhone,
      footer_show_address: footerShowAddress,
      footer_hours_message: footerHoursMessage,
      footer_hours_week: footerHoursWeek,
      footer_hours_sat: footerHoursSat,
      footer_hours_sat_time: footerHoursSatTime,
      footer_hours_sat_desc: footerHoursSatDesc,
      saas_enabled: saasEnabled,
      nfe_enabled: nfeEnabled,
      ai_enabled: aiEnabled,
      company_address: companyAddress,
      delivery_motoboy_price_km: Number(deliveryMotoboyPriceKm),
      delivery_car_price_km: Number(deliveryCarPriceKm),
      delivery_min_fee: Number(deliveryMinFee)
    });

    updateCompany({
      id: company.id,
      name: compName,
      document: compDocument,
      logo_url: company.logo_url || '',
      logo_light: compLogoLight,
      logo_dark: compLogoDark,
      favicon: compFavicon,
      theme_color: compThemeColor,
      phone: compPhone,
      email: compEmail,
      cep: compCEP,
      street: compStreet,
      number: compNumber,
      neighborhood: compNeighborhood,
      city: compCity,
      state: compState,
      instagram_url: compInstagram,
      facebook_url: compFacebook,
      youtube_url: compYoutube,
      refund_policy: compRefundPolicy,
      show_payments_visa: payVisa,
      show_payments_mastercard: payMastercard,
      show_payments_elo: payElo,
      show_payments_hipercard: payHipercard,
      show_payments_diners: payDiners,
      show_payments_amex: payAmex,
      show_payments_boleto: payBoleto,
      show_payments_transferencia: payTransferencia,
      show_payments_pix: payPix,
      show_delivery_sedex: delSedex,
      show_delivery_pac: delPac,
      show_delivery_correios: delCorreios,
      show_delivery_jadlog: delJadlog,
      show_delivery_motoboy: delMotoboy,
      show_security_letsencrypt: secLetsencrypt,
      show_security_google: secGoogle,
      img_payments_visa: imgVisa,
      img_payments_mastercard: imgMastercard,
      img_payments_elo: imgElo,
      img_payments_hipercard: imgHipercard,
      img_payments_diners: imgDiners,
      img_payments_amex: imgAmex,
      img_payments_boleto: imgBoleto,
      img_payments_transferencia: imgTransferencia,
      img_payments_pix: imgPix,
      img_delivery_sedex: imgSedex,
      img_delivery_pac: imgPac,
      img_delivery_correios: imgCorreios,
      img_delivery_jadlog: imgJadlog,
      img_delivery_motoboy: imgMotoboy,
      img_security_letsencrypt: imgLetsencrypt,
      img_security_google: imgGoogle,
      card_benefits_1_title: benefits1Title,
      card_benefits_1_subtitle: benefits1Subtitle,
      card_benefits_1_active: benefits1Active,
      card_benefits_2_title: benefits2Title,
      card_benefits_2_subtitle: benefits2Subtitle,
      card_benefits_2_active: benefits2Active,
      card_benefits_3_title: benefits3Title,
      card_benefits_3_subtitle: benefits3Subtitle,
      card_benefits_3_active: benefits3Active,
      card_benefits_4_title: benefits4Title,
      card_benefits_4_subtitle: benefits4Subtitle,
      card_benefits_4_active: benefits4Active
    });

    setNotification('Configurações atualizadas com sucesso!');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="space-y-6">
      {notification && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in duration-300">
          {notification}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar Abas */}
        <div className="w-full md:w-64 bg-card border border-border rounded-2xl p-2 shrink-0 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-1 scrollbar-none">
          {[
            { id: 'empresa', label: 'Empresa & Marca', icon: Building2 },
            { id: 'catalogo', label: 'Catálogo & Banners', icon: Layers },
            { id: 'financas', label: 'Finanças & Chave Pix', icon: Coins },
            { id: 'coleta', label: 'Balcões de Retirada', icon: MapPin },
            ...(activeProfile?.role === 'admin' ? [{ id: 'funcionarios', label: 'Funcionários & Acessos', icon: Users }] : []),
            { id: 'sistema', label: 'Avançado & Sistema', icon: Settings }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 md:w-full ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo da Aba Ativa */}
        <div className="flex-1 w-full space-y-6">
          {/* Banners do Catálogo (outside form) */}
          {activeTab === 'catalogo' && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
              <div className="border-b border-border pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4.5 w-4.5 text-primary" />
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Banners do Catálogo Online (Slider)</h3>
                </div>
                {!isAddingBanner && (
                  <button
                    type="button"
                    onClick={() => setIsAddingBanner(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/95 text-white text-[11px] font-bold shadow-sm transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" /> Novo Banner
                  </button>
                )}
              </div>

              {/* Add Banner Form */}
              {isAddingBanner && (
                <form onSubmit={handleAddBannerSubmit} className="p-4 bg-secondary/20 border border-border rounded-xl space-y-4 animate-in slide-in-from-top duration-200">
                  <div className="flex justify-between items-center border-b border-border pb-2">
                    <span className="font-bold text-xs text-foreground uppercase">Cadastrar Novo Banner</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingBanner(false);
                        setBannerTitle('');
                        setBannerSubtitle('');
                        setBannerLink('');
                        setBannerImage('');
                      }}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Título do Banner</label>
                      <input
                        type="text"
                        value={bannerTitle}
                        onChange={(e) => setBannerTitle(e.target.value)}
                        placeholder="Ex: CALCULE AS MEDIDAS & ENCOMENDE ONLINE"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Subtítulo do Banner</label>
                      <input
                        type="text"
                        value={bannerSubtitle}
                        onChange={(e) => setBannerSubtitle(e.target.value)}
                        placeholder="Ex: Banners e adesivos sob medida com preço calculado na hora."
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Link de Destino (Opcional)</label>
                      <input
                        type="text"
                        value={bannerLink}
                        onChange={(e) => setBannerLink(e.target.value)}
                        placeholder="Ex: # ou link do produto"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Imagem do Banner *</label>
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <button type="button" className="w-full py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors border border-dashed border-primary/30">
                            {bannerImage ? 'Alterar Imagem' : 'Selecionar Arquivo'}
                          </button>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleBannerImageUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </div>
                        {bannerImage && (
                          <button
                            type="button"
                            onClick={() => setBannerImage('')}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-semibold"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {bannerImage && (
                    <div className="mt-2 p-2 bg-background border border-border rounded-lg max-w-md">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Pré-visualização</span>
                      <img src={bannerImage} alt="Preview Banner" className="w-full h-32 object-cover rounded-md" />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 border-t border-border/50 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingBanner(false);
                        setBannerTitle('');
                        setBannerSubtitle('');
                        setBannerLink('');
                        setBannerImage('');
                      }}
                      className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-[11px] font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> Adicionar Banner
                    </button>
                  </div>
                </form>
              )}

              {/* Banners List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {banners && banners.length > 0 ? (
                  banners.map((banner) => (
                    <div key={banner.id} className="border border-border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow flex flex-col justify-between">
                      <div className="relative h-32 bg-slate-100 flex items-center justify-center">
                        <img src={banner.image_url} alt={banner.title || 'Banner'} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex flex-col justify-end text-white">
                          <span className="font-extrabold text-xs uppercase tracking-wide truncate">{banner.title || 'Sem título'}</span>
                          <span className="text-[10px] text-zinc-300 line-clamp-2 mt-0.5 leading-normal">{banner.subtitle}</span>
                        </div>
                      </div>
                      <div className="p-3 bg-secondary/10 flex items-center justify-between text-xs border-t border-border">
                        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={banner.link}>
                          Link: {banner.link || 'Nenhum'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Tem certeza que deseja excluir este banner?')) {
                              deleteBanner(banner.id);
                              setNotification('Banner excluído com sucesso!');
                              setTimeout(() => setNotification(null), 3000);
                            }
                          }}
                          className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 transition-colors"
                          title="Excluir Banner"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 p-8 text-center text-muted-foreground text-xs italic border border-dashed border-border rounded-xl">
                    Nenhum banner cadastrado para o catálogo.
                  </div>
                )}
              </div>
            </div>
          )}

          <form id="general-settings-form" onSubmit={handleSaveSettings} className="space-y-6">
            
            {activeTab === 'empresa' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Dados da Empresa */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Building2 className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Dados de Cadastro da Empresa</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">CNPJ Principal *</label>
                      <input
                        type="text"
                        required
                        value={compDocument}
                        onChange={(e) => handleCNPJChange(e.target.value)}
                        placeholder="Ex: 00.000.000/0000-00"
                        className={`w-full px-3 py-1.5 bg-secondary/50 border rounded-lg text-xs font-semibold focus:outline-none ${
                          cnpjError ? 'border-rose-500 text-rose-500' : 'border-border text-foreground'
                        }`}
                      />
                      {cnpjError && <p className="text-[9px] text-rose-500 font-bold">CNPJ inválido ou incompleto</p>}
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Razão Social / Nome Fantasia *</label>
                      <input
                        type="text"
                        required
                        value={compName}
                        onChange={(e) => setCompName(e.target.value)}
                        placeholder="Ex: PrintFlowPRO Gráfica Rápida"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Telefone de Contato</label>
                      <input
                        type="text"
                        value={compPhone}
                        onChange={(e) => setCompPhone(e.target.value)}
                        placeholder="Ex: (11) 98765-4321"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">E-mail Comercial</label>
                      <input
                        type="email"
                        value={compEmail}
                        onChange={(e) => setCompEmail(e.target.value)}
                        placeholder="Ex: comercial@suagrafica.com.br"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">CEP *</label>
                      <input
                        type="text"
                        required
                        value={compCEP}
                        onChange={(e) => handleCEPChange(e.target.value)}
                        placeholder="Ex: 00000-000"
                        className={`w-full px-3 py-1.5 bg-secondary/50 border rounded-lg text-xs font-semibold focus:outline-none ${
                          cepError ? 'border-rose-500 text-rose-500' : 'border-border text-foreground'
                        }`}
                      />
                      {cepError && <p className="text-[9px] text-rose-500 font-bold">CEP inválido</p>}
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Logradouro / Rua *</label>
                      <input
                        type="text"
                        required
                        value={compStreet}
                        onChange={(e) => setCompStreet(e.target.value)}
                        placeholder="Ex: Avenida Central"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Número *</label>
                      <input
                        type="text"
                        required
                        value={compNumber}
                        onChange={(e) => setCompNumber(e.target.value)}
                        placeholder="Ex: 100"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Bairro *</label>
                      <input
                        type="text"
                        required
                        value={compNeighborhood}
                        onChange={(e) => setCompNeighborhood(e.target.value)}
                        placeholder="Ex: Centro"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 col-span-1 md:col-span-1">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Cidade *</label>
                        <input
                          type="text"
                          required
                          value={compCity}
                          onChange={(e) => setCompCity(e.target.value)}
                          placeholder="Cidade"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                        />
                      </div>
                      <div className="col-span-1 space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">UF *</label>
                        <input
                          type="text"
                          required
                          maxLength={2}
                          value={compState}
                          onChange={(e) => setCompState(e.target.value.toUpperCase())}
                          placeholder="UF"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold text-center focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Identidade Visual */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Layers className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Identidade Visual da Empresa</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Logo Modo Claro */}
                    <div className="p-4 bg-secondary/10 border border-border rounded-xl flex flex-col justify-between items-center text-center space-y-3">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Logo Modo Claro</span>
                        <span className="text-[9px] text-muted-foreground mt-0.5 block">Exibido no tema claro</span>
                      </div>
                      <div className="h-20 w-full bg-slate-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center p-2 border border-border">
                        {compLogoLight ? (
                          <img src={compLogoLight} alt="Logo Modo Claro" className="h-16 object-contain" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Sem Logo</span>
                        )}
                      </div>
                      <div className="relative w-full">
                        <button type="button" className="w-full py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors">
                          {compLogoLight ? 'Alterar Logo' : 'Selecionar Logo'}
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleLogoUpload(e, 'light')}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      {compLogoLight && (
                        <button
                          type="button"
                          onClick={() => setCompLogoLight('')}
                          className="text-[10px] text-rose-500 font-bold hover:underline"
                        >
                          Remover Imagem
                        </button>
                      )}
                    </div>

                    {/* Logo Modo Escuro */}
                    <div className="p-4 bg-secondary/10 border border-border rounded-xl flex flex-col justify-between items-center text-center space-y-3">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Logo Modo Escuro</span>
                        <span className="text-[9px] text-muted-foreground mt-0.5 block">Exibido no tema escuro</span>
                      </div>
                      <div className="h-20 w-full bg-slate-800 rounded-lg flex items-center justify-center p-2 border border-border">
                        {compLogoDark ? (
                          <img src={compLogoDark} alt="Logo Modo Escuro" className="h-16 object-contain" />
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">Sem Logo</span>
                        )}
                      </div>
                      <div className="relative w-full">
                        <button type="button" className="w-full py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors">
                          {compLogoDark ? 'Alterar Logo' : 'Selecionar Logo'}
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleLogoUpload(e, 'dark')}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      {compLogoDark && (
                        <button
                          type="button"
                          onClick={() => setCompLogoDark('')}
                          className="text-[10px] text-rose-500 font-bold hover:underline"
                        >
                          Remover Imagem
                        </button>
                      )}
                    </div>

                    {/* Favicon */}
                    <div className="p-4 bg-secondary/10 border border-border rounded-xl flex flex-col justify-between items-center text-center space-y-3">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Favicon (Ícone de Aba)</span>
                        <span className="text-[9px] text-muted-foreground mt-0.5 block">Exibido na aba do navegador</span>
                      </div>
                      <div className="h-20 w-20 mx-auto bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center p-2 border border-border">
                        {compFavicon ? (
                          <img src={compFavicon} alt="Favicon" className="h-10 w-10 object-contain" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Sem Ícone</span>
                        )}
                      </div>
                      <div className="relative w-full">
                        <button type="button" className="w-full py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors">
                          {compFavicon ? 'Alterar Favicon' : 'Selecionar Favicon'}
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleLogoUpload(e, 'favicon')}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      {compFavicon && (
                        <button
                          type="button"
                          onClick={() => setCompFavicon('')}
                          className="text-[10px] text-rose-500 font-bold hover:underline"
                        >
                          Remover Imagem
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cor do Tema do Catálogo */}
                  <div className="border-t border-border pt-4 mt-2">
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3">Cor do Tema do Catálogo Online</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end text-xs">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Selecione a Cor Principal</label>
                        <select
                          value={compThemeColor}
                          onChange={(e) => setCompThemeColor(e.target.value)}
                          className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                        >
                          <option value="emerald">Verde Esmeralda (Padrão)</option>
                          <option value="blue">Azul Real</option>
                          <option value="violet">Roxo Violeta</option>
                          <option value="amber">Laranja / Âmbar</option>
                          <option value="rose">Vermelho / Rosa</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-secondary/10 border border-border rounded-xl h-[38px]">
                        <span className="font-semibold text-muted-foreground text-[10px] uppercase">Amostra:</span>
                        <div className={`h-4 w-4 rounded-full border border-border shrink-0 ${
                          compThemeColor === 'blue' ? 'bg-blue-600' :
                          compThemeColor === 'violet' ? 'bg-violet-600' :
                          compThemeColor === 'amber' ? 'bg-amber-600' :
                          compThemeColor === 'rose' ? 'bg-rose-600' : 'bg-emerald-600'
                        }`} />
                        <span className="font-bold uppercase text-[10px] text-foreground">
                          {compThemeColor === 'emerald' ? 'Esmeralda' :
                           compThemeColor === 'blue' ? 'Azul' :
                           compThemeColor === 'violet' ? 'Violeta' :
                           compThemeColor === 'amber' ? 'Âmbar' :
                           compThemeColor === 'rose' ? 'Rosa' : compThemeColor}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Configuração de Roteamento de Frete Local */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <MapPin className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Configuração de Roteamento de Frete Local</h3>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Endereço de Partida da Gráfica (Ponto A) *</label>
                      <input
                        type="text"
                        required
                        readOnly
                        value={companyAddress}
                        placeholder="Preencha o endereço da empresa acima..."
                        className="w-full px-3 py-1.5 bg-secondary/30 text-muted-foreground cursor-not-allowed border border-border rounded-lg text-xs font-semibold focus:outline-none"
                      />
                      <p className="text-[9px] text-muted-foreground">Este endereço é gerado automaticamente a partir dos "Dados de Cadastro da Empresa" acima e é usado como ponto de partida (Origem).</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Valor do KM - Motoboy (R$) *</label>
                        <input
                          type="text"
                          required
                          value={formatCurrencyInput(deliveryMotoboyPriceKm)}
                          onChange={(e) => setDeliveryMotoboyPriceKm(parseCurrencyInputToNumber(e.target.value))}
                          placeholder="0,00"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none font-semibold text-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Valor do KM - Carro (R$) *</label>
                        <input
                          type="text"
                          required
                          value={formatCurrencyInput(deliveryCarPriceKm)}
                          onChange={(e) => setDeliveryCarPriceKm(parseCurrencyInputToNumber(e.target.value))}
                          placeholder="0,00"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none font-semibold text-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Taxa Mínima de Entrega (R$) *</label>
                        <input
                          type="text"
                          required
                          value={formatCurrencyInput(deliveryMinFee)}
                          onChange={(e) => setDeliveryMinFee(parseCurrencyInputToNumber(e.target.value))}
                          placeholder="0,00"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none font-bold text-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'catalogo' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Personalização do Catálogo (Cabeçalho e Rodapé) */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Settings className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Personalização do Catálogo (Cabeçalho e Rodapé)</h3>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">Barra Superior (Cabeçalho)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Horário / Mensagem da Barra Superior</label>
                        <input
                          type="text"
                          value={topBarHours}
                          onChange={(e) => setTopBarHours(e.target.value)}
                          placeholder="Ex: Segunda à Sexta: 8h às 12h / 13h30 às 18h"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">WhatsApp de Suporte</label>
                        <input
                          type="text"
                          value={topBarPhone}
                          onChange={(e) => setTopBarPhone(e.target.value)}
                          placeholder="Ex: (51) 98765-4321"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-secondary/20 border border-border rounded-xl">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Alerta de Retirada Grátis</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                          Exibir "Retire grátis em nossos balcões autorizados" na barra superior do catálogo.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTopBarShowPickup(!topBarShowPickup)}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                          topBarShowPickup ? 'bg-primary' : 'bg-secondary border border-border'
                        }`}
                      >
                        <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                          topBarShowPickup ? 'translate-x-5.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-border/60">
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">Rodapé do Catálogo</h4>
                    
                    <div className="flex items-center justify-between p-3.5 bg-secondary/20 border border-border rounded-xl">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Exibir Endereço Físico</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                          Desative esta opção caso sua empresa funcione apenas online.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFooterShowAddress(!footerShowAddress)}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                          footerShowAddress ? 'bg-primary' : 'bg-secondary border border-border'
                        }`}
                      >
                        <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                          footerShowAddress ? 'translate-x-5.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Aviso / Nota de Atendimento</label>
                        <input
                          type="text"
                          value={footerHoursMessage}
                          onChange={(e) => setFooterHoursMessage(e.target.value)}
                          placeholder="Ex: *Atendimento presencial com hora marcada*"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Horário de Funcionamento (Semana)</label>
                        <input
                          type="text"
                          value={footerHoursWeek}
                          onChange={(e) => setFooterHoursWeek(e.target.value)}
                          placeholder="Ex: 8h às 12h / 13h30 às 18h"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Descrição de Dias (Semana)</label>
                        <input
                          type="text"
                          value={footerHoursSat}
                          onChange={(e) => setFooterHoursSat(e.target.value)}
                          placeholder="Ex: Segunda à Sexta-feira"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border/40">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Horário de Funcionamento (Sábado)</label>
                        <input
                          type="text"
                          value={footerHoursSatTime}
                          onChange={(e) => setFooterHoursSatTime(e.target.value)}
                          placeholder="Ex: 8h às 12h (ou Fechado)"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Descrição de Dia (Sábado)</label>
                        <input
                          type="text"
                          value={footerHoursSatDesc}
                          onChange={(e) => setFooterHoursSatDesc(e.target.value)}
                          placeholder="Ex: Sábado"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Redes Sociais do Catálogo */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Users className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Redes Sociais do Catálogo</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Instagram URL</label>
                      <input
                        type="url"
                        value={compInstagram}
                        onChange={(e) => setCompInstagram(e.target.value)}
                        placeholder="https://instagram.com/suapagina"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Facebook URL</label>
                      <input
                        type="url"
                        value={compFacebook}
                        onChange={(e) => setCompFacebook(e.target.value)}
                        placeholder="https://facebook.com/suapagina"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">YouTube URL</label>
                      <input
                        type="url"
                        value={compYoutube}
                        onChange={(e) => setCompYoutube(e.target.value)}
                        placeholder="https://youtube.com/suacanal"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Política de Devolução e Reembolso */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Política de Devolução e Reembolso</h3>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Texto da Política (Será exibido em modal no catálogo)</label>
                    <textarea
                      value={compRefundPolicy}
                      onChange={(e) => setCompRefundPolicy(e.target.value)}
                      placeholder="Escreva aqui a política de troca, reembolso e termos de devolução..."
                      rows={4}
                      className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none resize-none font-medium"
                    />
                  </div>
                </div>

                {/* Cards de Benefícios do Catálogo */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Building2 className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Cards de Benefícios do Catálogo</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Benefício 1 */}
                    <div className="p-4 bg-secondary/10 border border-border rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-primary uppercase">Card 1 (Ex: 4x Sem Juros)</span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold select-none text-foreground">
                          <input 
                            type="checkbox" 
                            checked={benefits1Active} 
                            onChange={(e) => setBenefits1Active(e.target.checked)} 
                            className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 bg-secondary" 
                          />
                          <span>Ativo</span>
                        </label>
                      </div>
                      {benefits1Active && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Título</label>
                            <input
                              type="text"
                              value={benefits1Title}
                              onChange={(e) => setBenefits1Title(e.target.value)}
                              placeholder="Ex: Até 4x Sem Juros"
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Descrição</label>
                            <input
                              type="text"
                              value={benefits1Subtitle}
                              onChange={(e) => setBenefits1Subtitle(e.target.value)}
                              placeholder="Ex: Parcela mínima de R$ 300,00 nos cartões Visa/Master."
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Benefício 2 */}
                    <div className="p-4 bg-secondary/10 border border-border rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-primary uppercase">Card 2 (Ex: Desconto no PIX)</span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold select-none text-foreground">
                          <input 
                            type="checkbox" 
                            checked={benefits2Active} 
                            onChange={(e) => setBenefits2Active(e.target.checked)} 
                            className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 bg-secondary" 
                          />
                          <span>Ativo</span>
                        </label>
                      </div>
                      {benefits2Active && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Título</label>
                            <input
                              type="text"
                              value={benefits2Title}
                              onChange={(e) => setBenefits2Title(e.target.value)}
                              placeholder="Ex: Desconto no PIX"
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Descrição</label>
                            <input
                              type="text"
                              value={benefits2Subtitle}
                              onChange={(e) => setBenefits2Subtitle(e.target.value)}
                              placeholder="Ex: Ganhe 5% de desconto automático em pagamentos à vista."
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Benefício 3 */}
                    <div className="p-4 bg-secondary/10 border border-border rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-primary uppercase">Card 3 (Ex: Frete Grátis)</span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold select-none text-foreground">
                          <input 
                            type="checkbox" 
                            checked={benefits3Active} 
                            onChange={(e) => setBenefits3Active(e.target.checked)} 
                            className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 bg-secondary" 
                          />
                          <span>Ativo</span>
                        </label>
                      </div>
                      {benefits3Active && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Título</label>
                            <input
                              type="text"
                              value={benefits3Title}
                              onChange={(e) => setBenefits3Title(e.target.value)}
                              placeholder="Ex: Frete para todo Brasil"
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Descrição</label>
                            <input
                              type="text"
                              value={benefits3Subtitle}
                              onChange={(e) => setBenefits3Subtitle(e.target.value)}
                              placeholder="Ex: Despacho via Correios ou Transportadora com código de rastreamento."
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Benefício 4 */}
                    <div className="p-4 bg-secondary/10 border border-border rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-primary uppercase">Card 4 (Ex: Pontos de Coleta)</span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold select-none text-foreground">
                          <input 
                            type="checkbox" 
                            checked={benefits4Active} 
                            onChange={(e) => setBenefits4Active(e.target.checked)} 
                            className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 bg-secondary" 
                          />
                          <span>Ativo</span>
                        </label>
                      </div>
                      {benefits4Active && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Título</label>
                            <input
                              type="text"
                              value={benefits4Title}
                              onChange={(e) => setBenefits4Title(e.target.value)}
                              placeholder="Ex: Pontos de Coleta"
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Descrição</label>
                            <input
                              type="text"
                              value={benefits4Subtitle}
                              onChange={(e) => setBenefits4Subtitle(e.target.value)}
                              placeholder="Ex: Retire sem custos em qualquer um de nossos balcões autorizados."
                              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'financas' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Pix configurations */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Key className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Configurações do Pix Integrado</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Tipo de Chave Pix</label>
                      <select
                        value={pixKeyType}
                        onChange={(e) => setPixKeyType(e.target.value)}
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      >
                        <option value="cnpj">CNPJ</option>
                        <option value="cpf">CPF</option>
                        <option value="celular">Telefone / Celular</option>
                        <option value="email">E-mail</option>
                        <option value="aleatoria">Chave Aleatória</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Chave Pix Recebedora</label>
                      <input
                        type="text"
                        value={pixKey}
                        onChange={(e) => setPixKey(e.target.value)}
                        placeholder="Ex: 00.000.000/0000-00, CPF, e-mail ou celular"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Instituição Bancária (Exibido no Pix)</label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="Ex: Banco Sicoob"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Pricing & financial defaults */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Coins className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Alíquotas Padrão de Precificação</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Alíquota Média de Imposto Simples (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={taxRate}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Comissão Padrão de Vendas (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Configurações do Rodapé (Pagamentos, Entregas, Segurança) */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Layers className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Formas de Exibição do Rodapé</h3>
                  </div>
                  
                  {/* Formas de Pagamento */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-extrabold text-primary uppercase block">Formas de Pagamento Aceitas</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {renderBadgeConfigItem("Visa", payVisa, setPayVisa, imgVisa, setImgVisa, DUMMY_COMPANY.img_payments_visa || '')}
                      {renderBadgeConfigItem("Mastercard", payMastercard, setPayMastercard, imgMastercard, setImgMastercard, DUMMY_COMPANY.img_payments_mastercard || '')}
                      {renderBadgeConfigItem("Elo", payElo, setPayElo, imgElo, setImgElo, DUMMY_COMPANY.img_payments_elo || '')}
                      {renderBadgeConfigItem("Hipercard", payHipercard, setPayHipercard, imgHipercard, setImgHipercard, DUMMY_COMPANY.img_payments_hipercard || '')}
                      {renderBadgeConfigItem("Diners Club", payDiners, setPayDiners, imgDiners, setImgDiners, DUMMY_COMPANY.img_payments_diners || '')}
                      {renderBadgeConfigItem("Amex", payAmex, setPayAmex, imgAmex, setImgAmex, DUMMY_COMPANY.img_payments_amex || '')}
                      {renderBadgeConfigItem("Boleto Bancário", payBoleto, setPayBoleto, imgBoleto, setImgBoleto, DUMMY_COMPANY.img_payments_boleto || '')}
                      {renderBadgeConfigItem("Transferência", payTransferencia, setPayTransferencia, imgTransferencia, setImgTransferencia, DUMMY_COMPANY.img_payments_transferencia || '')}
                      {renderBadgeConfigItem("PIX", payPix, setPayPix, imgPix, setImgPix, DUMMY_COMPANY.img_payments_pix || '')}
                    </div>
                  </div>

                  {/* Formas de Entrega */}
                  <div className="space-y-3 border-t border-border pt-4">
                    <span className="text-[10px] font-extrabold text-primary uppercase block">Formas de Entrega Aceitas</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {renderBadgeConfigItem("SEDEX", delSedex, setDelSedex, imgSedex, setImgSedex, DUMMY_COMPANY.img_delivery_sedex || '')}
                      {renderBadgeConfigItem("PAC", delPac, setDelPac, imgPac, setImgPac, DUMMY_COMPANY.img_delivery_pac || '')}
                      {renderBadgeConfigItem("Correios Geral", delCorreios, setDelCorreios, imgCorreios, setImgCorreios, DUMMY_COMPANY.img_delivery_correios || '')}
                      {renderBadgeConfigItem("Jadlog", delJadlog, setDelJadlog, imgJadlog, setImgJadlog, DUMMY_COMPANY.img_delivery_jadlog || '')}
                      {renderBadgeConfigItem("Motoboy", delMotoboy, setDelMotoboy, imgMotoboy, setImgMotoboy, DUMMY_COMPANY.img_delivery_motoboy || '')}
                    </div>
                  </div>

                  {/* Selos de Segurança */}
                  <div className="space-y-3 border-t border-border pt-4">
                    <span className="text-[10px] font-extrabold text-primary uppercase block">Selos de Segurança</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                      {renderBadgeConfigItem("Let's Encrypt SSL", secLetsencrypt, setSecLetsencrypt, imgLetsencrypt, setImgLetsencrypt, DUMMY_COMPANY.img_security_letsencrypt || '')}
                      {renderBadgeConfigItem("Google Safe Browsing", secGoogle, setSecGoogle, imgGoogle, setImgGoogle, DUMMY_COMPANY.img_security_google || '')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'sistema' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Future Integrations / SaaS Modules */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Layers className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Módulos de Preparação Futura</h3>
                  </div>

                  <div className="space-y-3.5">
                    {/* SaaS Toggle */}
                    <div className="flex items-center justify-between p-3.5 bg-secondary/20 border border-border rounded-xl">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Arquitetura SaaS Multiempresa (Multi-tenant)</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block max-w-md">
                          Isola banco de dados e usuários por empresa. A estrutura de tabelas SQL RLS já está ativa no arquivo `schema.sql`.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSaasEnabled(!saasEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                          saasEnabled ? 'bg-primary' : 'bg-secondary border border-border'
                        }`}
                      >
                        <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                          saasEnabled ? 'translate-x-5.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    {/* Fiscal Toggle */}
                    <div className="flex items-center justify-between p-3.5 bg-secondary/20 border border-border rounded-xl">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Emissão de Notas Fiscais (NF-e, NFS-e)</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block max-w-md">
                          Prepara a API de emissão fiscal automática para prefeituras e receita nacional.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNfeEnabled(!nfeEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                          nfeEnabled ? 'bg-primary' : 'bg-secondary border border-border'
                        }`}
                      >
                        <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                          nfeEnabled ? 'translate-x-5.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    {/* AI Toggle */}
                    <div className="flex items-center justify-between p-3.5 bg-secondary/20 border border-border rounded-xl">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Inteligência Artificial para Precificação e Margem</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block max-w-md">
                          Monitoramento inteligente de mercado para sugerir preços ideais com base nos insumos e concorrência local.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiEnabled(!aiEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                          aiEnabled ? 'bg-primary' : 'bg-secondary border border-border'
                        }`}
                      >
                        <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                          aiEnabled ? 'translate-x-5.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Global save button */}
            {['empresa', 'catalogo', 'financas', 'sistema'].includes(activeTab) && (
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  form="general-settings-form"
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1.5"
                >
                  <Check className="h-4.5 w-4.5" /> Salvar Configurações
                </button>
              </div>
            )}

          </form>



          {/* Balcões de Retirada (outside form) */}
          {activeTab === 'coleta' && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
              <div className="border-b border-border pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4.5 w-4.5 text-primary" />
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Balcões de Retirada / Pontos de Coleta</h3>
                </div>
                {!isAdding && !editingPoint && (
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/95 text-white text-[11px] font-bold shadow-sm transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" /> Novo Ponto de Coleta
                  </button>
                )}
              </div>

              {/* Add/Edit Form */}
              {(isAdding || editingPoint) && (
                <form onSubmit={isAdding ? handleAddPoint : handleUpdatePoint} className="p-4 bg-secondary/20 border border-border rounded-xl space-y-4 animate-in slide-in-from-top duration-200">
                  <div className="flex justify-between items-center border-b border-border pb-2">
                    <span className="font-bold text-xs text-foreground uppercase">
                      {isAdding ? 'Cadastrar Novo Ponto de Coleta' : 'Editar Ponto de Coleta'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setEditingPoint(null);
                        setPointName('');
                        setPointStreet('');
                        setPointNumber('');
                        setPointNeighborhood('');
                        setPointCity('');
                        setPointState('');
                        setPointHoursWeek('');
                        setPointHoursSat('');
                        setPointActive(true);
                      }}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground"
                    >
                      <X className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-3 space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Nome do Ponto de Coleta *</label>
                      <input
                        type="text"
                        required
                        value={pointName}
                        onChange={(e) => setPointName(e.target.value)}
                        placeholder="Ex: Balcão Central Porto Alegre"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Endereço (Rua/Av) *</label>
                      <input
                        type="text"
                        required
                        value={pointStreet}
                        onChange={(e) => setPointStreet(e.target.value)}
                        placeholder="Ex: Av. Alberto Bins"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Número *</label>
                      <input
                        type="text"
                        required
                        value={pointNumber}
                        onChange={(e) => setPointNumber(e.target.value)}
                        placeholder="Ex: 450"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Bairro *</label>
                      <input
                        type="text"
                        required
                        value={pointNeighborhood}
                        onChange={(e) => setPointNeighborhood(e.target.value)}
                        placeholder="Ex: Centro"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Cidade *</label>
                      <input
                        type="text"
                        required
                        value={pointCity}
                        onChange={(e) => setPointCity(e.target.value)}
                        placeholder="Ex: Porto Alegre"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">UF *</label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={pointState}
                        onChange={(e) => setPointState(e.target.value.toUpperCase())}
                        placeholder="Ex: RS"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold text-center focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Horário Segunda a Sexta *</label>
                      <input
                        type="text"
                        required
                        value={pointHoursWeek}
                        onChange={(e) => setPointHoursWeek(e.target.value)}
                        placeholder="Ex: 8h às 12h / 13h30 às 18h"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Horário Sábado</label>
                      <input
                        type="text"
                        value={pointHoursSat}
                        onChange={(e) => setPointHoursSat(e.target.value)}
                        placeholder="Ex: 8h às 12h (ou Fechado)"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-background border border-border rounded-xl">
                      <div>
                        <span className="font-bold text-[10px] text-foreground uppercase block">Ponto Ativo</span>
                        <span className="text-[9px] text-muted-foreground font-medium">Exibir no catálogo</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPointActive(!pointActive)}
                        className={`w-10 h-5.5 rounded-full transition-colors relative flex items-center ${
                          pointActive ? 'bg-emerald-600' : 'bg-secondary border border-border'
                        }`}
                      >
                        <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                          pointActive ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-border/50 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setEditingPoint(null);
                        setPointName('');
                        setPointStreet('');
                        setPointNumber('');
                        setPointNeighborhood('');
                        setPointCity('');
                        setPointState('');
                        setPointHoursWeek('');
                        setPointHoursSat('');
                        setPointActive(true);
                      }}
                      className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-[11px] font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> {isAdding ? 'Confirmar Cadastro' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              )}

              {/* Pickup points list */}
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {pickupPoints && pickupPoints.length > 0 ? (
                  pickupPoints.map((point) => (
                    <div key={point.id} className="p-4 flex items-center justify-between bg-card hover:bg-secondary/10 transition-colors">
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-foreground">{point.name}</span>
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                            point.active 
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/15' 
                              : 'bg-rose-500/10 text-rose-500 border border-rose-500/15'
                          }`}>
                            {point.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          {point.street ? `${point.street}, ${point.number} - ${point.neighborhood}` : point.address} — {point.city}/{point.state}
                        </p>
                        <p className="text-[10px] text-muted-foreground italic">
                          Horário: {point.hours_week ? `Seg-Sex: ${point.hours_week}${point.hours_sat ? ` | Sáb: ${point.hours_sat}` : ''}` : point.hours}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditing(point)}
                          className="p-2 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar Ponto de Coleta"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePoint(point.id)}
                          className="p-2 rounded-lg border border-border hover:bg-rose-500/10 text-rose-500 transition-colors"
                          title="Excluir Ponto de Coleta"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground text-xs italic">
                    Nenhum ponto de coleta cadastrado. Use o botão no topo para cadastrar.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aba Funcionários */}
          {activeTab === 'funcionarios' && activeProfile?.role === 'admin' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header with mini-tabs */}
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-sm uppercase text-foreground">Gestão de Equipe & Acessos</h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    Configure os usuários da gráfica e seus respectivos privilégios de navegação.
                  </p>
                </div>
                
                {/* Mini Tabs */}
                <div className="flex bg-secondary/50 p-1 rounded-xl border border-border/80 text-[11px] font-bold shrink-0">
                  <button
                    type="button"
                    onClick={() => setActivePermissionsTab('employees')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                      activePermissionsTab === 'employees'
                        ? 'bg-card text-foreground shadow-sm border border-border/20'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" /> Colaboradores
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePermissionsTab('permissions')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                      activePermissionsTab === 'permissions'
                        ? 'bg-card text-foreground shadow-sm border border-border/20'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Key className="h-3.5 w-3.5" /> Permissões
                  </button>
                </div>
              </div>

              {activePermissionsTab === 'employees' ? (
                <div className="space-y-6">
                  {/* Quick stats cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Total de Colaboradores</span>
                        <span className="text-xl font-black text-foreground">{profiles?.length || 0}</span>
                      </div>
                      <div className="h-8 w-8 bg-primary/10 text-primary flex items-center justify-center rounded-lg">
                        <Users className="h-4.5 w-4.5" />
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Contas Ativas</span>
                        <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{profiles?.filter(p => p.active).length || 0}</span>
                      </div>
                      <div className="h-8 w-8 bg-emerald-500/10 text-emerald-500 flex items-center justify-center rounded-lg">
                        <Check className="h-4.5 w-4.5" />
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Designers</span>
                        <span className="text-xl font-black text-fuchsia-600 dark:text-fuchsia-400">{profiles?.filter(p => p.role === 'arte_finalista').length || 0}</span>
                      </div>
                      <div className="h-8 w-8 bg-fuchsia-500/10 text-fuchsia-500 flex items-center justify-center rounded-lg">
                        <Layers className="h-4.5 w-4.5" />
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Inativos</span>
                        <span className="text-xl font-black text-rose-600 dark:text-rose-400">{(profiles?.length || 0) - (profiles?.filter(p => p.active).length || 0)}</span>
                      </div>
                      <div className="h-8 w-8 bg-rose-500/10 text-rose-500 flex items-center justify-center rounded-lg">
                        <X className="h-4.5 w-4.5" />
                      </div>
                    </div>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-80">
                      <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={empSearchTerm}
                        onChange={(e) => setEmpSearchTerm(e.target.value)}
                        placeholder="Buscar por nome ou e-mail..."
                        className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-xl text-xs font-semibold focus:outline-none focus:border-primary text-foreground"
                      />
                    </div>

                    <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3 items-center">
                      <select
                        value={empSelectedRole}
                        onChange={(e) => setEmpSelectedRole(e.target.value)}
                        className="w-full sm:w-48 px-3 py-2 bg-secondary/50 border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="all">Todos os Cargos</option>
                        <option value="admin">Administradores</option>
                        <option value="gerente">Gerentes</option>
                        <option value="financeiro">Financeiro</option>
                        <option value="vendas">Vendas</option>
                        <option value="producao">Produção</option>
                        <option value="arte_finalista">Arte Finalista (Designer)</option>
                        <option value="estoque">Estoque</option>
                      </select>

                      <button
                        type="button"
                        onClick={openEmpAddModal}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold shadow-md shadow-primary/10 flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" /> Cadastrar Funcionário
                      </button>
                    </div>
                  </div>

                  {/* Employees Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {profiles && profiles.filter(profile => {
                      const matchesSearch = profile.name.toLowerCase().includes(empSearchTerm.toLowerCase()) || 
                                            profile.email.toLowerCase().includes(empSearchTerm.toLowerCase());
                      const matchesRole = empSelectedRole === 'all' || profile.role === empSelectedRole;
                      return matchesSearch && matchesRole;
                    }).length > 0 ? (
                      profiles.filter(profile => {
                        const matchesSearch = profile.name.toLowerCase().includes(empSearchTerm.toLowerCase()) || 
                                              profile.email.toLowerCase().includes(empSearchTerm.toLowerCase());
                        const matchesRole = empSelectedRole === 'all' || profile.role === empSelectedRole;
                        return matchesSearch && matchesRole;
                      }).map((profile) => {
                        const roleColors: Record<string, { bg: string; text: string; border: string; label: string }> = {
                          admin: { bg: 'bg-violet-500/10', text: 'text-violet-500 dark:text-violet-400', border: 'border-violet-500/20', label: 'Administrador' },
                          gerente: { bg: 'bg-blue-500/10', text: 'text-blue-500 dark:text-blue-400', border: 'border-blue-500/20', label: 'Gerente' },
                          financeiro: { bg: 'bg-emerald-500/10', text: 'text-emerald-500 dark:text-emerald-400', border: 'border-emerald-500/20', label: 'Financeiro' },
                          vendas: { bg: 'bg-amber-500/10', text: 'text-amber-500 dark:text-amber-400', border: 'border-amber-500/20', label: 'Vendas' },
                          producao: { bg: 'bg-orange-500/10', text: 'text-orange-500 dark:text-orange-400', border: 'border-orange-500/20', label: 'Produção' },
                          estoque: { bg: 'bg-slate-500/10', text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-500/20', label: 'Estoque' },
                          arte_finalista: { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-500 dark:text-fuchsia-400', border: 'border-fuchsia-500/20', label: 'Arte Finalista (Designer)' },
                        };
                        const style = roleColors[profile.role] || {
                          bg: 'bg-secondary',
                          text: 'text-muted-foreground',
                          border: 'border-border',
                          label: profile.role,
                        };
                        return (
                          <div 
                            key={profile.id}
                            className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary/20 transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden text-slate-800 dark:text-slate-100"
                          >
                            <div className="flex items-start gap-4">
                              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-indigo-500/20 border border-primary/10 text-primary flex items-center justify-center font-extrabold text-base uppercase shrink-0">
                                {profile.name.charAt(0)}
                              </div>
                              <div className="space-y-1 truncate">
                                <h4 className="font-bold text-foreground text-sm group-hover:text-primary transition-colors truncate">
                                  {profile.name}
                                </h4>
                                <span className={`inline-block px-2.5 py-0.5 rounded-lg border text-[9px] font-extrabold uppercase tracking-wide ${style.bg} ${style.text} ${style.border}`}>
                                  {style.label}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-2 text-xs font-medium text-muted-foreground border-t border-border/40 pt-4">
                              <div className="flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                                <span className="truncate" title={profile.email}>{profile.email}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                                <span>{profile.phone || 'Sem Telefone'}</span>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${profile.active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className={profile.active ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'}>
                                  {profile.active ? 'Status Ativo' : 'Conta Suspensa'}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 border-t border-border/40 pt-4 mt-1">
                              <button
                                type="button"
                                onClick={() => openEmpEditModal(profile)}
                                className="flex-1 py-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Edit2 className="h-3.5 w-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEmpDelete(profile.id, profile.name)}
                                className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                                title="Excluir Colaborador"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-full py-16 text-center text-muted-foreground text-xs italic bg-card border border-dashed border-border rounded-2xl">
                        Nenhum funcionário encontrado com os filtros atuais.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-secondary/10">
                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm uppercase text-foreground">Definições de Controle de Acesso</h3>
                      <p className="text-xs text-muted-foreground">
                        Marque os módulos que cada cargo de colaborador está autorizado a visualizar e operar no sistema.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleEmpSavePermissions}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold shadow-md shadow-primary/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="h-4 w-4" /> Salvar Configurações de Acesso
                    </button>
                  </div>

                  <div className="px-6 py-3.5 bg-violet-500/5 border-b border-border/80 flex items-start gap-2.5">
                    <ShieldAlert className="h-4.5 w-4.5 text-violet-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-violet-600 dark:text-violet-400 font-medium leading-relaxed">
                      <span className="font-extrabold uppercase text-[10px]">Restrição de Segurança:</span> O cargo de <strong className="font-bold">Administrador (Admin)</strong> possui acesso irrestrito por padrão para evitar travamento acidental de acesso. As permissões de Admin não podem ser desativadas.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-secondary/30">
                          <th className="p-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider min-w-[240px]">Módulo do Sistema</th>
                          {[
                            { key: 'admin', label: 'Admin' },
                            { key: 'gerente', label: 'Gerente' },
                            { key: 'financeiro', label: 'Financeiro' },
                            { key: 'vendas', label: 'Vendas' },
                            { key: 'producao', label: 'Produção' },
                            { key: 'arte_finalista', label: 'Designer' },
                            { key: 'estoque', label: 'Estoque' }
                          ].map(role => (
                            <th key={role.key} className="p-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
                              {role.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {SYSTEM_MODULES.map(mod => (
                          <tr key={mod.path} className="hover:bg-secondary/20 transition-all group">
                            <td className="p-4 space-y-1">
                              <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-secondary border border-border group-hover:border-primary/20 transition-all">
                                  {getModuleIcon(mod.path)}
                                </div>
                                <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{mod.label}</span>
                                <span className="text-[9px] font-mono text-muted-foreground/60 bg-secondary/50 px-1.5 py-0.5 rounded border border-border/40">{mod.path}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground pl-9 font-medium max-w-xl leading-relaxed">
                                {mod.desc}
                              </p>
                            </td>
                            {[
                              { key: 'admin', label: 'Admin' },
                              { key: 'gerente', label: 'Gerente' },
                              { key: 'financeiro', label: 'Financeiro' },
                              { key: 'vendas', label: 'Vendas' },
                              { key: 'producao', label: 'Produção' },
                              { key: 'arte_finalista', label: 'Designer' },
                              { key: 'estoque', label: 'Estoque' }
                            ].map(role => {
                              const isChecked = tempPermissions[mod.path]?.includes(role.key) || false;
                              const isDisabled = role.key === 'admin';
                              return (
                                <td key={role.key} className="p-4 text-center">
                                  <label className="inline-flex items-center justify-center p-1 cursor-pointer rounded-lg hover:bg-secondary/40 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={isDisabled}
                                      onChange={() => handleEmpCheckboxChange(mod.path, role.key)}
                                      className={`h-4.5 w-4.5 rounded border-border text-primary focus:ring-primary/30 transition-all cursor-pointer ${
                                        isDisabled ? 'opacity-50 cursor-not-allowed text-violet-500 bg-violet-500/10' : ''
                                      }`}
                                    />
                                  </label>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Add/Edit Modal inside tab */}
              {empIsModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center py-6 px-4">
                  <div className="bg-card border border-border rounded-3xl w-full max-w-md shadow-2xl p-6 text-foreground space-y-5 animate-in zoom-in-95 duration-200" style={{ borderRadius: '10px' }}>
                    <div className="flex justify-between items-center border-b border-border pb-3">
                      <h3 className="font-bold text-sm uppercase flex items-center gap-2">
                        <Users className="h-4.5 w-4.5 text-primary" />
                        <span>{empEditingProfile ? 'Editar Funcionário' : 'Novo Funcionário'}</span>
                      </h3>
                      <button 
                        type="button"
                        onClick={() => setEmpIsModalOpen(false)}
                        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <form onSubmit={handleEmpSubmit} className="space-y-4">
                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Nome Completo *</label>
                        <input
                          type="text"
                          required
                          value={empFormName}
                          onChange={(e) => setEmpFormName(e.target.value)}
                          placeholder="Ex: Geraldo da Silva"
                          className="w-full px-3.5 py-2 bg-secondary/50 border border-border rounded-xl font-semibold text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">E-mail de Login *</label>
                        <input
                          type="email"
                          required
                          value={empFormEmail}
                          onChange={(e) => setEmpFormEmail(e.target.value)}
                          placeholder="Ex: geraldo@suagrafica.com"
                          className="w-full px-3.5 py-2 bg-secondary/50 border border-border rounded-xl font-semibold text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Telefone / WhatsApp</label>
                        <input
                          type="text"
                          value={empFormPhone}
                          onChange={(e) => setEmpFormPhone(e.target.value)}
                          placeholder="Ex: (51) 98765-4321"
                          className="w-full px-3.5 py-2 bg-secondary/50 border border-border rounded-xl font-semibold text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Nível de Acesso (Cargo) *</label>
                        <select
                          value={empFormRole}
                          onChange={(e) => setEmpFormRole(e.target.value as any)}
                          className="w-full px-3.5 py-2 bg-secondary/50 border border-border rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                        >
                          <option value="admin">Administrador (Acesso Geral)</option>
                          <option value="gerente">Gerente (Acesso Administrativo)</option>
                          <option value="financeiro">Financeiro (Contas/DRE/Vendas)</option>
                          <option value="vendas">Vendas (Clientes/Orçamentos/PDV)</option>
                          <option value="producao">Produção (Kanban OS/Estoque/Expedição)</option>
                          <option value="arte_finalista">Arte Finalista / Designer (Kanban OS/Pedidos)</option>
                          <option value="estoque">Estoque (Insumos/Logística)</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-secondary/20 border border-border rounded-2xl">
                        <div className="text-xs">
                          <span className="font-bold text-[10px] text-foreground uppercase block">Conta Ativa</span>
                          <span className="text-[9px] text-muted-foreground font-medium">Permitir login e simulação</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEmpFormActive(!empFormActive)}
                          className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                            empFormActive ? 'bg-primary' : 'bg-secondary border border-border'
                          }`}
                        >
                          <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                            empFormActive ? 'translate-x-5.5' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>

                      <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                        <button
                          type="button"
                          onClick={() => setEmpIsModalOpen(false)}
                          className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold shadow-sm"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold flex items-center gap-1 shadow-md shadow-primary/10"
                        >
                          <Check className="h-4 w-4" /> {empEditingProfile ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Avançado & Sistema Danger Zone */}
          {activeTab === 'sistema' && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
              <div className="border-b border-border pb-3 flex items-center gap-2 text-rose-500">
                <Trash2 className="h-4.5 w-4.5" />
                <h3 className="font-bold text-sm uppercase tracking-wide">Área de Perigo</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                A limpeza de dados apagará permanentemente todos os registros operacionais do sistema (como clientes, produtos, categorias, orçamentos, pedidos, produção e financeiro), deixando a plataforma limpa e pronta para uso real. As configurações da empresa e colaboradores serão mantidos. Esta ação é definitiva.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Deseja realmente apagar todos os registros do sistema (clientes, produtos, categorias, orçamentos, pedidos, etc.)? Isso deixará a sua plataforma vazia para uso real. Esta ação não poderá ser desfeita.')) {
                    resetDatabase();
                  }
                }}
                className="px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-semibold transition-all shadow-md shadow-rose-500/5"
              >
                Limpar Todos os Dados
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
