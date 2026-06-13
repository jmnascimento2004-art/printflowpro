'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { warnCaught } from '@/lib/safe-log';
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
  PickupPoint,
  DUMMY_PICKUP_POINTS,
  UserProfile,
  DUMMY_PROFILES
} from '@/lib/dummy-data';

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
  }) => Order;

  // CRM
  addCustomer: (cust: Omit<Customer, 'id' | 'company_id' | 'created_at'>) => Customer;
  updateCustomer: (cust: Customer) => void;
  deleteCustomer: (id: string) => void;

  // Suppliers & Categories
  addSupplier: (sup: Omit<Supplier, 'id' | 'company_id' | 'created_at'>) => Supplier;
  addCategory: (name: string, description: string, parent_id?: string | null) => Category;
  updateCategory: (id: string, name: string, description: string, parent_id?: string | null) => void;
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
  approveQuote: (id: string) => void;

  // Orders
  addOrder: (order: Omit<Order, 'id' | 'company_id' | 'number' | 'created_at'>) => Order;
  updateOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  payOrder: (id: string, amount: number, method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado') => void;

  // Production
  updateProductionStatus: (id: string, status: ProductionItem['status']) => void;
  assignProductionResponsible: (id: string, responsibleName: string) => void;

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
  deleteBanner: (id: string) => void;

  // Employees CRUD
  profiles: UserProfile[];
  addProfile: (profile: Omit<UserProfile, 'id' | 'company_id'>) => UserProfile;
  updateProfile: (profile: UserProfile) => void;
  deleteProfile: (id: string) => void;

  // Permissions
  rolePermissions: Record<string, string[]>;
  updateRolePermissions: (permissions: Record<string, string[]>) => void;

  // Helpers
  resetDatabase: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export interface StoreBanner {
  id: string;
  image_url: string;
  title?: string;
  subtitle?: string;
  link?: string;
}

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
  'catalog_footer_text'
] as const;
const isBrowser = () => typeof window !== 'undefined';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const normalizeDomain = (value: string = '') => {
  const trimmed = value.trim().toLowerCase();
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

const getCurrentHostname = () => {
  if (!isBrowser()) return '';
  return normalizeDomain(window.location.hostname);
};

const resolveCompanyForHostname = (companies: Company[]) => {
  const hostname = getCurrentHostname();
  if (!hostname || LOCAL_HOSTNAMES.has(hostname)) return companies[0];
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

const isDemoFallbackAllowed = () => {
  if (!isBrowser()) return false;
  return process.env.NODE_ENV !== 'production' || window.localStorage.getItem('printflow_demo_mode') === 'true';
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
  const [initialized, setInitialized] = useState(false);
  const [canShowToast, setCanShowToast] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
    if (initialized) {
      const timer = setTimeout(() => {
        setCanShowToast(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialized]);
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

  // Caixa
  const [sessions, setSessions] = useState<CashRegisterSession[]>([]);
  const [registerTransactions, setRegisterTransactions] = useState<CashRegisterTransaction[]>([]);
  const activeSession = sessions.find(s => s.status === 'aberto') || null;
  const currentCompanyId = company.id || DUMMY_COMPANY.id;

  // Load from Supabase on mount, fallback to localStorage
  useEffect(() => {
    if (!isBrowser()) return;

    const init = async () => {
      try {
    const { data: companies, error } = await supabase.from('companies').select('*');

        if (error) {  warnCaught('Erro companies:', error);
          loadFromLocalStorage();
          return;
      }
      
        if (error) throw error;

        if (!companies || companies.length === 0) {
          // Initial production setup must be done through Supabase SQL Editor or a server-side service role.
          // The browser client must not seed tenant data with the public key.
          
          // Clear operational data in localStorage to prevent loading dummy data locally
          window.localStorage.setItem('printflow_customers', '[]');
          window.localStorage.setItem('printflow_suppliers', '[]');
          window.localStorage.setItem('printflow_categories', '[]');
          window.localStorage.setItem('printflow_products', '[]');
          window.localStorage.setItem('printflow_quotes', '[]');
          window.localStorage.setItem('printflow_orders', '[]');
          window.localStorage.setItem('printflow_production', '[]');
          window.localStorage.setItem('printflow_financial', '[]');
          window.localStorage.setItem('printflow_shipments', '[]');
          window.localStorage.setItem('printflow_stockMovements', '[]');
          window.localStorage.setItem('printflow_pickupPoints', '[]');
          window.localStorage.setItem('printflow_banners', '[]');
          window.localStorage.setItem('printflow_sessions', '[]');
          window.localStorage.setItem('printflow_registerTransactions', '[]');

          // Keep public configuration empty/default until a real tenant is provisioned.
          setCompany({ ...DUMMY_COMPANY, name: 'PrintFlowPRO', document: '' });
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
          { data: customersData },
          { data: suppliersData },
          { data: categoriesData },
          { data: productsData },
          { data: quotesData },
          { data: quoteItemsData },
          { data: ordersData },
          { data: orderItemsData },
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
          supabase.from('settings').select('*'),
          supabase.from('profiles').select('*'),
          supabase.from('customers').select('*'),
          supabase.from('suppliers').select('*'),
          supabase.from('categories').select('*'),
          supabase.from('products').select('*'),
          supabase.from('quotes').select('*'),
          supabase.from('quote_items').select('*'),
          supabase.from('orders').select('*'),
          supabase.from('order_items').select('*'),
          supabase.from('production_queue').select('*'),
          supabase.from('financial_transactions').select('*'),
          supabase.from('shipments').select('*'),
          supabase.from('stock_movements').select('*'),
          supabase.from('pickup_points').select('*'),
          supabase.from('store_banners').select('*'),
          supabase.from('role_permissions').select('*'),
          supabase.from('cash_register_sessions').select('*'),
          supabase.from('cash_register_transactions').select('*')
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
          try {
            storedSettings = JSON.parse(window.localStorage.getItem('printflow_settings') || 'null');
          } catch {
            storedSettings = null;
          }
          setSettings(mergeSettingsWithDefaults(activeSettings as Partial<typeof DUMMY_SETTINGS>, storedSettings));
        }
        if (profilesData) setProfiles(filterByCompany(profilesData as UserProfile[]) as any);
        if (customersData) setCustomers(filterByCompany(customersData as any) as any);
        if (suppliersData) setSuppliers(filterByCompany(suppliersData as any) as any);
        if (categoriesData) setCategories(filterByCompany(categoriesData as any) as any);
        if (productsData) setProducts(filterByCompany(productsData as any) as any);
        
        if (quotesData) {
          const reconstructed = (filterByCompany(quotesData as any) as any[]).map(q => {
            const items = quoteItemsData ? quoteItemsData.filter(qi => qi.quote_id === q.id) : [];
            return { ...q, items };
          });
          setQuotes(reconstructed as any);
        }

        if (ordersData) {
          const reconstructed = (filterByCompany(ordersData as any) as any[]).map(o => {
            const items = orderItemsData ? orderItemsData.filter(oi => oi.order_id === o.id) : [];
            return { ...o, items };
          });
          setOrders(reconstructed as any);
        }

        if (productionData) setProduction(filterByCompany(productionData as any) as any);
        if (financialData) setFinancial(filterByCompany(financialData as any) as any);
        if (shipmentsData) setShipments(filterByCompany(shipmentsData as any) as any);
        if (stockMovementsData) setStockMovements(filterByCompany(stockMovementsData as any) as any);
        if (pickupPointsData) setPickupPoints(filterByCompany(pickupPointsData as any) as any);
        if (bannersData) setBanners(filterByCompany(bannersData as any) as any);
        
        if (rolePermsData) {
          const perms: Record<string, string[]> = {};
          rolePermsData.forEach(rp => {
            perms[rp.path] = rp.roles;
          });
          setRolePermissions(perms);
        }

        if (sessionsData) setSessions(filterByCompany(sessionsData as any) as any);
        if (regTransData) setRegisterTransactions(regTransData as any);

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
          setCompany({ ...DUMMY_COMPANY, name: 'PrintFlowPRO', document: '' });
          setBanners([]);
          setProfiles([]);
          setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
          setSessions([]);
          setRegisterTransactions([]);
          setInitialized(true);
          return;
        }

        const getOrSet = <T,>(key: string, defaultValue: T): T => {
          const stored = window.localStorage.getItem(`printflow_${key}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed !== null && parsed !== undefined) return parsed as T;
          }
          window.localStorage.setItem(`printflow_${key}`, JSON.stringify(defaultValue));
          return defaultValue;
        };

        setCustomers(getOrSet('customers', DUMMY_CUSTOMERS));
        setSuppliers(getOrSet('suppliers', DUMMY_SUPPLIERS));
        setCategories(getOrSet('categories', DUMMY_CATEGORIES));
        setProducts(getOrSet('products', DUMMY_PRODUCTS));
        setQuotes(getOrSet('quotes', DUMMY_QUOTES));
        
        const rawOrders = getOrSet('orders', DUMMY_ORDERS);
        setOrders(rawOrders.map(o => ({ ...o, number: o.number.replace(/ORD-\d{4}-/, 'ORD-') })));
        
        const rawProd = getOrSet('production', DUMMY_PRODUCTION_QUEUE);
        setProduction(rawProd.map(p => ({ ...p, order_number: p.order_number.replace(/ORD-\d{4}-/, 'ORD-') })));
        
        const rawFin = getOrSet('financial', DUMMY_FINANCIAL);
        setFinancial(rawFin.map(f => ({
          ...f,
          order_number: f.order_number ? f.order_number.replace(/ORD-\d{4}-/, 'ORD-') : undefined,
          description: f.description.replace(/ORD-\d{4}-/, 'ORD-')
        })));

        const rawShips = getOrSet('shipments', DUMMY_SHIPMENTS);
        setShipments(rawShips.map(s => ({ ...s, order_number: s.order_number.replace(/ORD-\d{4}-/, 'ORD-') })));
        
        setStockMovements(getOrSet('stockMovements', []));
        setSettings(mergeSettingsWithDefaults(null, getOrSet('settings', DUMMY_SETTINGS), true));
        setPickupPoints(getOrSet('pickupPoints', DUMMY_PICKUP_POINTS));
        
        const loadedCompany = getOrSet('company', DUMMY_COMPANY);
        setCompany(loadedCompany);
        
        setBanners(getOrSet('banners', DEFAULT_BANNERS));
        setProfiles(getOrSet('profiles', DUMMY_PROFILES));
        setRolePermissions(getOrSet('role_permissions', DEFAULT_ROLE_PERMISSIONS));
        setSessions(getOrSet('sessions', []));
        setRegisterTransactions(getOrSet('registerTransactions', []));
        
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
          setCompany({ ...DUMMY_COMPANY, name: 'PrintFlowPRO', document: '' });
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
  }, []);

  useEffect(() => {
    if (!isBrowser()) return;

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

  // Save triggers mapped to both localStorage and Supabase
  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_customers', JSON.stringify(customers));
      supabase.from('customers').upsert(customers).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar clientes no Supabase:', error);
      });
      if (canShowToast) showToast('Clientes atualizados com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar dados de clientes!', 'error');
    }
  }, [customers, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_suppliers', JSON.stringify(suppliers));
      supabase.from('suppliers').upsert(suppliers).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar fornecedores no Supabase:', error);
      });
      if (canShowToast) showToast('Fornecedores atualizados com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar fornecedores!', 'error');
    }
  }, [suppliers, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_categories', JSON.stringify(categories));
      supabase.from('categories').upsert(categories).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar categorias no Supabase:', error);
      });
      if (canShowToast) showToast('Categorias atualizadas com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar categorias!', 'error');
    }
  }, [categories, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_products', JSON.stringify(products));
      supabase.from('products').upsert(products).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar produtos no Supabase:', error);
      });
      if (canShowToast) showToast('Produtos atualizados com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar produtos!', 'error');
    }
  }, [products, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_quotes', JSON.stringify(quotes));
      
      const parentQuotes = quotes.map(({ items, ...q }) => q);
      supabase.from('quotes').upsert(parentQuotes).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar orçamentos no Supabase:', error);
      });
      
      const allItems = quotes.flatMap(q => 
        q.items.map(item => ({ ...item, quote_id: q.id }))
      );
      if (allItems.length > 0) {
        supabase.from('quote_items').upsert(allItems).then(({ error }) => {
          if (error) warnCaught('Erro ao sincronizar itens do orçamento no Supabase:', error);
        });
      }
      
      if (canShowToast) showToast('Orçamentos atualizados com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar orçamentos!', 'error');
    }
  }, [quotes, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_orders', JSON.stringify(orders));
      
      const parentOrders = orders.map(({ items, ...o }) => o);
      supabase.from('orders').upsert(parentOrders).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar pedidos no Supabase:', error);
      });
      
      const allItems = orders.flatMap(o => 
        o.items.map(item => ({ ...item, order_id: o.id }))
      );
      if (allItems.length > 0) {
        supabase.from('order_items').upsert(allItems).then(({ error }) => {
          if (error) warnCaught('Erro ao sincronizar itens do pedido no Supabase:', error);
        });
      }
      
      if (canShowToast) showToast('Pedidos atualizados com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar pedidos!', 'error');
    }
  }, [orders, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_production', JSON.stringify(production));
      supabase.from('production_queue').upsert(production).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar fila de produção no Supabase:', error);
      });
      if (canShowToast) showToast('Fila de produção atualizada!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao atualizar produção!', 'error');
    }
  }, [production, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_financial', JSON.stringify(financial));
      supabase.from('financial_transactions').upsert(financial).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar financeiro no Supabase:', error);
      });
      if (canShowToast) showToast('Transações financeiras atualizadas!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar finanças!', 'error');
    }
  }, [financial, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_shipments', JSON.stringify(shipments));
      supabase.from('shipments').upsert(shipments).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar expedição no Supabase:', error);
      });
      if (canShowToast) showToast('Envios e entregas atualizados!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar entregas!', 'error');
    }
  }, [shipments, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_stockMovements', JSON.stringify(stockMovements));
      supabase.from('stock_movements').upsert(stockMovements).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar estoque no Supabase:', error);
      });
      if (canShowToast) showToast('Estoque movimentado com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar estoque!', 'error');
    }
  }, [stockMovements, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser() || !company?.id) return;
    try {
      window.localStorage.setItem('printflow_settings', JSON.stringify(settings));
      supabase.from('settings').upsert({
        company_id: company.id,
        pix_key: settings.pix_key || null,
        pix_key_type: settings.pix_key_type || null,
        pix_beneficiary_name: settings.pix_beneficiary_name || null,
        bank_name: settings.bank_name || null,
        profit_margin: settings.profit_margin || 0,
        tax_rate: settings.tax_rate || 0,
        commission_rate: settings.commission_rate || 0,
        top_bar_hours: settings.top_bar_hours || null,
        top_bar_show_pickup: settings.top_bar_show_pickup ?? true,
        top_bar_phone: settings.top_bar_phone || null,
        footer_show_address: settings.footer_show_address ?? true,
        footer_hours_message: settings.footer_hours_message || null,
        footer_hours_week: settings.footer_hours_week || null,
        footer_hours_sat: settings.footer_hours_sat || null,
        footer_hours_sat_time: settings.footer_hours_sat_time || null,
        footer_hours_sat_desc: settings.footer_hours_sat_desc || null,
        saas_enabled: settings.saas_enabled ?? true,
        nfe_enabled: settings.nfe_enabled ?? false,
        ai_enabled: settings.ai_enabled ?? false,
        company_address: settings.company_address || null,
        delivery_motoboy_price_km: settings.delivery_motoboy_price_km || 0,
        delivery_car_price_km: settings.delivery_car_price_km || 0,
        delivery_min_fee: settings.delivery_min_fee || 0,
        catalog_header_message: settings.catalog_header_message || null,
        catalog_whatsapp: settings.catalog_whatsapp || null,
        free_pickup_alert: settings.free_pickup_alert ?? true,
        catalog_footer_text: settings.catalog_footer_text || null,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar configurações no Supabase:', error);
      });

    if (canShowToast) showToast('Configurações salvas com sucesso!', 'success');
  } catch (error) {
    warnCaught('Erro capturado:', error);
    if (canShowToast) showToast('Erro ao salvar configurações!', 'error');
  }
}, [settings, company?.id, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_pickupPoints', JSON.stringify(pickupPoints));
      supabase.from('pickup_points').upsert(pickupPoints).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar pontos de coleta no Supabase:', error);
      });
      if (canShowToast) showToast('Pontos de retirada salvos!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar pontos de retirada!', 'error');
    }
  }, [pickupPoints, initialized, canShowToast]);

useEffect(() => {
  if (!initialized || !isBrowser()) return;

  try {
    window.localStorage.setItem('printflow_company', JSON.stringify(company));

    if (!company?.id) return;

    supabase
      .from('companies')
      .update({
        name: company.name,
        document: company.document,
        phone: company.phone,
        email: company.email,
        cep: company.cep,
        street: company.street,
        number: company.number,
        neighborhood: company.neighborhood,
        city: company.city,
        state: company.state,
        logo_url: company.logo_url,
        logo_light: company.logo_light,
        logo_dark: company.logo_dark,
        favicon: company.favicon,
        theme_color: company.theme_color,
        admin_domain: company.admin_domain || null,
        store_domain: company.store_domain || company.custom_domain || null,
        custom_domain: company.custom_domain || null,
        custom_domain_status: company.custom_domain_status || 'not_configured',
        custom_domain_verified_at: company.custom_domain_verified_at || null,
        instagram_url: company.instagram_url,
        facebook_url: company.facebook_url,
        youtube_url: company.youtube_url,
        refund_policy: company.refund_policy,
        show_payments_visa: company.show_payments_visa,
        show_payments_mastercard: company.show_payments_mastercard,
        show_payments_elo: company.show_payments_elo,
        show_payments_hipercard: company.show_payments_hipercard,
        show_payments_diners: company.show_payments_diners,
        show_payments_amex: company.show_payments_amex,
        show_payments_boleto: company.show_payments_boleto,
        show_payments_transferencia: company.show_payments_transferencia,
        show_payments_pix: company.show_payments_pix,
        show_delivery_sedex: company.show_delivery_sedex,
        show_delivery_pac: company.show_delivery_pac,
        show_delivery_correios: company.show_delivery_correios,
        show_delivery_jadlog: company.show_delivery_jadlog,
        show_delivery_motoboy: company.show_delivery_motoboy,
        show_security_letsencrypt: company.show_security_letsencrypt,
        show_security_google: company.show_security_google,
        img_payments_visa: company.img_payments_visa,
        img_payments_mastercard: company.img_payments_mastercard,
        img_payments_elo: company.img_payments_elo,
        img_payments_hipercard: company.img_payments_hipercard,
        img_payments_diners: company.img_payments_diners,
        img_payments_amex: company.img_payments_amex,
        img_payments_boleto: company.img_payments_boleto,
        img_payments_transferencia: company.img_payments_transferencia,
        img_payments_pix: company.img_payments_pix,
        img_delivery_sedex: company.img_delivery_sedex,
        img_delivery_pac: company.img_delivery_pac,
        img_delivery_correios: company.img_delivery_correios,
        img_delivery_jadlog: company.img_delivery_jadlog,
        img_delivery_motoboy: company.img_delivery_motoboy,
        img_security_letsencrypt: company.img_security_letsencrypt,
        img_security_google: company.img_security_google,
        card_benefits_1_title: company.card_benefits_1_title,
        card_benefits_1_subtitle: company.card_benefits_1_subtitle,
        card_benefits_1_active: company.card_benefits_1_active,
        card_benefits_2_title: company.card_benefits_2_title,
        card_benefits_2_subtitle: company.card_benefits_2_subtitle,
        card_benefits_2_active: company.card_benefits_2_active,
        card_benefits_3_title: company.card_benefits_3_title,
        card_benefits_3_subtitle: company.card_benefits_3_subtitle,
        card_benefits_3_active: company.card_benefits_3_active,
        card_benefits_4_title: company.card_benefits_4_title,
        card_benefits_4_subtitle: company.card_benefits_4_subtitle,
        card_benefits_4_active: company.card_benefits_4_active,
      })
      .eq('id', company.id)
      .then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar empresa no Supabase:', error);
      });

    if (canShowToast) showToast('Configurações da empresa salvas com sucesso!', 'success');
  } catch (error) {
    warnCaught('Erro capturado:', error);
    if (canShowToast) showToast('Erro ao salvar empresa!', 'error');
  }
}, [company, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_banners', JSON.stringify(banners));
      const formatted = banners.map(b => ({ company_id: company.id, ...b }));
      supabase.from('store_banners').upsert(formatted).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar banners no Supabase:', error);
      });
      if (canShowToast) showToast('Banners salvos com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar banners!', 'error');
    }
  }, [banners, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_profiles', JSON.stringify(profiles));
      supabase.from('profiles').upsert(profiles).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar funcionários no Supabase:', error);
      });
      if (canShowToast) showToast('Funcionários atualizados com sucesso!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar funcionários!', 'error');
    }
  }, [profiles, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_role_permissions', JSON.stringify(rolePermissions));
      const formatted = Object.entries(rolePermissions).map(([path, roles]) => ({
        company_id: company.id,
        path,
        roles
      }));
      if (formatted.length > 0) {
      supabase
        .from('role_permissions')
        .upsert(formatted, { onConflict: 'company_id,path' })
        .then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar permissões no Supabase:', error);
      });
      }
      if (canShowToast) showToast('Permissões de acesso atualizadas!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar permissões de acesso!', 'error');
    }
  }, [rolePermissions, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_sessions', JSON.stringify(sessions));
      supabase.from('cash_register_sessions').upsert(sessions).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar sessões de caixa no Supabase:', error);
      });
      if (canShowToast) showToast('Status de caixa atualizado!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar sessões de caixa!', 'error');
    }
  }, [sessions, initialized, canShowToast]);

  useEffect(() => {
    if (!initialized || !isBrowser()) return;
    try {
      window.localStorage.setItem('printflow_registerTransactions', JSON.stringify(registerTransactions));
      supabase.from('cash_register_transactions').upsert(registerTransactions).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar transações de caixa no Supabase:', error);
      });
      if (canShowToast) showToast('Transação do caixa salva!', 'success');
    } catch {
      if (canShowToast) showToast('Erro ao salvar transações!', 'error');
    }
  }, [registerTransactions, initialized, canShowToast]);

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

    // Set operational data in localStorage to empty arrays to prevent falling back to dummy data on offline reload
    window.localStorage.setItem('printflow_customers', '[]');
    window.localStorage.setItem('printflow_suppliers', '[]');
    window.localStorage.setItem('printflow_categories', '[]');
    window.localStorage.setItem('printflow_products', '[]');
    window.localStorage.setItem('printflow_quotes', '[]');
    window.localStorage.setItem('printflow_orders', '[]');
    window.localStorage.setItem('printflow_production', '[]');
    window.localStorage.setItem('printflow_financial', '[]');
    window.localStorage.setItem('printflow_shipments', '[]');
    window.localStorage.setItem('printflow_stockMovements', '[]');
    window.localStorage.setItem('printflow_pickupPoints', '[]');
    window.localStorage.setItem('printflow_banners', '[]');
    window.localStorage.setItem('printflow_sessions', '[]');
    window.localStorage.setItem('printflow_registerTransactions', '[]');
    
    // Clear Supabase operational tables but KEEP companies, settings, profiles, and role_permissions
    Promise.all([
      supabase.from('customers').delete().not('id', 'is', null),
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
  // CRM API
  // ----------------------------------------------------
  const addCustomer = (cust: Omit<Customer, 'id' | 'company_id' | 'created_at'>) => {
    const customerIdPrefix = cust.tags?.includes('Catalogo Online') ? 'cust-web' : 'cust';
    const newCust: Customer = {
      ...cust,
      id: `${customerIdPrefix}-${Date.now()}`,
      company_id: currentCompanyId,
      created_at: new Date().toISOString()
    };
    setCustomers(prev => [newCust, ...prev]);
    supabase.from('customers').insert(newCust).then(({ error }) => {
      if (error) warnCaught('Erro ao sincronizar cliente criado no catÃ¡logo:', error);
    });
    return newCust;
  };

  const updateCustomer = (cust: Customer) => {
    setCustomers(prev => prev.map(c => (c.id === cust.id ? cust : c)));
  };

  const deleteCustomer = (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    supabase.from('customers').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir cliente no Supabase:', error);
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
    return newSup;
  };

  const addCategory = (name: string, description: string, parent_id?: string | null) => {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      company_id: currentCompanyId,
      name,
      description,
      parent_id: parent_id || null,
      created_at: new Date().toISOString()
    };
    setCategories(prev => [...prev, newCat]);
    return newCat;
  };

  const updateCategory = (id: string, name: string, description: string, parent_id?: string | null) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name, description, parent_id: parent_id || null } : c));
  };

  const deleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    supabase.from('categories').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir categoria no Supabase:', error);
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

  supabase
    .from('products')
    .insert({
      id: newProd.id,
      company_id: newProd.company_id,
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
    })
    .then(({ error }) => {
      if (error) {
        warnCaught('Erro ao salvar produto no Supabase:', error);
        showToast('Erro ao salvar produto no Supabase.', 'error');
      } else {
        showToast('Produto salvo com sucesso.', 'success');
      }
    });

  return newProd;
};

  const updateProduct = (prod: Product) => {
  setProducts(prev => prev.map(p => (p.id === prod.id ? prod : p)));

  supabase
    .from('products')
    .update({
      category_id: prod.category_id,
      name: prod.name,
      description: prod.description,
      sku: prod.sku,
      pricing_type: prod.pricing_type,
      base_cost: prod.base_cost,
      sales_price: prod.sales_price,
      stock_controlled: prod.stock_controlled,
      min_stock: prod.min_stock,
      current_stock: prod.current_stock,
      active: prod.active,
      catalog_active: prod.catalog_active !== false,
      image_url: prod.image_url || null,
      volume_pricing: prod.volume_pricing || null,
      variant_options: prod.variant_options || null,
      color_options: prod.color_options || null,
      is_promo: prod.is_promo || false,
      is_highlight: prod.is_highlight || false,
      pricing_details: prod.pricing_details || null
    })
    .eq('id', prod.id)
    .then(({ error }) => {
      if (error) {
        warnCaught('Erro ao atualizar produto no Supabase:', error);
        showToast('Erro ao atualizar produto no Supabase.', 'error');
      } else {
        showToast('Produto atualizado com sucesso.', 'success');
      }
    });
};

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    supabase.from('products').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir produto no Supabase:', error);
    });
  };

  const adjustStock = (productId: string, quantity: number, reason: string, type: 'entrada' | 'saida', cost?: number) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === productId) {
          const delta = type === 'entrada' ? quantity : -quantity;
          const newStock = Math.max(0, p.current_stock + delta);
          return { ...p, current_stock: newStock };
        }
        return p;
      })
    );

    const match = products.find(p => p.id === productId);
    const newMovement: StockMovement = {
      id: `sm-${Date.now()}`,
      company_id: currentCompanyId,
      product_id: productId,
      product_name: match ? match.name : 'Produto Desconhecido',
      type,
      quantity,
      reason,
      unit_cost: cost || (match ? match.base_cost : 0),
      created_at: new Date().toISOString()
    };
    setStockMovements(prev => [newMovement, ...prev]);
  };

  // ----------------------------------------------------
  // QUOTES API
  // ----------------------------------------------------
  const persistQuotesSnapshot = (nextQuotes: Quote[]) => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem('printflow_quotes', JSON.stringify(nextQuotes));
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
    setQuotes(prev => {
      const nextQuotes = [newQuote, ...prev];
      persistQuotesSnapshot(nextQuotes);
      return nextQuotes;
    });

    const { items, ...parentQuote } = newQuote;
    supabase.from('quotes').insert(parentQuote).then(({ error }) => {
      if (error) warnCaught('Erro ao sincronizar orçamento criado no catálogo:', error);
    });

    if (items.length > 0) {
      const quoteItems = items.map(item => ({ ...item, quote_id: newQuote.id }));
      supabase.from('quote_items').insert(quoteItems).then(({ error }) => {
        if (error) warnCaught('Erro ao sincronizar itens do orçamento criado no catálogo:', error);
      });
    }

    return newQuote;
  };

  const updateQuote = (quote: Quote) => {
    setQuotes(prev => prev.map(q => (q.id === quote.id ? quote : q)));
  };

  const deleteQuote = (id: string) => {
    setQuotes(prev => prev.filter(q => q.id !== id));
    supabase.from('quotes').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir orçamento no Supabase:', error);
    });
  };

  const getNextOrderNumber = (currentOrders: Order[]) => {
    const prefix = `ORD-`;
    
    const nums = currentOrders
      .filter(o => o.number.startsWith(prefix))
      .map(o => {
        const parts = o.number.split('-');
        const numPart = parts[parts.length - 1];
        return parseInt(numPart) || 0;
      });
      
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    const nextNum = maxNum + 1;
    
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  };

  const approveQuote = (id: string) => {
    const match = quotes.find(q => q.id === id);
    if (!match) return;

    // 1. Update quote status to approved
    setQuotes(prev => prev.map(q => (q.id === id ? { ...q, status: 'aprovado' } : q)));

    // 2. Automatically generate an Order
    const orderNumber = getNextOrderNumber(orders);
    const newOrder: Order = {
      id: `order-${Date.now()}`,
      company_id: currentCompanyId,
      customer_id: match.customer_id,
      customer_name: match.customer_name,
      number: orderNumber,
      status: 'aguardando_aprovacao',
      total_amount: match.total_amount,
      paid_amount: 0,
      payment_status: 'pendente',
      shipping_cost: match.delivery_fee || 0,
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
      notes: `Convertido do Orçamento #${match.number}. ${match.notes}`,
      items: match.items.map(i => ({
        id: `oi-${Math.random().toString(36).substr(2, 9)}`,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total_price: i.total_price,
        details: i.details,
        outsourced: false
      })),
      created_at: new Date().toISOString(),
      delivery_type: match.delivery_type,
      delivery_address: match.delivery_address,
      delivery_distance_km: match.delivery_distance_km
    };

    setOrders(prev => [newOrder, ...prev]);
  };

  // ----------------------------------------------------
  // ORDERS & PRODUCTION/STOCK TRIGGER API
  // ----------------------------------------------------
  const addOrder = (order: Omit<Order, 'id' | 'company_id' | 'number' | 'created_at'>) => {
    const orderNumber = getNextOrderNumber(orders);
    const newOrder: Order = {
      ...order,
      id: `order-${Date.now()}`,
      company_id: currentCompanyId,
      number: orderNumber,
      created_at: new Date().toISOString()
    };

    setOrders(prev => [newOrder, ...prev]);

    // Handle initial state production injection if order begins in production
    if (newOrder.status === 'producao' || newOrder.status === 'impressao' || newOrder.status === 'acabamento') {
      injectProductionQueue(newOrder);
    }

    return newOrder;
  };

  const updateOrder = (order: Order) => {
    setOrders(prev => prev.map(o => (o.id === order.id ? order : o)));
  };

  const injectProductionQueue = (order: Order) => {
    // Helper to queue items
    const newQueueItems: ProductionItem[] = order.items.map(item => ({
      id: `prod-q-${Math.random().toString(36).substr(2, 9)}`,
      company_id: currentCompanyId,
      order_id: order.id,
      order_number: order.number,
      order_item_id: item.id,
      product_name: item.product_name,
      quantity: item.quantity,
      status: 'fila',
      priority: 'media',
      deadline: order.deadline,
      created_at: new Date().toISOString()
    }));

    setProduction(prev => [...prev, ...newQueueItems]);

    // Deduct stock for materials if controlled
    order.items.forEach(item => {
      const match = products.find(p => p.id === item.product_id);
      if (match && match.stock_controlled) {
        adjustStock(
          item.product_id,
          item.quantity,
          `Pedido ${order.number}`,
          'saida'
        );
      }
    });
  };

  const updateOrderStatus = (id: string, status: Order['status']) => {
    let orderMatch: Order | undefined;
    
    setOrders(prev =>
      prev.map(o => {
        if (o.id === id) {
          orderMatch = { ...o, status };
          return orderMatch;
        }
        return o;
      })
    );

    if (!orderMatch) return;

    // Trigger Production Queue on moving to 'producao'
    if (status === 'producao') {
      const exists = production.some(p => p.order_id === id);
      if (!exists && orderMatch) {
        injectProductionQueue(orderMatch);
      }
    }

    // Trigger Shipment Creation on moving to 'expedicao'
    if (status === 'expedicao') {
      const exists = shipments.some(s => s.order_id === id);
      if (!exists && orderMatch) {
        const defaultCust = customers.find(c => c.name === orderMatch?.customer_name);
        const newShip: Shipment = {
          id: `ship-${Date.now()}`,
          company_id: currentCompanyId,
          order_id: id,
          order_number: orderMatch.number,
          customer_name: orderMatch.customer_name,
          status: 'separacao',
          carrier: 'Retirada Balcão',
          address: defaultCust?.address || {
            street: 'Rua de Entrega',
            number: '123',
            neighborhood: 'Centro',
            city: 'São Paulo',
            state: 'SP',
            zip_code: '01000-000'
          },
          created_at: new Date().toISOString()
        };
        setShipments(prev => [newShip, ...prev]);
      }
    }

    // Inject Financial income transactions if moving to 'finalizado' and paid
    if (status === 'finalizado') {
      // Complete production items
      setProduction(prev =>
        prev.map(p => (p.order_id === id ? { ...p, status: 'concluido', finished_at: new Date().toISOString() } : p))
      );
      // Mark shipment as delivered
      setShipments(prev =>
        prev.map(s => (s.order_id === id ? { ...s, status: 'entregue', delivered_at: new Date().toISOString() } : s))
      );
    }
  };

  const payOrder = (id: string, amount: number, method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado') => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === id) {
          const newPaid = Math.min(o.total_amount, o.paid_amount + amount);
          const payment_status = newPaid >= o.total_amount ? 'pago' : 'parcial';
          
          // Look up B2B term days for the customer
          const matchCust = customers.find(c => c.name === o.customer_name);
          let dueDays = 30;
          if (matchCust && matchCust.billing_type === 'faturado' && matchCust.payment_terms_days) {
            dueDays = matchCust.payment_terms_days;
          }
          const dueDateObj = new Date();
          dueDateObj.setDate(dueDateObj.getDate() + dueDays);

          // Log Financial income transaction
          const trans: FinancialTransaction = {
            id: `fin-${Date.now()}`,
            company_id: currentCompanyId,
            order_id: o.id,
            order_number: o.number,
            type: 'receita',
            category: 'Vendas',
            amount: amount,
            description: method === 'faturado'
              ? `Faturamento B2B do Pedido ${o.number} (${dueDays} dias)`
              : `Pagamento ${payment_status === 'pago' ? 'Total' : 'Parcial'} do Pedido ${o.number}`,
            payment_method: method,
            status: method === 'faturado' ? 'pendente' : 'pago',
            due_date: method === 'faturado' 
              ? dueDateObj.toISOString().split('T')[0] 
              : new Date().toISOString().split('T')[0],
            paid_at: method === 'faturado' ? undefined : new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          
          setFinancial(f => [trans, ...f]);

          // Log Cash Register transaction if active session exists and payment isn't B2B faturado
          const activeReg = sessions.find(s => s.status === 'aberto');
          if (activeReg && method !== 'faturado') {
            const newPOSRegTrans: CashRegisterTransaction = {
              id: `crt-ord-pay-${Date.now()}`,
              session_id: activeReg.id,
              type: 'venda',
              amount: amount,
              description: `Rec. Pedido ${o.number}`,
              payment_method: method,
              created_at: new Date().toISOString()
            };
            setRegisterTransactions(prev => [newPOSRegTrans, ...prev]);

            if (method === 'dinheiro') {
              setSessions(prev =>
                prev.map(s =>
                  s.id === activeReg.id
                    ? { ...s, expected_cash: s.expected_cash + amount }
                    : s
                )
              );
            }
          }

          // Update customer credit used if faturado
          if (method === 'faturado' && matchCust) {
            const currentUsed = matchCust.credit_used || 0;
            updateCustomer({
              ...matchCust,
              credit_used: currentUsed + amount
            });
          }

          // Auto step from waiting payment to production if fully paid OR if faturado
          let nextStatus = o.status;
          if (o.status === 'aguardando_pagamento' && (payment_status === 'pago' || method === 'faturado')) {
            nextStatus = 'producao';
            // Trigger production queue injection right after state completes
            setTimeout(() => {
              updateOrderStatus(o.id, 'producao');
            }, 10);
          }

          return {
            ...o,
            paid_amount: method === 'faturado' ? o.paid_amount : newPaid,
            payment_status: method === 'faturado' ? 'parcial' : payment_status,
            status: nextStatus
          };
        }
        return o;
      })
    );
  };

  // ----------------------------------------------------
  // PRODUCTION API
  // ----------------------------------------------------
  const updateProductionStatus = (id: string, status: ProductionItem['status']) => {
    setProduction(prev =>
      prev.map(p => {
        if (p.id === id) {
          const started_at = status === 'producao' ? new Date().toISOString() : p.started_at;
          const finished_at = status === 'concluido' ? new Date().toISOString() : p.finished_at;
          
          // If completed, check if all items in this order are completed
          if (status === 'concluido') {
            setTimeout(() => {
              checkAndAdvanceOrderProduction(p.order_id);
            }, 10);
          }

          return { ...p, status, started_at, finished_at };
        }
        return p;
      })
    );
  };

  const checkAndAdvanceOrderProduction = (orderId: string) => {
    setProduction(currentProdQueue => {
      const orderItems = currentProdQueue.filter(p => p.order_id === orderId);
      const allDone = orderItems.every(p => p.status === 'concluido');
      
      if (allDone && orderItems.length > 0) {
        setOrders(currentOrders => {
          const order = currentOrders.find(o => o.id === orderId);
          // If in production stage, advance to acabamento or expedicao
          if (order && (order.status === 'producao' || order.status === 'impressao' || order.status === 'acabamento')) {
            setTimeout(() => {
              updateOrderStatus(orderId, 'expedicao');
            }, 10);
          }
          return currentOrders;
        });
      }
      return currentProdQueue;
    });
  };

  const assignProductionResponsible = (id: string, name: string) => {
    setProduction(prev =>
      prev.map(p => (p.id === id ? { ...p, responsible_name: name, status: p.status === 'fila' ? 'producao' : p.status } : p))
    );
  };

  // ----------------------------------------------------
  // FINANCIAL API
  // ----------------------------------------------------
  const addTransaction = (trans: Omit<FinancialTransaction, 'id' | 'company_id' | 'created_at'>) => {
    const newTrans: FinancialTransaction = {
      ...trans,
      id: `fin-${Date.now()}`,
      company_id: currentCompanyId,
      created_at: new Date().toISOString()
    };
    setFinancial(prev => [newTrans, ...prev]);
    return newTrans;
  };

  const updateTransactionStatus = (id: string, status: 'pendente' | 'pago') => {
    // If B2B faturado is transitioning to paid, restore customer credit!
    const trans = financial.find(f => f.id === id);
    if (trans && trans.payment_method === 'faturado' && status === 'pago' && trans.status === 'pendente') {
      const ord = orders.find(o => o.id === trans.order_id);
      if (ord) {
        const matchCust = customers.find(c => c.name === ord.customer_name);
        if (matchCust) {
          const currentUsed = matchCust.credit_used || 0;
          setCustomers(prev =>
            prev.map(c =>
              c.id === matchCust.id
                ? { ...c, credit_used: Math.max(0, currentUsed - trans.amount) }
                : c
            )
          );
        }
        setOrders(prev =>
          prev.map(o => {
            if (o.id === ord.id) {
              const newPaid = Math.min(o.total_amount, o.paid_amount + trans.amount);
              return {
                ...o,
                paid_amount: newPaid,
                payment_status: newPaid >= o.total_amount ? 'pago' : 'parcial'
              };
            }
            return o;
          })
        );
      }
    }

    setFinancial(prev =>
      prev.map(f =>
        f.id === id
          ? {
              ...f,
              status,
              paid_at: status === 'pago' ? new Date().toISOString() : undefined
            }
          : f
      )
    );
  };

  // ----------------------------------------------------
  // SHIPMENTS API
  // ----------------------------------------------------
  const updateShipmentStatus = (id: string, status: Shipment['status'], tracking?: string, carrier?: string) => {
    setShipments(prev =>
      prev.map(s => {
        if (s.id === id) {
          const shipped_at = status === 'enviado' ? new Date().toISOString() : s.shipped_at;
          const delivered_at = status === 'entregue' ? new Date().toISOString() : s.delivered_at;
          
          // Auto-complete order if delivered
          if (status === 'entregue') {
            setTimeout(() => {
              updateOrderStatus(s.order_id, 'entregue');
            }, 10);
          }

          return {
            ...s,
            status,
            tracking_code: tracking || s.tracking_code,
            carrier: carrier || s.carrier,
            shipped_at,
            delivered_at
          };
        }
        return s;
      })
    );
  };
  // ----------------------------------------------------
  // SETTINGS API
  // ----------------------------------------------------
  const updateSettings = (newSettings: Partial<typeof DUMMY_SETTINGS>) => {
    setSettings(prev => mergeSettingsWithDefaults(prev, newSettings, true));
  };

  const updateCompany = (comp: Company) => {
    setCompany(comp);
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
    return newPoint;
  };

  const updatePickupPoint = (point: PickupPoint) => {
    setPickupPoints(prev => prev.map(p => (p.id === point.id ? point : p)));
  };

  const deletePickupPoint = (id: string) => {
    setPickupPoints(prev => prev.filter(p => p.id !== id));
    supabase.from('pickup_points').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir ponto de coleta no Supabase:', error);
    });
  };

  // ----------------------------------------------------
  // CAIXA / CASH REGISTER API
  // ----------------------------------------------------
  const openRegister = (openingBalance: number, notes?: string) => {
    const existing = sessions.find(s => s.status === 'aberto');
    if (existing) return;

    const sessionId = `session-${Date.now()}`;
    const newSession: CashRegisterSession = {
      id: sessionId,
      company_id: currentCompanyId,
      opened_by: 'Operador Balcão',
      opened_at: new Date().toISOString(),
      opening_balance: openingBalance,
      expected_cash: openingBalance,
      status: 'aberto',
      notes
    };

    setSessions(prev => [newSession, ...prev]);

    const initialTransaction: CashRegisterTransaction = {
      id: `crt-${Date.now()}`,
      session_id: sessionId,
      type: 'abertura',
      amount: openingBalance,
      description: 'Abertura do Caixa',
      payment_method: 'dinheiro',
      created_at: new Date().toISOString()
    };

    setRegisterTransactions(prev => [initialTransaction, ...prev]);
  };

  const closeRegister = (actualCash: number, notes?: string) => {
    const active = sessions.find(s => s.status === 'aberto');
    if (!active) return;

    const difference = actualCash - active.expected_cash;

    setSessions(prev =>
      prev.map(s =>
        s.id === active.id
          ? {
              ...s,
              status: 'fechado',
              closed_at: new Date().toISOString(),
              actual_cash: actualCash,
              difference,
              notes: notes || s.notes
            }
          : s
      )
    );

    const closingTransaction: CashRegisterTransaction = {
      id: `crt-${Date.now()}`,
      session_id: active.id,
      type: 'fechamento',
      amount: actualCash,
      description: 'Fechamento do Caixa',
      payment_method: 'dinheiro',
      created_at: new Date().toISOString()
    };

    setRegisterTransactions(prev => [closingTransaction, ...prev]);

    if (difference !== 0) {
      const summaryTrans: FinancialTransaction = {
        id: `fin-closing-${Date.now()}`,
        company_id: currentCompanyId,
        type: difference >= 0 ? 'receita' : 'despesa',
        category: 'Ajuste de Caixa',
        amount: Math.abs(difference),
        description: `Diferença de Fechamento de Caixa: ${difference >= 0 ? 'Sobra' : 'Quebra'} (Sessão ${active.id})`,
        payment_method: 'dinheiro',
        status: 'pago',
        due_date: new Date().toISOString().split('T')[0],
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      setFinancial(prev => [summaryTrans, ...prev]);
    }
  };

  const addRegisterTransaction = (type: 'suprimento' | 'sangria', amount: number, description: string) => {
    const active = sessions.find(s => s.status === 'aberto');
    if (!active) return;

    const newTrans: CashRegisterTransaction = {
      id: `crt-${Date.now()}`,
      session_id: active.id,
      type,
      amount,
      description,
      payment_method: 'dinheiro',
      created_at: new Date().toISOString()
    };

    setRegisterTransactions(prev => [newTrans, ...prev]);

    setSessions(prev =>
      prev.map(s => {
        if (s.id === active.id) {
          const delta = type === 'suprimento' ? amount : -amount;
          return {
            ...s,
            expected_cash: Math.max(0, s.expected_cash + delta)
          };
        }
        return s;
      })
    );

    const trans: FinancialTransaction = {
      id: `fin-${Date.now()}`,
      company_id: currentCompanyId,
      type: type === 'suprimento' ? 'receita' : 'despesa',
      category: 'Operações de Caixa',
      amount,
      description: `${type.toUpperCase()}: ${description} (Caixa)`,
      payment_method: 'dinheiro',
      status: 'pago',
      due_date: new Date().toISOString().split('T')[0],
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    setFinancial(prev => [trans, ...prev]);
  };

  // ----------------------------------------------------
  // POS / PDV API
  // ----------------------------------------------------
  const addOrderFromPOS = (posOrder: {
    customer_id: string;
    customer_name: string;
    items: Omit<OrderItem, 'id' | 'outsourced'>[];
    discount: number;
    paid_amount: number;
    payment_method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado';
    notes?: string;
  }) => {
    const orderNumber = getNextOrderNumber(orders);
    const subtotal = posOrder.items.reduce((sum, item) => sum + item.total_price, 0);
    const total = subtotal - posOrder.discount;
    const orderId = `order-${Date.now()}`;

    const newOrder: Order = {
      id: orderId,
      company_id: currentCompanyId,
      customer_id: posOrder.customer_id,
      customer_name: posOrder.customer_name,
      number: orderNumber,
      status: posOrder.payment_method === 'faturado' || posOrder.paid_amount >= total ? 'producao' : 'aguardando_pagamento',
      total_amount: total,
      paid_amount: posOrder.payment_method === 'faturado' ? 0 : posOrder.paid_amount,
      payment_status: posOrder.payment_method === 'faturado'
        ? 'parcial'
        : posOrder.paid_amount >= total 
          ? 'pago' 
          : posOrder.paid_amount > 0 
            ? 'parcial' 
            : 'pendente',
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

    setOrders(prev => [newOrder, ...prev]);
    injectProductionQueue(newOrder);

    if (posOrder.payment_method === 'faturado') {
      const matchCust = customers.find(c => c.id === posOrder.customer_id);
      if (matchCust) {
        const currentUsed = matchCust.credit_used || 0;
        updateCustomer({
          ...matchCust,
          credit_used: currentUsed + total
        });
      }

      let dueDays = 30;
      if (matchCust && matchCust.billing_type === 'faturado' && matchCust.payment_terms_days) {
        dueDays = matchCust.payment_terms_days;
      }
      const dueDateObj = new Date();
      dueDateObj.setDate(dueDateObj.getDate() + dueDays);

      const trans: FinancialTransaction = {
        id: `fin-pos-${Date.now()}`,
        company_id: currentCompanyId,
        order_id: orderId,
        order_number: orderNumber,
        type: 'receita',
        category: 'Vendas',
        amount: total,
        description: `Faturamento B2B do Pedido PDV ${orderNumber}`,
        payment_method: 'faturado',
        status: 'pendente',
        due_date: dueDateObj.toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };
      setFinancial(prev => [trans, ...prev]);
    } else if (posOrder.paid_amount > 0) {
      const trans: FinancialTransaction = {
        id: `fin-pos-${Date.now()}`,
        company_id: currentCompanyId,
        order_id: orderId,
        order_number: orderNumber,
        type: 'receita',
        category: 'Vendas',
        amount: posOrder.paid_amount,
        description: `Venda direta PDV ${orderNumber}`,
        payment_method: posOrder.payment_method,
        status: 'pago',
        due_date: new Date().toISOString().split('T')[0],
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      setFinancial(prev => [trans, ...prev]);

      const active = sessions.find(s => s.status === 'aberto');
      if (active) {
        const newPOSRegTrans: CashRegisterTransaction = {
          id: `crt-pos-${Date.now()}`,
          session_id: active.id,
          type: 'venda',
          amount: posOrder.paid_amount,
          description: `Venda PDV ${orderNumber}`,
          payment_method: posOrder.payment_method,
          created_at: new Date().toISOString()
        };
        setRegisterTransactions(prev => [newPOSRegTrans, ...prev]);

        if (posOrder.payment_method === 'dinheiro') {
          setSessions(prev =>
            prev.map(s =>
              s.id === active.id
                ? { ...s, expected_cash: s.expected_cash + posOrder.paid_amount }
                : s
            )
          );
        }
      }
    }

    return newOrder;
  };

  const addBanner = (banner: Omit<StoreBanner, 'id'>) => {
    const newBanner: StoreBanner = {
      ...banner,
      id: `banner-${Date.now()}`
    };
    setBanners(prev => [...prev, newBanner]);
    return newBanner;
  };

  const deleteBanner = (id: string) => {
    setBanners(prev => prev.filter(b => b.id !== id));
    supabase.from('store_banners').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir banner no Supabase:', error);
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
    setProfiles(prev => [...prev, newProfile]);
    return newProfile;
  };

  const updateProfile = (profile: UserProfile) => {
    setProfiles(prev => prev.map(p => p.id === profile.id ? profile : p));
  };

  const deleteProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
    supabase.from('profiles').delete().eq('id', id).then(({ error }) => {
      if (error) warnCaught('Erro ao excluir funcionário no Supabase:', error);
    });
  };

  const updateRolePermissions = (permissions: Record<string, string[]>) => {
    setRolePermissions(permissions);
  };

  if (!initialized) {
  return null;
  }
  
  return (
    <DatabaseContext.Provider
      value={{
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
        deleteBanner,
        profiles,
        addProfile,
        updateProfile,
        deleteProfile,
        rolePermissions,
        updateRolePermissions,
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
