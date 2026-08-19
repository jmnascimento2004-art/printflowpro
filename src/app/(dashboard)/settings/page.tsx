'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { 
  Settings, 
  Key, 
  DollarSign, 
  Users, 
  Coins, 
  Building2, 
  FileText, 
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
  ExternalLink,
  FileClock,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { useDatabase, DEFAULT_ROLE_PERMISSIONS } from '@/context/database-context';
import { useAuth } from '@/context/auth-context';
import { validateCNPJ, formatCNPJ, validateCEP, formatCEP, formatCurrencyInput, parseCurrencyInputToNumber, normalizeRichTextHtml, onlyPhoneDigits, getBrazilianPhoneDisplay } from '@/lib/utils';
import { lookupCNPJ } from '@/lib/cnpj-lookup';
import { DUMMY_COMPANY, PickupPoint, UserProfile, type Company } from '@/lib/dummy-data';
import { warnCaught } from '@/lib/safe-log';
import { RichTextEditor } from '@/components/rich-text-editor';
import { supabase } from '@/lib/supabaseClient';
import {
  getEmployeeAvatarStoragePath,
  removeEmployeeAvatar,
  uploadEmployeeAvatar,
  validateEmployeeAvatar,
} from '@/lib/employee-avatars';
import {
  CATALOG_BENEFIT_ICON_OPTIONS,
  catalogBenefitCardsToCompanyPatch,
  getCatalogBenefitCards,
  type CatalogBenefitCard
} from '@/lib/store/catalog-visual-settings';
import { CatalogNavigationSettings } from '@/components/settings/catalog-navigation-settings';
import { AuditLogPanel } from '@/components/settings/audit-log-panel';

type EmployeeRole = 'admin' | 'gerente' | 'financeiro' | 'vendas' | 'producao' | 'estoque' | 'arte_finalista';
type SettingsTab = 'empresa' | 'catalogo' | 'financas' | 'coleta' | 'funcionarios' | 'auditoria' | 'sistema';

const SYSTEM_MODULES = [
  { path: '/dashboard', label: 'Dashboard', desc: 'Resumo geral, estatísticas de vendas, status de produção e fluxo financeiro simplificado.' },
  { path: '/pos', label: 'PDV / Caixa', desc: 'Vendas rápidas presenciais, abertura e fechamento de caixa, sangrias e suprimentos.' },
  { path: '/crm', label: 'Clientes', desc: 'Cadastro de clientes, histórico de compras e contatos.' },
  { path: '/products', label: 'Produtos e Serviços', desc: 'Cadastro de materiais, serviços de impressão, acabamentos e preços base.' },
  { path: '/quotes', label: 'Orçamentos', desc: 'Geração de propostas comerciais e conversão em pedidos de venda.' },
  { path: '/pricing', label: 'Precificação / Calculadora', desc: 'Simulador avançado de custos de impressão, m² e margens.' },
  { path: '/orders', label: 'Pedidos / OS', desc: 'Controle de ordens de serviço, faturamento e fluxo de status.' },
  { path: '/production', label: 'Fila de Produção', desc: 'Quadro Kanban de ordens de serviço em impressão, acabamento e arte.' },
  { path: '/financial', label: 'Financeiro', desc: 'Lançamentos de contas a pagar e receber, DRE dinâmico e movimentações.' },
  { path: '/stock', label: 'Estoque / Insumos', desc: 'Controle de bobinas, chapas, tintas e alertas de estoque mínimo.' },
  { path: '/shipment', label: 'Expedição / Entregas', desc: 'Roteirização de entregas, motoboy, transportadoras e retiradas.' },
  { path: '/resale', label: 'Módulo Revenda', desc: 'Integração de pedidos e compras de parceiros terceirizados.' },
  { path: '/settings', label: 'Configurações Gráfica', desc: 'Dados da empresa, finanças, equipe, integrações e segurança.' }
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
  const { activeProfile, setActiveProfile } = useAuth();
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
    categories,
    updateCategoryCatalogPresentation,
    profiles,
    addProfile,
    updateProfile,
    deleteProfile,
    rolePermissions,
    updateRolePermissions
  } = useDatabase();

  const [activeTab, setActiveTab] = useState<SettingsTab>('empresa');

  const [pixKey, setPixKey] = useState(settings.pix_key || 'financeiro@printflowpro.com.br');
  const [pixKeyType, setPixKeyType] = useState(settings.pix_key_type || 'email');
  const [pixBeneficiaryName, setPixBeneficiaryName] = useState(settings.pix_beneficiary_name || company.name || '');
  const [bankName, setBankName] = useState(settings.bank_name || 'Banco Sicoob');

  // Company Form State
  const [compName, setCompName] = useState(company.name || '');
  const [compDocument, setCompDocument] = useState(company.document || '');
  const [compLogoLight, setCompLogoLight] = useState(company.logo_light || '');
  const [compLogoDark, setCompLogoDark] = useState(company.logo_dark || '');
  const [compFavicon, setCompFavicon] = useState(company.favicon || '');
  const [compThemeColor, setCompThemeColor] = useState(company.theme_color || 'violet');
  const [compAdminDomain, setCompAdminDomain] = useState(company.admin_domain || '');
  const [compStoreDomain, setCompStoreDomain] = useState(company.store_domain || company.custom_domain || '');
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
  const [compRefundPolicy, setCompRefundPolicy] = useState(normalizeRichTextHtml(company.refund_policy || ''));

  const [benefitCards, setBenefitCards] = useState<CatalogBenefitCard[]>(() => getCatalogBenefitCards(company));

  // Payments / Delivery / Security toggles
  const [payVisa, setPayVisa] = useState(company.show_payments_visa !== false);
  const [payMastercard, setPayMastercard] = useState(company.show_payments_mastercard !== false);
  const [payElo, setPayElo] = useState(company.show_payments_elo !== false);
  const [payHipercard, setPayHipercard] = useState(company.show_payments_hipercard !== false);
  const [payBoleto, setPayBoleto] = useState(company.show_payments_boleto === true);
  const [payTransferencia, setPayTransferencia] = useState(company.show_payments_transferencia === true);
  const [payPix, setPayPix] = useState(company.show_payments_pix !== false);

  const [delSedex, setDelSedex] = useState(company.show_delivery_sedex !== false);
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
  const [cnpjLookupStatus, setCnpjLookupStatus] = useState('');
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
    if (['Diners Club', 'Amex', 'Boleto Bancário', 'Transferência', 'PAC'].includes(label)) {
      return null;
    }

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
    setCnpjLookupStatus('');
    const clean = formatted.replace(/\D/g, '');

    if (clean.length === 14) {
      const isValid = validateCNPJ(clean);
      setCnpjError(!isValid);

      if (isValid) {
        setCnpjLookupStatus('Consultando CNPJ...');
        try {
          const data = await lookupCNPJ(clean);
          setCompName(data.razaoSocial || data.nomeFantasia || compName);
          setCompPhone(getBrazilianPhoneDisplay(data.telefone || compPhone));
          setCompEmail(data.email || compEmail);
          setCompCEP(data.cep || compCEP);
          setCompStreet(data.logradouro || compStreet);
          setCompNumber(data.numero || compNumber);
          setCompNeighborhood(data.bairro || compNeighborhood);
          setCompCity(data.municipio || compCity);
          setCompState(data.uf || compState);
          setCnpjLookupStatus('Dados da empresa preenchidos automaticamente.');
        } catch (e) {
          warnCaught('Erro ao consultar CNPJ da empresa:', e);
          setCnpjLookupStatus(e instanceof Error ? e.message : 'Não foi possível consultar o CNPJ.');
        }
      }
    } else {
      setCnpjError(false);
    }
  };

  const handleCatalogWhatsAppChange = (value: string) => {
    const digits = onlyPhoneDigits(value).slice(0, 13);
    setCatalogWhatsApp(getBrazilianPhoneDisplay(digits) || digits);
  };

  const handleCompanyPhoneChange = (value: string) => {
    const digits = onlyPhoneDigits(value).slice(0, 13);
    setCompPhone(getBrazilianPhoneDisplay(digits) || digits);
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
          warnCaught('Erro capturado:', e);
        }
      }
    } else {
      setCepError(false);
    }
  };

  // CRUD Local State for Pickup Points
  const [isAdding, setIsAdding] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PickupPoint | null>(null);

  const [pointName, setPointName] = useState('');
  const [pointStreet, setPointStreet] = useState('');
  const [pointNumber, setPointNumber] = useState('');
  const [pointNeighborhood, setPointNeighborhood] = useState('');
  const [pointCity, setPointCity] = useState('');
  const [pointState, setPointState] = useState('');
  const [pointHoursWeek, setPointHoursWeek] = useState('');
  const [pointHoursSat, setPointHoursSat] = useState('');
  const [pointActive, setPointActive] = useState(true);
  const [profitMarginRate, setProfitMarginRate] = useState(settings.profit_margin !== undefined && settings.profit_margin !== null ? settings.profit_margin : 40.0);
  const [taxRate, setTaxRate] = useState(settings.tax_rate !== undefined && settings.tax_rate !== null ? settings.tax_rate : 6.0);
  const [commissionRate, setCommissionRate] = useState(settings.commission_rate !== undefined && settings.commission_rate !== null ? settings.commission_rate : 5.0);

  useEffect(() => {
    setProfitMarginRate(settings.profit_margin !== undefined && settings.profit_margin !== null ? settings.profit_margin : 40.0);
    setTaxRate(settings.tax_rate !== undefined && settings.tax_rate !== null ? settings.tax_rate : 6.0);
    setCommissionRate(settings.commission_rate !== undefined && settings.commission_rate !== null ? settings.commission_rate : 5.0);
  }, [settings.profit_margin, settings.tax_rate, settings.commission_rate]);

  // Storefront Header & Footer Customization State
  const [topBarHours, setTopBarHours] = useState(settings.top_bar_hours || 'Segunda à Sexta: 8h às 12h / 13h30 às 18h');
  const [topBarShowPickup, setTopBarShowPickup] = useState(settings.top_bar_show_pickup !== false);
  const [topBarPhone, setTopBarPhone] = useState(settings.top_bar_phone || '');
  const [catalogWhatsApp, setCatalogWhatsApp] = useState(getBrazilianPhoneDisplay(settings.catalog_whatsapp || ''));
  const [footerShowAddress, setFooterShowAddress] = useState(settings.footer_show_address !== false);
  const [catalogPromotionsSectionEnabled, setCatalogPromotionsSectionEnabled] = useState(settings.catalog_promotions_section_enabled !== false);
  const [catalogBestsellersSectionEnabled, setCatalogBestsellersSectionEnabled] = useState(settings.catalog_bestsellers_section_enabled !== false);
  const [catalogHighlightsSectionEnabled, setCatalogHighlightsSectionEnabled] = useState(
    settings.catalog_highlights_section_enabled ?? settings.catalog_promotions_section_enabled ?? true
  );
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

  const normalizeCustomDomainInput = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return '';
    return trimmed.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '');
  };

  const updateBenefitCard = (slot: CatalogBenefitCard['slot'], patch: Partial<CatalogBenefitCard>) => {
    setBenefitCards((current) => current.map((card) => card.slot === slot ? { ...card, ...patch } : card));
  };

  const moveBenefitCard = (slot: CatalogBenefitCard['slot'], direction: -1 | 1) => {
    setBenefitCards((current) => {
      const index = current.findIndex((card) => card.slot === slot);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  useEffect(() => {
    setPixKey(settings.pix_key || 'financeiro@printflowpro.com.br');
    setPixKeyType(settings.pix_key_type || 'email');
    setPixBeneficiaryName(settings.pix_beneficiary_name || company.name || '');
    setBankName(settings.bank_name || 'Banco Sicoob');
    setCompanyAddress(settings.company_address || 'Av. Paulista, 1000 - Bela Vista, Sao Paulo - SP, 01310-100');
    setDeliveryMotoboyPriceKm(settings.delivery_motoboy_price_km !== undefined && settings.delivery_motoboy_price_km !== null ? settings.delivery_motoboy_price_km : 2.50);
    setDeliveryCarPriceKm(settings.delivery_car_price_km !== undefined && settings.delivery_car_price_km !== null ? settings.delivery_car_price_km : 4.50);
    setDeliveryMinFee(settings.delivery_min_fee !== undefined && settings.delivery_min_fee !== null ? settings.delivery_min_fee : 10.00);
    setTopBarHours(settings.top_bar_hours || 'Segunda a Sexta: 8h as 12h / 13h30 as 18h');
    setTopBarShowPickup(settings.top_bar_show_pickup !== false);
    setTopBarPhone(settings.top_bar_phone || '');
    setCatalogWhatsApp(getBrazilianPhoneDisplay(settings.catalog_whatsapp || ''));
    setFooterShowAddress(settings.footer_show_address !== false);
    setCatalogPromotionsSectionEnabled(settings.catalog_promotions_section_enabled !== false);
    setCatalogBestsellersSectionEnabled(settings.catalog_bestsellers_section_enabled !== false);
    setCatalogHighlightsSectionEnabled(
      settings.catalog_highlights_section_enabled ?? settings.catalog_promotions_section_enabled ?? true
    );
    setFooterHoursMessage(settings.footer_hours_message || '*Atendimento presencial com hora marcada*');
    setFooterHoursWeek(settings.footer_hours_week || '8h as 12h / 13h30 as 18h');
    setFooterHoursSat(settings.footer_hours_sat || 'Segunda a Sexta-feira');
    setFooterHoursSatTime(settings.footer_hours_sat_time || 'Fechado');
    setFooterHoursSatDesc(settings.footer_hours_sat_desc || 'Sabado');
    setSaasEnabled(settings.saas_enabled !== undefined ? settings.saas_enabled : true);
    setNfeEnabled(settings.nfe_enabled || false);
    setAiEnabled(settings.ai_enabled || false);
  }, [settings, company.name]);

  useEffect(() => {
    setCompName(company.name || '');
    setCompDocument(company.document || '');
    setCompLogoLight(company.logo_light || '');
    setCompLogoDark(company.logo_dark || '');
    setCompFavicon(company.favicon || '');
    setCompThemeColor(company.theme_color || 'violet');
    setCompAdminDomain(company.admin_domain || '');
    setCompStoreDomain(company.store_domain || company.custom_domain || '');
    setCompPhone(getBrazilianPhoneDisplay(company.phone || ''));
    setCompEmail(company.email || '');
    setCompCEP(company.cep || '');
    setCompStreet(company.street || '');
    setCompNumber(company.number || '');
    setCompNeighborhood(company.neighborhood || '');
    setCompCity(company.city || '');
    setCompState(company.state || '');
    setCompInstagram(company.instagram_url || '');
    setCompFacebook(company.facebook_url || '');
    setCompYoutube(company.youtube_url || '');
    setCompRefundPolicy(normalizeRichTextHtml(company.refund_policy || ''));

    setBenefitCards(getCatalogBenefitCards(company));

    setPayVisa(company.show_payments_visa !== false);
    setPayMastercard(company.show_payments_mastercard !== false);
    setPayElo(company.show_payments_elo !== false);
    setPayHipercard(company.show_payments_hipercard !== false);
    setPayBoleto(company.show_payments_boleto === true);
    setPayTransferencia(company.show_payments_transferencia === true);
    setPayPix(company.show_payments_pix !== false);
    setDelSedex(company.show_delivery_sedex !== false);
    setDelCorreios(company.show_delivery_correios !== false);
    setDelJadlog(company.show_delivery_jadlog !== false);
    setDelMotoboy(company.show_delivery_motoboy !== false);
    setSecLetsencrypt(company.show_security_letsencrypt !== false);
    setSecGoogle(company.show_security_google !== false);

    setImgVisa(company.img_payments_visa || '');
    setImgMastercard(company.img_payments_mastercard || '');
    setImgElo(company.img_payments_elo || '');
    setImgHipercard(company.img_payments_hipercard || '');
    setImgDiners(company.img_payments_diners || '');
    setImgAmex(company.img_payments_amex || '');
    setImgBoleto(company.img_payments_boleto || '');
    setImgTransferencia(company.img_payments_transferencia || '');
    setImgPix(company.img_payments_pix || '');
    setImgSedex(company.img_delivery_sedex || '');
    setImgPac(company.img_delivery_pac || '');
    setImgCorreios(company.img_delivery_correios || '');
    setImgJadlog(company.img_delivery_jadlog || '');
    setImgMotoboy(company.img_delivery_motoboy || '');
    setImgLetsencrypt(company.img_security_letsencrypt || '');
    setImgGoogle(company.img_security_google || '');
  }, [company]);

  // Safeguard: redirect if not admin and on funcionarios tab
  useEffect(() => {
    if (['funcionarios', 'auditoria'].includes(activeTab) && activeProfile?.role !== 'admin') {
      setActiveTab('empresa');
    }
  }, [activeTab, activeProfile]);

  // Suggest an initial delivery origin only when no custom routing address exists yet.
  useEffect(() => {
    if (!settings.company_address && (compStreet || compNumber || compNeighborhood || compCity || compState || compCEP)) {
      setCompanyAddress(`${compStreet}, ${compNumber} - ${compNeighborhood}, ${compCity} - ${compState}${compCEP ? `, CEP ${compCEP}` : ''}`);
    }
  }, [settings.company_address, compStreet, compNumber, compNeighborhood, compCity, compState, compCEP]);

  // Employee-related state variables
  const [empSearchTerm, setEmpSearchTerm] = useState('');
  const [empSelectedRole, setEmpSelectedRole] = useState('all');
  const [empIsModalOpen, setEmpIsModalOpen] = useState(false);
  const [empIsSaving, setEmpIsSaving] = useState(false);
  const [empFormError, setEmpFormError] = useState('');
  const [empAvatarFile, setEmpAvatarFile] = useState<File | null>(null);
  const [empEditingProfile, setEmpEditingProfile] = useState<UserProfile | null>(null);
  
  const [empFormName, setEmpFormName] = useState('');
  const [empFormEmail, setEmpFormEmail] = useState('');
  const [empFormPhone, setEmpFormPhone] = useState('');
  const [empFormAvatar, setEmpFormAvatar] = useState('');
  const [empFormRole, setEmpFormRole] = useState<EmployeeRole>('vendas');
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
    setEmpFormAvatar('');
    setEmpAvatarFile(null);
    setEmpFormError('');
    setEmpFormRole('vendas');
    setEmpFormActive(true);
    setEmpIsModalOpen(true);
  };

  const openEmpEditModal = (profile: UserProfile) => {
    setEmpEditingProfile(profile);
    setEmpFormName(profile.name);
    setEmpFormEmail(profile.email);
    setEmpFormPhone(profile.phone || '');
    setEmpFormAvatar(profile.avatar_url || '');
    setEmpAvatarFile(null);
    setEmpFormError('');
    setEmpFormRole(profile.role as EmployeeRole);
    setEmpFormActive(profile.active);
    setEmpIsModalOpen(true);
  };

  const handleEmpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empFormName.trim() || !empFormEmail.trim()) {
      alert('Nome e E-mail são obrigatórios!');
      return;
    }

    setEmpIsSaving(true);
    setEmpFormError('');
    let uploadedAvatarPath: string | null = null;
    try {
      let avatarUrl = empFormAvatar || null;
      const profileIdForUpload = empEditingProfile?.id || crypto.randomUUID();

      if (empAvatarFile) {
        const upload = await uploadEmployeeAvatar(supabase, empAvatarFile, {
          companyId: empEditingProfile?.company_id || company.id,
          profileId: profileIdForUpload,
        });
        avatarUrl = upload.publicUrl;
        uploadedAvatarPath = upload.path;
      }

      if (empEditingProfile) {
        const updatedProfile: UserProfile = {
          ...empEditingProfile,
          name: empFormName,
          email: empFormEmail,
          phone: empFormPhone,
          avatar_url: avatarUrl,
          role: empFormRole,
          active: empFormActive
        };
        const persistedProfile = await updateProfile(updatedProfile);
        if (activeProfile.id === persistedProfile.id) {
          setActiveProfile(persistedProfile);
        }
        const previousAvatarPath = getEmployeeAvatarStoragePath(empEditingProfile.avatar_url);
        if (previousAvatarPath && previousAvatarPath !== uploadedAvatarPath && previousAvatarPath !== getEmployeeAvatarStoragePath(avatarUrl)) {
          void removeEmployeeAvatar(supabase, previousAvatarPath).catch((cleanupError) => {
            warnCaught('Não foi possível remover a foto anterior do funcionário:', cleanupError);
          });
        }
        setNotification('Funcionário atualizado com sucesso!');
      } else {
        addProfile({
          name: empFormName,
          email: empFormEmail,
          phone: empFormPhone,
          avatar_url: avatarUrl,
          role: empFormRole,
          active: empFormActive
        });
        setNotification('Funcionário cadastrado com sucesso!');
      }

      setEmpIsModalOpen(false);
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      if (uploadedAvatarPath) {
        void removeEmployeeAvatar(supabase, uploadedAvatarPath).catch((cleanupError) => {
          warnCaught('Não foi possível limpar o avatar após falha ao salvar:', cleanupError);
        });
      }
      const message = error instanceof Error ? error.message : 'A alteração não foi confirmada pelo banco de dados.';
      setEmpFormError(`Não foi possível salvar o funcionário. ${message}`);
    } finally {
      setEmpIsSaving(false);
    }
  };

  const handleEmpAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateEmployeeAvatar(file);
    if (!validation.valid) {
      setEmpFormError(validation.message);
      event.target.value = '';
      return;
    }

    setEmpFormError('');
    setEmpAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setEmpFormAvatar(reader.result as string);
    reader.onerror = () => setEmpFormError('Não foi possível carregar a foto selecionada.');
    reader.readAsDataURL(file);
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
      link: bannerLink || undefined,
      placement: 'hero',
      active: true,
      sort_order: banners.filter((banner) => (banner.placement || 'hero') === 'hero').length
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

  const startEditing = (point: PickupPoint) => {
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

  const normalizeSocialHandle = (value: string) => {
  const clean = value
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/^instagram\.com\//i, '')
    .replace(/^facebook\.com\//i, '')
    .replace(/^youtube\.com\//i, '')
    .replace(/^@/, '')
    .replace(/^\/+/, '');

  return clean ? `/${clean}` : '';
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
      pix_beneficiary_name: pixBeneficiaryName,
      bank_name: bankName,
      profit_margin: Number(profitMarginRate),
      tax_rate: Number(taxRate),
      commission_rate: Number(commissionRate),
      top_bar_hours: topBarHours,
      top_bar_show_pickup: topBarShowPickup,
      top_bar_phone: topBarPhone,
      catalog_whatsapp: onlyPhoneDigits(catalogWhatsApp),
      footer_show_address: footerShowAddress,
      catalog_promotions_section_enabled: catalogPromotionsSectionEnabled,
      catalog_bestsellers_section_enabled: catalogBestsellersSectionEnabled,
      catalog_highlights_section_enabled: catalogHighlightsSectionEnabled,
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
      admin_domain: normalizeCustomDomainInput(compAdminDomain),
      store_domain: normalizeCustomDomainInput(compStoreDomain),
      custom_domain: normalizeCustomDomainInput(compStoreDomain),
      custom_domain_status: normalizeCustomDomainInput(compAdminDomain) || normalizeCustomDomainInput(compStoreDomain) ? (company.custom_domain_status === 'active' ? 'active' : 'pending') : 'not_configured',
      custom_domain_verified_at: normalizeCustomDomainInput(compAdminDomain) || normalizeCustomDomainInput(compStoreDomain) ? company.custom_domain_verified_at || null : null,
      phone: getBrazilianPhoneDisplay(compPhone),
      email: compEmail,
      cep: compCEP,
      street: compStreet,
      number: compNumber,
      neighborhood: compNeighborhood,
      city: compCity,
      state: compState,
      instagram_url: normalizeSocialHandle(compInstagram),
      facebook_url: normalizeSocialHandle(compFacebook),
      youtube_url: normalizeSocialHandle(compYoutube),
      refund_policy: normalizeRichTextHtml(compRefundPolicy),
      show_payments_visa: payVisa,
      show_payments_mastercard: payMastercard,
      show_payments_elo: payElo,
      show_payments_hipercard: payHipercard,
      show_payments_diners: false,
      show_payments_amex: false,
      show_payments_boleto: false,
      show_payments_transferencia: false,
      show_payments_pix: payPix,
      show_delivery_sedex: delSedex,
      show_delivery_pac: false,
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
      ...catalogBenefitCardsToCompanyPatch(benefitCards)
    } as Company);

    setNotification('Configurações atualizadas com sucesso!');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      {notification && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in duration-300">
          {notification}
        </div>
      )}

      <div className="flex min-w-0 flex-col items-start gap-4 sm:gap-6 xl:flex-row">
        {/* Sidebar Abas */}
        <div className="flex w-full min-w-0 shrink-0 flex-row gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2 scrollbar-none xl:w-64 xl:flex-col xl:overflow-x-visible">
          {[
            { id: 'empresa', label: 'Empresa & Marca', icon: Building2 },
            { id: 'financas', label: 'Finanças & Chave Pix', icon: Coins },
            { id: 'coleta', label: 'Balcões de Retirada', icon: MapPin },
            ...(activeProfile?.role === 'admin' ? [{ id: 'funcionarios', label: 'Funcionários & Acessos', icon: Users }] : []),
            ...(activeProfile?.role === 'admin' ? [{ id: 'auditoria', label: 'Logs de Auditoria', icon: FileClock }] : []),
            { id: 'sistema', label: 'Avançado & Sistema', icon: Settings }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-3 text-xs font-semibold transition-all xl:w-full ${
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
        <div className="w-full min-w-0 flex-1 space-y-4 sm:space-y-6">
          {/* Banners do Catálogo (outside form) */}
          {activeTab === 'catalogo' && (
            <div className="animate-in space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm fade-in duration-200 sm:p-6">
              <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Layers className="h-4.5 w-4.5 text-primary" />
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Banners do Catálogo Online (Slider)</h3>
                </div>
                {!isAddingBanner && (
                  <button
                    type="button"
                    onClick={() => setIsAddingBanner(true)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-primary/95 sm:w-auto"
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
                      <div className="flex justify-between items-baseline">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Imagem do Banner *</label>
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Ideal: 1220x300px</span>
                      </div>
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
                      <span className="text-[9px] text-muted-foreground block leading-tight pt-0.5">
                        * Dica: Centralize textos e elementos importantes para evitar cortes em smartphones (onde a imagem é reduzida nas laterais).
                      </span>
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
                {banners && banners.some((banner) => (banner.placement || 'hero') === 'hero') ? (
                  banners.filter((banner) => (banner.placement || 'hero') === 'hero').map((banner) => (
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

          {activeTab === 'catalogo' && (
            <CatalogNavigationSettings
              companyId={company.id}
              categories={categories}
              updateCategory={updateCategoryCatalogPresentation}
              notify={(message) => {
                setNotification(message);
                setTimeout(() => setNotification(null), 3000);
              }}
            />
          )}

          {['empresa', 'catalogo', 'financas', 'sistema'].includes(activeTab) && (
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
                      {cnpjLookupStatus && (
                        <p className={`text-[9px] font-bold ${cnpjLookupStatus.includes('preenchidos') ? 'text-emerald-500' : cnpjLookupStatus.includes('Consultando') ? 'text-primary' : 'text-rose-500'}`}>
                          {cnpjLookupStatus}
                        </p>
                      )}
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
                        onChange={(e) => handleCompanyPhoneChange(e.target.value)}
                        placeholder="Ex: (11) 98765-4321"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">WhatsApp de Vendas</label>
                      <input
                        type="tel"
                        value={catalogWhatsApp}
                        onChange={(e) => handleCatalogWhatsAppChange(e.target.value)}
                        placeholder="Ex: (81) 99274-9650"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                      <p className="text-[9px] text-muted-foreground font-semibold">
                        Usado no rodapé, botão flutuante e atendimento do catálogo. Não substitui o telefone comercial.
                      </p>
                    </div>

                    <div className="space-y-1">
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 col-span-1 md:col-span-1">
                      <div className="space-y-1 sm:col-span-2">
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

                  <div className="border-t border-border pt-4 mt-4">
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3">Domínios Próprios do Cliente</h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Domínio do Admin / SaaS</label>
                        <input
                          type="text"
                          value={compAdminDomain}
                          onChange={(e) => setCompAdminDomain(e.target.value)}
                          onBlur={(e) => setCompAdminDomain(normalizeCustomDomainInput(e.target.value))}
                          placeholder="admin.cibeleprint.com.br"
                          className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none focus:border-primary"
                        />
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                          Use este domínio para o painel administrativo: produtos, pedidos, orçamentos, financeiro e configurações.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Domínio do Catálogo / Loja</label>
                        <input
                          type="text"
                          value={compStoreDomain}
                          onChange={(e) => setCompStoreDomain(e.target.value)}
                          onBlur={(e) => setCompStoreDomain(normalizeCustomDomainInput(e.target.value))}
                          placeholder="store.cibeleprint.com.br"
                          className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none focus:border-primary"
                        />
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                          Use este domínio para o catálogo público que o cliente final acessa para consultar produtos e enviar orçamento.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-2">
                      <p className="text-[10px] font-black uppercase text-primary">Instruções para configurar domínio</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                        <div className="rounded-lg bg-background border border-border p-2">
                          <span className="block text-muted-foreground font-bold uppercase">Tipo</span>
                          <span className="font-black text-foreground">CNAME</span>
                        </div>
                        <div className="rounded-lg bg-background border border-border p-2">
                          <span className="block text-muted-foreground font-bold uppercase">Subdomínios</span>
                          <span className="font-black text-foreground break-all">admin / store</span>
                        </div>
                        <div className="rounded-lg bg-background border border-border p-2">
                          <span className="block text-muted-foreground font-bold uppercase">Destino</span>
                          <span className="font-black text-foreground break-all">Informado pela Vercel</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                        Adicione os domínios no projeto da Vercel e configure os registros DNS conforme as instruções exibidas pela própria Vercel.
                        Depois de configurado, informe os domínios acima para o catálogo reconhecer a empresa corretamente.
                        Copie o CNAME informado pela Vercel e configure no seu provedor de DNS.
                      </p>
                      <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/20 px-2.5 py-1.5">
                        <span className={`h-2 w-2 rounded-full ${compAdminDomain || compStoreDomain ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          {compAdminDomain || compStoreDomain ? 'Configuração manual' : 'Não configurado'}
                        </span>
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

                  {/* Cor do Tema do SaaS e Catálogo */}
                  <div className="border-t border-border pt-4 mt-2">
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3">Cor do Tema do SaaS e Catálogo Online</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end text-xs">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Selecione a Cor Principal</label>
                        <div className="flex gap-2">
                          <select
                            value={['emerald', 'blue', 'violet', 'amber', 'rose'].includes(compThemeColor) ? compThemeColor : 'custom'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setCompThemeColor('#5b3df4');
                              } else {
                                setCompThemeColor(val);
                              }
                            }}
                            className="flex-1 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                          >
                            <option value="emerald">Verde Esmeralda (Padrão)</option>
                            <option value="blue">Azul Real</option>
                            <option value="violet">Roxo Violeta</option>
                            <option value="amber">Laranja / Âmbar</option>
                            <option value="rose">Vermelho / Rosa</option>
                            <option value="custom">Personalizado (Seletor de Cor) 🎨</option>
                          </select>

                          {/* Render color picker next to it if not a standard preset or starts with # */}
                          {(!['emerald', 'blue', 'violet', 'amber', 'rose'].includes(compThemeColor) || compThemeColor.startsWith('#')) && (
                            <div className="relative w-10 h-[38px] shrink-0 rounded-lg border border-border overflow-hidden bg-secondary/50">
                              <input
                                type="color"
                                value={compThemeColor.startsWith('#') ? compThemeColor : '#5b3df4'}
                                onChange={(e) => setCompThemeColor(e.target.value)}
                                className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-3 bg-secondary/10 border border-border rounded-xl h-[38px]">
                        <span className="font-semibold text-muted-foreground text-[10px] uppercase">Amostra:</span>
                        <div 
                          className="h-4 w-4 rounded-full border border-border shrink-0" 
                          style={{
                            backgroundColor: 
                              compThemeColor === 'blue' ? '#2563eb' :
                              compThemeColor === 'violet' ? '#5b3df4' :
                              compThemeColor === 'amber' ? '#d97706' :
                              compThemeColor === 'rose' ? '#e11d48' :
                              compThemeColor === 'emerald' ? '#059669' :
                              compThemeColor
                          }}
                        />
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
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        placeholder="Ex: Rua do fornecedor, 123 - Bairro, Cidade - UF, CEP 00000-000"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none focus:border-primary"
                      />
                      <p className="text-[9px] text-muted-foreground">Este é o ponto de origem usado para calcular a distância em KM no frete. Pode ser o endereço da empresa, fornecedor, parceiro terceirizado ou outro ponto operacional.</p>
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
                        <label className="text-xs font-semibold text-muted-foreground">Telefone da Barra Superior</label>
                        <input
                          type="text"
                          value={topBarPhone}
                          onChange={(e) => setTopBarPhone(e.target.value)}
                          placeholder="Ex: (51) 98765-4321"
                          className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3" data-testid="catalog-showcase-toggles">
                      {[
                        {
                          label: 'Mostrar + Vendidos',
                          help: 'Controla somente a visibilidade do ranking atual.',
                          value: catalogBestsellersSectionEnabled,
                          setValue: setCatalogBestsellersSectionEnabled
                        },
                        {
                          label: 'Mostrar Promoções',
                          help: 'Exibe produtos já marcados como promoção.',
                          value: catalogPromotionsSectionEnabled,
                          setValue: setCatalogPromotionsSectionEnabled
                        },
                        {
                          label: 'Mostrar Destaques',
                          help: 'Exibe produtos já marcados como destaque.',
                          value: catalogHighlightsSectionEnabled,
                          setValue: setCatalogHighlightsSectionEnabled
                        }
                      ].map((section) => (
                        <div key={section.label} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 p-3.5">
                          <div>
                            <span className="block text-xs font-bold text-foreground">{section.label}</span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{section.help}</span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={section.value}
                            aria-label={section.label}
                            onClick={() => section.setValue(!section.value)}
                            className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${section.value ? 'bg-primary' : 'border border-border bg-secondary'}`}
                          >
                            <span className={`absolute h-4 w-4 rounded-full bg-white transition-transform ${section.value ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-secondary/20 border border-border rounded-xl">
                      <div>
                        <span className="font-bold text-xs text-foreground block">Alerta de Retirada Grátis</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                          Exibir &quot;Retire grátis em nossos balcões autorizados&quot; na barra superior do catálogo.
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
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Página Instagram</label>
                      <input
                        type="text"
                        value={compInstagram}
                        onChange={(e) => setCompInstagram(e.target.value)}
                        placeholder="/suapagina"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Página Facebook</label>
                      <input
                        type="text"
                        value={compFacebook}
                        onChange={(e) => setCompFacebook(e.target.value)}
                        placeholder="/suapagina"
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Canal YouTube</label>
                      <input
                        type="text"
                        value={compYoutube}
                        onChange={(e) => setCompYoutube(e.target.value)}
                        placeholder="/seucanal"
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
                    <RichTextEditor
                      value={compRefundPolicy}
                      onChange={setCompRefundPolicy}
                      placeholder="Escreva aqui a política de troca, reembolso e termos de devolução..."
                      minHeightClass="min-h-[170px]"
                    />
                  </div>
                </div>

                {/* Cards de Benefícios do Catálogo */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="border-b border-border pb-3 flex items-center gap-2">
                    <Building2 className="h-4.5 w-4.5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Cards de Benefícios do Catálogo</h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2" data-testid="catalog-benefit-card-settings">
                    {benefitCards.map((card, index) => (
                      <article key={card.slot} className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <span className="block text-[10px] font-extrabold uppercase text-primary">Card {index + 1}</span>
                            <span className="text-[10px] text-muted-foreground">Ordem salva: {index + 1}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => moveBenefitCard(card.slot, -1)} disabled={index === 0} aria-label={`Mover ${card.title} para cima`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                            <button type="button" onClick={() => moveBenefitCard(card.slot, 1)} disabled={index === benefitCards.length - 1} aria-label={`Mover ${card.title} para baixo`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                            <label className="ml-1 flex min-h-11 items-center gap-2 text-xs font-bold text-foreground">
                              <input type="checkbox" checked={card.active} onChange={(event) => updateBenefitCard(card.slot, { active: event.target.checked })} className="h-4 w-4 rounded border-border text-primary" />
                              Ativo
                            </label>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">
                            Título
                            <input type="text" value={card.title} onChange={(event) => updateBenefitCard(card.slot, { title: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-foreground" />
                          </label>
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">
                            Ícone
                            <select value={card.icon} onChange={(event) => updateBenefitCard(card.slot, { icon: event.target.value as CatalogBenefitCard['icon'] })} className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-foreground">
                              {CATALOG_BENEFIT_ICON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className="block text-[10px] font-bold uppercase text-muted-foreground">
                          Texto auxiliar
                          <input type="text" value={card.subtitle} onChange={(event) => updateBenefitCard(card.slot, { subtitle: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-foreground" />
                        </label>
                      </article>
                    ))}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
                      <label className="text-xs font-semibold text-muted-foreground">Nome do Favorecido</label>
                      <input
                        type="text"
                        value={pixBeneficiaryName}
                        onChange={(e) => setPixBeneficiaryName(e.target.value)}
                        placeholder="Ex: CIBELEPRINT"
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Margem Líquida Padrão (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={profitMarginRate}
                        onChange={(e) => setProfitMarginRate(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground font-semibold"
                      />
                    </div>
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

                {/* A exibição do rodapé agora é administrada exclusivamente em /catalog. */}
                {false && <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
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
                </div>}
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
              <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-5 text-blue-800">
                  A identidade visual do aplicativo foi atualizada. Caso o nome ou icone antigo permaneça no seu dispositivo, remova e instale o aplicativo novamente.
                </div>
                <button
                  type="submit"
                  form="general-settings-form"
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex shrink-0 items-center justify-center gap-1.5"
                >
                  <Check className="h-4.5 w-4.5" /> Salvar Configurações
                </button>
              </div>
            )}

          </form>
          )}



          {/* Balcões de Retirada (outside form) */}
          {activeTab === 'coleta' && (
            <div className="animate-in space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm fade-in duration-200 sm:p-6">
              <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-center">
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
                    <div key={point.id} className="flex flex-col items-start justify-between gap-3 bg-card p-4 transition-colors hover:bg-secondary/10 sm:flex-row sm:items-center">
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
            <div className="min-w-0 space-y-4 animate-in fade-in duration-200 sm:space-y-6">
              {/* Header with mini-tabs */}
              <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm lg:flex-row lg:items-center">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-sm uppercase text-foreground">Gestão de Equipe & Acessos</h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    Configure os usuários da gráfica e seus respectivos privilégios de navegação.
                  </p>
                </div>
                
                {/* Mini Tabs */}
                <div className="flex w-full shrink-0 rounded-xl border border-border/80 bg-secondary/50 p-1 text-[11px] font-bold sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setActivePermissionsTab('employees')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 transition-all sm:flex-none ${
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
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 transition-all sm:flex-none ${
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
                  <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm lg:flex-row">
                    <div className="relative w-full lg:w-80">
                      <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={empSearchTerm}
                        onChange={(e) => setEmpSearchTerm(e.target.value)}
                        placeholder="Buscar por nome ou e-mail..."
                        className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-xl text-xs font-semibold focus:outline-none focus:border-primary text-foreground"
                      />
                    </div>

                    <div className="flex w-full flex-col items-center gap-3 sm:flex-row lg:w-auto">
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
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/20 to-indigo-500/20 text-base font-extrabold uppercase text-primary">
                                {profile.avatar_url ? (
                                  <Image
                                    src={profile.avatar_url}
                                    alt={`Foto de ${profile.name}`}
                                    width={48}
                                    height={48}
                                    unoptimized
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  profile.name.charAt(0)
                                )}
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
                <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col items-start justify-between gap-4 border-b border-border bg-secondary/10 p-4 sm:p-6 lg:flex-row lg:items-center">
                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm uppercase text-foreground">Definições de Controle de Acesso</h3>
                      <p className="text-xs text-muted-foreground">
                        Marque os módulos que cada cargo de colaborador está autorizado a visualizar e operar no sistema.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleEmpSavePermissions}
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-md shadow-primary/10 transition-all hover:bg-primary/90 lg:w-auto"
                    >
                      <Check className="h-4 w-4" /> Salvar Configurações de Acesso
                    </button>
                  </div>

                  <div className="flex items-start gap-2.5 border-b border-border/80 bg-violet-500/5 px-4 py-3.5 sm:px-6">
                    <ShieldAlert className="h-4.5 w-4.5 text-violet-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-violet-600 dark:text-violet-400 font-medium leading-relaxed">
                      <span className="font-extrabold uppercase text-[10px]">Restrição de Segurança:</span> O cargo de <strong className="font-bold">Administrador (Admin)</strong> possui acesso irrestrito por padrão para evitar travamento acidental de acesso. As permissões de Admin não podem ser desativadas.
                    </p>
                  </div>

                  <p className="border-b border-border/60 px-4 py-2 text-[10px] font-medium text-muted-foreground lg:hidden">
                    Deslize horizontalmente para consultar todos os cargos.
                  </p>
                  <div className="max-w-full overflow-x-auto overscroll-x-contain">
                    <table className="w-full min-w-[880px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-border bg-secondary/30">
                          <th className="sticky left-0 z-20 min-w-[240px] bg-secondary p-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Módulo do Sistema</th>
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
                            <td className="sticky left-0 z-10 space-y-1 bg-card p-4 group-hover:bg-secondary/20">
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
              {empIsModalOpen && createPortal((
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/65 p-2 backdrop-blur-sm sm:items-center sm:p-6">
                  <div className="animate-in flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl zoom-in-95 duration-200 sm:max-h-[calc(100dvh-3rem)]">
                    <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3.5 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Users className="h-4.5 w-4.5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold">{empEditingProfile ? 'Editar funcionário' : 'Novo funcionário'}</h3>
                          <p className="text-[11px] text-muted-foreground">Dados de acesso, contato e identificação do operador.</p>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setEmpIsModalOpen(false)}
                        disabled={empIsSaving}
                        aria-label="Fechar edição do funcionário"
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <form onSubmit={handleEmpSubmit} className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary/20 p-4 sm:flex-row sm:items-center">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-primary/10 text-xl font-black text-primary shadow-sm">
                          {empFormAvatar ? (
                            <Image
                              src={empFormAvatar}
                              alt="Pré-visualização da foto do funcionário"
                              width={64}
                              height={64}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            (empFormName.trim().charAt(0) || '?').toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div>
                            <p className="text-xs font-bold text-foreground">Foto de perfil</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">JPG, PNG ou WEBP, com até 2 MB. A imagem será armazenada com segurança e permanecerá após atualizar a página.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground transition-colors hover:bg-primary/90">
                              <Upload className="h-3.5 w-3.5" />
                              {empFormAvatar ? 'Trocar foto' : 'Selecionar foto'}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleEmpAvatarUpload}
                                className="sr-only"
                              />
                            </label>
                            {empFormAvatar && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEmpFormAvatar('');
                                  setEmpAvatarFile(null);
                                  setEmpFormError('');
                                }}
                                className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              >
                                Remover foto
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {empFormError && (
                        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium leading-relaxed text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                          {empFormError}
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                          onChange={(e) => setEmpFormPhone(getBrazilianPhoneDisplay(onlyPhoneDigits(e.target.value)))}
                          placeholder="Ex: (51) 98765-4321"
                          className="w-full px-3.5 py-2 bg-secondary/50 border border-border rounded-xl font-semibold text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Nível de Acesso (Cargo) *</label>
                        <select
                          value={empFormRole}
                          onChange={(e) => setEmpFormRole(e.target.value as EmployeeRole)}
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
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/20 p-3.5">
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

                      </div>

                      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
                        <button
                          type="button"
                          onClick={() => setEmpIsModalOpen(false)}
                          disabled={empIsSaving}
                          className="rounded-xl bg-secondary px-4 py-2.5 text-xs font-bold text-foreground shadow-sm hover:bg-secondary/80 sm:min-w-28"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={empIsSaving}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-md shadow-primary/10 hover:bg-primary/95 disabled:cursor-wait disabled:opacity-60 sm:min-w-40"
                        >
                          <Check className="h-4 w-4" /> {empIsSaving ? 'Salvando...' : empEditingProfile ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ), document.body)}
            </div>
          )}

          {/* Avançado & Sistema Danger Zone */}
          {activeTab === 'sistema' && (
            <div className="animate-in space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm fade-in duration-200 sm:p-6">
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

          {activeTab === 'auditoria' && activeProfile?.role === 'admin' && (
            <AuditLogPanel companyId={company.id} />
          )}

        </div>
      </div>
    </div>
  );
}
