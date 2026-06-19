'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  ShoppingCart, 
  Trash2, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  X,
  ArrowRight,
  TrendingUp,
  Search,
  Clock,
  CreditCard,
  Truck,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Heart,
  Menu,
  Mail,
  Tag,
  Star,
  Sun,
  Moon
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Product } from '@/lib/dummy-data';
import { formatCEP, normalizeRichTextHtml } from '@/lib/utils';
import { formatCurrency } from '@/lib/pricing';
import { safeHref } from '@/lib/safe-url';
import { buildWhatsAppOrderMessage, openWhatsAppWithMessage } from '@/lib/whatsapp-order';
import { BrandLogo, BrandMark } from '@/components/brand';
import { StoreInstallAppButton } from '@/components/store/StoreInstallAppButton';
import { StorePWARegister } from '@/components/store/store-pwa-register';
import {
  ProductConfiguratorModal,
  type ProductConfiguratorCartPayload
} from '@/components/store/ProductConfiguratorModal';

interface CartItem {
  product: Product;
  quantity: number;
  width?: number;
  height?: number;
  length?: number;
  variant?: string;
  color?: string;
  calculatedPrice: number;
  selected_options?: ProductConfiguratorCartPayload['selected_options'];
  pricing_type?: Product['pricing_type'];
  production_days?: number;
  configuration_summary?: string;
}
const getProductBadge = (name: string): 'favorito' | 'novo' | null => {
  const lowerName = name.toLowerCase();
  if (
    (lowerName.includes('flyer') && !lowerName.includes('premium')) ||
    lowerName.includes('cartão') ||
    lowerName.includes('pasta') ||
    lowerName.includes('folder') ||
    lowerName.includes('cartaz') ||
    lowerName.includes('bloco') ||
    lowerName.includes('adesivo')
  ) {
    return 'favorito';
  }
  if (lowerName.includes('premium') || lowerName.includes('novo') || lowerName.includes('caneca')) {
    return 'novo';
  }
  return null;
};

// Helper to parse HEX to RGB and adjust brightness or opacity for custom themes
function getThemeColorShade(hex: string, percent: number, opacity?: number) {
  let num = hex.replace('#', '');
  if (num.length === 3) {
    num = num[0] + num[0] + num[1] + num[1] + num[2] + num[2];
  }
  
  if (num.length !== 6 || isNaN(parseInt(num, 16))) {
    num = '059669'; // Fallback to emerald green
  }

  const r = parseInt(num.substring(0, 2), 16);
  const g = parseInt(num.substring(2, 4), 16);
  const b = parseInt(num.substring(4, 6), 16);

  if (opacity !== undefined) {
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  const newR = Math.min(255, Math.max(0, r + percent));
  const newG = Math.min(255, Math.max(0, g + percent));
  const newB = Math.min(255, Math.max(0, b + percent));

  const toHex = (c: number) => {
    const hexStr = c.toString(16);
    return hexStr.length === 1 ? '0' + hexStr : hexStr;
  };

  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

export default function StorefrontPage() {
  const { products, categories, orders, addQuote, addCustomer, pickupPoints, banners, company, settings } = useDatabase();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState<'all' | 'promo' | 'highlight'>('all');
  const [showcaseTab, setShowcaseTab] = useState<'bestsellers' | 'promo' | 'highlight'>('bestsellers');
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);

  // Local store theme state (catalog defaults to light mode!)
  const [storeTheme, setStoreTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem('printflow_store_theme') as 'light' | 'dark';
    const initialTheme = stored === 'light' || stored === 'dark' ? stored : 'light';
    setStoreTheme(initialTheme);
    
    // Apply store theme class to document element on mount
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(initialTheme);

    return () => {
      // Restore dashboard theme when leaving catalog storefront
      const adminTheme = window.localStorage.getItem('printflow_theme') as 'light' | 'dark' || 'dark';
      root.classList.remove('light', 'dark');
      root.classList.add(adminTheme);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(storeTheme);
    window.localStorage.setItem('printflow_store_theme', storeTheme);
  }, [storeTheme]);

  const toggleStoreTheme = () => {
    setStoreTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const [megaMenuCategory, setMegaMenuCategory] = useState<string | null>(null);
  const [openedFromAllProducts, setOpenedFromAllProducts] = useState(false);

  const menuBarRef = useRef<HTMLDivElement>(null);
  const [activeButton, setActiveButton] = useState<HTMLElement | null>(null);
  const [megamenuStyle, setMegamenuStyle] = useState<React.CSSProperties>({});

  const updateMenuPosition = (buttonEl: HTMLElement, hasSidebar: boolean) => {
    if (!menuBarRef.current) return;

    const parentRect = menuBarRef.current.getBoundingClientRect();
    const buttonRect = buttonEl.getBoundingClientRect();

    const buttonLeft = buttonRect.left - parentRect.left;
    const buttonRight = buttonRect.right - parentRect.left;

    const megamenuWidth = hasSidebar ? 1024 : 768;
    const parentWidth = parentRect.width;

    let left = buttonLeft;
    if (buttonLeft + megamenuWidth > parentWidth) {
      left = buttonRight - megamenuWidth;
      if (left < 0) left = 0;
    }

    setMegamenuStyle({
      left: `${left}px`,
      width: `${megamenuWidth}px`,
    });
  };

  const handleTopCategoryClick = (categoryId: string | null, event?: React.MouseEvent<HTMLButtonElement>) => {
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    if (isMobile) {
      setMegaMenuOpen(false);
      handleCategorySelect(categoryId);
    } else {
      const buttonEl = event?.currentTarget || null;
      if (buttonEl) {
        setActiveButton(buttonEl);
      }
      
      if (megaMenuOpen && megaMenuCategory === categoryId) {
        setMegaMenuOpen(false);
      } else {
        setMegaMenuCategory(categoryId);
        setOpenedFromAllProducts(categoryId === null);
        setMegaMenuOpen(true);
        handleCategorySelect(categoryId);
      }
    }
  };

  const handleMenuCategoryClick = (categoryId: string | null) => {
    setMegaMenuCategory(categoryId);
    handleCategorySelect(categoryId);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!megaMenuOpen || !activeButton) return;

    const handleResize = () => {
      updateMenuPosition(activeButton, openedFromAllProducts);
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [megaMenuOpen, activeButton, openedFromAllProducts]);

  // Pickup Points Modal State
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);

  // Banner Slider State
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners]);

  const handlePrevSlide = () => {
    if (!banners || banners.length === 0) return;
    setCurrentSlide(prev => (prev - 1 + banners.length) % banners.length);
  };

  const handleNextSlide = () => {
    if (!banners || banners.length === 0) return;
    setCurrentSlide(prev => (prev + 1) % banners.length);
  };

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setTimeout(() => {
      if (typeof window === 'undefined') return;

      const element = window.document.getElementById('products-showcase');
      if (element) {
        const yOffset = -135; // offset for sticky header (80px) and category bar (48px)
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 100);
  };

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeAdvancedConfigProduct, setActiveAdvancedConfigProduct] = useState<Product | null>(null);

  // Client checkout info
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'retirada' | 'motoboy'>('retirada');
  const [selectedPickupPoint, setSelectedPickupPoint] = useState('');
  const [deliveryZipCode, setDeliveryZipCode] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [orderCompleted, setOrderCompleted] = useState<string | null>(null);

  // 1. Filter active points and auto-select first active point
  const activePickupPoints = (pickupPoints || []).filter(p => p && p.active);
  
  useEffect(() => {
    if (activePickupPoints.length > 0 && !selectedPickupPoint) {
      setSelectedPickupPoint(activePickupPoints[0].name);
    }
  }, [pickupPoints, selectedPickupPoint]);

  // 2. Filter products based on active status, visible category, and search query
  const catalogCategories = (categories || []).filter((category) => {
    if (!category || category.show_in_catalog === false) return false;
    if (!category.parent_id) return true;
    const parent = (categories || []).find((item) => item.id === category.parent_id);
    return parent?.show_in_catalog !== false;
  });
  const catalogCategoryIds = new Set(catalogCategories.map((category) => category.id));
  const activeProducts = (products || []).filter((product) => {
    if (!product || product.catalog_active === false) return false;
    return !product.category_id || catalogCategoryIds.has(product.category_id);
  });
  const searchedProducts = searchQuery.trim() !== ''
    ? activeProducts.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : activeProducts;

  const selectedCategoryIds = selectedCategory
    ? [selectedCategory, ...catalogCategories.filter(c => c.parent_id === selectedCategory).map(c => c.id)]
    : [];

  const filteredProducts = selectedCategory 
    ? searchedProducts.filter(p => selectedCategoryIds.includes(p.category_id))
    : searchedProducts;

  const taggedProducts = filteredProducts.filter((product) => {
    if (selectedTagFilter === 'promo') return product.is_promo;
    if (selectedTagFilter === 'highlight') return product.is_highlight;
    return true;
  });
  const soldQuantityByProductId = (orders || []).reduce<Record<string, number>>((acc, order) => {
    (order.items || []).forEach((item) => {
      acc[item.product_id] = (acc[item.product_id] || 0) + item.quantity;
    });
    return acc;
  }, {});
  const bestsellingProducts = [...activeProducts]
    .sort((a, b) => {
      const salesDiff = (soldQuantityByProductId[b.id] || 0) - (soldQuantityByProductId[a.id] || 0);
      if (salesDiff !== 0) return salesDiff;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 8);
  const promoProducts = activeProducts.filter((product) => product.is_promo).slice(0, 8);
  const highlightProducts = activeProducts.filter((product) => product.is_highlight).slice(0, 8);
  const showcaseProductsByTab = {
    bestsellers: bestsellingProducts,
    promo: promoProducts,
    highlight: highlightProducts
  };
  const showcaseProducts = showcaseProductsByTab[showcaseTab];
  const showPromotionsSection = settings.catalog_promotions_section_enabled !== false && (
    bestsellingProducts.length > 0 || promoProducts.length > 0 || highlightProducts.length > 0
  );

  const handleOpenProductConfig = (product: Product) => {
    setActiveAdvancedConfigProduct(product);
  };

  const handleAddAdvancedProductToCart = (payload: ProductConfiguratorCartPayload) => {
    const newItem: CartItem = {
      product: payload.product,
      quantity: payload.quantity,
      width: payload.dimensions?.width,
      height: payload.dimensions?.height,
      length: payload.dimensions?.length,
      calculatedPrice: payload.unit_price,
      selected_options: payload.selected_options,
      pricing_type: payload.pricing_type,
      production_days: payload.production_days,
      configuration_summary: payload.configuration_summary
    };

    setCart(prev => [...prev, newItem]);
    setActiveAdvancedConfigProduct(null);
  };

  const handleWhatsAppProductRequest = (payload: ProductConfiguratorCartPayload) => {
    const companyWhatsAppPhone = settings.catalog_whatsapp || settings.top_bar_phone || company.phone || '';
    if (!companyWhatsAppPhone.trim()) {
      alert('WhatsApp da empresa não configurado.');
      return;
    }

    const message = buildWhatsAppOrderMessage({
      companyName: company.name,
      productName: payload.product_name,
      saleType: payload.sale_mode_label,
      pricingType: payload.sale_mode || payload.pricing_type,
      quantity: payload.quantity,
      dimensions: payload.dimensions,
      selectedOptions: payload.selected_options,
      productionDays: payload.production_days,
      estimatedDeadline: payload.product.delivery_time || payload.product.pricing_details?.delivery_time,
      subtotal: payload.total_price,
      customerName: clientName,
      customerPhone: clientPhone,
      notes: clientNotes
    });

    const opened = openWhatsAppWithMessage(companyWhatsAppPhone, message);
    if (!opened) {
      alert('WhatsApp da empresa não configurado.');
    }
  };

  const handleRemoveFromCart = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.calculatedPrice), 0);
  };

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !clientName.trim() || !clientPhone.trim()) return;
    const isMotoboyDelivery = deliveryMethod === 'motoboy';
    if (
      isMotoboyDelivery &&
      (!deliveryZipCode.trim() ||
        !deliveryStreet.trim() ||
        !deliveryNumber.trim() ||
        !deliveryNeighborhood.trim() ||
        !deliveryCity.trim() ||
        !deliveryState.trim())
    ) {
      alert('Preencha o endereço completo para entrega por motoboy.');
      return;
    }

    const deliveryFullAddress = isMotoboyDelivery
      ? `${deliveryStreet}, ${deliveryNumber} - ${deliveryNeighborhood}, ${deliveryCity} - ${deliveryState}${deliveryZipCode ? `, CEP ${deliveryZipCode}` : ''}`
      : '';

    // Trigger ERP Quote injection
    const qItems = cart.map((c, i) => ({
      id: `qi-store-${i}-${Date.now()}`,
      product_id: c.product.id,
      product_name: c.product.name,
      quantity: c.quantity,
      unit_price: c.calculatedPrice,
      total_price: c.quantity * c.calculatedPrice,
      details: {
        width: c.width,
        height: c.height,
        length: c.length,
        variant: c.variant,
        color: c.color,
        selected_options: c.selected_options,
        pricing_type: c.pricing_type || c.product.pricing_type,
        production_days: c.production_days,
        configuration_summary: c.configuration_summary,
        notes: ['Enviado pelo catálogo online', c.variant ? `Variação: ${c.variant}` : '', c.color ? `Cor: ${c.color}` : ''].filter(Boolean).join(' | ')
      }
    }));

    const purchaseInterest = cart
      .map((item, index) => {
        const dimensions = [
          item.width ? `largura ${item.width}m` : '',
          item.height ? `altura ${item.height}m` : '',
          item.length ? `metragem ${item.length}m` : '',
          item.variant ? `variacao ${item.variant}` : '',
          item.color ? `cor ${item.color}` : '',
          item.configuration_summary ? item.configuration_summary : ''
        ].filter(Boolean).join(', ');
        const config = dimensions ? ` (${dimensions})` : '';
        return `${index + 1}. ${item.product.name} - qtd ${item.quantity}${config} - total ${formatCurrency(item.quantity * item.calculatedPrice)}`;
      })
      .join('\n');

    const checkoutNotes = clientNotes.trim() || 'Sem observacoes.';

    const webCustomer = addCustomer({
      name: clientName.trim(),
      document: '',
      phone: clientPhone.trim(),
      email: '',
      address: {
        street: isMotoboyDelivery ? deliveryStreet : '',
        number: isMotoboyDelivery ? deliveryNumber : '',
        neighborhood: isMotoboyDelivery ? deliveryNeighborhood : '',
        city: isMotoboyDelivery ? deliveryCity : '',
        state: isMotoboyDelivery ? deliveryState : '',
        zip_code: isMotoboyDelivery ? deliveryZipCode : ''
      },
      tags: ['Catalogo Online'],
      notes: `Cliente criado pelo catalogo online.\nInteresse de compra:\n${purchaseInterest}\nObs cliente: ${checkoutNotes}`,
      billing_type: 'imediato',
      credit_limit: 0,
      credit_used: 0,
      payment_terms_days: 0,
      credit_status: 'aprovado'
    });

    const nextQuote = addQuote({
      customer_id: webCustomer.id,
      customer_name: `${clientName} (Web)`,
      status: 'pendente',
      total_amount: getCartTotal(),
      discount: 0,
      valid_until: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      customer_phone: clientPhone,
      delivery_type: deliveryMethod,
      delivery_address: isMotoboyDelivery ? deliveryFullAddress : undefined,
      delivery_fee: 0,
      notes: `Telefone: ${clientPhone}. Entrega: ${deliveryMethod === 'retirada' ? `Retirada no Balcão - ${selectedPickupPoint}` : `Envio por motoboy - ${deliveryFullAddress}`}. Interesse de compra: ${purchaseInterest.replace(/\n/g, ' | ')}. Obs cliente: ${checkoutNotes}`,
      items: qItems
    });

    // Reset Cart
    setCart([]);
    setClientName('');
    setClientPhone('');
    setClientNotes('');
    setDeliveryZipCode('');
    setDeliveryStreet('');
    setDeliveryNumber('');
    setDeliveryNeighborhood('');
    setDeliveryCity('');
    setDeliveryState('');
    setCartOpen(false);
    setOrderCompleted(nextQuote.number.toString());
  };

  let primaryColor = company.theme_color || '#5b3df4';
  const PRESETS: Record<string, string> = {
    emerald: '#5b3df4',
    blue: '#2563eb',
    violet: '#5b3df4',
    amber: '#d97706',
    rose: '#e11d48'
  };
  if (PRESETS[primaryColor]) {
    primaryColor = PRESETS[primaryColor];
  }

  const primary = primaryColor;
  const dark = getThemeColorShade(primary, -30);
  const darker = getThemeColorShade(primary, -50);
  const light = getThemeColorShade(primary, 30);
  const ultraLight = getThemeColorShade(primary, 0, 0.05);
  const opacity5 = getThemeColorShade(primary, 0, 0.05);
  const opacity10 = getThemeColorShade(primary, 0, 0.1);
  const opacity20 = getThemeColorShade(primary, 0, 0.2);
  const opacity40 = getThemeColorShade(primary, 0, 0.4);

  const socialUrl = (
  platform: 'instagram' | 'facebook' | 'youtube',
  value?: string
) => {
  if (!value) return '#';

  const username = value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^instagram\.com\//, '')
    .replace(/^facebook\.com\//, '')
    .replace(/^youtube\.com\//, '')
    .replace(/^@/, '')
    .replace(/^\/+/, '')
    .trim();

  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${username}`;

    case 'facebook':
      return `https://facebook.com/${username}`;

    case 'youtube':
      return `https://youtube.com/${username}`;

    default:
      return '#';
  }
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200/70 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans antialiased flex flex-col justify-between">
      <StorePWARegister />
      <style dangerouslySetInnerHTML={{ __html: `
        .bg-emerald-600 { background-color: ${primary} !important; }
        .bg-emerald-500 { background-color: ${light} !important; }
        .bg-emerald-50 { background-color: ${ultraLight} !important; }
        .text-emerald-600 { color: ${primary} !important; }
        .text-emerald-500 { color: ${primary} !important; }
        .text-emerald-400 { color: ${light} !important; }
        .hover\\:bg-emerald-600:hover { background-color: ${primary} !important; }
        .hover\\:bg-emerald-500:hover { background-color: ${light} !important; }
        .hover\\:text-emerald-400:hover { color: ${light} !important; }
        .hover\\:text-emerald-600:hover { color: ${primary} !important; }
        .dark .dark\\:text-emerald-400 { color: ${light} !important; }
        .dark .dark\\:hover\\:text-emerald-400:hover { color: ${light} !important; }
        .border-emerald-500\\/10 { border-color: ${opacity10} !important; }
        .border-emerald-500\\/20 { border-color: ${opacity20} !important; }
        .hover\\:border-emerald-500\\/40:hover { border-color: ${opacity40} !important; }
        .focus\\:border-emerald-500:focus { border-color: ${primary} !important; }
        .group:hover .group-hover\\:text-emerald-600 { color: ${primary} !important; }
        .shadow-emerald-600\\/10 { --tw-shadow-color: ${opacity10} !important; }
        .shadow-emerald-600\\/20 { --tw-shadow-color: ${opacity20} !important; }
        .shadow-emerald-600\\/5 { --tw-shadow-color: ${opacity5} !important; }
        .border-emerald-600 { border-color: ${primary} !important; }
        .text-emerald-700 { color: ${dark} !important; }
        .text-emerald-800 { color: ${darker} !important; }
        .ring-emerald-600\\/10 { --tw-ring-color: ${opacity10} !important; }
        .bg-emerald-50\\/30 { background-color: ${opacity5} !important; }
        .bg-emerald-500\\/10 { background-color: ${opacity10} !important; }
      `}} />
      
      {/* 1. Header Top Info Bar */}
      <div className="bg-white/75 dark:bg-zinc-950 text-slate-600 dark:text-zinc-300 text-xs py-2 border-b border-slate-200 dark:border-zinc-800 backdrop-blur">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-2">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 min-w-0 text-center md:text-left">
            <span className="flex min-w-0 items-center justify-center md:justify-start gap-1">
              <Clock className="h-3.5 w-3.5 text-emerald-500" /> {settings?.top_bar_hours || 'Segunda à Sexta: 8h às 12h / 13h30 às 18h'}
            </span>
            {settings?.top_bar_show_pickup !== false && (
              <span className="hidden md:flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" /> Retire grátis em nossos balcões autorizados
              </span>
            )}
          </div>
          <div className="flex items-center justify-center gap-4">
            {company.instagram_url && (
              <a href={socialUrl('instagram', company.instagram_url)} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center hover:scale-110" title="Instagram">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </a>
            )}
            {company.facebook_url && (
              <a href={socialUrl('facebook', company.facebook_url)} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center hover:scale-110" title="Facebook">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                </svg>
              </a>
            )}
            {company.youtube_url && (
              <a href={socialUrl('youtube', company.youtube_url)} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center hover:scale-110" title="YouTube">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                  <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Header */}
      <header className="bg-white/90 dark:bg-zinc-900/95 border-b border-slate-200 dark:border-zinc-800 h-20 sticky top-0 z-30 shadow-sm backdrop-blur flex items-center">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Header Logo */}
            {(() => {
              const logoSrc = storeTheme === 'dark' ? (company.logo_dark || company.logo_light) : (company.logo_light || company.logo_dark);
              return logoSrc ? (
                <img 
                  src={logoSrc} 
                  alt={company.name || 'Logo'} 
                  className="h-9 w-auto object-contain max-w-[140px] sm:max-w-[200px]"
                />
              ) : (
                <BrandLogo subtitle="Catalogo Online" className="[&>img]:h-9 [&>img]:w-9" />
              );
            })()}
          </div>

          {/* Header Search Field (Desktop) */}
          <div className="hidden md:flex items-center flex-1 max-w-md mx-6 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar banners, adesivos, canecas, cartões..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs focus:outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 text-slate-800 dark:text-zinc-100 transition-all font-medium"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <StoreInstallAppButton />
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleStoreTheme}
              className="flex items-center justify-center p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-100 transition-all border border-slate-200 dark:border-zinc-700 font-bold shrink-0 cursor-pointer"
              title={storeTheme === 'light' ? 'Mudar para Modo Escuro' : 'Mudar para Modo Claro'}
            >
              {storeTheme === 'light' ? (
                <Moon className="h-4.5 w-4.5 text-zinc-600 dark:text-zinc-400" />
              ) : (
                <Sun className="h-4.5 w-4.5 text-amber-500" />
              )}
            </button>

            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 p-2.5 px-3 sm:px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white relative transition-all shadow-md shadow-emerald-600/10"
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shadow-md animate-bounce">
                  {cart.length}
                </span>
              )}
              <span className="hidden sm:inline text-xs font-bold">Carrinho</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Search Field */}
      <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 md:hidden py-3">
        <div className="max-w-7xl mx-auto px-4 w-full flex relative items-center">
          <Search className="h-4 w-4 text-slate-400 absolute left-8" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="O que você deseja produzir hoje?"
            className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:bg-white dark:focus:bg-zinc-900"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-8 text-slate-400">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category Menu Bar */}
      <div className="bg-white dark:bg-zinc-900 sticky top-20 z-20 shadow-sm border-b border-slate-200 dark:border-zinc-800 w-full select-none">
        <div ref={menuBarRef} className="max-w-7xl mx-auto w-full px-4 md:px-8 relative">
          <div className="w-full flex items-center overflow-x-auto no-scrollbar">
            <div className="flex items-center w-full min-w-max h-12">
              {/* Todos os Serviços button styled as hamburger menu */}
              <button
                onClick={(e) => handleTopCategoryClick(null, e)}
                className={`flex items-center gap-2 h-full pl-0 pr-6 text-xs font-bold uppercase tracking-wider transition-colors shrink-0 border-r border-slate-200 dark:border-zinc-800 mr-4 relative ${
                  (megaMenuOpen ? megaMenuCategory === null : selectedCategory === null)
                    ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' 
                    : 'text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                }`}
              >
                <Menu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Todos os Produtos</span>
              </button>

              {/* Other Categories */}
              <div className="flex items-center gap-6 md:gap-8 h-full">
                {catalogCategories.filter(c => !c.parent_id).map(cat => (
                  <button
                    key={cat.id}
                    onClick={(e) => handleTopCategoryClick(cat.id, e)}
                    className={`text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors shrink-0 h-full relative flex items-center ${
                      (megaMenuOpen ? megaMenuCategory === cat.id : selectedCategory === cat.id)
                        ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' 
                        : 'text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mega Menu Dropdown */}
          {megaMenuOpen && (
            <>
              {/* Backdrop overlay to close when clicking outside */}
              <div 
                className="fixed inset-x-0 bottom-0 top-[128px] md:top-[160px] bg-black/45 dark:bg-black/60 backdrop-blur-xs z-10 transition-opacity"
                onClick={() => setMegaMenuOpen(false)}
              />
              
              <div 
                style={megamenuStyle}
                className={`absolute top-full bg-white dark:bg-zinc-900 border-t-0 border border-slate-200 dark:border-zinc-800 shadow-2xl rounded-b-3xl overflow-hidden hidden md:grid z-20 animate-in fade-in slide-in-from-top-2 duration-200 text-slate-800 dark:text-zinc-200 ${
                  openedFromAllProducts ? 'grid-cols-4' : 'grid-cols-3'
                }`}
              >
                {/* Left Sidebar: Categories List */}
                {openedFromAllProducts && (
                  <div className="bg-slate-50/80 dark:bg-zinc-950/80 p-5 space-y-1.5 border-r border-slate-150 dark:border-zinc-850 h-[380px] overflow-y-auto no-scrollbar col-span-1">
                    {/* Option "Todos os Produtos" in sidebar */}
                    <button
                      onClick={() => handleMenuCategoryClick(null)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between group text-xs font-bold uppercase tracking-wide ${
                        megaMenuCategory === null
                          ? 'bg-white dark:bg-zinc-900 shadow-sm border border-slate-200/80 dark:border-zinc-800 text-slate-900 dark:text-white font-extrabold'
                          : 'hover:bg-slate-100 dark:hover:bg-zinc-850 hover:text-slate-900 dark:hover:text-white text-slate-500 dark:text-zinc-400'
                      }`}
                    >
                      <span>Todos os Produtos</span>
                      {megaMenuCategory === null && <ChevronRight className="h-3.5 w-3.5 text-slate-700 dark:text-zinc-300 shrink-0 ml-2" />}
                    </button>

                    {/* Other category options in sidebar */}
                    {(() => {
                      const rootCategories = catalogCategories.filter(c => !c.parent_id);
                      const childCategories = catalogCategories.filter(c => c.parent_id);
                      const selectedChild = childCategories.find(child => child.id === megaMenuCategory);
                      const expandedParentId = selectedChild?.parent_id || megaMenuCategory;
                      
                      const items: { id: string; name: string; isChild: boolean }[] = [];
                      rootCategories.forEach(parent => {
                        items.push({ id: parent.id, name: parent.name, isChild: false });
                        if (expandedParentId === parent.id) {
                          childCategories
                            .filter(child => child.parent_id === parent.id)
                            .forEach(child => {
                              items.push({ id: child.id, name: child.name, isChild: true });
                            });
                        }
                      });
                      
                      // Fallback: add child categories whose parents aren't found in root
                      childCategories.forEach(child => {
                        if (!rootCategories.some(r => r.id === child.parent_id) && !items.some(item => item.id === child.id)) {
                          items.push({ id: child.id, name: child.name, isChild: true });
                        }
                      });

                      return items.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => handleMenuCategoryClick(cat.id)}
                          className={`w-full text-left py-2.5 rounded-xl transition-all flex items-center justify-between group uppercase tracking-wide ${
                            cat.isChild 
                              ? 'pl-7 pr-3.5 text-[11px] font-medium normal-case' 
                              : 'px-3.5 text-xs font-bold'
                          } ${
                            megaMenuCategory === cat.id
                              ? 'bg-white dark:bg-zinc-900 shadow-sm border border-slate-200/80 dark:border-zinc-800 text-slate-900 dark:text-white font-extrabold'
                              : 'hover:bg-slate-100/70 dark:hover:bg-zinc-850/70 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <span className="truncate">
                            {cat.name}
                          </span>
                          {megaMenuCategory === cat.id && <ChevronRight className="h-3.5 w-3.5 text-slate-700 dark:text-zinc-300 shrink-0 ml-2" />}
                        </button>
                      ));
                    })()}
                  </div>
                )}

                {/* Right Area: Product Sublists */}
                {(() => {
                  const selectedCategoryIds = megaMenuCategory
                    ? [megaMenuCategory, ...catalogCategories.filter(c => c.parent_id === megaMenuCategory).map(c => c.id)]
                    : [];
                  const menuProducts = megaMenuCategory
                    ? activeProducts.filter(p => selectedCategoryIds.includes(p.category_id))
                    : activeProducts;

                  const column1 = menuProducts.filter((_, index) => index % 3 === 0);
                  const column2 = menuProducts.filter((_, index) => index % 3 === 1);
                  const column3 = menuProducts.filter((_, index) => index % 3 === 2);
                  const visibleMenuColumnCount = [column1, column2, column3].filter(column => column.length > 0).length;
                  const menuGridColumns =
                    visibleMenuColumnCount <= 1 ? 'grid-cols-1' :
                    visibleMenuColumnCount === 2 ? 'grid-cols-2' :
                    'grid-cols-3';

                  return (
                    <div className={`grid ${menuGridColumns} p-6 gap-6 overflow-y-auto ${
                      openedFromAllProducts ? 'h-[380px] col-span-3' : 'h-auto max-h-[380px] col-span-3 w-full'
                    }`}>
                      {/* Column 1 */}
                      {column1.length > 0 && (
                      <div className="space-y-4">
                        <div>
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-zinc-850 pb-2 mb-3 block">
                            Produtos
                          </span>
                        </div>
                        <div className="space-y-2">
                          {column1.map((p) => {
                              const badge = getProductBadge(p.name);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => { setMegaMenuOpen(false); handleOpenProductConfig(p); }}
                                  className="w-full text-left flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800/40 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs font-medium"
                                >
                                  <span className="truncate">{p.name}</span>
                                  {badge === 'favorito' && (
                                    <span className="text-[9px] font-bold bg-[#e2f82c] text-black px-1.5 py-0.5 rounded shrink-0 ml-2 tracking-wide uppercase">
                                      Favorito
                                    </span>
                                  )}
                                  {badge === 'novo' && (
                                    <span className="text-[9px] font-bold bg-[#bef264] text-black px-1.5 py-0.5 rounded shrink-0 ml-2 tracking-wide uppercase">
                                      Novo
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                      )}

                      {/* Column 2 */}
                      {column2.length > 0 && (
                      <div className="space-y-4">
                        <div>
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-zinc-850 pb-2 mb-3 block">
                            Mais procurados
                          </span>
                        </div>
                        <div className="space-y-2">
                          {column2.map((p) => {
                              const badge = getProductBadge(p.name);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => { setMegaMenuOpen(false); handleOpenProductConfig(p); }}
                                  className="w-full text-left flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800/40 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs font-medium"
                                >
                                  <span className="truncate">{p.name}</span>
                                  {badge === 'favorito' && (
                                    <span className="text-[9px] font-bold bg-[#e2f82c] text-black px-1.5 py-0.5 rounded shrink-0 ml-2 tracking-wide uppercase">
                                      Favorito
                                    </span>
                                  )}
                                  {badge === 'novo' && (
                                    <span className="text-[9px] font-bold bg-[#bef264] text-black px-1.5 py-0.5 rounded shrink-0 ml-2 tracking-wide uppercase">
                                      Novo
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                      )}

                      {/* Column 3 */}
                      {column3.length > 0 && (
                      <div className="space-y-4">
                        <div>
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-zinc-850 pb-2 mb-3 block">
                            Veja também
                          </span>
                        </div>
                        <div className="space-y-2">
                          {column3.map((p) => {
                              const badge = getProductBadge(p.name);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => { setMegaMenuOpen(false); handleOpenProductConfig(p); }}
                                  className="w-full text-left flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800/40 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs font-medium"
                                >
                                  <span className="truncate">{p.name}</span>
                                  {badge === 'favorito' && (
                                    <span className="text-[9px] font-bold bg-[#e2f82c] text-black px-1.5 py-0.5 rounded shrink-0 ml-2 tracking-wide uppercase">
                                      Favorito
                                    </span>
                                  )}
                                  {badge === 'novo' && (
                                    <span className="text-[9px] font-bold bg-[#bef264] text-black px-1.5 py-0.5 rounded shrink-0 ml-2 tracking-wide uppercase">
                                      Novo
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-[15px] py-[15px]">
        {/* Banner Slider Section */}
        {banners && banners.length > 0 && (
          <section className="w-full px-4 md:px-8">
            <div className="relative h-[180px] sm:h-[240px] md:h-[300px] w-full max-w-[1220px] mx-auto overflow-hidden bg-slate-900 group rounded-xl">
              {/* Slides wrapper */}
              <div className="relative h-full w-full">
                {banners.map((banner, index) => {
                  const isActive = index === currentSlide;
                  return (
                    <div
                      key={banner.id}
                      className={`absolute inset-0 h-full w-full transition-all duration-700 ease-in-out ${
                        isActive 
                          ? 'opacity-100 translate-x-0 pointer-events-auto z-10' 
                          : 'opacity-0 translate-x-4 pointer-events-none z-0'
                      }`}
                    >
                      {/* Slide Image */}
                      <img
                        src={banner.image_url}
                        alt={banner.title || 'Banner'}
                        className="h-full w-full object-cover select-none"
                      />
                      
                      {/* Gradient Overlay for Readability */}
                      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/30 to-transparent flex flex-col justify-center px-6 sm:px-12 md:px-20 text-white">
                        <div className="max-w-xl md:max-w-2xl space-y-2.5 md:space-y-4">
                          {banner.title && (
                            <h2 className="text-xl sm:text-3xl md:text-5xl font-black uppercase tracking-tight leading-tight drop-shadow-sm">
                              {banner.title}
                            </h2>
                          )}
                          {banner.subtitle && (
                            <p className="text-[10px] sm:text-xs md:text-base text-slate-200 font-medium leading-relaxed max-w-md md:max-w-lg drop-shadow-sm">
                              {banner.subtitle}
                            </p>
                          )}
                          {banner.link && (
                            <a
                              href={safeHref(banner.link)}
                              className="inline-flex items-center gap-1.5 px-5 py-2.5 mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] sm:text-xs font-bold transition-all shadow-md shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] w-fit"
                            >
                              Ver Mais <ArrowRight className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation Arrows */}
              {banners.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevSlide}
                    className="absolute left-6 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-black/25 hover:bg-black/45 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm shadow-md"
                    aria-label="Slide anterior"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextSlide}
                    className="absolute right-6 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-black/25 hover:bg-black/45 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm shadow-md"
                    aria-label="Próximo slide"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}

              {/* Pagination Indicators (Dots) */}
              {banners.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                  {banners.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentSlide(idx)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        idx === currentSlide ? 'bg-emerald-500 w-6' : 'bg-white/40 w-2 hover:bg-white/70'
                      }`}
                      aria-label={`Ir para slide ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
        {/* 4. Trust signals grid (Benefit cards) */}
        <section className="max-w-7xl w-full mx-auto px-4 md:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {company.card_benefits_1_active !== false && (
            <div className="p-4 bg-white dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-700 rounded-xl flex items-start gap-3 shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-emerald-500/40 transition-shadow">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  {company.card_benefits_1_title || 'Até 4x Sem Juros'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-zinc-300 mt-0.5">
                  {company.card_benefits_1_subtitle || 'Parcela mínima de R$ 300,00 nos cartões Visa/Master.'}
                </p>
              </div>
            </div>
          )}

          {company.card_benefits_2_active !== false && (
            <div className="p-4 bg-white dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-700 rounded-xl flex items-start gap-3 shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-emerald-500/40 transition-shadow">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  {company.card_benefits_2_title || 'Desconto no PIX'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-zinc-300 mt-0.5">
                  {company.card_benefits_2_subtitle || 'Ganhe 5% de desconto automático em pagamentos à vista.'}
                </p>
              </div>
            </div>
          )}

          {company.card_benefits_3_active !== false && (
            <div className="p-4 bg-white dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-700 rounded-xl flex items-start gap-3 shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-emerald-500/40 transition-shadow">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 shrink-0">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  {company.card_benefits_3_title || 'Frete para todo Brasil'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-zinc-300 mt-0.5">
                  {company.card_benefits_3_subtitle || 'Despacho via Correios ou Transportadora com código de rastreamento.'}
                </p>
              </div>
            </div>
          )}

          {company.card_benefits_4_active !== false && (
            <div className="p-4 bg-white dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-700 rounded-xl flex items-start gap-3 shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-emerald-500/40 transition-shadow">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  {company.card_benefits_4_title || 'Pontos de Coleta'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-zinc-300 mt-0.5">
                  {company.card_benefits_4_subtitle || 'Retire sem custos em qualquer um de nossos balcões autorizados.'}
                </p>
              </div>
            </div>
          )}
        </section>


        {/* 5. Products Showcase */}
        <main id="products-showcase" className="max-w-7xl w-full mx-auto px-4 md:px-8 space-y-6">
          {/* Dynamic products list grid */}
          {taggedProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {taggedProducts.map(p => {
                const hasVolumeTiers = p.volume_pricing && p.volume_pricing.length > 0;
                const deliveryTime = p.delivery_time || p.pricing_details?.delivery_time;
                const displayPrice = p.volume_pricing && p.volume_pricing.length > 0
                  ? Math.min(...p.volume_pricing.map(v => v.price))
                  : p.sales_price;

                return (
                  <div 
                    key={p.id}
                    className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div>
                      {/* Product Image Area (Aspect Square & No Margin at top/left/right) */}
                      <div className="aspect-[1/1.08] w-full bg-white overflow-hidden border-b border-slate-200/60 flex items-center justify-center shrink-0 relative">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                          />
                        ) : (
                          <div className="text-slate-300 flex flex-col items-center gap-1">
                            <ShoppingBag className="h-10 w-10 stroke-[1.2]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem Foto</span>
                          </div>
                        )}

                        {/* Floating Heart Icon Button (Moved to top-left) */}
                        <button 
                          type="button"
                          className="absolute top-2.5 left-2.5 h-7 w-7 rounded-full bg-white/90 backdrop-blur-sm text-slate-400 hover:text-rose-500 shadow-sm flex items-center justify-center hover:scale-110 transition-all z-10"
                          onClick={(e) => { e.stopPropagation(); alert("Adicionado aos favoritos!"); }}
                        >
                          <Heart className="h-4 w-4" />
                        </button>

                        {/* Floating Promo / Highlight tags (Top-right) */}
                        <div className="absolute top-2.5 right-2.5 flex flex-col gap-1 items-end z-10">
                          {p.is_promo && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTagFilter('promo');
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[8px] md:text-[9px] uppercase tracking-wider shadow-md hover:bg-emerald-500 transition-colors"
                              title="Filtrar promocoes"
                            >
                              <Tag className="h-2.5 w-2.5 stroke-[2.5]" />
                              Promoção
                            </button>
                          )}
                          {p.is_highlight && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTagFilter('highlight');
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[8px] md:text-[9px] uppercase tracking-wider shadow-md hover:bg-emerald-500 transition-colors"
                              title="Filtrar destaques"
                            >
                              <Star className="h-2.5 w-2.5 fill-white stroke-none" />
                              Destaque
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content padding wrapper */}
                      <div className="p-3 space-y-2.5">
                        {/* Visual Category badge */}
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg border border-emerald-500/10 uppercase tracking-wide">
                            {catalogCategories.find(c => c && c.id === p.category_id)?.name || 'Outros'}
                          </span>
                          {p.pricing_type === 'm2' && (
                            <span className="text-[9px] font-extrabold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-500/10 uppercase tracking-wide">
                              Sob Medida (m²)
                            </span>
                          )}
                        </div>
                        
                        {/* Product Title (uppercase & bold as in reference image) */}
                        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide line-clamp-2 min-h-[2rem] group-hover:text-emerald-600 transition-colors duration-300">
                          {p.name}
                        </h3>
                        {deliveryTime && (
                          <p className="text-[10px] leading-snug text-slate-500">
                            <strong className="text-slate-700">Prazo de entrega:</strong> {deliveryTime}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Price card footer */}
                    <div className="border-t border-slate-100 p-3 pt-3 mt-1 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                          {hasVolumeTiers ? 'A partir de' : 'Preço'}
                        </span>
                        <span className="font-extrabold text-emerald-600 text-sm block leading-none">
                          {formatCurrency(displayPrice)} 
                          <span className="text-[10px] text-slate-400 font-normal">/{p.pricing_type}</span>
                        </span>
                        {company.show_payments_pix !== false && (
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">
                            <svg className="h-3.5 w-3.5 text-[#32BCAD] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0L1.6 10.4 12 20.8 22.4 10.4 12 0zm0 3.2L19.2 10.4 12 17.6 4.8 10.4 12 3.2zm0 3.8L8.2 10.8 12 14.6 15.8 10.8 12 7zm0 2.2l1.6 1.6-1.6 1.6-1.6-1.6 1.6-1.6z"/>
                            </svg>
                            <span>
                              {formatCurrency(displayPrice * 0.95)} à vista
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleOpenProductConfig(p)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/5 hover:shadow-lg"
                      >
                        <ShoppingBag className="h-3.5 w-3.5" />
                        Comprar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center space-y-3 bg-white border border-slate-200 rounded-xl">
              <HelpCircle className="h-10 w-10 text-slate-400 mx-auto" />
              <p className="text-slate-500 text-sm font-medium">Nenhum serviço gráfico encontrado nesta busca.</p>
              <button 
                onClick={() => { setSelectedCategory(null); setSearchQuery(''); setSelectedTagFilter('all'); }}
                className="text-xs text-emerald-600 font-bold hover:underline"
              >
                Limpar filtros de pesquisa
              </button>
            </div>
          )}
        </main>
      </div>

      {/* 6. Hero Copy Section (above footer) */}
      <section className="relative py-[15px] text-center bg-gradient-to-b from-white to-slate-50 px-4 border-t border-b border-slate-200">
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight">
            Calcule as Medidas e <br />
            <span className="text-emerald-600">
              Encomende seus Materiais Online
            </span>
          </h2>
          <p className="text-sm md:text-base text-slate-500 max-w-xl mx-auto leading-relaxed">
            Orçamentos automáticos para lonas, banners e adesivos. Configure as dimensões exatas de seu projeto e envie o pedido instantaneamente para nossa fila de produção.
          </p>
        </div>
      </section>

      <ProductConfiguratorModal
        product={activeAdvancedConfigProduct}
        isOpen={Boolean(activeAdvancedConfigProduct)}
        onClose={() => setActiveAdvancedConfigProduct(null)}
        onAddToCart={handleAddAdvancedProductToCart}
        onRequestWhatsApp={handleWhatsAppProductRequest}
        categoryName={
          activeAdvancedConfigProduct
            ? catalogCategories.find(c => c && c.id === activeAdvancedConfigProduct.category_id)?.name || 'Catálogo'
            : undefined
        }
      />

      {/* 8. Cart Drawer Panel */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-md border-l border-slate-200 h-full flex flex-col justify-between shadow-2xl p-4 sm:p-6 overflow-y-auto animate-in slide-in-from-right duration-200 text-slate-800">
            
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm uppercase flex items-center gap-1.5 tracking-wide">
                  <ShoppingCart className="h-4.5 w-4.5 text-emerald-600" /> Carrinho de Orçamentos
                </h3>
                <button 
                  onClick={() => setCartOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Added items list */}
              <div className="space-y-3 max-h-52 overflow-y-auto divide-y divide-slate-100 pr-1">
                {cart.length > 0 ? (
                  cart.map((item, idx) => (
                    <div key={idx} className="pt-3 first:pt-0 flex justify-between items-start gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 break-words">{item.product.name}</div>
                        {item.width && (
                          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            Dimensões: {item.width}m {item.height ? `x ${item.height}m` : 'linear'}
                          </div>
                        )}
                        {item.length && (
                          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            Metragem: {item.length}m
                          </div>
                        )}
                        {(item.variant || item.color) && (
                          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            {[item.variant ? `Variacao: ${item.variant}` : '', item.color ? `Cor: ${item.color}` : ''].filter(Boolean).join(' | ')}
                          </div>
                        )}
                        {item.configuration_summary && (
                          <div className="text-[10px] text-slate-400 mt-0.5 font-medium line-clamp-2">
                            {item.configuration_summary}
                          </div>
                        )}
                        <span className="text-[10px] text-slate-500 mt-0.5 block font-semibold">{item.quantity}x {formatCurrency(item.calculatedPrice)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <span className="font-black text-slate-900 whitespace-nowrap">{formatCurrency(item.quantity * item.calculatedPrice)}</span>
                        <button
                          onClick={() => handleRemoveFromCart(idx)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-500 hover:text-white transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 italic text-xs font-medium">
                    Seu carrinho está vazio. Adicione produtos para orçamento.
                  </div>
                )}
              </div>

              {/* Total Card */}
              {cart.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center font-bold text-xs border border-slate-200/80 shadow-sm">
                  <span className="text-slate-500">Total Estimado do Pedido:</span>
                  <span className="text-emerald-600 text-sm md:text-base font-black">{formatCurrency(getCartTotal())}</span>
                </div>
              )}

              {/* Checkout Client Form */}
              {cart.length > 0 && (
                <form onSubmit={handleCheckout} className="border-t border-slate-100 pt-4 mt-2 space-y-3.5">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Preencha seus Dados para Contato</h4>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">Nome Completo / Empresa *</label>
                    <input
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: Restaurante Sabor & Arte"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">WhatsApp / Telefone *</label>
                    <input
                      type="text"
                      required
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="Ex: (51) 99999-9999"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                    />
                  </div>

                  {/* Delivery Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">Forma de Retirada / Envio *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDeliveryMethod('retirada')}
                        className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                          deliveryMethod === 'retirada' 
                            ? 'bg-slate-900 border-slate-900 text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        Retirar no Balcão
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryMethod('motoboy')}
                        className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                          deliveryMethod === 'motoboy' 
                            ? 'bg-slate-900 border-slate-900 text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        Enviar por Motoboy
                      </button>
                    </div>
                  </div>

                  {/* Pickup locations dropdown if Retirada selected */}
                  {deliveryMethod === 'retirada' && activePickupPoints.length > 0 && (
                    <div className="space-y-1 animate-in slide-in-from-top duration-150">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">Escolha o Balcão de Coleta *</label>
                      <select
                        required
                        value={selectedPickupPoint}
                        onChange={(e) => setSelectedPickupPoint(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500"
                      >
                        {activePickupPoints.map(point => (
                          <option key={point.id} value={point.name}>{point.name} ({point.city}/{point.state})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {deliveryMethod === 'motoboy' && (
                    <div className="space-y-2 animate-in slide-in-from-top duration-150">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">Endereco completo para entrega *</label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">CEP *</label>
                          <input
                            type="text"
                            required={deliveryMethod === 'motoboy'}
                            value={deliveryZipCode}
                            onChange={(e) => {
                              const formatted = formatCEP(e.target.value);
                              setDeliveryZipCode(formatted);
                              const clean = formatted.replace(/\D/g, '');

                              if (clean.length === 8) {
                                fetch(`https://viacep.com.br/ws/${clean}/json/`)
                                  .then((res) => res.json())
                                  .then((data) => {
                                    if (!data.erro) {
                                      setDeliveryStreet(data.logradouro || '');
                                      setDeliveryNeighborhood(data.bairro || '');
                                      setDeliveryCity(data.localidade || '');
                                      setDeliveryState(data.uf || '');
                                    }
                                  })
                                  .catch(() => undefined);
                              }
                            }}
                            placeholder="00000-000"
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Rua / Logradouro *</label>
                          <input
                            type="text"
                            required={deliveryMethod === 'motoboy'}
                            value={deliveryStreet}
                            onChange={(e) => setDeliveryStreet(e.target.value)}
                            placeholder="Rua, avenida, travessa..."
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Numero *</label>
                          <input
                            type="text"
                            required={deliveryMethod === 'motoboy'}
                            value={deliveryNumber}
                            onChange={(e) => setDeliveryNumber(e.target.value)}
                            placeholder="80"
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-3">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Bairro *</label>
                          <input
                            type="text"
                            required={deliveryMethod === 'motoboy'}
                            value={deliveryNeighborhood}
                            onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                            placeholder="Bairro"
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="space-y-1 sm:col-span-3">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Cidade *</label>
                          <input
                            type="text"
                            required={deliveryMethod === 'motoboy'}
                            value={deliveryCity}
                            onChange={(e) => setDeliveryCity(e.target.value)}
                            placeholder="Cidade"
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">UF *</label>
                          <input
                            type="text"
                            required={deliveryMethod === 'motoboy'}
                            maxLength={2}
                            value={deliveryState}
                            onChange={(e) => setDeliveryState(e.target.value.toUpperCase())}
                            placeholder="PE"
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold uppercase text-center focus:outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">Observações do Orçamento</label>
                    <textarea
                      value={clientNotes}
                      onChange={(e) => setClientNotes(e.target.value)}
                      placeholder="Descreva detalhes como acabamento, cores ou urgência..."
                      rows={2}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/10 hover:shadow-lg transition-all flex items-center justify-center gap-1.5 mt-3"
                  >
                    Enviar Pedido de Orçamento <ArrowRight className="h-4.5 w-4.5" />
                  </button>
                </form>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <button
                onClick={() => setCartOpen(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold text-center transition-colors"
              >
                Voltar ao Catálogo
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 9. Success checkout modal */}
      {orderCompleted && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center py-6 px-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 text-center space-y-4 animate-in zoom-in duration-200 text-slate-800 shadow-2xl">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Orçamento Recebido!</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Obrigado! Seu pedido de orçamento foi cadastrado com sucesso. Código gerado: <strong className="text-slate-800">Orçamento #{orderCompleted}</strong>.
            </p>
            <p className="text-[10px] bg-slate-50 border border-slate-200 p-2.5 rounded-lg italic text-slate-600">
              Nossa equipe comercial analisará suas configurações e entrará em contato via WhatsApp nas próximas horas.
            </p>
            <button
              onClick={() => setOrderCompleted(null)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md"
            >
              Voltar ao Catálogo
            </button>
          </div>
        </div>
      )}

      {showPromotionsSection && (
        <section className="bg-slate-100 dark:bg-zinc-950 border-y border-slate-200 dark:border-zinc-800 py-10 md:py-12 px-4">
          <div className="max-w-7xl mx-auto space-y-7">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5">
              <div className="hidden sm:block h-px flex-1 bg-slate-900/80 dark:bg-zinc-700" />
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-4 md:gap-x-7 text-xs sm:text-sm md:text-base font-black uppercase tracking-wide text-slate-950 dark:text-zinc-100">
                {[
                  { id: 'bestsellers' as const, label: '+ Vendidos' },
                  { id: 'promo' as const, label: 'Promoções' },
                  { id: 'highlight' as const, label: 'Destaque' }
                ].map((tab, index) => (
                  <React.Fragment key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setShowcaseTab(tab.id)}
                      className={`transition-colors ${
                        showcaseTab === tab.id
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-950 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-400'
                      }`}
                    >
                      {tab.label}
                    </button>
                    {index < 2 && <span className="text-slate-950 dark:text-zinc-500">|</span>}
                  </React.Fragment>
                ))}
              </div>
              <div className="hidden sm:block h-px flex-1 bg-slate-900/80 dark:bg-zinc-700" />
            </div>

            {showcaseProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {showcaseProducts.map((product) => {
                  const hasVolumeTiers = product.volume_pricing && product.volume_pricing.length > 0;
                  const deliveryTime = product.delivery_time || product.pricing_details?.delivery_time;
                  const displayPrice = product.volume_pricing && product.volume_pricing.length > 0
                    ? Math.min(...product.volume_pricing.map(v => v.price))
                    : product.sales_price;

                  return (
                    <div
                      key={product.id}
                      className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div>
                        <div className="aspect-[1/1.08] w-full bg-white overflow-hidden border-b border-slate-200/60 flex items-center justify-center shrink-0 relative">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                            />
                          ) : (
                            <div className="text-slate-300 flex flex-col items-center gap-1">
                              <ShoppingBag className="h-10 w-10 stroke-[1.2]" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem Foto</span>
                            </div>
                          )}

                          <button
                            type="button"
                            className="absolute top-2.5 left-2.5 h-7 w-7 rounded-full bg-white/90 backdrop-blur-sm text-slate-400 hover:text-rose-500 shadow-sm flex items-center justify-center hover:scale-110 transition-all z-10"
                            onClick={(e) => { e.stopPropagation(); alert("Adicionado aos favoritos!"); }}
                          >
                            <Heart className="h-4 w-4" />
                          </button>

                          <div className="absolute top-2.5 right-2.5 flex flex-col gap-1 items-end z-10">
                            {product.is_promo && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowcaseTab('promo');
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[8px] md:text-[9px] uppercase tracking-wider shadow-md hover:bg-emerald-500 transition-colors"
                                title="Filtrar promoções"
                              >
                                <Tag className="h-2.5 w-2.5 stroke-[2.5]" />
                                Promoção
                              </button>
                            )}
                            {product.is_highlight && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowcaseTab('highlight');
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[8px] md:text-[9px] uppercase tracking-wider shadow-md hover:bg-emerald-500 transition-colors"
                                title="Filtrar destaques"
                              >
                                <Star className="h-2.5 w-2.5 fill-white stroke-none" />
                                Destaque
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="p-3 space-y-2.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg border border-emerald-500/10 uppercase tracking-wide">
                              {catalogCategories.find(c => c && c.id === product.category_id)?.name || 'Outros'}
                            </span>
                            {product.pricing_type === 'm2' && (
                              <span className="text-[9px] font-extrabold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-500/10 uppercase tracking-wide">
                                Sob Medida (m²)
                              </span>
                            )}
                          </div>

                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide line-clamp-2 min-h-[2rem] group-hover:text-emerald-600 transition-colors duration-300">
                            {product.name}
                          </h3>
                          {deliveryTime && (
                            <p className="text-[10px] leading-snug text-slate-500">
                              <strong className="text-slate-700">Prazo de entrega:</strong> {deliveryTime}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-100 p-3 pt-3 mt-1 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                            {hasVolumeTiers ? 'A partir de' : 'Preço'}
                          </span>
                          <span className="font-extrabold text-emerald-600 text-sm block leading-none">
                            {formatCurrency(displayPrice)}
                            <span className="text-[10px] text-slate-400 font-normal">/{product.pricing_type}</span>
                          </span>
                          {company.show_payments_pix !== false && (
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">
                              <svg className="h-3.5 w-3.5 text-[#32BCAD] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0L1.6 10.4 12 20.8 22.4 10.4 12 0zm0 3.2L19.2 10.4 12 17.6 4.8 10.4 12 3.2zm0 3.8L8.2 10.8 12 14.6 15.8 10.8 12 7zm0 2.2l1.6 1.6-1.6 1.6-1.6-1.6 1.6-1.6z"/>
                              </svg>
                              <span>
                                {formatCurrency(displayPrice * 0.95)} à vista
                              </span>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenProductConfig(product)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/5 hover:shadow-lg"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Comprar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="min-h-40 rounded-md border border-dashed border-slate-300 dark:border-zinc-700 flex items-center justify-center text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                Nenhum produto nesta seleção
              </div>
            )}
          </div>
        </section>
      )}

      {/* 10. Footer */}
      <footer className="bg-slate-900 text-slate-400 py-[15px] border-t border-slate-800 text-xs select-none">
        <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-16">
          
          {/* Contatos */}
          <div className="space-y-4">
            <div>
              <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Contatos</h4>
            </div>
            <div className="space-y-3.5">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">WhatsApp Vendas</span>
                <a href={`https://wa.me/55${(company.phone || '51987654321').replace(/\D/g, '')}`} target="_blank" className="flex items-center gap-2 text-slate-200 hover:text-emerald-400 font-semibold transition-colors">
                  <svg className="h-3.5 w-3.5 fill-current text-emerald-500 shrink-0" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z"/>
                  </svg>
                  <span>{company.phone || '(51) 98765-4321'}</span>
                </a>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">Telefone Comercial</span>
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Phone className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>{company.phone || '(51) 3785-3525'}</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">E-mail Vendas</span>
                <a href={`mailto:${company.email || 'comercial@printflowpro.com.br'}`} className="flex items-center gap-2 text-slate-200 hover:text-emerald-400 font-semibold transition-colors break-all">
                  <Mail className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>{company.email || 'comercial@printflowpro.com.br'}</span>
                </a>
              </div>
              
              {/* Redes Sociais */}
              {(company.instagram_url || company.facebook_url || company.youtube_url) && (
                <div className="pt-2 flex items-center gap-3">
                  {company.instagram_url && (
                    <a href={socialUrl('instagram', company.instagram_url)} target="_blank" rel="noopener noreferrer" className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white flex items-center justify-center transition-all hover:scale-105" title="Instagram">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                      </svg>
                    </a>
                  )}
                  {company.facebook_url && (
                    <a href={socialUrl('facebook', company.facebook_url)} target="_blank" rel="noopener noreferrer" className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white flex items-center justify-center transition-all hover:scale-105" title="Facebook">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                      </svg>
                    </a>
                  )}
                  {company.youtube_url && (
                    <a href={socialUrl('youtube', company.youtube_url)} target="_blank" rel="noopener noreferrer" className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white flex items-center justify-center transition-all hover:scale-105" title="YouTube">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                      </svg>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <div>
              <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Endereço</h4>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">Sede / Matriz</span>
                {settings?.footer_show_address !== false ? (
                  <p className="text-slate-200 font-medium leading-relaxed">
                    {company.street ? (
                      <>
                        {company.street}, {company.number}<br />
                        {company.neighborhood} - {company.city}/{company.state}<br />
                        CEP {company.cep}
                      </>
                    ) : (
                      <>
                        Avenida das Indústrias, 1200 - Igara<br />
                        Porto Alegre - RS | CEP 90200-290
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-slate-200 font-medium leading-relaxed italic">
                    Atendimento apenas online
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Horário de Atendimento */}
          <div className="space-y-4">
            <div>
              <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Horário de Atendimento</h4>
            </div>
            <div className="space-y-3.5 text-slate-200 font-medium leading-relaxed">
              {settings?.footer_hours_message && (
                <div className="p-2 bg-slate-800/40 border border-slate-800 rounded-xl text-[10px] text-slate-400 italic">
                  {settings.footer_hours_message}
                </div>
              )}
              <div className="space-y-2">
                <div className="space-y-0.5">
                  <p className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>{settings?.footer_hours_week || '8h às 12h / 13h30 às 18h'}</span>
                  </p>
                  <p className="text-slate-400 text-[10px] uppercase font-bold pl-5.5">{settings?.footer_hours_sat || 'Segunda à Sexta-feira'}</p>
                </div>
                {settings?.footer_hours_sat_time && (
                  <div className="space-y-0.5">
                    <p className="flex items-center gap-2 text-slate-200 font-semibold">
                      <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span>{settings.footer_hours_sat_time}</span>
                    </p>
                    <p className="text-slate-400 text-[10px] uppercase font-bold pl-5.5">{settings?.footer_hours_sat_desc || 'Sábado'}</p>
                  </div>
                )}
              </div>
              {settings?.footer_show_address !== false && (
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  LOJA FÍSICA | MATRIZ {company.city || 'PORTO ALEGRE'} - {company.state || 'RS'}
                </div>
              )}
            </div>
          </div>

          {/* Institucional */}
          <div className="space-y-4">
            <div>
              <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Institucional</h4>
            </div>
            <div className="flex flex-col gap-2.5 font-semibold">
              <div className="sm:hidden">
                <StoreInstallAppButton />
              </div>
              <button onClick={() => setCartOpen(true)} className="text-left text-slate-300 hover:text-emerald-400 transition-colors">
                Carrinho de Orçamentos
              </button>
              <button onClick={() => setSelectedCategory(null)} className="text-left text-slate-300 hover:text-emerald-400 transition-colors">
                Todos os Serviços
              </button>
              <button onClick={() => setPickupModalOpen(true)} className="text-left text-slate-300 hover:text-emerald-400 transition-colors">
                Balcões de Retirada
              </button>
              <button onClick={() => setRefundModalOpen(true)} className="text-left text-slate-300 hover:text-emerald-400 transition-colors">
                Política de devolução e reembolso
              </button>
              <a href={`https://wa.me/55${(company.phone || '51987654321').replace(/\D/g, '')}`} target="_blank" className="text-left text-slate-300 hover:text-emerald-400 transition-colors">
                Falar com Vendedor
              </a>
            </div>
          </div>

        </div>

        {/* Dynamic Badges: Payment, Delivery, Security */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 border-t border-slate-800/80 pt-[15px] mt-[15px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-16">
          {/* FORMAS DE PAGAMENTO */}
          <div className="space-y-3.5 lg:col-span-2">
            <h4 className="font-extrabold text-emerald-500 text-xs uppercase tracking-wider">Formas de Pagamento</h4>
            <div className="flex flex-wrap gap-2">
              {company.show_payments_visa !== false && (
                company.img_payments_visa ? (
                  <img src={company.img_payments_visa} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Visa" title="Visa" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Visa</span>
                )
              )}
              {company.show_payments_mastercard !== false && (
                company.img_payments_mastercard ? (
                  <img src={company.img_payments_mastercard} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Mastercard" title="Mastercard" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Mastercard</span>
                )
              )}
              {company.show_payments_elo !== false && (
                company.img_payments_elo ? (
                  <img src={company.img_payments_elo} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Elo" title="Elo" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Elo</span>
                )
              )}
              {company.show_payments_hipercard !== false && (
                company.img_payments_hipercard ? (
                  <img src={company.img_payments_hipercard} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Hipercard" title="Hipercard" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Hipercard</span>
                )
              )}
              {false && company.show_payments_diners !== false && (
                company.img_payments_diners ? (
                  <img src={company.img_payments_diners} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Diners Club" title="Diners Club" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Diners</span>
                )
              )}
              {false && company.show_payments_amex !== false && (
                company.img_payments_amex ? (
                  <img src={company.img_payments_amex} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="American Express" title="American Express" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Amex</span>
                )
              )}
              {false && company.show_payments_boleto !== false && (
                company.img_payments_boleto ? (
                  <img src={company.img_payments_boleto} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Boleto Bancário" title="Boleto Bancário" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Boleto</span>
                )
              )}
              {false && company.show_payments_transferencia !== false && (
                company.img_payments_transferencia ? (
                  <img src={company.img_payments_transferencia} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Transferência" title="Transferência" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Transferência</span>
                )
              )}
              {company.show_payments_pix !== false && (
                company.img_payments_pix ? (
                  <img src={company.img_payments_pix} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="PIX" title="PIX" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">PIX</span>
                )
              )}
            </div>
          </div>
 
          {/* FORMAS DE ENTREGA */}
          <div className="space-y-3.5">
            <h4 className="font-extrabold text-emerald-500 text-xs uppercase tracking-wider">Formas de Entrega</h4>
            <div className="flex flex-wrap gap-2">
              {company.show_delivery_sedex !== false && (
                company.img_delivery_sedex ? (
                  <img src={company.img_delivery_sedex} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="SEDEX" title="SEDEX" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">SEDEX</span>
                )
              )}
              {false && company.show_delivery_pac !== false && (
                company.img_delivery_pac ? (
                  <img src={company.img_delivery_pac} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="PAC" title="PAC" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">PAC</span>
                )
              )}
              {company.show_delivery_correios !== false && (
                company.img_delivery_correios ? (
                  <img src={company.img_delivery_correios} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Correios" title="Correios" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Correios</span>
                )
              )}
              {company.show_delivery_jadlog !== false && (
                company.img_delivery_jadlog ? (
                  <img src={company.img_delivery_jadlog} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Jadlog" title="Jadlog" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Jadlog</span>
                )
              )}
              {company.show_delivery_motoboy !== false && (
                company.img_delivery_motoboy ? (
                  <img src={company.img_delivery_motoboy} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Motoboy" title="Motoboy" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Motoboy</span>
                )
              )}
            </div>
          </div>
 
          {/* SEGURANÇA */}
          <div className="space-y-3.5">
            <h4 className="font-extrabold text-emerald-500 text-xs uppercase tracking-wider">Segurança</h4>
            <div className="flex flex-wrap gap-2">
              {company.show_security_letsencrypt !== false && (
                company.img_security_letsencrypt ? (
                  <img src={company.img_security_letsencrypt} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Let's Encrypt" title="Let's Encrypt" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">SSL Seguro</span>
                )
              )}
              {company.show_security_google !== false && (
                company.img_security_google ? (
                  <img src={company.img_security_google} className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white" alt="Google Safe" title="Google Safe" />
                ) : (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">Google Safe</span>
                )
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 border-t border-slate-800/80 pt-[15px] mt-[15px] text-center text-[10px] md:text-xs text-slate-500 font-medium flex flex-col items-center gap-4">
          <p>
            {new Date().getFullYear()} - Copyright © - {company.name || 'PrintFlowPRO'}
            {company.document ? ` - CNPJ: ${company.document}` : ''} | Desenvolvido para Alta Lucratividade de Gráficas e Comunicação Visual.
          </p>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600 bg-slate-950/40 px-3 py-1.5 rounded-full border border-slate-800/60 select-none">
            <span>Desenvolvido e Hospedado por</span>
            <BrandMark className="h-4 w-4 rounded-md" />
            <span className="font-extrabold uppercase tracking-widest text-emerald-400">PrintFlowPRO</span>
            <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold">SaaS v1.0</span>
          </div>
        </div>

        {/* Floating WhatsApp Badge */}
        <a
          href={`https://wa.me/55${(company.phone || '51987654321').replace(/\D/g, '')}`}
          target="_blank"
          className="fixed bottom-6 right-6 z-40 bg-[#25D366] hover:bg-[#20ba5a] text-white p-3.5 rounded-full shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
          title="Fale Conosco no WhatsApp"
        >
          <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z"/>
          </svg>
        </a>
      </footer>

      {/* Pickup points list modal */}
      {pickupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-center items-center py-6 px-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-2xl p-6 text-slate-800 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-600" />
                <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Nossos Balcões de Retirada</h3>
              </div>
              <button 
                onClick={() => setPickupModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto pr-1">
              {pickupPoints && pickupPoints.filter(p => p && p.active).length > 0 ? (
                pickupPoints.filter(p => p && p.active).map(point => (
                  <div key={point.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between hover:shadow-sm transition-shadow">
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">{point.name}</span>
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-normal">
                        {point.street ? `${point.street}, ${point.number} - ${point.neighborhood}` : point.address}
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase">
                      <span>{point.city} - {point.state}</span>
                      <span className="text-slate-500">
                        {point.hours_week ? `Seg-Sex: ${point.hours_week}${point.hours_sat ? ` | Sab: ${point.hours_sat}` : ''}` : point.hours}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-center py-6 text-xs text-slate-400 italic">
                  Nenhum balcão de retirada disponível no momento.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPickupModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md"
              >
                Fechar Janela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Policy Modal */}
      {refundModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-center items-center py-6 px-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-2xl p-6 text-slate-800 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-emerald-600" />
                <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Política de Devolução e Reembolso</h3>
              </div>
              <button 
                onClick={() => setRefundModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {company.refund_policy ? (
              <div
                className="rich-text-description max-h-[350px] overflow-y-auto pr-1 text-xs leading-relaxed text-slate-600 font-medium"
                dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(company.refund_policy) }}
              />
            ) : (
              <div className="max-h-[350px] overflow-y-auto pr-1 text-xs leading-relaxed text-slate-600 font-medium">
                Nenhuma política cadastrada no momento. Entre em contato com o suporte.
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRefundModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
