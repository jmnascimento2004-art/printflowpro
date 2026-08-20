'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { publicStoreSelect } from '@/lib/publicSupabaseClient';
import { warnCaught } from '@/lib/safe-log';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import {
  clearOperationalDemoSnapshots,
  getOrSetDemoSnapshot,
  isDemoFallbackAllowed,
  persistDemoSnapshot
} from '@/context/database/demo-storage';
import {
  createUnprovisionedCompany,
  mergeCategoriesWithStoredVisibility,
  normalizeDemoFinancial,
  normalizeDemoOrders,
  normalizeDemoProduction,
  normalizeDemoShipments
} from '@/context/database/bootstrap';
import {
  reconstructOrdersWithItems,
  reconstructQuotesWithItems,
  type OrderItemRow,
  type QuoteItemRow
} from '@/context/database/reconstruct';
import {
  buildCustomerRecord,
  createCustomer,
  deleteAllCustomers,
  deleteCustomerRecord,
  listCustomers,
  updateCustomerRecord,
  type NewCustomerInput
} from '@/services/customers.service';
import {
  Customer,
  Supplier,
  Category,
  Product,
  Quote,
  Order,
  ProductionItem,
  FinancialTransaction,
  Shipment,
  StockMovement,
  DUMMY_CUSTOMERS,
  DUMMY_SUPPLIERS,
  DUMMY_CATEGORIES,
  DUMMY_PRODUCTS,
  DUMMY_QUOTES,
  DUMMY_ORDERS,
  DUMMY_PRODUCTION_QUEUE,
  DUMMY_FINANCIAL,
  DUMMY_SHIPMENTS,
  DUMMY_SETTINGS,
  DUMMY_COMPANY,
  Company,
  OrderItem,
  QuoteItem,
  PickupPoint,
  DUMMY_PICKUP_POINTS,
  UserProfile,
  DUMMY_PROFILES
} from '@/lib/dummy-data';
import { normalizeStatus } from '@/lib/order-status';
import { useAuth } from '@/context/auth-context';
import {
  assignProductionResponsiblePersisted,
  ensureProductionQueueForOrder,
  ProductionMutationError,
  replaceProductionItem,
  transitionProductionStage
} from '@/lib/production/production-service';
import {
  adjustInventoryStock,
  deleteTenantRecord,
  insertTenantRecord,
  operateCashRegister,
  patchTenantRecord,
  PersistenceMutationError,
  recordOrderPayment,
  saveRolePermissions,
  settleFinancialTransaction,
  transitionOrderStatus,
  transitionShipment
} from '@/lib/persistence/persistence-service';

export interface CashRegisterSession {
  id: string;
  company_id: string;
  opened_by: string;
  opened_at: string;
  closed_at?: string;
  opening_balance: number;
  expected_cash: number;
  actual_cash?: number;
  difference?: number;
  status: 'aberto' | 'fechado';
  notes?: string;
  updated_at?: string;
}

export interface CashRegisterTransaction {
  id: string;
  session_id: string;
  type: 'abertura' | 'suprimento' | 'sangria' | 'venda' | 'fechamento';
  amount: number;
  description: string;
  payment_method: string;
  created_at: string;
}

interface DatabaseContextType {
  isTenantReady: boolean;
  isSessionSwitching: boolean;
  customers: Customer[];
  suppliers: Supplier[];
  categories: Category[];
  products: Product[];
  quotes: Quote[];
  orders: Order[];
  production: ProductionItem[];
  financial: FinancialTransaction[];
  shipments: Shipment[];
  settings: typeof DUMMY_SETTINGS;
  company: Company;
  updateCompany: (comp: Company) => void;
  pickupPoints: PickupPoint[];
  
  // Caixa
  activeSession: CashRegisterSession | null;
  sessions: CashRegisterSession[];
  registerTransactions: CashRegisterTransaction[];
  openRegister: (openingBalance: number, notes?: string) => void;
  closeRegister: (actualCash: number, notes?: string) => void;
  addRegisterTransaction: (type: 'suprimento' | 'sangria', amount: number, description: string) => void;

  // POS
  addOrderFromPOS: (posOrder: {
    customer_id: string;
    customer_name: string;
    items: Omit<OrderItem, 'id' | 'outsourced'>[];
    discount: number;
    paid_amount: number;
    payment_method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado';
    notes?: string;
  }) => Promise<Order | null>;

  // Clientes
  addCustomer: (cust: NewCustomerInput) => Customer;
  updateCustomer: (cust: Customer) => void;
  deleteCustomer: (id: string) => void;

  // Suppliers & Categories
  addSupplier: (sup: Omit<Supplier, 'id' | 'company_id' | 'created_at'>) => Supplier;
  addCategory: (name: string, description: string, parent_id?: string | null, show_in_catalog?: boolean) => Category;
  updateCategory: (id: string, name: string, description: string, parent_id?: string | null, show_in_catalog?: boolean) => void;
  updateCategoryCatalogPresentation: (id: string, patch: CategoryCatalogPresentationPatch) => Promise<void>;
  deleteCategory: (id: string) => void;

  // Products
  addProduct: (prod: Omit<Product, 'id' | 'company_id' | 'created_at' | 'current_stock'>) => Product;
  updateProduct: (prod: Product) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (productId: string, quantity: number, reason: string, type: 'entrada' | 'saida', cost?: number) => void;
  stockMovements: StockMovement[];

  // Quotes
  addQuote: (quote: Omit<Quote, 'id' | 'company_id' | 'number' | 'created_at'>) => Quote;
  updateQuote: (quote: Quote) => void;
  deleteQuote: (id: string) => void;
  approveQuote: (id: string) => Promise<Order | null>;

  // Orders
  addOrder: (order: Omit<Order, 'id' | 'company_id' | 'number' | 'created_at'>) => Promise<Order | null>;
  updateOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  payOrder: (
    id: string,
    amount: number,
    method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado',
    options?: {
      payment_type?: 'adiantamento' | 'parcial' | 'saldo' | 'total';
      paid_at?: string;
      notes?: string;
    }
  ) => void;

  // Production
  updateProductionStatus: (id: string, status: ProductionItem['status']) => Promise<void>;
  assignProductionResponsible: (id: string, responsibleName: string) => Promise<void>;

  // Financial
  addTransaction: (trans: Omit<FinancialTransaction, 'id' | 'company_id' | 'created_at'>) => FinancialTransaction;
  updateTransactionStatus: (id: string, status: 'pendente' | 'pago') => void;

  // Shipments
  updateShipmentStatus: (id: string, status: Shipment['status'], tracking?: string, carrier?: string) => void;

  // Settings
  updateSettings: (newSettings: Partial<typeof DUMMY_SETTINGS>) => void;

  // Pickup Points CRUD
  addPickupPoint: (point: Omit<PickupPoint, 'id' | 'company_id'>) => PickupPoint;
  updatePickupPoint: (point: PickupPoint) => void;
  deletePickupPoint: (id: string) => void;
  
  // Store banners
  banners: StoreBanner[];
  addBanner: (banner: Omit<StoreBanner, 'id'>) => StoreBanner;
  updateBanner: (id: string, patch: Partial<Omit<StoreBanner, 'id'>>) => void;
  deleteBanner: (id: string) => void;

  // Employees CRUD
  profiles: UserProfile[];
  addProfile: (profile: Omit<UserProfile, 'id' | 'company_id'>) => UserProfile;
  updateProfile: (profile: UserProfile) => Promise<UserProfile>;
  deleteProfile: (id: string) => void;

  // Permissions
  rolePermissions: Record<string, string[]>;
  updateRolePermissions: (permissions: Record<string, string[]>) => void;

  // Helpers
  refreshStoreCatalog: () => Promise<void>;
  resetDatabase: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export interface StoreBanner {
  id: string;
  image_url: string;
  title?: string;
  subtitle?: string;
  link?: string;
  placement?: 'hero' | 'catalog';
  mobile_image_url?: string | null;
  alt_text?: string | null;
  active?: boolean;
  sort_order?: number;
  open_in_new_tab?: boolean;
  updated_at?: string;
}

export type CategoryCatalogPresentationPatch = Pick<Category,
  | 'catalog_featured'
  | 'catalog_featured_title'
  | 'catalog_featured_sort_order'
  | 'catalog_mega_menu_enabled'
  | 'catalog_mega_menu_banner_enabled'
  | 'catalog_mega_menu_banner_image_url'
  | 'catalog_mega_menu_banner_link'
  | 'catalog_mega_menu_banner_alt'
  | 'catalog_mega_menu_banner_new_tab'
>;

type StoreBannerRow = StoreBanner & { company_id?: string };
type RolePermissionRow = { id: string; company_id: string; path: string; roles: string[]; updated_at?: string };
type SavedQuotePayload = {
  quote?: Omit<Quote, 'items'> | null;
  items?: Array<QuoteItem & { quote_id?: string }> | null;
};
type Phase4bAggregateSaveResult = {
  result_status: 'UPDATED' | 'CONFLICT' | 'NOT_FOUND' | 'NOT_AUTHORIZED' | 'INVALID_INPUT';
  payload?: SavedQuotePayload | SavedOrderPayload;
  quote?: Record<string, unknown>;
  order?: Record<string, unknown>;
};
type SavedOrderPayload = {
  order?: Omit<Order, 'items'> | null;
  items?: Array<OrderItem & { order_id?: string }> | null;
};
type ApprovedQuotePayload = SavedOrderPayload & {
  quote?: Omit<Quote, 'items'> | null;
};
type PublicStoreDataResponse = {
  debug?: Record<string, unknown>;
  company: Company | null;
  settings: (Partial<typeof DUMMY_SETTINGS> & { company_id?: string }) | null;
  categories: Category[];
  products: Product[];
  pickupPoints: PickupPoint[];
  banners: StoreBannerRow[];
};

const DEFAULT_BANNERS: StoreBanner[] = [
  {
    id: 'banner-1',
    image_url: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=1200&q=80',
    title: 'CALCULE AS MEDIDAS & ENCOMENDE ONLINE',
    subtitle: 'Banners, lona 440g e adesivos sob medida com preço calculado em tempo real.',
    link: '#'
  },
  {
    id: 'banner-2',
    image_url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1200&q=80',
    title: 'PAPELARIA INSTITUCIONAL EM ATACADO',
    subtitle: 'Cartões de visita, talões e panfletos com descontos progressivos por quantidade.',
    link: '#'
  }
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  '/dashboard': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/pos': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/crm': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/whatsapp': ['admin', 'gerente'],
  '/customers': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/products': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/quotes': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/pricing': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/orders': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/production': ['admin', 'gerente', 'producao', 'arte_finalista'],
  '/financial': ['admin', 'gerente', 'financeiro'],
  '/stock': ['admin', 'gerente', 'financeiro', 'producao', 'estoque'],
  '/shipment': ['admin', 'gerente', 'financeiro', 'producao'],
  '/resale': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/settings': ['admin', 'gerente'],
};

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);
const SETTINGS_LOCAL_FALLBACK_KEYS = [
  'pix_key',
  'pix_key_type',
  'pix_beneficiary_name',
  'bank_name',
  'profit_margin',
  'tax_rate',
  'commission_rate',
  'top_bar_hours',
  'top_bar_show_pickup',
  'top_bar_phone',
  'footer_show_address',
  'footer_hours_message',
  'footer_hours_week',
  'footer_hours_sat',
  'footer_hours_sat_time',
  'footer_hours_sat_desc',
  'saas_enabled',
  'nfe_enabled',
  'ai_enabled',
  'company_address',
  'delivery_motoboy_price_km',
  'delivery_car_price_km',
  'delivery_min_fee',
  'catalog_header_message',
  'catalog_whatsapp',
  'free_pickup_alert',
  'catalog_promotions_section_enabled',
  'catalog_bestsellers_section_enabled',
  'catalog_highlights_section_enabled',
  'catalog_footer_text'
] as const;
const isBrowser = () => typeof window !== 'undefined';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const isPublicStoreRoute = () => isBrowser() && window.location.pathname.startsWith('/store');

const normalizeDomain = (value?: string | null) => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  return withoutProtocol.split('/')[0].split(':')[0].replace(/^www\./, '');
};

const normalizeDomainSlug = (value: string = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const isPlaceholderCompanyName = (name?: string | null) => {
  const slug = normalizeDomainSlug(name || '');
  return !slug || slug === 'minhaempresa' || slug === 'printflowpro';
};

const resolveLocalCompany = (companies: Company[]) =>
  companies.find((company) => !isPlaceholderCompanyName(company.name)) || companies[0];

const normalizeProductionQueueStatus = (status: unknown): ProductionItem['status'] => {
  const normalized = normalizeStatus(status);
  if (normalized.includes('acabamento') || normalized === 'finishing') return 'impressao';
  if (['fila', 'producao', 'impressao', 'concluido', 'expedicao', 'entregue', 'finalizado'].includes(normalized)) {
    return normalized as ProductionItem['status'];
  }
  return 'fila';
};

const getCurrentHostname = () => {
  if (!isBrowser()) return '';
  return normalizeDomain(window.location.hostname);
};

const isStoreDebugEnabled = () => {
  if (!isBrowser()) return false;
  return (
    window.location.search.includes('debugStore=1') ||
    window.localStorage.getItem('printflow_store_debug') === 'true'
  );
};

const logStoreDebug = (label: string, payload: Record<string, unknown>) => {
  if (!isStoreDebugEnabled()) return;
  console.log(`[STORE DEBUG] ${label}`, payload);
};

const resolveCompanyForHostname = (companies: Company[]) => {
  const hostname = getCurrentHostname();
  if (!hostname || LOCAL_HOSTNAMES.has(hostname)) return resolveLocalCompany(companies);
  const exactDomainMatch = companies.find((item) => {
    const adminDomain = normalizeDomain(item.admin_domain);
    const storeDomain = normalizeDomain(item.store_domain || item.custom_domain);
    return adminDomain === hostname || storeDomain === hostname;
  });
  if (exactDomainMatch) return exactDomainMatch;

  const hostnameWithoutKnownPrefix = hostname.replace(/^(admin|store)\./, '');
  const hostnameSlug = normalizeDomainSlug(hostnameWithoutKnownPrefix.split('.')[0] || hostnameWithoutKnownPrefix);
  const brandedDomainMatch = companies.find((item) => {
    const companySlug = normalizeDomainSlug(item.name);
    return companySlug.length >= 4 && hostnameSlug.includes(companySlug);
  });

  return brandedDomainMatch || companies[0];
};

const hasSettingValue = (value: unknown) => value !== undefined && value !== null && value !== '';

const mergeSettingsWithDefaults = (
  remoteSettings?: Partial<typeof DUMMY_SETTINGS> | null,
  storedSettings?: Partial<typeof DUMMY_SETTINGS> | null,
  preferStored = false
) => {
  const merged: typeof DUMMY_SETTINGS = { ...DUMMY_SETTINGS, ...(remoteSettings || {}) };

  if (!storedSettings) return merged;
  if (preferStored) return { ...merged, ...storedSettings };

  SETTINGS_LOCAL_FALLBACK_KEYS.forEach(key => {
    const storedValue = storedSettings[key];
    const remoteValue = remoteSettings?.[key];

    if (hasSettingValue(storedValue) && !hasSettingValue(remoteValue)) {
      (merged as unknown as Record<string, unknown>)[key] = storedValue;
    }
  });

  return merged;
};

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { session, activeProfile, isLoading: isAuthLoading } = useAuth();
  const [initialized, setInitialized] = useState(false);
  const [isTenantReady, setIsTenantReady] = useState(false);
  const [isSessionSwitching, setIsSessionSwitching] = useState(true);
  const [canShowToast, setCanShowToast] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const loadGenerationRef = useRef(0);
  const loadedSessionScopeKeyRef = useRef('');
  const tenantPersistenceArmedRef = useRef(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (initialized && isTenantReady) {
      const timer = setTimeout(() => {
        setCanShowToast(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialized, isTenantReady]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [production, setProduction] = useState<ProductionItem[]>([]);
  const [financial, setFinancial] = useState<FinancialTransaction[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [settings, setSettings] = useState<typeof DUMMY_SETTINGS>(DUMMY_SETTINGS);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [company, setCompany] = useState<Company>(DUMMY_COMPANY);
  const [banners, setBanners] = useState<StoreBanner[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const rolePermissionVersionsRef = useRef<Record<string, string>>({});

  // Caixa
  const [sessions, setSessions] = useState<CashRegisterSession[]>([]);
  const [registerTransactions, setRegisterTransactions] = useState<CashRegisterTransaction[]>([]);
  const activeSession = sessions.find(s => s.status === 'aberto') || null;
  const currentCompanyId = company.id || '';

  const resetTenantState = useCallback(() => {
    tenantPersistenceArmedRef.current = false;
    rolePermissionVersionsRef.current = {};
    if (isBrowser()) {
      try {
        window.localStorage.removeItem('printflow_company');
        window.localStorage.removeItem('printflow_settings');
      } catch {
        // Storage cleanup is best effort; in-memory isolation does not depend on it.
      }
    }
    setInitialized(false);
    setIsTenantReady(false);
    setIsSessionSwitching(true);
    setCanShowToast(false);
    setToast(null);
    setCustomers([]);
    setSuppliers([]);
    setCategories([]);
    setProducts([]);
    setQuotes([]);
    setOrders([]);
    setProduction([]);
    setFinancial([]);
    setShipments([]);
    setStockMovements([]);
    setSettings(DUMMY_SETTINGS);
    setPickupPoints([]);
    setCompany(createUnprovisionedCompany(DUMMY_COMPANY));
    setBanners([]);
    setProfiles([]);
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    setSessions([]);
    setRegisterTransactions([]);
  }, []);

  const refreshStoreCatalog = useCallback(async () => {
    const hostname = getCurrentHostname();
    const storeResponse = await fetch('/api/store/public-data', { cache: 'no-store' });

    if (!storeResponse.ok) {
      const errorBody = await storeResponse.text().catch(() => '');
      throw new Error(`Public store loader failed: ${storeResponse.status} ${errorBody}`);
    }

    const storeData = (await storeResponse.json()) as PublicStoreDataResponse;
    const activeCompany = storeData.company;
    const activeCompanyId = activeCompany?.id || null;
    const scopedProducts = storeData.products || [];
    const scopedCategories = (storeData.categories || []).map((category) => ({
      ...category,
      show_in_catalog: category.show_in_catalog ?? true
    }));
    const activeProductCount = scopedProducts.filter((product) => product.active !== false).length;
    const catalogProductCount = scopedProducts.filter(
      (product) => product.active !== false && product.catalog_active !== false
    ).length;

    logStoreDebug('context-load', {
      hostname,
      pathname: window.location.pathname,
      companiesCount: storeData.debug?.companies_count || null,
      resolvedCompany: activeCompany
        ? {
            id: activeCompany.id,
            name: activeCompany.name,
            admin_domain: activeCompany.admin_domain,
            store_domain: activeCompany.store_domain,
            custom_domain: activeCompany.custom_domain
          }
        : null,
      resolvedCompanyId: activeCompanyId,
      loader: storeData.debug || null,
      productsRawCount: scopedProducts.length,
      productsCompanyCount: scopedProducts.length,
      productsActiveCount: activeProductCount,
      productsCatalogActiveCount: catalogProductCount,
      categoriesRawCount: scopedCategories.length,
      categoriesCompanyCount: scopedCategories.length
    });

    if (!activeCompany || !activeCompanyId) {
      warnCaught('[STORE DEBUG] Empresa da loja nao resolvida para o dominio:', {
        hostname,
        companiesCount: storeData.debug?.companies_count || null
      });
    }

    setCompany(activeCompany || createUnprovisionedCompany(DUMMY_COMPANY));
    setSettings(storeData.settings
      ? mergeSettingsWithDefaults(storeData.settings as Partial<typeof DUMMY_SETTINGS>)
      : DUMMY_SETTINGS
    );
    setCustomers([]);
    setSuppliers([]);
    setCategories(scopedCategories);
    setProducts(scopedProducts);
    setQuotes([]);
    setOrders([]);
    setProduction([]);
    setFinancial([]);
    setShipments([]);
    setStockMovements([]);
    setPickupPoints(storeData.pickupPoints || []);
    setBanners(storeData.banners || []);
    setProfiles([]);
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    setSessions([]);
    setRegisterTransactions([]);
    setIsTenantReady(true);
    setIsSessionSwitching(false);
    setInitialized(true);
  }, []);

  // Load from Supabase on mount; demo/localStorage fallback is explicit opt-in only.
  useEffect(() => {
    if (!isBrowser()) return;
    if (!isPublicStoreRoute()) return;

    const init = async () => {
      try {
        const isStoreRoute = window.location.pathname.startsWith('/store');
        const publicSelect = async <T,>(table: string) =>
          isStoreRoute ? publicStoreSelect<T>(table) : supabase.from(table).select('*');
        const skipPrivateData = Promise.resolve({ data: null, error: null });

        if (isStoreRoute) {
          await refreshStoreCatalog();
          return;
        }

        const companiesResponse = await publicSelect<Company>('companies');
        const companies = companiesResponse.data;
        const error = 'error' in companiesResponse ? companiesResponse.error : null;

        if (error) {  warnCaught('Erro companies:', error);
          loadFromLocalStorage();
          return;
      }
      
        if (error) throw error;

        if (!companies || companies.length === 0) {
          // Initial production setup must be done through Supabase SQL Editor or a server-side service role.
          // The browser client must not seed tenant data with the public key.
          
          clearOperationalDemoSnapshots();

          // Keep public configuration empty/default until a real tenant is provisioned.
          setCompany(createUnprovisionedCompany(DUMMY_COMPANY));
          setSettings(DUMMY_SETTINGS);
          setProfiles([]);
          setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
          
          // Set operational data states to completely blank arrays
          setCustomers([]);
          setSuppliers([]);
          setCategories([]);
          setProducts([]);
          setQuotes([]);
          setOrders([]);
          setProduction([]);
          setFinancial([]);
          setShipments([]);
          setStockMovements([]);
          setPickupPoints([]);
          setBanners([]);
          setSessions([]);
          setRegisterTransactions([]);

          setInitialized(true);
          return;
        }

        const [
          { data: settingsData },
          { data: profilesData },
          { data: suppliersData },
          { data: categoriesData },
          { data: productsData },
          { data: quotesData, error: quotesError },
          { data: quoteItemsData, error: quoteItemsError },
          { data: ordersData, error: ordersError },
          { data: orderItemsData, error: orderItemsError },
          { data: productionData },
          { data: financialData },
          { data: shipmentsData },
          { data: stockMovementsData },
          { data: pickupPointsData },
          { data: bannersData },
          { data: rolePermsData },
          { data: sessionsData },
          { data: regTransData }
        ] = await Promise.all([
          publicSelect<typeof DUMMY_SETTINGS>('settings'),
          isStoreRoute ? skipPrivateData : supabase.from('profiles').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('suppliers').select('*'),
          publicSelect<Category>('categories'),
          publicSelect<Product>('products'),
          isStoreRoute ? skipPrivateData : supabase.from('quotes').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('quote_items').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('orders').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('order_items').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('production_queue').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('financial_transactions').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('shipments').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('stock_movements').select('*'),
          publicSelect<PickupPoint>('pickup_points'),
          publicSelect<StoreBannerRow>('store_banners'),
          isStoreRoute ? skipPrivateData : supabase.from('role_permissions').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('cash_register_sessions').select('*'),
          isStoreRoute ? skipPrivateData : supabase.from('cash_register_transactions').select('*')
        ]);

        const activeCompany = companies && companies.length > 0 ? resolveCompanyForHostname(companies as Company[]) : null;
        const activeCompanyId = activeCompany?.id || companies?.[0]?.id;

        const filterByCompany = <T extends { company_id?: string }>(items: T[] | null) =>
          activeCompanyId ? (items || []).filter((item) => item.company_id === activeCompanyId) : (items || []);

        if (activeCompany) setCompany(activeCompany);
        if (settingsData && settingsData.length > 0) {
          const activeSettings = activeCompanyId
            ? settingsData.find((item) => item.company_id === activeCompanyId) || settingsData[0]
            : settingsData[0];
          let storedSettings: Partial<typeof DUMMY_SETTINGS> | null = null;
          if (isDemoFallbackAllowed()) {
            try {
              storedSettings = JSON.parse(window.localStorage.getItem('printflow_settings') || 'null');
            } catch {
              storedSettings = null;
            }
          }
          setSettings(mergeSettingsWithDefaults(activeSettings as Partial<typeof DUMMY_SETTINGS>, storedSettings));
        }
        if (profilesData) setProfiles(filterByCompany(profilesData as UserProfile[]));
        setCustomers(isStoreRoute ? [] : await listCustomers(activeCompanyId));
        if (suppliersData) setSuppliers(filterByCompany(suppliersData as Supplier[]));
        if (categoriesData) {
          let storedCategories: Category[] = [];
          if (isDemoFallbackAllowed()) {
            try {
              storedCategories = JSON.parse(window.localStorage.getItem('printflow_categories') || '[]');
            } catch {
              storedCategories = [];
            }
          }
          const mergedCategories = mergeCategoriesWithStoredVisibility(
            filterByCompany(categoriesData as Category[]),
            storedCategories
          );
          setCategories(mergedCategories);
        }
        if (productsData) setProducts(filterByCompany(productsData as Product[]));
        
        if (quotesError) warnCaught('Erro ao carregar orçamentos no Supabase:', quotesError);
        if (quoteItemsError) warnCaught('Erro ao carregar itens de orçamentos no Supabase:', quoteItemsError);
        if (quotesData) {
          const quoteItems = quoteItemsError ? [] : (quoteItemsData || []) as QuoteItemRow[];
          setQuotes(reconstructQuotesWithItems(filterByCompany(quotesData as Quote[]), quoteItems));
        }

        if (ordersError) warnCaught('Erro ao carregar pedidos no Supabase:', ordersError);
        if (orderItemsError) warnCaught('Erro ao carregar itens de pedidos no Supabase:', orderItemsError);
        if (ordersData) {
          const orderItems = orderItemsError ? [] : (orderItemsData || []) as OrderItemRow[];
          setOrders(reconstructOrdersWithItems(filterByCompany(ordersData as Order[]), orderItems));
        }

        if (productionData) setProduction(filterByCompany(productionData as ProductionItem[]));
        if (financialData) setFinancial(filterByCompany(financialData as FinancialTransaction[]));
        if (shipmentsData) setShipments(filterByCompany(shipmentsData as Shipment[]));
        if (stockMovementsData) setStockMovements(filterByCompany(stockMovementsData as StockMovement[]));
        if (pickupPointsData) setPickupPoints(filterByCompany(pickupPointsData as PickupPoint[]));
        if (bannersData) setBanners(filterByCompany(bannersData as StoreBannerRow[]));
        
        if (rolePermsData) {
          const perms: Record<string, string[]> = {};
          const versions: Record<string, string> = {};
          (rolePermsData as RolePermissionRow[]).forEach(rp => {
            perms[rp.path] = rp.roles;
            if (rp.updated_at) versions[rp.path] = rp.updated_at;
          });
          rolePermissionVersionsRef.current = versions;
          setRolePermissions(perms);
        }

        if (sessionsData) setSessions(filterByCompany(sessionsData as CashRegisterSession[]));
        if (regTransData) setRegisterTransactions(regTransData as CashRegisterTransaction[]);

        setInitialized(true);
      } catch (err) {
        warnCaught('Erro capturado:', err);
        loadFromLocalStorage();
      }
    };

    const loadFromLocalStorage = () => {
      try {
        if (!isDemoFallbackAllowed()) {
          setCustomers([]);
          setSuppliers([]);
          setCategories([]);
          setProducts([]);
          setQuotes([]);
          setOrders([]);
          setProduction([]);
          setFinancial([]);
          setShipments([]);
          setStockMovements([]);
          setSettings(DUMMY_SETTINGS);
          setPickupPoints([]);
          setCompany(createUnprovisionedCompany(DUMMY_COMPANY));
          setBanners([]);
          setProfiles([]);
          setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
          setSessions([]);
          setRegisterTransactions([]);
          setInitialized(true);
          return;
        }

        setCustomers(getOrSetDemoSnapshot('customers', DUMMY_CUSTOMERS));
        setSuppliers(getOrSetDemoSnapshot('suppliers', DUMMY_SUPPLIERS));
        setCategories(getOrSetDemoSnapshot('categories', DUMMY_CATEGORIES));
        setProducts(getOrSetDemoSnapshot('products', DUMMY_PRODUCTS));
        setQuotes(getOrSetDemoSnapshot('quotes', DUMMY_QUOTES));
        
        const rawOrders = getOrSetDemoSnapshot('orders', DUMMY_ORDERS);
        setOrders(normalizeDemoOrders(rawOrders));
        
        const rawProd = getOrSetDemoSnapshot('production', DUMMY_PRODUCTION_QUEUE);
        setProduction(normalizeDemoProduction(rawProd));
        
        const rawFin = getOrSetDemoSnapshot('financial', DUMMY_FINANCIAL);
        setFinancial(normalizeDemoFinancial(rawFin));

        const rawShips = getOrSetDemoSnapshot('shipments', DUMMY_SHIPMENTS);
        setShipments(normalizeDemoShipments(rawShips));
        
        setStockMovements(getOrSetDemoSnapshot('stockMovements', []));
        setSettings(mergeSettingsWithDefaults(null, getOrSetDemoSnapshot('settings', DUMMY_SETTINGS), true));
        setPickupPoints(getOrSetDemoSnapshot('pickupPoints', DUMMY_PICKUP_POINTS));
        
        const loadedCompany = getOrSetDemoSnapshot('company', DUMMY_COMPANY);
        setCompany(loadedCompany);
        
        setBanners(getOrSetDemoSnapshot('banners', DEFAULT_BANNERS));
        setProfiles(getOrSetDemoSnapshot('profiles', DUMMY_PROFILES));
        setRolePermissions(getOrSetDemoSnapshot('role_permissions', DEFAULT_ROLE_PERMISSIONS));
        setSessions(getOrSetDemoSnapshot('sessions', []));
        setRegisterTransactions(getOrSetDemoSnapshot('registerTransactions', []));
        
        setInitialized(true);
      } catch (e) {
        warnCaught('Erro capturado:', e);
        if (!isDemoFallbackAllowed()) {
          setCustomers([]);
          setSuppliers([]);
          setCategories([]);
          setProducts([]);
          setQuotes([]);
          setOrders([]);
          setProduction([]);
          setFinancial([]);
          setShipments([]);
          setStockMovements([]);
          setSettings(DUMMY_SETTINGS);
          setPickupPoints([]);
          setCompany(createUnprovisionedCompany(DUMMY_COMPANY));
          setBanners([]);
          setProfiles([]);
          setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
          setSessions([]);
          setRegisterTransactions([]);
          setInitialized(true);
          return;
        }
        setCustomers(DUMMY_CUSTOMERS);
        setSuppliers(DUMMY_SUPPLIERS);
        setCategories(DUMMY_CATEGORIES);
        setProducts(DUMMY_PRODUCTS);
        setQuotes(DUMMY_QUOTES);
        setOrders(DUMMY_ORDERS);
        setProduction(DUMMY_PRODUCTION_QUEUE);
        setFinancial(DUMMY_FINANCIAL);
        setShipments(DUMMY_SHIPMENTS);
        setSettings(DUMMY_SETTINGS);
        setPickupPoints(DUMMY_PICKUP_POINTS);
        setCompany(DUMMY_COMPANY);
        setBanners(DEFAULT_BANNERS);
        setProfiles(DUMMY_PROFILES);
        setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
        setInitialized(true);
      }
    };

    init();
  }, [refreshStoreCatalog]);

  const authUserId = session?.user.id || '';
  const profileMatchesSession = Boolean(
    authUserId &&
    activeProfile.active &&
    activeProfile.auth_user_id === authUserId &&
    activeProfile.company_id
  );
  const sessionScopeKey = `${authUserId || 'signed-out'}:${
    profileMatchesSession ? activeProfile.id : 'profile-pending'
  }:${profileMatchesSession ? activeProfile.company_id : 'company-pending'}`;

  // AuthProvider owns the single Supabase auth listener. React to its validated
  // user/profile scope, empty the old tenant first, and reject stale responses.
  useEffect(() => {
    if (!isBrowser() || isPublicStoreRoute()) return;

    const generation = ++loadGenerationRef.current;
    let disposed = false;
    const isCurrentGeneration = () => !disposed && generation === loadGenerationRef.current;

    resetTenantState();

    const finishEmptyState = () => {
      if (!isCurrentGeneration()) return;
      loadedSessionScopeKeyRef.current = sessionScopeKey;
      setIsSessionSwitching(false);
      setInitialized(true);
    };

    if (isAuthLoading) {
      return () => {
        disposed = true;
        if (generation === loadGenerationRef.current) loadGenerationRef.current += 1;
      };
    }

    if (!authUserId || !profileMatchesSession) {
      finishEmptyState();
      return () => {
        disposed = true;
        if (generation === loadGenerationRef.current) loadGenerationRef.current += 1;
      };
    }

    const companyId = activeProfile.company_id;

    const loadTenant = async () => {
      try {
        const { data: activeCompany, error: companyError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .maybeSingle();

        if (companyError) throw companyError;
        if (!activeCompany) throw new Error('Empresa do perfil autenticado nao encontrada.');

        const customerData = await listCustomers(companyId);
        const [
          { data: settingsData },
          { data: profilesData },
          { data: suppliersData },
          { data: categoriesData },
          { data: productsData },
          { data: quotesData, error: quotesError },
          { data: quoteItemsData, error: quoteItemsError },
          { data: ordersData, error: ordersError },
          { data: orderItemsData, error: orderItemsError },
          { data: productionData },
          { data: financialData },
          { data: shipmentsData },
          { data: stockMovementsData },
          { data: pickupPointsData },
          { data: bannersData },
          { data: rolePermsData },
          { data: sessionsData },
          { data: regTransData }
        ] = await Promise.all([
          supabase.from('settings').select('*').eq('company_id', companyId),
          supabase.from('profiles').select('*').eq('company_id', companyId),
          supabase.from('suppliers').select('*').eq('company_id', companyId),
          supabase.from('categories').select('*').eq('company_id', companyId),
          supabase.from('products').select('*').eq('company_id', companyId),
          supabase.from('quotes').select('*').eq('company_id', companyId),
          supabase.from('quote_items').select('*'),
          supabase.from('orders').select('*').eq('company_id', companyId),
          supabase.from('order_items').select('*'),
          supabase.from('production_queue').select('*').eq('company_id', companyId),
          supabase.from('financial_transactions').select('*').eq('company_id', companyId),
          supabase.from('shipments').select('*').eq('company_id', companyId),
          supabase.from('stock_movements').select('*').eq('company_id', companyId),
          supabase.from('pickup_points').select('*').eq('company_id', companyId),
          supabase.from('store_banners').select('*').eq('company_id', companyId),
          supabase.from('role_permissions').select('*').eq('company_id', companyId),
          supabase.from('cash_register_sessions').select('*').eq('company_id', companyId),
          supabase.from('cash_register_transactions').select('*')
        ]);

        if (!isCurrentGeneration()) return;

        if (quotesError) warnCaught('Erro ao carregar orcamentos no Supabase:', quotesError);
        if (quoteItemsError) warnCaught('Erro ao carregar itens de orcamentos no Supabase:', quoteItemsError);
        if (ordersError) warnCaught('Erro ao carregar pedidos no Supabase:', ordersError);
        if (orderItemsError) warnCaught('Erro ao carregar itens de pedidos no Supabase:', orderItemsError);

        const scopedSessions = (sessionsData || []) as CashRegisterSession[];
        const sessionIds = new Set(scopedSessions.map((item) => item.id));
        const permissions: Record<string, string[]> = {};
        const permissionVersions: Record<string, string> = {};
        ((rolePermsData || []) as RolePermissionRow[]).forEach((permission) => {
          permissions[permission.path] = permission.roles;
          if (permission.updated_at) permissionVersions[permission.path] = permission.updated_at;
        });
        rolePermissionVersionsRef.current = permissionVersions;

        setCompany(activeCompany as Company);
        setSettings(settingsData?.[0]
          ? mergeSettingsWithDefaults(settingsData[0] as Partial<typeof DUMMY_SETTINGS>)
          : DUMMY_SETTINGS
        );
        setProfiles((profilesData || []) as UserProfile[]);
        setCustomers(customerData);
        setSuppliers((suppliersData || []) as Supplier[]);
        setCategories(mergeCategoriesWithStoredVisibility((categoriesData || []) as Category[], []));
        setProducts((productsData || []) as Product[]);
        setQuotes(reconstructQuotesWithItems(
          (quotesData || []) as Quote[],
          quoteItemsError ? [] : (quoteItemsData || []) as QuoteItemRow[]
        ));
        setOrders(reconstructOrdersWithItems(
          (ordersData || []) as Order[],
          orderItemsError ? [] : (orderItemsData || []) as OrderItemRow[]
        ));
        setProduction((productionData || []) as ProductionItem[]);
        setFinancial((financialData || []) as FinancialTransaction[]);
        setShipments((shipmentsData || []) as Shipment[]);
        setStockMovements((stockMovementsData || []) as StockMovement[]);
        setPickupPoints((pickupPointsData || []) as PickupPoint[]);
        setBanners((bannersData || []) as StoreBannerRow[]);
        setRolePermissions(Object.keys(permissions).length > 0 ? permissions : DEFAULT_ROLE_PERMISSIONS);
        setSessions(scopedSessions);
        setRegisterTransactions(((regTransData || []) as CashRegisterTransaction[]).filter((item) =>
          sessionIds.has(item.session_id)
        ));
        loadedSessionScopeKeyRef.current = sessionScopeKey;
        setIsTenantReady(true);
        setIsSessionSwitching(false);
        setInitialized(true);
      } catch (error) {
        if (!isCurrentGeneration()) return;
        warnCaught('Erro ao carregar tenant autenticado:', error);
        finishEmptyState();
      }
    };

    void loadTenant();

    return () => {
      disposed = true;
      if (generation === loadGenerationRef.current) loadGenerationRef.current += 1;
    };
  }, [
    activeProfile.company_id,
    activeProfile.id,
    authUserId,
    isAuthLoading,
    profileMatchesSession,
    resetTenantState,
    sessionScopeKey
  ]);

  useEffect(() => {
    if (!isBrowser() || !isDemoFallbackAllowed() || !isPublicStoreRoute()) return;

    const handleQuoteStorageSync = (event: StorageEvent) => {
      if (event.key !== 'printflow_quotes' || !event.newValue) return;

      try {
        const nextQuotes = JSON.parse(event.newValue);
        if (Array.isArray(nextQuotes)) {
          setQuotes(nextQuotes);
        }
      } catch (error) {
        warnCaught('Erro capturado:', error);
      }
    };

    window.addEventListener('storage', handleQuoteStorageSync);
    return () => window.removeEventListener('storage', handleQuoteStorageSync);
  }, []);

  useEffect(() => {
    if (!initialized || !tenantPersistenceArmedRef.current || !isBrowser() || isPublicStoreRoute()) return;
    try {
      persistDemoSnapshot('quotes', quotes);
    } catch {
      if (canShowToast) showToast('Erro ao salvar orçamentos!', 'error');
    }
  }, [quotes, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !tenantPersistenceArmedRef.current || !isBrowser() || isPublicStoreRoute()) return;
    try {
      persistDemoSnapshot('orders', orders);
    } catch {
      if (canShowToast) showToast('Erro ao salvar pedidos!', 'error');
    }
  }, [orders, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !company.id || !session?.user || isPublicStoreRoute()) return;

    const channel = supabase
      .channel(`production-queue-${company.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_queue',
          filter: `company_id=eq.${company.id}`
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removedId = String((payload.old as { id?: unknown }).id || '');
            if (removedId) setProduction((current) => current.filter((item) => item.id !== removedId));
            return;
          }

          const incoming = payload.new as unknown as ProductionItem;
          if (!incoming?.id || incoming.company_id !== company.id) return;
          setProduction((current) => replaceProductionItem(current, incoming));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialized, company.id, session?.user]);

  // Business writes are performed only by the explicit commands below. State
  // changes, hydration and Realtime never write collection snapshots back.

  // Arm the demo-only quote/order fallback only after hydration. Production
  // tenant collections are never persisted by effects.
  useEffect(() => {
    if (
      !isPublicStoreRoute() &&
      initialized &&
      isTenantReady &&
      profileMatchesSession &&
      company.id === activeProfile.company_id
    ) {
      tenantPersistenceArmedRef.current = true;
    }
  }, [activeProfile.company_id, company.id, initialized, isTenantReady, profileMatchesSession]);

  // Dynamically update DOM favicon when configured
  useEffect(() => {
    if (!initialized || !isBrowser() || !company?.favicon) return;

    // Check if it's a supported browser favicon (not .cdr or other unsupported formats)
    const isSupported = (url: string) => {
      const lower = url.toLowerCase();
      return !lower.endsWith('.cdr') && (lower.startsWith('http') || lower.startsWith('data:image/') || lower.includes('.png') || lower.includes('.ico') || lower.includes('.svg') || lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.webp'));
    };

    if (!isSupported(company.favicon)) {
      console.warn('Favicon format not supported by browser:', company.favicon);
      return;
    }

    const updateFavicons = () => {
      try {
        const links = window.document.querySelectorAll("link[rel*='icon']");
        // Resolve absolute URL for correct comparison in browser
        const absoluteFavicon = new URL(company.favicon!, window.location.href).href;
        
        if (links.length > 0) {
          links.forEach(link => {
            if ((link as HTMLLinkElement).href !== absoluteFavicon) {
              (link as HTMLLinkElement).href = absoluteFavicon;
            }
          });
        } else {
          const link = window.document.createElement('link');
          link.rel = 'icon';
          link.href = absoluteFavicon;
          window.document.getElementsByTagName('head')[0].appendChild(link);
        }
      } catch (e) {
        warnCaught('Erro capturado:', e);
      }
    };

    updateFavicons();
  }, [company?.favicon, initialized]);
 
  const resetDatabase = () => {
    if (!isBrowser()) return;

    clearOperationalDemoSnapshots();
    
    // Clear Supabase operational tables but KEEP companies, settings, profiles, and role_permissions
    Promise.all([
      deleteAllCustomers(),
      supabase.from('suppliers').delete().not('id', 'is', null),
      supabase.from('categories').delete().not('id', 'is', null),
      supabase.from('products').delete().not('id', 'is', null),
      supabase.from('quotes').delete().not('id', 'is', null),
      supabase.from('quote_items').delete().not('id', 'is', null),
      supabase.from('orders').delete().not('id', 'is', null),
      supabase.from('order_items').delete().not('id', 'is', null),
      supabase.from('production_queue').delete().not('id', 'is', null),
      supabase.from('financial_transactions').delete().not('id', 'is', null),
      supabase.from('shipments').delete().not('id', 'is', null),
      supabase.from('stock_movements').delete().not('id', 'is', null),
      supabase.from('pickup_points').delete().not('id', 'is', null),
      supabase.from('store_banners').delete().not('id', 'is', null),
      supabase.from('cash_register_sessions').delete().not('id', 'is', null),
      supabase.from('cash_register_transactions').delete().not('id', 'is', null)
    ]).then(() => {
      window.location.reload();
    }).catch(err => {
      warnCaught('Erro capturado:', err);
      window.location.reload();
    });
  };

  // ----------------------------------------------------
  // Clientes API
  // ----------------------------------------------------
  const addCustomer = (cust: NewCustomerInput) => {
    const newCust = buildCustomerRecord(cust, currentCompanyId);
    setCustomers(prev => [newCust, ...prev]);
    persistDemoSnapshot('customers', [newCust, ...customers]);
    createCustomer(newCust).then((saved) => {
      setCustomers((items) => items.map((item) => item.id === saved.id ? saved : item));
    }).catch((error) => {
      setCustomers((items) => items.filter((item) => item.id !== newCust.id));
      warnCaught('Erro ao criar cliente no Supabase:', error);
      if (canShowToast) showToast('Erro ao salvar cliente no Supabase!', 'error');
    });
    return newCust;
  };

  const updateCustomer = (cust: Customer) => {
    const previous = customers.find((customer) => customer.id === cust.id);
    if (!previous) return;
    const nextCustomers = customers.map(c => (c.id === cust.id ? cust : c));
    setCustomers(nextCustomers);
    persistDemoSnapshot('customers', nextCustomers);
    updateCustomerRecord(cust, previous).then((saved) => {
      setCustomers((items) => items.map((item) => item.id === saved.id ? saved : item));
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Customer | undefined : undefined;
      setCustomers((items) => items.map((item) => item.id === cust.id ? (latest || previous) : item));
      warnCaught('Erro ao atualizar cliente no Supabase:', error);
      if (canShowToast) showToast(error instanceof Error ? error.message : 'Erro ao atualizar cliente no Supabase!', 'error');
    });
  };

  const deleteCustomer = (id: string) => {
    const current = customers.find((customer) => customer.id === id);
    if (!current) return;
    const nextCustomers = customers.filter(c => c.id !== id);
    setCustomers(nextCustomers);
    persistDemoSnapshot('customers', nextCustomers);
    deleteCustomerRecord(current).catch((error) => {
      setCustomers((items) => items.some((item) => item.id === id) ? items : [...items, current]);
      warnCaught('Erro ao excluir cliente no Supabase:', error);
      if (canShowToast) showToast(error instanceof Error ? error.message : 'Erro ao excluir cliente no Supabase!', 'error');
    });
  };

  // ----------------------------------------------------
  // SUPPLIERS & CATEGORIES API
  // ----------------------------------------------------
  const addSupplier = (sup: Omit<Supplier, 'id' | 'company_id' | 'created_at'>) => {
    const newSup: Supplier = {
      ...sup,
      id: `sup-${Date.now()}`,
      company_id: currentCompanyId,
      created_at: new Date().toISOString()
    };
    setSuppliers(prev => [newSup, ...prev]);
    void insertTenantRecord<Supplier>('suppliers', newSup).then((saved) => {
      setSuppliers((current) => current.map((item) => item.id === saved.id ? saved : item));
    }).catch((error) => {
      setSuppliers((current) => current.filter((item) => item.id !== newSup.id));
      warnCaught('Erro ao salvar fornecedor no Supabase:', error);
      showToast('Não foi possível salvar o fornecedor.', 'error');
    });
    return newSup;
  };

  const addCategory = (name: string, description: string, parent_id?: string | null, show_in_catalog: boolean = true) => {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      company_id: currentCompanyId,
      name,
      description,
      parent_id: parent_id || null,
      show_in_catalog,
      created_at: new Date().toISOString()
    };
    setCategories(prev => [...prev, newCat]);

    void insertTenantRecord<Category>('categories', newCat).then((saved) => {
      setCategories((items) => items.map((item) => item.id === saved.id ? saved : item));
      showToast('Categoria salva com sucesso.', 'success');
    }).catch((error) => {
      setCategories((items) => items.filter((item) => item.id !== newCat.id));
      warnCaught('Erro ao salvar categoria no Supabase:', error);
      showToast('Não foi possível salvar a categoria.', 'error');
    });

    return newCat;
  };

  const updateCategory = (id: string, name: string, description: string, parent_id?: string | null, show_in_catalog: boolean = true) => {
    const current = categories.find((category) => category.id === id);
    if (!current) return;
    const intended = { name, description, parent_id: parent_id || null, show_in_catalog };
    const patch = Object.fromEntries(Object.entries(intended).filter(([key, value]) => (
      JSON.stringify(value) !== JSON.stringify((current as unknown as Record<string, unknown>)[key])
    )));
    if (Object.keys(patch).length === 0) return;
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    void patchTenantRecord<Category>(
      'categories', id, currentCompanyId, patch, { expectedUpdatedAt: current.updated_at }
    ).then((saved) => {
      setCategories((items) => items.map((item) => item.id === saved.id ? saved : item));
      showToast('Categoria atualizada com sucesso.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Category | undefined : undefined;
      setCategories((items) => items.map((item) => item.id === id ? (latest || current) : item));
      warnCaught('Erro ao atualizar categoria no Supabase:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível atualizar a categoria.', 'error');
    });
  };

  const updateCategoryCatalogPresentation = async (id: string, patch: CategoryCatalogPresentationPatch) => {
    const normalizedPatch: CategoryCatalogPresentationPatch = {
      ...patch,
      catalog_featured_title: patch.catalog_featured_title?.trim() || null,
      catalog_featured_sort_order: Math.max(0, Number(patch.catalog_featured_sort_order) || 0),
      catalog_mega_menu_banner_image_url: patch.catalog_mega_menu_banner_image_url?.trim() || null,
      catalog_mega_menu_banner_link: patch.catalog_mega_menu_banner_link?.trim() || null,
      catalog_mega_menu_banner_alt: patch.catalog_mega_menu_banner_alt?.trim() || null
    };

    const current = categories.find((category) => category.id === id);
    if (!current) throw new Error('Categoria não encontrada.');
    const saved = await patchTenantRecord<Category>(
      'categories', id, currentCompanyId, normalizedPatch, { expectedUpdatedAt: current.updated_at }
    );
    setCategories((items) => items.map((category) => category.id === id ? saved : category));
  };

  const deleteCategory = (id: string) => {
    const current = categories.find((category) => category.id === id);
    if (!current) return;
    setCategories(prev => prev.filter(c => c.id !== id));
    void deleteTenantRecord('categories', id, currentCompanyId, { expectedUpdatedAt: current.updated_at }).catch((error) => {
      setCategories((items) => items.some((item) => item.id === id) ? items : [...items, current]);
      warnCaught('Erro ao excluir categoria no Supabase:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir a categoria.', 'error');
    });
  };

  // ----------------------------------------------------
  // PRODUCTS & INVENTORY API
  // ----------------------------------------------------
  const addProduct = (prod: Omit<Product, 'id' | 'company_id' | 'created_at' | 'current_stock'>) => {
  const newProd: Product = {
    ...prod,
    id: `prod-${Date.now()}`,
    company_id: currentCompanyId,
    current_stock: 0,
    created_at: new Date().toISOString()
  };

  setProducts(prev => [newProd, ...prev]);

  void insertTenantRecord<Product>('products', {
      id: newProd.id,
      company_id: newProd.company_id,
      slug: newProd.slug || null,
      category_id: newProd.category_id,
      name: newProd.name,
      description: newProd.description,
      sku: newProd.sku,
      pricing_type: newProd.pricing_type,
      base_cost: newProd.base_cost,
      sales_price: newProd.sales_price,
      stock_controlled: newProd.stock_controlled,
      min_stock: newProd.min_stock,
      current_stock: newProd.current_stock,
      active: newProd.active,
      catalog_active: newProd.catalog_active !== false,
      image_url: newProd.image_url || null,
      volume_pricing: newProd.volume_pricing || null,
      variant_options: newProd.variant_options || null,
      color_options: newProd.color_options || null,
      is_promo: newProd.is_promo || false,
      is_highlight: newProd.is_highlight || false,
      pricing_details: newProd.pricing_details || null,
      created_at: newProd.created_at
    } as Product).then((saved) => {
      setProducts((items) => items.map((item) => item.id === saved.id ? saved : item));
      showToast('Produto salvo com sucesso.', 'success');
    }).catch((error) => {
      setProducts((items) => items.filter((item) => item.id !== newProd.id));
      warnCaught('Erro ao salvar produto no Supabase:', error);
      showToast('Não foi possível salvar o produto.', 'error');
    });

  return newProd;
};

  const updateProduct = (prod: Product) => {
    const current = products.find((item) => item.id === prod.id);
    if (!current) return;
    const writableKeys: Array<keyof Product> = [
      'category_id', 'name', 'description', 'sku', 'pricing_type', 'base_cost',
      'sales_price', 'stock_controlled', 'min_stock', 'active', 'catalog_active',
      'image_url', 'volume_pricing', 'variant_options', 'color_options', 'is_promo',
      'is_highlight', 'pricing_details', 'slug'
    ];
    const patch = writableKeys.reduce<Record<string, unknown>>((result, key) => {
      if (JSON.stringify(current[key]) !== JSON.stringify(prod[key])) result[key] = prod[key] ?? null;
      return result;
    }, {});
    if (Object.keys(patch).length === 0) return;

    const optimistic = { ...current, ...patch } as Product;
    setProducts(prev => prev.map(p => (p.id === prod.id ? optimistic : p)));
    void patchTenantRecord<Product>(
      'products', prod.id, currentCompanyId, patch, { expectedUpdatedAt: current.updated_at }
    ).then((saved) => {
      setProducts((items) => items.map((item) => item.id === saved.id ? saved : item));
      showToast('Produto atualizado com sucesso.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Product | undefined : undefined;
      setProducts((items) => items.map((item) => item.id === prod.id ? (latest || current) : item));
      warnCaught('Erro ao atualizar produto no Supabase:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível atualizar o produto.', 'error');
    });
};

  const deleteProduct = (id: string) => {
    const current = products.find((item) => item.id === id);
    if (!current) return;
    setProducts(prev => prev.filter(p => p.id !== id));
    void deleteTenantRecord('products', id, currentCompanyId, { expectedUpdatedAt: current.updated_at }).catch((error) => {
      setProducts((items) => items.some((item) => item.id === id) ? items : [...items, current]);
      warnCaught('Erro ao excluir produto no Supabase:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir o produto.', 'error');
    });
  };

  const adjustStock = (productId: string, quantity: number, reason: string, type: 'entrada' | 'saida', cost?: number) => {
    const match = products.find(p => p.id === productId);
    if (!match) return;
    void adjustInventoryStock<Product, StockMovement>({
      productId,
      quantity,
      type,
      reason,
      unitCost: cost,
      expectedUpdatedAt: match.updated_at
    }).then(({ product, movement }) => {
      setProducts((items) => items.map((item) => item.id === product.id ? product : item));
      setStockMovements((items) => items.some((item) => item.id === movement.id) ? items : [movement, ...items]);
      showToast('Movimento de estoque registrado.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Product | undefined : undefined;
      if (latest) setProducts((items) => items.map((item) => item.id === latest.id ? latest : item));
      warnCaught('Erro ao ajustar estoque:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível ajustar o estoque.', 'error');
    });
  };

  // ----------------------------------------------------
  // QUOTES API
  // ----------------------------------------------------
  const persistQuotesSnapshot = (nextQuotes: Quote[]) => {
    if (typeof window === 'undefined') return;

    persistDemoSnapshot('quotes', nextQuotes);
  };

  const persistOrdersSnapshot = (nextOrders: Order[]) => {
    if (typeof window === 'undefined') return;

    persistDemoSnapshot('orders', nextOrders);
  };

  const normalizeQuotePayload = (payload: SavedQuotePayload | null): Quote | null => {
    if (!payload?.quote) return null;

    const items = (payload.items || []).map((item) => {
      const cleanItem = { ...item };
      delete (cleanItem as { quote_id?: string }).quote_id;

      return {
        ...cleanItem,
        product_id: cleanItem.product_id || '',
        quantity: Number(cleanItem.quantity || 0),
        unit_price: Number(cleanItem.unit_price || 0),
        total_price: Number(cleanItem.total_price || 0)
      };
    });

    return {
      ...payload.quote,
      number: Number(payload.quote.number || 0),
      total_amount: Number(payload.quote.total_amount || 0),
      discount: Number(payload.quote.discount || 0),
      delivery_distance_km: Number(payload.quote.delivery_distance_km || 0),
      delivery_fee: Number(payload.quote.delivery_fee || 0),
      additional_services: payload.quote.additional_services || [],
      items
    };
  };

  const normalizeOrderPayload = (payload: SavedOrderPayload | null): Order | null => {
    if (!payload?.order) return null;

    const items = (payload.items || []).map((item) => {
      const cleanItem = { ...item };
      delete (cleanItem as { order_id?: string }).order_id;

      return {
        ...cleanItem,
        product_id: cleanItem.product_id || '',
        quantity: Number(cleanItem.quantity || 0),
        unit_price: Number(cleanItem.unit_price || 0),
        total_price: Number(cleanItem.total_price || 0),
        outsourced: Boolean(cleanItem.outsourced)
      };
    });

    return {
      ...payload.order,
      total_amount: Number(payload.order.total_amount || 0),
      paid_amount: Number(payload.order.paid_amount || 0),
      shipping_cost: Number(payload.order.shipping_cost || 0),
      delivery_distance_km: Number(payload.order.delivery_distance_km || 0),
      additional_services: payload.order.additional_services || [],
      items
    };
  };

  const upsertQuoteState = (quote: Quote) => {
    setQuotes(prev => {
      const exists = prev.some(item => item.id === quote.id);
      const nextQuotes = exists
        ? prev.map(item => (item.id === quote.id ? quote : item))
        : [quote, ...prev];
      persistQuotesSnapshot(nextQuotes);
      return nextQuotes;
    });
  };

  const upsertOrderState = (order: Order) => {
    setOrders(prev => {
      const exists = prev.some(item => item.id === order.id);
      const nextOrders = exists
        ? prev.map(item => (item.id === order.id ? order : item))
        : [order, ...prev];
      persistOrdersSnapshot(nextOrders);
      return nextOrders;
    });
  };

  const saveQuoteWithItems = async (quote: Quote, errorContext: string) => {
    const { items, ...parentQuote } = quote;
    const p_quote = parentQuote;
    const p_items = items;
    const invalidItem = p_items.find(
      item =>
        !String(item.product_name || '').trim() ||
        Number(item.quantity || 0) <= 0 ||
        Number(item.unit_price || 0) < 0 ||
        Number(item.total_price || 0) < 0
    );

    if (!String(p_quote.company_id || '').trim()) {
      warnCaught(`Payload inválido ao salvar orçamento ${errorContext}:`, { reason: 'company_id vazio', p_quote, p_items });
      showToast('Não foi possível salvar: empresa não identificada.', 'error');
      return null;
    }

    if (!String(p_quote.customer_name || '').trim()) {
      warnCaught(`Payload inválido ao salvar orçamento ${errorContext}:`, { reason: 'cliente vazio', p_quote, p_items });
      showToast('Selecione um cliente antes de salvar o orçamento.', 'error');
      return null;
    }

    if (!Number.isFinite(Number(p_quote.total_amount))) {
      warnCaught(`Payload inválido ao salvar orçamento ${errorContext}:`, { reason: 'total inválido', p_quote, p_items });
      showToast('O total do orçamento está inválido.', 'error');
      return null;
    }

    if (p_items.length === 0 || invalidItem) {
      warnCaught(`Payload inválido ao salvar orçamento ${errorContext}:`, {
        reason: p_items.length === 0 ? 'sem itens' : 'item inválido',
        invalidItem,
        p_quote,
        p_items
      });
      showToast('Inclua pelo menos um item válido antes de salvar o orçamento.', 'error');
      return null;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[save_quote_with_items payload]', { p_quote, p_items });
    }

    const { data, error } = await supabase.rpc('save_quote_with_items_phase4b', {
      p_quote,
      p_items,
      p_expected_updated_at: quote.updated_at || null
    });

    if (error) {
      warnCaught(`Erro ao salvar orçamento ${errorContext} no Supabase:`, { error, p_quote, p_items });
      showToast('Não foi possível salvar o orçamento. Verifique os dados e tente novamente.', 'error');
      return null;
    }

    const result = data as Phase4bAggregateSaveResult;
    if (result.result_status === 'CONFLICT') {
      const [{ data: latestQuote }, { data: latestItems }] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', quote.id).eq('company_id', currentCompanyId).maybeSingle(),
        supabase.from('quote_items').select('*').eq('quote_id', quote.id)
      ]);
      const latest = latestQuote ? normalizeQuotePayload({ quote: latestQuote as Quote, items: (latestItems || []) as QuoteItemRow[] }) : null;
      if (latest) upsertQuoteState(latest);
      showToast('Este orçamento foi alterado em outra sessão. A versão mais recente foi carregada.', 'error');
      return null;
    }
    if (result.result_status !== 'UPDATED' || !result.payload) {
      showToast('Você não tem permissão ou os dados do orçamento são inválidos.', 'error');
      return null;
    }
    const savedQuote = normalizeQuotePayload(result.payload as SavedQuotePayload);
    if (!savedQuote) {
      warnCaught(`Resposta inválida ao salvar orçamento ${errorContext} no Supabase:`, data);
      showToast('O orçamento foi enviado, mas a resposta do servidor veio incompleta.', 'error');
      return null;
    }

    upsertQuoteState(savedQuote);
    return savedQuote;
  };

  const saveOrderWithItems = async (order: Order, errorContext: string) => {
    const { items, ...parentOrder } = order;
    const { data, error } = await supabase.rpc('save_order_with_items_phase4b', {
      p_order: parentOrder,
      p_items: items,
      p_expected_updated_at: order.updated_at || null
    });

    if (error) {
      warnCaught(`Erro ao salvar pedido ${errorContext} no Supabase:`, error);
      showToast('Não foi possível salvar o pedido. Verifique os dados e tente novamente.', 'error');
      return null;
    }

    const result = data as Phase4bAggregateSaveResult;
    if (result.result_status === 'CONFLICT') {
      const [{ data: latestOrder }, { data: latestItems }] = await Promise.all([
        supabase.from('orders').select('*').eq('id', order.id).eq('company_id', currentCompanyId).maybeSingle(),
        supabase.from('order_items').select('*').eq('order_id', order.id)
      ]);
      const latest = latestOrder ? normalizeOrderPayload({ order: latestOrder as Order, items: (latestItems || []) as OrderItemRow[] }) : null;
      if (latest) upsertOrderState(latest);
      showToast('Este pedido foi alterado em outra sessão. A versão mais recente foi carregada.', 'error');
      return null;
    }
    if (result.result_status !== 'UPDATED' || !result.payload) {
      showToast('Você não tem permissão ou os dados do pedido são inválidos.', 'error');
      return null;
    }
    const savedOrder = normalizeOrderPayload(result.payload as SavedOrderPayload);
    if (!savedOrder) {
      warnCaught(`Resposta inválida ao salvar pedido ${errorContext} no Supabase:`, data);
      showToast('O pedido foi enviado, mas a resposta do servidor veio incompleta.', 'error');
      return null;
    }

    upsertOrderState(savedOrder);
    return savedOrder;
  };

  const addQuote = (quote: Omit<Quote, 'id' | 'company_id' | 'number' | 'created_at'>) => {
    const nextNum = quotes.length > 0 ? Math.max(...quotes.map(q => q.number)) + 1 : 1001;
    const newQuote: Quote = {
      ...quote,
      id: `quote-${Date.now()}`,
      company_id: currentCompanyId,
      number: nextNum,
      created_at: new Date().toISOString()
    };
    void saveQuoteWithItems(newQuote, 'criado');

    return newQuote;
  };

  const updateQuote = (quote: Quote) => {
    const nextQuote = {
      ...quote,
      company_id: quote.company_id || currentCompanyId
    };

    void saveQuoteWithItems(nextQuote, 'atualizado');
  };

  const deleteQuote = (id: string) => {
    setQuotes(prev => prev.filter(q => q.id !== id));
    supabase.from('quotes').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir orçamento no Supabase:', error);
    });
  };

  const approveQuote = async (id: string) => {
    const match = quotes.find(q => q.id === id);
    if (!match) return null;

    const { data, error } = await supabase.rpc('approve_quote_and_create_order', { p_quote_id: id });
    if (error) {
      warnCaught('Erro ao aprovar orçamento e criar pedido no Supabase:', error);
      showToast('Não foi possível aprovar o orçamento. Tente novamente.', 'error');
      return null;
    }

    const payload = data as ApprovedQuotePayload;
    const savedOrder = normalizeOrderPayload(payload);
    if (!savedOrder || !payload.quote) {
      warnCaught('Resposta inválida ao aprovar orçamento no Supabase:', data);
      showToast('O orçamento foi enviado, mas a resposta do servidor veio incompleta.', 'error');
      return null;
    }

    upsertQuoteState({ ...match, ...payload.quote, items: match.items, status: 'aprovado' });
    upsertOrderState(savedOrder);
    showToast(`Pedido ${formatOrderDisplayNumber(savedOrder.number)} criado a partir do orçamento #${match.number}.`);
    return savedOrder;
  };

  // ----------------------------------------------------
  // ORDERS & PRODUCTION/STOCK TRIGGER API
  // ----------------------------------------------------
  const addOrder = async (order: Omit<Order, 'id' | 'company_id' | 'number' | 'created_at'>) => {
    const newOrder: Order = {
      ...order,
      id: `order-${Date.now()}`,
      company_id: currentCompanyId,
      number: '',
      created_at: new Date().toISOString()
    };

    const savedOrder = await saveOrderWithItems(newOrder, 'criado');
    if (!savedOrder) return null;

    if (savedOrder.status === 'producao' || savedOrder.status === 'impressao' || savedOrder.status === 'acabamento') {
      void injectProductionQueue(savedOrder);
    }

    return savedOrder;
  };

  const updateOrder = (order: Order) => {
    const nextOrder = {
      ...order,
      company_id: order.company_id || currentCompanyId
    };
    void saveOrderWithItems(nextOrder, 'atualizado');
  };

  const injectProductionQueue = async (order: Order) => {
    try {
      const newQueueItems = await ensureProductionQueueForOrder(order.id);
      if (newQueueItems.length === 0) return;

      setProduction((current) => newQueueItems.reduce(replaceProductionItem, current));

      // Stock is deducted only for rows created by the idempotent server operation.
      newQueueItems.forEach(queueItem => {
        const item = order.items.find(orderItem => orderItem.id === queueItem.order_item_id);
        if (!item) return;
        const match = products.find(p => p.id === item.product_id);
        if (match && match.stock_controlled) {
          adjustStock(
            item.product_id,
            item.quantity,
            `Pedido ${formatOrderDisplayNumber(order.number)}`,
            'saida'
          );
        }
      });
    } catch (error) {
      warnCaught('Erro ao criar itens da fila de produção:', error);
      showToast('Não foi possível criar a fila de produção do pedido.', 'error');
    }
  };

  const updateOrderStatus = (id: string, status: Order['status']) => {
    const current = orders.find((order) => order.id === id);
    if (!current || current.status === status) return;
    const optimistic = { ...current, status };
    setOrders((items) => items.map((item) => item.id === id ? optimistic : item));
    void transitionOrderStatus<Order, Shipment>({
      orderId: id,
      status,
      expectedUpdatedAt: current.updated_at
    }).then(({ order: savedOrder, shipment }) => {
      setOrders((items) => items.map((item) => item.id === savedOrder.id ? { ...savedOrder, items: item.items } : item));
      if (shipment) {
        setShipments((items) => items.some((item) => item.id === shipment.id)
          ? items.map((item) => item.id === shipment.id ? shipment : item)
          : [shipment, ...items]);
      }
      if (status === 'producao' && !production.some((item) => item.order_id === id)) {
        void injectProductionQueue({ ...savedOrder, items: current.items });
      }
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Order | undefined : undefined;
      setOrders((items) => items.map((item) => item.id === id ? { ...(latest || current), items: item.items } : item));
      warnCaught('Erro ao atualizar status do pedido:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.', 'error');
    });
  };

  const createOperationId = (prefix: string) => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const payOrder = (
    id: string,
    amount: number,
    method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado',
    options?: {
      payment_type?: 'adiantamento' | 'parcial' | 'saldo' | 'total';
      paid_at?: string;
      notes?: string;
    }
  ) => {
    const current = orders.find((order) => order.id === id);
    if (!current) return;

    void recordOrderPayment<Order, FinancialTransaction, Customer, CashRegisterSession, CashRegisterTransaction>({
      orderId: id,
      amount,
      method,
      paymentType: options?.payment_type,
      paidAt: options?.paid_at,
      notes: options?.notes,
      expectedUpdatedAt: current.updated_at
    }).then(({ order: savedOrder, financial: savedFinancial, customer, session: savedSession, registerTransaction }) => {
      const orderWithItems = { ...savedOrder, items: current.items };
      setOrders((items) => items.map((item) => item.id === savedOrder.id ? orderWithItems : item));
      setFinancial((items) => items.some((item) => item.id === savedFinancial.id)
        ? items.map((item) => item.id === savedFinancial.id ? savedFinancial : item)
        : [savedFinancial, ...items]);
      if (customer) setCustomers((items) => items.map((item) => item.id === customer.id ? customer : item));
      if (savedSession) setSessions((items) => items.map((item) => item.id === savedSession.id ? savedSession : item));
      if (registerTransaction) {
        setRegisterTransactions((items) => items.some((item) => item.id === registerTransaction.id)
          ? items
          : [registerTransaction, ...items]);
      }
      if (savedOrder.status === 'producao' && current.status !== 'producao') {
        void injectProductionQueue(orderWithItems);
      }
      showToast('Pagamento registrado com sucesso.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Order | undefined : undefined;
      if (latest) setOrders((items) => items.map((item) => item.id === latest.id ? { ...latest, items: item.items } : item));
      warnCaught('Erro ao registrar pagamento do pedido:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível registrar o pagamento.', 'error');
    });
  };

  // ----------------------------------------------------
  // PRODUCTION API
  // ----------------------------------------------------
  const updateProductionStatus = async (id: string, status: ProductionItem['status']) => {
    const nextStatus = normalizeProductionQueueStatus(status);
    const currentItem = production.find((item) => item.id === id);
    if (!currentItem?.updated_at) {
      showToast('A versão deste item está desatualizada. Recarregue a fila.', 'error');
      throw new ProductionMutationError('CONFLICT', 'Versão da fila ausente.');
    }

    if (currentItem.status === nextStatus) return;

    const optimisticItem: ProductionItem = {
      ...currentItem,
      status: nextStatus,
      started_at: nextStatus !== 'fila' ? (currentItem.started_at || new Date().toISOString()) : currentItem.started_at,
      finished_at: ['concluido', 'finalizado'].includes(nextStatus)
        ? (currentItem.finished_at || new Date().toISOString())
        : undefined
    };
    setProduction((items) => replaceProductionItem(items, optimisticItem));

    const orderStatusByProductionStatus: Partial<Record<ProductionItem['status'], Order['status']>> = {
      producao: 'producao',
      impressao: 'impressao',
      expedicao: 'expedicao',
      entregue: 'entregue',
      finalizado: 'finalizado'
    };

    try {
      const savedItem = await transitionProductionStage(id, nextStatus, currentItem.updated_at);
      setProduction((items) => replaceProductionItem(items, savedItem));

      const nextOrderStatus = orderStatusByProductionStatus[nextStatus];
      if (nextOrderStatus) updateOrderStatus(savedItem.order_id, nextOrderStatus);

      if (nextStatus === 'concluido') {
        const { data, error } = await supabase
          .from('production_queue')
          .select('status')
          .eq('company_id', savedItem.company_id)
          .eq('order_id', savedItem.order_id);
        if (!error && data && data.length > 0 && data.every((item) => item.status === 'concluido')) {
          const order = orders.find((candidate) => candidate.id === savedItem.order_id);
          if (order && ['producao', 'impressao', 'acabamento'].includes(order.status)) {
            updateOrderStatus(savedItem.order_id, 'expedicao');
          }
        }
      }
      showToast('Fase de produção atualizada.', 'success');
    } catch (error) {
      const mutationError = error instanceof ProductionMutationError ? error : null;
      setProduction((items) => {
        if (mutationError?.latestItem) return replaceProductionItem(items, mutationError.latestItem);
        return items.map((item) => (
          item.id === currentItem.id
          && item.updated_at === currentItem.updated_at
          && item.status === nextStatus
            ? currentItem
            : item
        ));
      });
      showToast(mutationError?.message || 'Não foi possível atualizar a fase de produção.', 'error');
      throw error;
    }
  };

  const assignProductionResponsible = async (id: string, name: string) => {
    const currentItem = production.find((item) => item.id === id);
    if (!currentItem) throw new ProductionMutationError('NOT_FOUND', 'Item da fila não encontrado.');
    const optimistic = { ...currentItem, responsible_name: name || undefined };
    setProduction((items) => replaceProductionItem(items, optimistic));
    try {
      const savedItem = await assignProductionResponsiblePersisted(currentCompanyId, currentItem, name);
      setProduction((items) => replaceProductionItem(items, savedItem));
    } catch (error) {
      const mutationError = error instanceof ProductionMutationError ? error : null;
      setProduction((items) => {
        if (mutationError?.latestItem) return replaceProductionItem(items, mutationError.latestItem);
        return items.map((item) => (
          item.id === currentItem.id
          && item.updated_at === currentItem.updated_at
          && item.responsible_name === optimistic.responsible_name
            ? currentItem
            : item
        ));
      });
      showToast(error instanceof Error ? error.message : 'Não foi possível atribuir o responsável.', 'error');
      throw error;
    }
  };

  // ----------------------------------------------------
  // FINANCIAL API
  // ----------------------------------------------------
  const addTransaction = (trans: Omit<FinancialTransaction, 'id' | 'company_id' | 'created_at'>) => {
    const newTrans: FinancialTransaction = {
      ...trans,
      id: createOperationId('fin'),
      company_id: currentCompanyId,
      created_at: new Date().toISOString()
    };
    setFinancial(prev => [newTrans, ...prev]);
    void insertTenantRecord<FinancialTransaction>('financial_transactions', newTrans).then((saved) => {
      setFinancial((items) => items.map((item) => item.id === saved.id ? saved : item));
      showToast('Lançamento financeiro salvo.', 'success');
    }).catch((error) => {
      setFinancial((items) => items.filter((item) => item.id !== newTrans.id));
      warnCaught('Erro ao salvar lançamento financeiro:', error);
      showToast('Não foi possível salvar o lançamento financeiro.', 'error');
    });
    return newTrans;
  };

  const updateTransactionStatus = (id: string, status: 'pendente' | 'pago') => {
    const trans = financial.find(f => f.id === id);
    if (!trans || trans.status === status) return;
    void settleFinancialTransaction<FinancialTransaction>({
      transactionId: id,
      status,
      expectedUpdatedAt: trans.updated_at
    }).then(async (saved) => {
      setFinancial((items) => items.map((item) => item.id === saved.id ? saved : item));
      if (saved.order_id) {
        const { data: orderRow } = await supabase.from('orders').select('*').eq('id', saved.order_id).eq('company_id', currentCompanyId).maybeSingle();
        if (orderRow) setOrders((items) => items.map((item) => item.id === orderRow.id ? { ...item, ...orderRow } as Order : item));
        if (saved.payment_method === 'faturado') setCustomers(await listCustomers(currentCompanyId));
      }
      showToast('Status financeiro atualizado.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as FinancialTransaction | undefined : undefined;
      if (latest) setFinancial((items) => items.map((item) => item.id === latest.id ? latest : item));
      warnCaught('Erro ao atualizar status financeiro:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível atualizar o lançamento.', 'error');
    });
  };

  // ----------------------------------------------------
  // SHIPMENTS API
  // ----------------------------------------------------
  const updateShipmentStatus = (id: string, status: Shipment['status'], tracking?: string, carrier?: string) => {
    const current = shipments.find((shipment) => shipment.id === id);
    if (!current) return;
    void transitionShipment<Shipment>({
      shipmentId: id,
      status,
      trackingCode: tracking,
      carrier,
      expectedUpdatedAt: current.updated_at
    }).then((saved) => {
      setShipments((items) => items.map((item) => item.id === saved.id ? saved : item));
      if (saved.status === 'entregue') {
        setOrders((items) => items.map((item) => item.id === saved.order_id && item.status !== 'finalizado' ? { ...item, status: 'entregue' } : item));
      }
      showToast('Expedição atualizada.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Shipment | undefined : undefined;
      if (latest) setShipments((items) => items.map((item) => item.id === latest.id ? latest : item));
      warnCaught('Erro ao atualizar expedição:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível atualizar a expedição.', 'error');
    });
  };
  // ----------------------------------------------------
  // SETTINGS API
  // ----------------------------------------------------
  const updateSettings = (newSettings: Partial<typeof DUMMY_SETTINGS>) => {
    const previous = settings;
    const patch = Object.fromEntries(Object.entries(newSettings).filter(([key, value]) => (
      value !== undefined && JSON.stringify(value) !== JSON.stringify((settings as unknown as Record<string, unknown>)[key])
    )));
    if (Object.keys(patch).length === 0) return;
    setSettings(prev => mergeSettingsWithDefaults(prev, newSettings, true));
    void patchTenantRecord<Record<string, unknown>>(
      'settings', currentCompanyId, currentCompanyId, patch,
      { idColumn: 'company_id', companyColumn: 'company_id', expectedUpdatedAt: (settings as unknown as { updated_at?: string }).updated_at }
    ).then((saved) => {
      setSettings((current) => mergeSettingsWithDefaults(current, saved as Partial<typeof DUMMY_SETTINGS>, true));
      showToast('Configurações salvas com sucesso.', 'success');
    }).catch((error) => {
      setSettings(previous);
      warnCaught('Erro ao salvar configurações:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar as configurações.', 'error');
    });
  };

  const updateCompany = (comp: Company) => {
    const previous = company;
    const excluded = new Set(['id', 'created_at', 'updated_at']);
    const patch = Object.fromEntries(Object.entries(comp).filter(([key, value]) => (
      !excluded.has(key) && value !== undefined && JSON.stringify(value) !== JSON.stringify((company as unknown as Record<string, unknown>)[key])
    )));
    if (Object.keys(patch).length === 0) return;
    setCompany(comp);
    void patchTenantRecord<Company>(
      'companies', comp.id, currentCompanyId, patch,
      { companyColumn: 'id', expectedUpdatedAt: company.updated_at }
    ).then((saved) => {
      setCompany(saved);
      showToast('Configurações da empresa salvas com sucesso.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as Company | undefined : undefined;
      setCompany(latest || previous);
      warnCaught('Erro ao salvar empresa:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar a empresa.', 'error');
    });
  };

  // ----------------------------------------------------
  // PICKUP POINTS API
  // ----------------------------------------------------
  const addPickupPoint = (point: Omit<PickupPoint, 'id' | 'company_id'>) => {
    const newPoint: PickupPoint = {
      ...point,
      id: `pick-${Date.now()}`,
      company_id: currentCompanyId
    };
    setPickupPoints(prev => [...prev, newPoint]);
    void insertTenantRecord<PickupPoint>('pickup_points', newPoint).then((saved) => {
      setPickupPoints((items) => items.map((item) => item.id === saved.id ? saved : item));
    }).catch((error) => {
      setPickupPoints((items) => items.filter((item) => item.id !== newPoint.id));
      warnCaught('Erro ao salvar ponto de coleta:', error);
      showToast('Não foi possível salvar o ponto de coleta.', 'error');
    });
    return newPoint;
  };

  const updatePickupPoint = (point: PickupPoint) => {
    const current = pickupPoints.find((item) => item.id === point.id);
    if (!current) return;
    const patch = Object.fromEntries(Object.entries(point).filter(([key, value]) => (
      !['id', 'company_id', 'updated_at'].includes(key) && JSON.stringify(value) !== JSON.stringify((current as unknown as Record<string, unknown>)[key])
    )));
    setPickupPoints(prev => prev.map(p => (p.id === point.id ? point : p)));
    void patchTenantRecord<PickupPoint>(
      'pickup_points', point.id, currentCompanyId, patch, { expectedUpdatedAt: current.updated_at }
    ).then((saved) => setPickupPoints((items) => items.map((item) => item.id === saved.id ? saved : item)))
      .catch((error) => {
        const latest = error instanceof PersistenceMutationError ? error.latest as PickupPoint | undefined : undefined;
        setPickupPoints((items) => items.map((item) => item.id === point.id ? (latest || current) : item));
        showToast(error instanceof Error ? error.message : 'Não foi possível atualizar o ponto de coleta.', 'error');
      });
  };

  const deletePickupPoint = (id: string) => {
    const current = pickupPoints.find((item) => item.id === id);
    if (!current) return;
    setPickupPoints(prev => prev.filter(p => p.id !== id));
    void deleteTenantRecord('pickup_points', id, currentCompanyId, { expectedUpdatedAt: current.updated_at }).catch((error) => {
      setPickupPoints((items) => items.some((item) => item.id === id) ? items : [...items, current]);
      warnCaught('Erro ao excluir ponto de coleta no Supabase:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir o ponto de coleta.', 'error');
    });
  };

  // ----------------------------------------------------
  // CAIXA / CASH REGISTER API
  // ----------------------------------------------------
  const openRegister = (openingBalance: number, notes?: string) => {
    const existing = sessions.find(s => s.status === 'aberto');
    if (existing) return;
    void operateCashRegister<CashRegisterSession, CashRegisterTransaction>({
      operation: 'open', amount: openingBalance, description: notes
    }).then(({ session: savedSession, transaction }) => {
      setSessions((items) => [savedSession, ...items.filter((item) => item.id !== savedSession.id)]);
      setRegisterTransactions((items) => [transaction, ...items.filter((item) => item.id !== transaction.id)]);
      showToast('Caixa aberto com sucesso.', 'success');
    }).catch((error) => {
      warnCaught('Erro ao abrir caixa:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível abrir o caixa.', 'error');
    });
  };

  const closeRegister = (actualCash: number, notes?: string) => {
    const active = sessions.find(s => s.status === 'aberto');
    if (!active) return;
    void operateCashRegister<CashRegisterSession, CashRegisterTransaction>({
      operation: 'close', amount: actualCash, description: notes, expectedUpdatedAt: active.updated_at
    }).then(async ({ session: savedSession, transaction }) => {
      setSessions((items) => items.map((item) => item.id === savedSession.id ? savedSession : item));
      setRegisterTransactions((items) => [transaction, ...items.filter((item) => item.id !== transaction.id)]);
      const { data } = await supabase.from('financial_transactions').select('*').eq('company_id', currentCompanyId).order('created_at', { ascending: false });
      if (data) setFinancial(data as FinancialTransaction[]);
      showToast('Caixa fechado com sucesso.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as CashRegisterSession | undefined : undefined;
      if (latest) setSessions((items) => items.map((item) => item.id === latest.id ? latest : item));
      warnCaught('Erro ao fechar caixa:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível fechar o caixa.', 'error');
    });
  };

  const addRegisterTransaction = (type: 'suprimento' | 'sangria', amount: number, description: string) => {
    const active = sessions.find(s => s.status === 'aberto');
    if (!active) return;
    void operateCashRegister<CashRegisterSession, CashRegisterTransaction>({
      operation: type, amount, description, expectedUpdatedAt: active.updated_at
    }).then(async ({ session: savedSession, transaction }) => {
      setSessions((items) => items.map((item) => item.id === savedSession.id ? savedSession : item));
      setRegisterTransactions((items) => [transaction, ...items.filter((item) => item.id !== transaction.id)]);
      const { data } = await supabase.from('financial_transactions').select('*').eq('company_id', currentCompanyId).order('created_at', { ascending: false });
      if (data) setFinancial(data as FinancialTransaction[]);
      showToast(type === 'suprimento' ? 'Suprimento registrado.' : 'Sangria registrada.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as CashRegisterSession | undefined : undefined;
      if (latest) setSessions((items) => items.map((item) => item.id === latest.id ? latest : item));
      warnCaught('Erro na operação de caixa:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível registrar a operação de caixa.', 'error');
    });
  };

  // ----------------------------------------------------
  // POS / PDV API
  // ----------------------------------------------------
  const addOrderFromPOS = async (posOrder: {
    customer_id: string;
    customer_name: string;
    items: Omit<OrderItem, 'id' | 'outsourced'>[];
    discount: number;
    paid_amount: number;
    payment_method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado';
    notes?: string;
  }) => {
    const subtotal = posOrder.items.reduce((sum, item) => sum + item.total_price, 0);
    const total = subtotal - posOrder.discount;
    const newOrder: Order = {
      id: `order-${Date.now()}`,
      company_id: currentCompanyId,
      customer_id: posOrder.customer_id,
      customer_name: posOrder.customer_name,
      number: '',
      status: 'aguardando_pagamento',
      total_amount: total,
      paid_amount: 0,
      payment_status: 'pendente',
      shipping_cost: 0,
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      notes: posOrder.notes || 'Venda direta realizada no PDV de Balcão.',
      items: posOrder.items.map((item, idx) => ({
        ...item,
        id: `oi-pos-${idx}-${Date.now()}`,
        outsourced: false
      })),
      created_at: new Date().toISOString()
    };

    const createdOrder = await saveOrderWithItems(newOrder, 'criado no PDV');
    if (!createdOrder) return null;

    const paymentAmount = posOrder.payment_method === 'faturado'
      ? total
      : Math.min(total, Math.max(0, posOrder.paid_amount));
    if (paymentAmount <= 0) return createdOrder;

    try {
      const result = await recordOrderPayment<Order, FinancialTransaction, Customer, CashRegisterSession, CashRegisterTransaction>({
        orderId: createdOrder.id,
        amount: paymentAmount,
        method: posOrder.payment_method,
        paymentType: paymentAmount >= total ? 'total' : 'parcial',
        notes: posOrder.notes,
        expectedUpdatedAt: createdOrder.updated_at
      });
      const savedOrder = { ...result.order, items: createdOrder.items };
      setOrders((items) => items.map((item) => item.id === savedOrder.id ? savedOrder : item));
      setFinancial((items) => items.some((item) => item.id === result.financial.id)
        ? items
        : [result.financial, ...items]);
      if (result.customer) setCustomers((items) => items.map((item) => item.id === result.customer?.id ? result.customer : item));
      if (result.session) setSessions((items) => items.map((item) => item.id === result.session?.id ? result.session : item));
      if (result.registerTransaction) {
        setRegisterTransactions((items) => items.some((item) => item.id === result.registerTransaction?.id)
          ? items
          : [result.registerTransaction as CashRegisterTransaction, ...items]);
      }
      if (savedOrder.status === 'producao') void injectProductionQueue(savedOrder);
      return savedOrder;
    } catch (error) {
      warnCaught('Erro ao registrar pagamento atômico do PDV:', error);
      showToast(error instanceof Error ? error.message : 'O pedido foi criado, mas o pagamento não foi registrado.', 'error');
      return createdOrder;
    }
  };

  const addBanner = (banner: Omit<StoreBanner, 'id'>) => {
    const newBanner: StoreBanner = {
      ...banner,
      id: `banner-${Date.now()}`
    };
    setBanners(prev => [...prev, newBanner]);
    void insertTenantRecord<StoreBannerRow>('store_banners', {
      ...newBanner,
      company_id: currentCompanyId
    }).then((saved) => {
      setBanners((items) => items.map((item) => item.id === saved.id ? saved : item));
    }).catch((error) => {
      setBanners((items) => items.filter((item) => item.id !== newBanner.id));
      warnCaught('Erro ao salvar banner:', error);
      showToast('Não foi possível salvar o banner.', 'error');
    });
    return newBanner;
  };

  const updateBanner = (id: string, patch: Partial<Omit<StoreBanner, 'id'>>) => {
    const current = banners.find((banner) => banner.id === id);
    if (!current) return;
    setBanners((current) => current.map((banner) => banner.id === id ? { ...banner, ...patch } : banner));
    void patchTenantRecord<StoreBannerRow>(
      'store_banners', id, currentCompanyId, patch, { expectedUpdatedAt: current.updated_at }
    ).then((saved) => {
      setBanners((items) => items.map((item) => item.id === saved.id ? saved : item));
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as StoreBanner | undefined : undefined;
      setBanners((items) => items.map((item) => item.id === id ? (latest || current) : item));
      warnCaught('Erro ao atualizar banner:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível atualizar o banner.', 'error');
    });
  };

  const deleteBanner = (id: string) => {
    const current = banners.find((banner) => banner.id === id);
    if (!current) return;
    setBanners(prev => prev.filter(b => b.id !== id));
    void deleteTenantRecord('store_banners', id, currentCompanyId, { expectedUpdatedAt: current.updated_at }).catch((error) => {
      setBanners((items) => items.some((item) => item.id === id) ? items : [...items, current]);
      warnCaught('Erro ao excluir banner no Supabase:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir o banner.', 'error');
    });
  };

  // ----------------------------------------------------
  // EMPLOYEES / PROFILES CRUD API
  // ----------------------------------------------------
  const addProfile = (profile: Omit<UserProfile, 'id' | 'company_id'>) => {
    const newProfile: UserProfile = {
      ...profile,
      id: `u-${Date.now()}`,
      company_id: currentCompanyId
    };
    setProfiles(prev => {
      const nextProfiles = [...prev, newProfile];
      persistDemoSnapshot('profiles', nextProfiles);
      return nextProfiles;
    });
    supabase.from('profiles').insert(newProfile).then(({ error }) => {
      if (error) warnCaught('Erro ao criar funcionário no Supabase:', error);
    });
    return newProfile;
  };

  const updateProfile = async (profile: UserProfile) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        name: profile.name,
        email: profile.email,
        phone: profile.phone || null,
        avatar_url: profile.avatar_url || null,
        role: profile.role,
        active: profile.active,
      })
      .eq('id', profile.id)
      .eq('company_id', currentCompanyId)
      .select('*')
      .maybeSingle();

    if (error) {
      warnCaught('Erro ao atualizar funcionário no Supabase:', error);
      throw error;
    }

    if (!data) {
      const persistenceError = new Error('O perfil não foi confirmado pelo banco de dados.');
      warnCaught('Erro ao atualizar funcionário no Supabase:', persistenceError);
      throw persistenceError;
    }

    const persistedProfile = data as UserProfile;
    setProfiles(prev => {
      const nextProfiles = prev.map(p => p.id === persistedProfile.id ? persistedProfile : p);
      persistDemoSnapshot('profiles', nextProfiles);
      return nextProfiles;
    });

    return persistedProfile;
  };

  const deleteProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
    supabase.from('profiles').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir funcionário no Supabase:', error);
    });
  };

  const updateRolePermissions = (permissions: Record<string, string[]>) => {
    const previous = rolePermissions;
    setRolePermissions(permissions);
    void saveRolePermissions<RolePermissionRow>(permissions, rolePermissionVersionsRef.current).then((saved) => {
      const nextPermissions: Record<string, string[]> = {};
      const nextVersions: Record<string, string> = {};
      saved.forEach((row) => {
        nextPermissions[row.path] = row.roles;
        if (row.updated_at) nextVersions[row.path] = row.updated_at;
      });
      rolePermissionVersionsRef.current = nextVersions;
      setRolePermissions(nextPermissions);
      showToast('Permissões atualizadas.', 'success');
    }).catch((error) => {
      const latest = error instanceof PersistenceMutationError ? error.latest as RolePermissionRow[] | undefined : undefined;
      if (latest) {
        const nextPermissions: Record<string, string[]> = {};
        const nextVersions: Record<string, string> = {};
        latest.forEach((row) => {
          nextPermissions[row.path] = row.roles;
          if (row.updated_at) nextVersions[row.path] = row.updated_at;
        });
        rolePermissionVersionsRef.current = nextVersions;
        setRolePermissions(nextPermissions);
      } else {
        setRolePermissions(previous);
      }
      warnCaught('Erro ao salvar permissões:', error);
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar as permissões.', 'error');
    });
  };

  const canRenderCurrentScope = isPublicStoreRoute() || (
    !isAuthLoading && loadedSessionScopeKeyRef.current === sessionScopeKey
  );

  if (!initialized || !canRenderCurrentScope) {
  return null;
  }
  
  return (
    <DatabaseContext.Provider
      value={{
        isTenantReady,
        isSessionSwitching,
        customers,
        suppliers,
        categories,
        products,
        quotes,
        orders,
        production,
        financial,
        shipments,
        stockMovements,
        settings,
        company,
        updateCompany,
        pickupPoints,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addSupplier,
        addCategory,
        updateCategory,
        updateCategoryCatalogPresentation,
        deleteCategory,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustStock,
        addQuote,
        updateQuote,
        deleteQuote,
        approveQuote,
        addOrder,
        updateOrder,
        updateOrderStatus,
        payOrder,
        updateProductionStatus,
        assignProductionResponsible,
        addTransaction,
        updateTransactionStatus,
        updateShipmentStatus,
        updateSettings,
        resetDatabase,
        addPickupPoint,
        updatePickupPoint,
        deletePickupPoint,
        activeSession,
        sessions,
        registerTransactions,
        openRegister,
        closeRegister,
        addRegisterTransaction,
        addOrderFromPOS,
        banners,
        addBanner,
        updateBanner,
        deleteBanner,
        profiles,
        addProfile,
        updateProfile,
        deleteProfile,
        rolePermissions,
        updateRolePermissions,
        refreshStoreCatalog,
        showToast
      }}
    >
      {children}
      {toast && (
        <>
          <style>{`
            @keyframes toast-slide-in {
              from {
                transform: translateX(120%) scale(0.9);
                opacity: 0;
              }
              to {
                transform: translateX(0) scale(1);
                opacity: 1;
              }
            }
            .animate-toast-in {
              animation: toast-slide-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
          `}</style>
          <div 
            className="fixed bottom-5 right-5 z-[99999] animate-toast-in flex items-center gap-3 p-4 shadow-2xl transition-all border"
            style={{
              borderRadius: '10px',
              backgroundColor: toast.type === 'success' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(24, 24, 27, 0.95)',
              borderColor: toast.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
              boxShadow: toast.type === 'success' 
                ? '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(16, 185, 129, 0.05), 0 0 15px 0px rgba(16, 185, 129, 0.15)' 
                : '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(239, 68, 68, 0.05), 0 0 15px 0px rgba(239, 68, 68, 0.15)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* Icon */}
            <div className={`p-2 rounded-lg flex items-center justify-center ${
              toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {toast.type === 'success' ? (
                <svg className="w-5 h-5 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </div>

            {/* Content */}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-100">
                {toast.type === 'success' ? 'Sucesso' : 'Erro'}
              </span>
              <span className="text-xs text-slate-400 pr-4 mt-0.5 max-w-[250px]">
                {toast.message}
              </span>
            </div>

            {/* Close Button */}
            <button 
              onClick={() => setToast(null)}
              className="ml-auto p-1 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </>
      )}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}
