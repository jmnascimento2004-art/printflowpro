'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ShoppingBag, 
  ShoppingCart, 
  Trash2, 
  MapPin, 
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
  Tag,
  Star,
  Sun,
  Moon
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Product } from '@/lib/dummy-data';
import { formatCEP, normalizeRichTextHtml } from '@/lib/utils';
import { formatCurrency, formatUnitCurrency, getCatalogPricePresentation } from '@/lib/pricing';
import { getPrimaryProductImage } from '@/lib/product-images';
import { safeHref } from '@/lib/safe-url';
import { buildWhatsAppOrderMessage, openWhatsAppWithMessage } from '@/lib/whatsapp-order';
import { StorePWARegister } from '@/components/store/store-pwa-register';
import StoreMobileBottomNavigation from '@/components/store/StoreMobileBottomNavigation';
import { StoreAccountMenu } from '@/components/store/StoreAccountMenu';
import { StoreFooter } from '@/components/store/StoreFooter';
import { useStoreCustomer } from '@/context/store-customer-context';
import { formatStoreAddress } from '@/lib/store-customer';
import { STORE_ROUTES, withStoreRedirect } from '@/lib/store-routes';
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

function getStoreInitials(name: string) {
  const words = name.split(/\s+/).map((word) => word.replace(/[^a-z0-9]/gi, '')).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || 'LO').toUpperCase();
}

const isStoreDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.location.search.includes('debugStore=1') ||
    window.localStorage.getItem('printflow_store_debug') === 'true'
  );
};

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
  const searchParams = useSearchParams();
  const { products, categories, orders, addQuote, addCustomer, pickupPoints, banners, company, settings } = useDatabase();
  const {
    isAuthenticated: storeCustomerAuthenticated,
    customer: storeCustomer,
    addresses: storeCustomerAddresses,
    defaultAddress: storeDefaultAddress,
    favoriteProductIds,
    toggleProductFavorite
  } = useStoreCustomer();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState<'all' | 'promo' | 'highlight'>('all');
  const [showcaseTab, setShowcaseTab] = useState<'bestsellers' | 'promo' | 'highlight'>('bestsellers');
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [favoriteSavingProductId, setFavoriteSavingProductId] = useState<string | null>(null);

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

  const favoriteProductIdSet = useMemo(() => new Set(favoriteProductIds), [favoriteProductIds]);

  useEffect(() => {
    if (!favoriteNotice) return;

    const timeout = window.setTimeout(() => setFavoriteNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [favoriteNotice]);

  const handleProductFavorite = async (productId: string) => {
    if (!storeCustomerAuthenticated) {
      setFavoriteNotice('Entre ou crie sua conta para salvar favoritos.');
      return;
    }

    if (favoriteSavingProductId) return;

    setFavoriteSavingProductId(productId);
    try {
      const favorited = await toggleProductFavorite(productId);
      setFavoriteNotice(favorited ? 'Produto salvo nos favoritos.' : 'Produto removido dos favoritos.');
    } catch {
      setFavoriteNotice('Nao foi possivel atualizar seus favoritos agora.');
    } finally {
      setFavoriteSavingProductId(null);
    }
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

    const megamenuWidth = hasSidebar ? 560 : 768;
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
    event?.preventDefault();
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
      }
    }
  };

  const runWithoutScrollJump = (action: () => void) => {
    if (typeof window === 'undefined') {
      action();
      return;
    }

    const previousScrollY = window.scrollY;
    action();
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: previousScrollY, behavior: 'auto' });
    });
  };

  const handleMenuCategoryClick = (categoryId: string | null, event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    runWithoutScrollJump(() => {
      setMegaMenuCategory(categoryId);
      setSelectedCategory(categoryId);
      setMegaMenuOpen(false);
    });
  };

  const handleMegaMenuProductClick = (product: Product, event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    runWithoutScrollJump(() => {
      setMegaMenuOpen(false);
      handleOpenProductConfig(product);
    });
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

  useEffect(() => {
    if (!megaMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuBarRef.current?.contains(event.target as Node)) return;
      setMegaMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMegaMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [megaMenuOpen]);

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

  const handleStoreHome = () => {
    setSelectedCategory(null);
    setSelectedTagFilter('all');
    setSearchQuery('');
    setMegaMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleMobileSearchChange = (query: string) => {
    setSearchQuery(query);
    if (query.trim() && typeof window !== 'undefined') {
      const element = window.document.getElementById('products-showcase');
      if (element) {
        const y = element.getBoundingClientRect().top + window.pageYOffset - 96;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
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
  const [selectedStoreAddressId, setSelectedStoreAddressId] = useState('');
  const [orderCompleted, setOrderCompleted] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedCart = window.localStorage.getItem('printflow_store_cart');
      if (storedCart) setCart(JSON.parse(storedCart) as CartItem[]);
    } catch {
      // Cart persistence is only used to preserve checkout across auth navigation.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('printflow_store_cart', JSON.stringify(cart));
    } catch {
      // Ignore unavailable storage.
    }
  }, [cart]);

  useEffect(() => {
    if (searchParams.get('checkout') === '1') setCartOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!storeCustomerAuthenticated || !storeCustomer) return;

    setClientName((current) => current || storeCustomer.name || '');
    setClientPhone((current) => current || storeCustomer.phone || '');

    if (storeDefaultAddress) {
      setSelectedStoreAddressId((current) => current || storeDefaultAddress.id);
      setDeliveryZipCode((current) => current || storeDefaultAddress.zip_code || '');
      setDeliveryStreet((current) => current || storeDefaultAddress.street || '');
      setDeliveryNumber((current) => current || storeDefaultAddress.number || '');
      setDeliveryNeighborhood((current) => current || storeDefaultAddress.neighborhood || '');
      setDeliveryCity((current) => current || storeDefaultAddress.city || '');
      setDeliveryState((current) => current || storeDefaultAddress.state || '');
    }
  }, [storeCustomerAuthenticated, storeCustomer, storeDefaultAddress]);

  const applyStoreAddress = (addressId: string) => {
    setSelectedStoreAddressId(addressId);
    const address = storeCustomerAddresses.find((item) => item.id === addressId);
    if (!address) return;
    setDeliveryZipCode(address.zip_code || '');
    setDeliveryStreet(address.street || '');
    setDeliveryNumber(address.number || '');
    setDeliveryNeighborhood(address.neighborhood || '');
    setDeliveryCity(address.city || '');
    setDeliveryState(address.state || '');
    setDeliveryMethod('motoboy');
  };

  // 1. Filter active points and auto-select first active point
  const activePickupPoints = useMemo(
    () => (pickupPoints || []).filter(p => p && p.active),
    [pickupPoints]
  );
  
  useEffect(() => {
    if (activePickupPoints.length > 0 && !selectedPickupPoint) {
      setSelectedPickupPoint(activePickupPoints[0].name);
    }
  }, [activePickupPoints, selectedPickupPoint]);

  // 2. Keep hidden categories out of the menu, but not out of "Todos os produtos".
  const catalogCategories = (categories || []).filter((category) => {
    if (!category || category.show_in_catalog === false) return false;
    if (!category.parent_id) return true;
    const parent = (categories || []).find((item) => item.id === category.parent_id);
    return parent?.show_in_catalog !== false;
  });
  const getProductCategoryName = useCallback((product: Product) => {
    if (!product.category_id) return 'Outros';
    return categories.find((item) => item.id === product.category_id)?.name || 'Outros';
  }, [categories]);

  const getProductSaleModeLabel = useCallback((product: Product) => {
    const configurator = product.pricing_details?.configurator_options;
    if (product.pricing_type === 'm2') return 'Sob Medida (m²)';
    if (product.pricing_type === 'linear') {
      return configurator?.max_width ? 'Metro linear largura max.' : 'Metro linear';
    }
    return '';
  }, []);

  const getProductPriceUnitLabel = useCallback((product: Product, hasVolumeTiers: boolean) => {
    if (hasVolumeTiers) return 'un';
    if (product.pricing_type === 'm2') return 'm²';
    if (product.pricing_type === 'linear') return 'm linear';
    return product.pricing_type;
  }, []);

  const activeProducts = (products || []).filter((product) => {
    if (!product || product.active === false) return false;
    if (!product || product.catalog_active === false) return false;
    return true;
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

  useEffect(() => {
    if (!isStoreDebugEnabled()) return;

    const productsAfterActive = (products || []).filter((product) => product && product.active !== false);
    const productsAfterCatalog = productsAfterActive.filter((product) => product.catalog_active !== false);

    console.log('[STORE DEBUG] page-filters', {
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      company: company
        ? {
            id: company.id,
            name: company.name,
            admin_domain: company.admin_domain,
            store_domain: company.store_domain,
            custom_domain: company.custom_domain
          }
        : null,
      companyId: company?.id || null,
      productsRawCount: (products || []).length,
      productsAfterActiveCount: productsAfterActive.length,
      productsAfterCatalogActiveCount: productsAfterCatalog.length,
      categoriesCount: (categories || []).length,
      searchTerm: searchQuery,
      selectedCategory,
      selectedTagFilter,
      finalRenderedCount: taggedProducts.length,
      finalRenderedProducts: taggedProducts.map((product) => ({
        id: product.id,
        name: product.name,
        company_id: product.company_id,
        category_id: product.category_id,
        category_name: getProductCategoryName(product),
        active: product.active,
        catalog_active: product.catalog_active
      }))
    });
  }, [products, categories, company, searchQuery, selectedCategory, selectedTagFilter, taggedProducts, getProductCategoryName]);

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
    const companyWhatsAppPhone = settings.catalog_whatsapp || '';
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
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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

    const webCustomer = storeCustomerAuthenticated && storeCustomer ? storeCustomer : addCustomer({
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
      notes: `Cliente criado pelo catálogo online.\nInteresse de compra:\n${purchaseInterest}\nObs cliente: ${checkoutNotes}`,
      billing_type: 'imediato',
      credit_limit: 0,
      credit_used: 0,
      payment_terms_days: 0,
      credit_status: 'aprovado'
    });

    const nextQuote = addQuote({
      customer_id: webCustomer.id,
      customer_name: storeCustomerAuthenticated ? clientName.trim() : `${clientName} (Web)`,
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
    if (typeof window !== 'undefined') window.localStorage.removeItem('printflow_store_cart');
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
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200/70 pb-[calc(5.75rem+env(safe-area-inset-bottom))] text-slate-800 antialiased dark:bg-zinc-950 dark:text-zinc-100 md:pb-0 font-sans flex flex-col justify-between">
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

      {favoriteNotice && (
        <div
          role="status"
          className="fixed right-4 top-4 z-[70] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-2xl md:right-6 md:top-6"
        >
          <p>{favoriteNotice}</p>
          {favoriteNotice.startsWith('Entre') && (
            <div className="mt-2 flex gap-2">
              <Link href={STORE_ROUTES.login} className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50">
                Entrar
              </Link>
              <Link href={STORE_ROUTES.signup} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-white">
                Criar conta
              </Link>
            </div>
          )}
        </div>
      )}
      
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
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xs font-black text-white">
                    {getStoreInitials(company.name || 'Loja')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950 dark:text-white">{company.name || 'Loja'}</p>
                    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">Catalogo Online</p>
                  </div>
                </div>
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
            <StoreAccountMenu primaryColor={primary} />

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
              className="hidden md:flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white relative transition-all shadow-md shadow-emerald-600/10"
              aria-label="Carrinho"
              title="Carrinho"
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shadow-md animate-bounce">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Search Field */}
      <div className="hidden bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 md:hidden py-3">
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
      <div className="hidden md:block bg-white dark:bg-zinc-900 sticky top-20 z-20 shadow-sm border-b border-slate-200 dark:border-zinc-800 w-full select-none">
        <div ref={menuBarRef} className="max-w-7xl mx-auto w-full px-4 md:px-8 relative">
          <div className="w-full flex items-center overflow-x-auto no-scrollbar">
            <div className="flex items-center w-full min-w-max h-12">
              {/* Todos os Serviços button styled as hamburger menu */}
              <button
                type="button"
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
                className="absolute top-full bg-white dark:bg-zinc-900 border-t-0 border border-slate-200 dark:border-zinc-800 shadow-2xl rounded-b-3xl overflow-hidden hidden md:block z-20 animate-in fade-in slide-in-from-top-2 duration-200 text-slate-800 dark:text-zinc-200"
              >
                {/* Left Sidebar: Categories List */}
                {openedFromAllProducts && (
                  <div className="bg-slate-50/80 dark:bg-zinc-950/80 p-5 space-y-1.5 max-h-[360px] overflow-y-auto no-scrollbar">
                    <div className="mb-3 border-b border-slate-200/80 dark:border-zinc-800 pb-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                        Categorias
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
                        Escolha uma categoria para filtrar os produtos.
                      </p>
                    </div>

                    {(() => {
                      const rootCategories = catalogCategories.filter(c => !c.parent_id);
                      const childCategories = catalogCategories.filter(c => c.parent_id);
                      const items: { id: string; name: string; isChild: boolean }[] = [];
                      rootCategories.forEach(parent => {
                        items.push({ id: parent.id, name: parent.name, isChild: false });
                        childCategories
                          .filter(child => child.parent_id === parent.id)
                          .forEach(child => {
                            items.push({ id: child.id, name: child.name, isChild: true });
                          });
                      });
                      
                      // Fallback: add child categories whose parents aren't found in root
                      childCategories.forEach(child => {
                        if (!rootCategories.some(r => r.id === child.parent_id) && !items.some(item => item.id === child.id)) {
                          items.push({ id: child.id, name: child.name, isChild: true });
                        }
                      });

                      if (items.length === 0) {
                        return (
                          <p className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/70 px-4 py-6 text-center text-xs font-bold text-slate-500 dark:text-zinc-400">
                            Nenhuma categoria cadastrada.
                          </p>
                        );
                      }

                      return items.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={(event) => handleMenuCategoryClick(cat.id, event)}
                          className={`w-full text-left py-2.5 rounded-xl transition-all flex items-center justify-between group uppercase tracking-wide ${
                            cat.isChild 
                              ? 'pl-7 pr-3.5 text-[11px] font-medium normal-case' 
                              : 'px-3.5 text-xs font-bold'
                          } ${
                            selectedCategory === cat.id
                              ? 'bg-white dark:bg-zinc-900 shadow-sm border border-slate-200/80 dark:border-zinc-800 text-slate-900 dark:text-white font-extrabold'
                              : 'hover:bg-slate-100/70 dark:hover:bg-zinc-850/70 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <span className="truncate">
                            {cat.name}
                          </span>
                          {selectedCategory === cat.id && <ChevronRight className="h-3.5 w-3.5 text-slate-700 dark:text-zinc-300 shrink-0 ml-2" />}
                        </button>
                      ));
                    })()}
                  </div>
                )}

                {/* Right Area: Product Sublists */}
                {!openedFromAllProducts && (() => {
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
                                  type="button"
                                  onClick={(event) => handleMegaMenuProductClick(p, event)}
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
                                  type="button"
                                  onClick={(event) => handleMegaMenuProductClick(p, event)}
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
                                  type="button"
                                  onClick={(event) => handleMegaMenuProductClick(p, event)}
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
                            <h2 className="text-lg sm:text-2xl md:text-4xl font-black uppercase tracking-tight leading-tight drop-shadow-sm">
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
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {taggedProducts.map(p => {
                const deliveryTime = p.delivery_time || p.pricing_details?.delivery_time;
                const pricePresentation = getCatalogPricePresentation(p);
                const { hasVolumeTiers } = pricePresentation;
                const displayPrice = pricePresentation.unitPrice;
                const saleModeLabel = getProductSaleModeLabel(p);
                const priceUnitLabel = getProductPriceUnitLabel(p, hasVolumeTiers);
                const primaryImage = getPrimaryProductImage(p);

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Abrir produto ${p.name}`}
                    onClick={() => handleOpenProductConfig(p)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;

                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleOpenProductConfig(p);
                      }
                    }}
                    className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 transition-all duration-200 flex flex-col justify-between group relative overflow-hidden cursor-pointer"
                  >
                    <div>
                      {/* Product Image Area (Aspect Square & No Margin at top/left/right) */}
                      <div className="aspect-[1/1.08] w-full bg-white overflow-hidden border-b border-slate-200/60 flex items-center justify-center shrink-0 relative">
                        {primaryImage ? (
                          <img
                            src={primaryImage}
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
                        {(() => {
                          const isFavorite = favoriteProductIdSet.has(p.id);
                          const isSaving = favoriteSavingProductId === p.id;

                          return (
                            <button
                              type="button"
                              className={`absolute top-2.5 left-2.5 h-7 w-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center hover:scale-110 transition-all z-10 disabled:cursor-wait disabled:opacity-70 ${
                                isFavorite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProductFavorite(p.id);
                              }}
                              disabled={isSaving}
                              aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                              title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                            >
                              <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                            </button>
                          );
                        })()}

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
                      <div className="p-3 space-y-1.5">
                        {/* Visual Category badge */}
                        <div className="flex justify-between items-center gap-1.5">
                          <span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg border border-emerald-500/10 uppercase tracking-wide">
                            {getProductCategoryName(p)}
                          </span>
                          {saleModeLabel && (
                            <span className="text-[9px] font-extrabold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-500/10 uppercase tracking-wide">
                              {saleModeLabel}
                            </span>
                          )}
                        </div>
                        
                        {/* Product Title (uppercase & bold as in reference image) */}
                        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide leading-tight line-clamp-2 min-h-[1.8rem] group-hover:text-emerald-600 transition-colors duration-300">
                          {p.name}
                        </h3>
                        {deliveryTime && (
                          <p className="text-[10px] leading-tight text-slate-500">
                            <strong className="text-slate-700">Prazo de entrega:</strong> {deliveryTime}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Price card footer */}
                    <div className="border-t border-slate-100 p-3 pt-2.5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div className="leading-tight">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                          {hasVolumeTiers ? 'A partir de' : 'Preço'}
                        </span>
                        {hasVolumeTiers && (
                          <span className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500 leading-tight">
                            {pricePresentation.quantity} un
                          </span>
                        )}
                        <span className="font-extrabold text-emerald-600 text-sm block leading-none">
                          {hasVolumeTiers ? formatUnitCurrency(displayPrice) : formatCurrency(displayPrice)} 
                          <span className="text-[10px] text-slate-400 font-normal">/{priceUnitLabel}</span>
                        </span>
                        {hasVolumeTiers && (
                          <span className="mt-0.5 block text-[10px] font-bold text-slate-500 leading-tight">
                            {formatCurrency(pricePresentation.totalPrice)} total
                          </span>
                        )}
                        {company.show_payments_pix !== false && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-emerald-600 dark:text-emerald-400 font-extrabold">
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
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenProductConfig(p);
                        }}
                        className="flex min-h-10 items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/5 hover:shadow-lg"
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
          <h2 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
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
            ? getProductCategoryName(activeAdvancedConfigProduct)
            : undefined
        }
      />

      {/* 8. Cart Drawer Panel */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-md border-l border-slate-200 h-full flex flex-col justify-between shadow-2xl p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6 overflow-y-auto animate-in slide-in-from-right duration-200 text-slate-800">
            
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
                        <span className="text-[10px] text-slate-500 mt-0.5 block font-semibold">{item.quantity}x {formatUnitCurrency(item.calculatedPrice)}</span>
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
                  {!storeCustomerAuthenticated && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                      <p className="text-xs font-black text-slate-950">Ja possui uma conta?</p>
                      <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-600">
                        Crie sua conta para acompanhar pedidos, salvar endereços e comprar com mais rapidez.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Link href={withStoreRedirect(STORE_ROUTES.login, STORE_ROUTES.checkout)} className="flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700">
                          Entrar
                        </Link>
                        <Link href={withStoreRedirect(STORE_ROUTES.signup, STORE_ROUTES.checkout)} className="flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-black text-white">
                          Criar conta
                        </Link>
                      </div>
                    </div>
                  )}
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-500">
                    Usaremos estes dados para processar o orçamento, pedido, pagamento, entrega e atendimento. Marketing e cookies não essenciais dependem de consentimento separado.
                  </p>
                  
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

                      {storeCustomerAuthenticated && storeCustomerAddresses.length > 0 && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Enderecos salvos</label>
                          <select
                            value={selectedStoreAddressId}
                            onChange={(event) => applyStoreAddress(event.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">Selecionar endereço salvo...</option>
                            {storeCustomerAddresses.map((address) => (
                              <option key={address.id} value={address.id}>
                                {address.label} - {formatStoreAddress(address)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

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
                    className="sticky bottom-0 z-10 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/10 hover:shadow-lg transition-all flex items-center justify-center gap-1.5 mt-3"
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
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {showcaseProducts.map((product) => {
                  const deliveryTime = product.delivery_time || product.pricing_details?.delivery_time;
                  const pricePresentation = getCatalogPricePresentation(product);
                  const { hasVolumeTiers } = pricePresentation;
                  const displayPrice = pricePresentation.unitPrice;
                  const saleModeLabel = getProductSaleModeLabel(product);
                  const priceUnitLabel = getProductPriceUnitLabel(product, hasVolumeTiers);
                  const primaryImage = getPrimaryProductImage(product);

                  return (
                    <div
                      key={product.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Abrir produto ${product.name}`}
                      onClick={() => handleOpenProductConfig(product)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;

                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleOpenProductConfig(product);
                        }
                      }}
                      className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 transition-all duration-200 flex flex-col justify-between group relative overflow-hidden cursor-pointer"
                    >
                      <div>
                        <div className="aspect-[1/1.08] w-full bg-white overflow-hidden border-b border-slate-200/60 flex items-center justify-center shrink-0 relative">
                          {primaryImage ? (
                            <img
                              src={primaryImage}
                              alt={product.name}
                              className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                            />
                          ) : (
                            <div className="text-slate-300 flex flex-col items-center gap-1">
                              <ShoppingBag className="h-10 w-10 stroke-[1.2]" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem Foto</span>
                            </div>
                          )}

                          {(() => {
                            const isFavorite = favoriteProductIdSet.has(product.id);
                            const isSaving = favoriteSavingProductId === product.id;

                            return (
                              <button
                                type="button"
                                className={`absolute top-2.5 left-2.5 h-7 w-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center hover:scale-110 transition-all z-10 disabled:cursor-wait disabled:opacity-70 ${
                                  isFavorite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleProductFavorite(product.id);
                                }}
                                disabled={isSaving}
                                aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                                title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                              >
                                <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                              </button>
                            );
                          })()}

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

                        <div className="p-3 space-y-1.5">
                          <div className="flex justify-between items-center gap-1.5">
                            <span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg border border-emerald-500/10 uppercase tracking-wide">
                              {getProductCategoryName(product)}
                            </span>
                            {saleModeLabel && (
                              <span className="text-[9px] font-extrabold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-500/10 uppercase tracking-wide">
                                {saleModeLabel}
                              </span>
                            )}
                          </div>

                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide leading-tight line-clamp-2 min-h-[1.8rem] group-hover:text-emerald-600 transition-colors duration-300">
                            {product.name}
                          </h3>
                          {deliveryTime && (
                            <p className="text-[10px] leading-tight text-slate-500">
                              <strong className="text-slate-700">Prazo de entrega:</strong> {deliveryTime}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-100 p-3 pt-2.5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div className="leading-tight">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                            {hasVolumeTiers ? 'A partir de' : 'Preço'}
                          </span>
                          {hasVolumeTiers && (
                            <span className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500 leading-tight">
                              {pricePresentation.quantity} un
                            </span>
                          )}
                          <span className="font-extrabold text-emerald-600 text-sm block leading-none">
                            {hasVolumeTiers ? formatUnitCurrency(displayPrice) : formatCurrency(displayPrice)}
                            <span className="text-[10px] text-slate-400 font-normal">/{priceUnitLabel}</span>
                          </span>
                          {hasVolumeTiers && (
                            <span className="mt-0.5 block text-[10px] font-bold text-slate-500 leading-tight">
                              {formatCurrency(pricePresentation.totalPrice)} total
                            </span>
                          )}
                          {company.show_payments_pix !== false && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-emerald-600 dark:text-emerald-400 font-extrabold">
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
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenProductConfig(product);
                          }}
                          className="flex min-h-10 items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/5 hover:shadow-lg"
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
      <StoreFooter
        company={company}
        settings={settings}
        storeCustomerAuthenticated={storeCustomerAuthenticated}
        onShowAllServices={() => setSelectedCategory(null)}
        onOpenPickupPoints={() => setPickupModalOpen(true)}
      />
      {!cartOpen && !activeAdvancedConfigProduct && !orderCompleted && !pickupModalOpen && !refundModalOpen && (
        <StoreMobileBottomNavigation
          categories={catalogCategories}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          cartItemCount={cartItemCount}
          companyName={company.name || 'Loja online'}
          companyPhone={settings.catalog_whatsapp}
          companyEmail={company.email}
          primaryColor={primary}
          onGoHome={handleStoreHome}
          onSelectCategory={handleCategorySelect}
          onSearchChange={handleMobileSearchChange}
          onOpenCart={() => setCartOpen(true)}
          onOpenPickupPoints={() => setPickupModalOpen(true)}
          onOpenRefundPolicy={() => setRefundModalOpen(true)}
        />
      )}

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
                className="pf-button-primary px-5 py-2.5 text-xs shadow-md"
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
                className="pf-button-primary px-5 py-2.5 text-xs shadow-md"
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
