'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useDatabase } from '@/context/database-context';
import type { Customer } from '@/lib/dummy-data';
import {
  StoreCustomerAccount,
  StoreCustomerAddress,
  StoreCustomerFavorite,
  StoreCustomerOrder,
  StoreCustomerQuote,
  StoreSignupInput
} from '@/lib/store-customer';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/lib/privacy';
import { warnCaught } from '@/lib/safe-log';

type StoreCustomerContextType = {
  session: Session | null;
  user: User | null;
  account: StoreCustomerAccount | null;
  customer: Customer | null;
  addresses: StoreCustomerAddress[];
  orders: StoreCustomerOrder[];
  quotes: StoreCustomerQuote[];
  favoriteProductIds: string[];
  favoritePendingProductIds: string[];
  defaultAddress: StoreCustomerAddress | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signUp: (input: StoreSignupInput) => Promise<'confirmed' | 'pending_confirmation'>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refresh: () => Promise<void>;
  updateCustomerProfile: (updates: Partial<Customer>) => Promise<void>;
  saveAddress: (address: Partial<StoreCustomerAddress>) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  setDefaultAddress: (id: string) => Promise<void>;
  toggleProductFavorite: (productId: string) => Promise<boolean>;
};

const StoreCustomerContext = createContext<StoreCustomerContextType | undefined>(undefined);
const STORE_SIGNUP_CACHE_KEY = 'printflow_store_signup_cache';

const emptyAddressList: StoreCustomerAddress[] = [];
type EnsuredStoreAccount = { account_id: string; customer_id: string };
type LinkedStoreCustomer = { companyId: string; customerId: string };

const isStoreCustomerSession = (currentSession?: Session | null) =>
  currentSession?.user.user_metadata?.store_customer === true ||
  currentSession?.user.user_metadata?.store_customer === 'true' ||
  currentSession?.user.app_metadata?.store_customer === true ||
  currentSession?.user.app_metadata?.store_customer === 'true';

const getCachedSignup = (email: string): Partial<StoreSignupInput> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const cache = JSON.parse(window.localStorage.getItem(STORE_SIGNUP_CACHE_KEY) || '{}') as Record<string, Partial<StoreSignupInput>>;
    return cache[email.trim().toLowerCase()] || null;
  } catch {
    return null;
  }
};

const setCachedSignup = (input: StoreSignupInput) => {
  if (typeof window === 'undefined') return;
  try {
    const cache = JSON.parse(window.localStorage.getItem(STORE_SIGNUP_CACHE_KEY) || '{}') as Record<string, Partial<StoreSignupInput>>;
    cache[input.email.trim().toLowerCase()] = {
      name: input.name,
      customerType: input.customerType,
      document: input.document,
      phone: input.phone,
      tradeName: input.tradeName,
      birthDate: input.birthDate,
      contactPreference: input.contactPreference,
      marketingEmailAccepted: input.marketingEmailAccepted,
      marketingWhatsappAccepted: input.marketingWhatsappAccepted
    };
    window.localStorage.setItem(STORE_SIGNUP_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache is only a convenience for confirmed-email flows.
  }
};

const cleanAddressText = (value?: string | null) => (value || '').trim();

const getAddressError = (payload: {
  recipient_name: string;
  zip_code: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
}) => {
  if (!payload.recipient_name) return 'Informe o destinatário.';
  if (payload.zip_code.replace(/\D/g, '').length !== 8) return 'Informe um CEP válido.';
  if (!payload.street) return 'Informe a rua.';
  if (!payload.number) return 'Informe o número.';
  if (!payload.neighborhood) return 'Informe o bairro.';
  if (!payload.city) return 'Informe a cidade.';
  if (payload.state.length !== 2) return 'Informe a UF com 2 letras.';
  return '';
};

const getStoreAccountLinkError = () =>
  'Não foi possível confirmar o vínculo da sua conta com o cadastro do catálogo. Tente carregar novamente antes de salvar o endereço.';

const warnStoreCustomerError = (message: string, error: unknown) => {
  if (process.env.NODE_ENV !== 'production') {
    warnCaught(message, error);
  }
};

export class StoreFavoriteError extends Error {
  constructor(public readonly reason: 'session_expired' | 'not_authenticated' | 'failed') {
    super(reason);
    this.name = 'StoreFavoriteError';
  }
}

const isExpiredSessionError = (error: unknown) => {
  const candidate = error as { code?: string; status?: number; message?: string } | null;
  return candidate?.status === 401 || candidate?.code === 'PGRST301' || /jwt|session.*expired|not authenticated/i.test(candidate?.message || '');
};

export function StoreCustomerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { company } = useDatabase();
  const isStoreRoute = pathname?.startsWith('/store') ?? false;
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<StoreCustomerAccount | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<StoreCustomerAddress[]>(emptyAddressList);
  const [orders, setOrders] = useState<StoreCustomerOrder[]>([]);
  const [quotes, setQuotes] = useState<StoreCustomerQuote[]>([]);
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>([]);
  const [favoritePendingProductIds, setFavoritePendingProductIds] = useState<string[]>([]);
  const pendingFavoritesRef = useRef(new Set<string>());
  const loadGenerationRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const defaultAddress = useMemo(
    () => addresses.find((address) => address.is_default) || addresses[0] || null,
    [addresses]
  );

  const resetStoreCustomerState = useCallback(() => {
    loadGenerationRef.current += 1;
    pendingFavoritesRef.current.clear();
    setSession(null);
    setAccount(null);
    setCustomer(null);
    setAddresses(emptyAddressList);
    setOrders([]);
    setQuotes([]);
    setFavoriteProductIds([]);
    setFavoritePendingProductIds([]);
    setError(null);
    setIsLoading(false);
  }, []);

  const ensureAccount = async (currentSession: Session, fallback?: Partial<StoreSignupInput>): Promise<EnsuredStoreAccount | null> => {
    const email = currentSession.user.email?.trim().toLowerCase() || '';
    const cached = email ? getCachedSignup(email) : null;
    const metadata = currentSession.user.user_metadata || {};
    const data = {
      name: fallback?.name || cached?.name || metadata.name || email,
      customerType: fallback?.customerType || cached?.customerType || metadata.customer_type || 'fisica',
      document: fallback?.document || cached?.document || metadata.document || '',
      phone: fallback?.phone || cached?.phone || metadata.phone || '',
      whatsapp: fallback?.phone || cached?.phone || metadata.whatsapp || metadata.phone || '',
      tradeName: fallback?.tradeName || cached?.tradeName || metadata.trade_name || '',
      birthDate: fallback?.birthDate || cached?.birthDate || metadata.birth_date || null,
      contactPreference: fallback?.contactPreference || cached?.contactPreference || metadata.contact_preference || 'whatsapp',
      marketingEmailAccepted: Boolean(fallback?.marketingEmailAccepted || cached?.marketingEmailAccepted || metadata.marketing_email_accepted),
      marketingWhatsappAccepted: Boolean(fallback?.marketingWhatsappAccepted || cached?.marketingWhatsappAccepted || metadata.marketing_whatsapp_accepted)
    };

    if (!company.id || !email) return null;

    const { data: ensuredData, error: rpcError } = await supabase.rpc('ensure_store_customer_account', {
      p_company_id: company.id,
      p_name: data.name,
      p_customer_type: data.customerType,
      p_document: data.document,
      p_phone: data.phone,
      p_whatsapp: data.whatsapp,
      p_trade_name: data.tradeName,
      p_birth_date: data.birthDate,
      p_contact_preference: data.contactPreference,
      p_privacy_policy_version: PRIVACY_POLICY_VERSION,
      p_terms_version: TERMS_VERSION,
      p_marketing_email_granted: data.marketingEmailAccepted,
      p_marketing_whatsapp_granted: data.marketingWhatsappAccepted
    });

    if (rpcError) throw rpcError;
    return (ensuredData?.[0] as EnsuredStoreAccount | undefined) || null;
  };

  const loadStoreCustomer = async (nextSession = session) => {
    const generation = ++loadGenerationRef.current;
    if (!nextSession?.user || !company.id) {
      setAccount(null);
      setCustomer(null);
      setAddresses(emptyAddressList);
      setOrders([]);
      setQuotes([]);
      setFavoriteProductIds([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: accountData, error: accountError } = await supabase
        .from('store_customer_accounts')
        .select('*, customer:customers(*)')
        .eq('company_id', company.id)
        .eq('auth_user_id', nextSession.user.id)
        .maybeSingle();

      if (accountError) throw accountError;

      let nextAccount = (accountData as StoreCustomerAccount | null) || null;
      let nextCustomer = nextAccount?.customer || null;
      let ensuredAccount: EnsuredStoreAccount | null = null;
      let ensureAccountError = '';

      const email = nextSession.user.email?.trim().toLowerCase() || '';

      if (!nextAccount && email) {
        const cached = email ? getCachedSignup(email) : null;
        const metadata = nextSession.user.user_metadata || {};
        const canEnsureAccount =
          isStoreCustomerSession(nextSession) ||
          Boolean(email) ||
          Boolean(cached?.document && cached?.phone) ||
          Boolean(metadata.document && metadata.phone);

        if (canEnsureAccount) {
          ensuredAccount = await ensureAccount(nextSession).catch((accountError) => {
            warnStoreCustomerError('Conta de cliente final ainda incompleta:', accountError);
            ensureAccountError = 'Não foi possível concluir o vínculo da sua conta do catálogo.';
            return null;
          });
        }
      }

      const accountCustomerId = nextAccount?.customer_id || ensuredAccount?.customer_id || '';

      if (!nextCustomer && accountCustomerId) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('company_id', company.id)
          .eq('id', accountCustomerId)
          .maybeSingle();

        if (customerError) throw customerError;
        nextCustomer = customerData as Customer | null;
      }

      if (!nextAccount && ensuredAccount) {
        nextAccount = {
          id: ensuredAccount.account_id,
          company_id: company.id,
          customer_id: ensuredAccount.customer_id,
          auth_user_id: nextSession.user.id,
          status: 'active',
          customer: nextCustomer || undefined
        };
      }

      if (nextAccount?.status && nextAccount.status !== 'active') {
        setAccount(null);
        setCustomer(null);
        setAddresses(emptyAddressList);
        setOrders([]);
        setQuotes([]);
        setFavoriteProductIds([]);
        setError('Sua conta do catálogo não está ativa no momento.');
        setIsLoading(false);
        return;
      }

      if (!nextAccount) {
        setAccount(null);
        setCustomer(null);
        setAddresses(emptyAddressList);
        setOrders([]);
        setQuotes([]);
        setFavoriteProductIds([]);
        setError(ensureAccountError || 'Não encontramos um cadastro de cliente vinculado a este login.');
        setIsLoading(false);
        return;
      }

      setAccount(nextAccount);
      setCustomer(nextCustomer || null);

      if (!nextCustomer?.id) {
        setAccount(null);
        setCustomer(null);
        setAddresses(emptyAddressList);
        setOrders([]);
        setQuotes([]);
        setFavoriteProductIds([]);
        setError('Não foi possível carregar os dados do cliente vinculado a este login.');
        setIsLoading(false);
        return;
      }

      const [
        { data: addressesData, error: addressesError },
        { data: ordersData, error: ordersError },
        { data: quotesData, error: quotesError },
        { data: favoritesData, error: favoritesError }
      ] = await Promise.all([
        supabase
          .from('customer_addresses')
          .select('*')
          .eq('company_id', company.id)
          .eq('customer_id', nextCustomer.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('*, items:order_items(*)')
          .eq('company_id', company.id)
          .eq('customer_id', nextCustomer.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('quotes')
          .select('*, items:quote_items(*)')
          .eq('company_id', company.id)
          .eq('customer_id', nextCustomer.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('store_customer_favorites')
          .select('product_id')
          .eq('company_id', company.id)
          .eq('customer_id', nextCustomer.id)
          .order('created_at', { ascending: false })
      ]);

      if (addressesError) warnStoreCustomerError('Erro ao carregar enderecos do cliente:', addressesError);
      if (ordersError) warnStoreCustomerError('Erro ao carregar pedidos do cliente:', ordersError);
      if (quotesError) warnStoreCustomerError('Erro ao carregar orcamentos do cliente:', quotesError);
      if (favoritesError) warnStoreCustomerError('Erro ao carregar favoritos do cliente:', favoritesError);

      if (generation !== loadGenerationRef.current) return;
      setAddresses(addressesError ? emptyAddressList : (addressesData || []) as StoreCustomerAddress[]);
      setOrders(ordersError ? [] : (ordersData || []) as StoreCustomerOrder[]);
      setQuotes(quotesError ? [] : (quotesData || []) as StoreCustomerQuote[]);
      setFavoriteProductIds(
        favoritesError
          ? []
          : ((favoritesData || []) as StoreCustomerFavorite[]).map((favorite) => favorite.product_id)
      );
    } catch (loadError) {
      if (generation !== loadGenerationRef.current) return;
      warnStoreCustomerError('Erro ao carregar area do cliente:', loadError);
      setAccount(null);
      setCustomer(null);
      setAddresses(emptyAddressList);
      setOrders([]);
      setQuotes([]);
      setFavoriteProductIds([]);
      setError('Não foi possível carregar sua conta agora.');
    } finally {
      if (generation === loadGenerationRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!isStoreRoute) {
        resetStoreCustomerState();
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      await loadStoreCustomer(data.session);
    };

    init();

    if (!isStoreRoute) {
      return () => {
        mounted = false;
      };
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadStoreCustomer(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, isStoreRoute, resetStoreCustomerState]);

  const signUp = async (input: StoreSignupInput) => {
    setError(null);
    setCachedSignup(input);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/store/conta` : undefined,
        data: {
          store_customer: true,
          name: input.name,
          customer_type: input.customerType,
          document: input.document,
          phone: input.phone,
          whatsapp: input.phone,
          trade_name: input.tradeName,
          birth_date: input.birthDate,
          contact_preference: input.contactPreference || 'whatsapp',
          marketing_email_accepted: Boolean(input.marketingEmailAccepted),
          marketing_whatsapp_accepted: Boolean(input.marketingWhatsappAccepted)
        }
      }
    });

    if (signUpError) throw signUpError;

    if (data.session) {
      await ensureAccount(data.session, input);
      await loadStoreCustomer(data.session);
      return 'confirmed';
    }

    return 'pending_confirmation';
  };

  const signIn = async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (signInError) {
      setIsLoading(false);
      throw signInError;
    }
    if (data.session) {
      setSession(data.session);
      await loadStoreCustomer(data.session);
    } else {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    loadGenerationRef.current += 1;
    pendingFavoritesRef.current.clear();
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORE_SIGNUP_CACHE_KEY);
        if ('caches' in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.includes('store-customer') || cacheName.includes('private'))
              .map((cacheName) => window.caches.delete(cacheName))
          );
        }
      } catch {
        // Local cleanup should never block logout.
      }
    }
    setSession(null);
    setAccount(null);
    setCustomer(null);
    setAddresses(emptyAddressList);
    setOrders([]);
    setQuotes([]);
    setFavoriteProductIds([]);
    setFavoritePendingProductIds([]);
    router.push('/store');
  };

  const sendPasswordReset = async (email: string) => {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/store/redefinir-senha` : undefined;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo
    });
    if (resetError) throw resetError;
  };

  const updatePassword = async (password: string) => {
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
  };

  const updateCustomerProfile = async (updates: Partial<Customer>) => {
    if (!customer) throw new Error('Cliente nao autenticado.');

    const payload = {
      name: updates.name,
      phone: updates.phone,
      email: updates.email,
      whatsapp: updates.corporate_additional_info?.whatsapp,
      birth_date: updates.corporate_additional_info?.birth_date,
      corporate_additional_info: {
        ...(customer.corporate_additional_info || {}),
        ...(updates.corporate_additional_info || {})
      }
    };

    const { error: updateError } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', customer.id)
      .eq('company_id', customer.company_id);

    if (updateError) throw updateError;
    await loadStoreCustomer();
  };

  const requireLinkedStoreCustomer = (): LinkedStoreCustomer => {
    if (!session?.user || !account?.customer_id || !customer?.id || account.customer_id !== customer.id) {
      throw new Error(getStoreAccountLinkError());
    }

    return {
      companyId: account.company_id || customer.company_id,
      customerId: account.customer_id
    };
  };

  const saveAddress = async (address: Partial<StoreCustomerAddress>) => {
    if (!customer) throw new Error('Cliente não autenticado.');
    const linkedCustomer = requireLinkedStoreCustomer();

    const payload = {
      company_id: linkedCustomer.companyId,
      customer_id: linkedCustomer.customerId,
      label: cleanAddressText(address.label) || 'Casa',
      recipient_name: cleanAddressText(address.recipient_name) || customer.name,
      zip_code: cleanAddressText(address.zip_code),
      street: cleanAddressText(address.street),
      number: cleanAddressText(address.number),
      complement: cleanAddressText(address.complement) || null,
      neighborhood: cleanAddressText(address.neighborhood),
      city: cleanAddressText(address.city),
      state: cleanAddressText(address.state).toUpperCase(),
      reference: cleanAddressText(address.reference) || null,
      is_default: address.is_default ?? addresses.length === 0
    };
    const validationError = getAddressError(payload);
    if (validationError) throw new Error(validationError);

    if (payload.is_default) {
      const { error: defaultError } = await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('company_id', linkedCustomer.companyId)
        .eq('customer_id', linkedCustomer.customerId);
      if (defaultError) throw new Error('Não foi possível atualizar o endereço principal.');
    }

    const query = address.id
      ? supabase
        .from('customer_addresses')
        .update(payload)
        .eq('id', address.id)
        .eq('company_id', linkedCustomer.companyId)
        .eq('customer_id', linkedCustomer.customerId)
      : supabase.from('customer_addresses').insert(payload);

    const { error: saveError } = await query;
    if (saveError) {
      warnStoreCustomerError('Erro ao salvar endereco do cliente:', saveError);
      throw new Error('Não foi possível salvar o endereço. Verifique os dados e tente novamente.');
    }
    await loadStoreCustomer();
  };

  const deleteAddress = async (id: string) => {
    const linkedCustomer = requireLinkedStoreCustomer();
    const { error: deleteError } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', id)
      .eq('company_id', linkedCustomer.companyId)
      .eq('customer_id', linkedCustomer.customerId);
    if (deleteError) {
      warnStoreCustomerError('Erro ao excluir endereco do cliente:', deleteError);
      throw new Error('Não foi possível excluir o endereço.');
    }
    await loadStoreCustomer();
  };

  const setDefaultAddress = async (id: string) => {
    if (!customer) throw new Error('Cliente não autenticado.');
    const linkedCustomer = requireLinkedStoreCustomer();
    const { error: clearDefaultError } = await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('company_id', linkedCustomer.companyId)
      .eq('customer_id', linkedCustomer.customerId);
    if (clearDefaultError) throw new Error('Não foi possível atualizar o endereço principal.');

    const { error: updateError } = await supabase
      .from('customer_addresses')
      .update({ is_default: true })
      .eq('id', id)
      .eq('company_id', linkedCustomer.companyId)
      .eq('customer_id', linkedCustomer.customerId);

    if (updateError) {
      warnStoreCustomerError('Erro ao definir endereco principal:', updateError);
      throw new Error('Não foi possível definir o endereço principal.');
    }
    await loadStoreCustomer();
  };

  const toggleProductFavorite = async (productId: string) => {
    if (!session?.user || !customer || !account || account.customer_id !== customer.id) {
      throw new StoreFavoriteError('not_authenticated');
    }
    if (!productId || pendingFavoritesRef.current.has(productId)) {
      return favoriteProductIds.includes(productId);
    }

    const isFavorite = favoriteProductIds.includes(productId);
    pendingFavoritesRef.current.add(productId);
    setFavoritePendingProductIds((current) => [...current, productId]);
    setFavoriteProductIds((current) => isFavorite ? current.filter((id) => id !== productId) : [...new Set([...current, productId])]);

    try {
      const result = isFavorite
        ? await supabase.from('store_customer_favorites').delete()
          .eq('company_id', customer.company_id).eq('customer_id', customer.id).eq('product_id', productId)
        : await supabase.from('store_customer_favorites').insert({ company_id: customer.company_id, customer_id: customer.id, product_id: productId });
      if (result.error && !(!isFavorite && result.error.code === '23505')) throw result.error;
      if (!isFavorite && result.error?.code === '23505') setFavoriteProductIds((current) => [...new Set([...current, productId])]);
      return !isFavorite;
    } catch (favoriteError) {
      setFavoriteProductIds((current) => isFavorite ? [...new Set([...current, productId])] : current.filter((id) => id !== productId));
      if (isExpiredSessionError(favoriteError)) {
        setFavoriteProductIds([]);
        throw new StoreFavoriteError('session_expired');
      }
      warnStoreCustomerError('Erro ao atualizar favorito:', favoriteError);
      throw new StoreFavoriteError('failed');
    } finally {
      pendingFavoritesRef.current.delete(productId);
      setFavoritePendingProductIds((current) => current.filter((id) => id !== productId));
    }
  };

  const value: StoreCustomerContextType = {
    session,
    user: session?.user || null,
    account,
    customer,
    addresses,
    orders,
    quotes,
    favoriteProductIds,
    favoritePendingProductIds,
    defaultAddress,
    isAuthenticated: Boolean(session?.user && account?.status === 'active' && customer),
    isLoading,
    error,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    updatePassword,
    refresh: () => loadStoreCustomer(),
    updateCustomerProfile,
    saveAddress,
    deleteAddress,
    setDefaultAddress,
    toggleProductFavorite
  };

  return (
    <StoreCustomerContext.Provider value={value}>
      {children}
    </StoreCustomerContext.Provider>
  );
}

export function useStoreCustomer() {
  const context = useContext(StoreCustomerContext);
  if (!context) {
    throw new Error('useStoreCustomer must be used within StoreCustomerProvider');
  }
  return context;
}
