'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useDatabase } from '@/context/database-context';
import type { Customer } from '@/lib/dummy-data';
import {
  StoreCustomerAccount,
  StoreCustomerAddress,
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
};

const StoreCustomerContext = createContext<StoreCustomerContextType | undefined>(undefined);
const STORE_SIGNUP_CACHE_KEY = 'printflow_store_signup_cache';

const emptyAddressList: StoreCustomerAddress[] = [];
type EnsuredStoreAccount = { account_id: string; customer_id: string };

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

export function StoreCustomerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { company } = useDatabase();
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<StoreCustomerAccount | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<StoreCustomerAddress[]>(emptyAddressList);
  const [orders, setOrders] = useState<StoreCustomerOrder[]>([]);
  const [quotes, setQuotes] = useState<StoreCustomerQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const defaultAddress = useMemo(
    () => addresses.find((address) => address.is_default) || addresses[0] || null,
    [addresses]
  );

  const createSessionCustomer = (currentSession: Session): Customer => {
    const metadata = currentSession.user.user_metadata || {};
    const email = currentSession.user.email?.trim().toLowerCase() || '';
    const cached = email ? getCachedSignup(email) : null;
    const customerType = cached?.customerType || metadata.customer_type || 'fisica';

    return {
      id: currentSession.user.id,
      company_id: company.id,
      name: cached?.name || metadata.name || email || 'Cliente',
      document: cached?.document || metadata.document || '',
      phone: cached?.phone || metadata.phone || '',
      email,
      address: {
        street: '',
        number: '',
        neighborhood: '',
        city: '',
        state: '',
        zip_code: ''
      },
      tags: ['Catalogo Online'],
      notes: 'Perfil carregado pela sessao do cliente final.',
      corporate_additional_info: {
        nome_fantasia: cached?.tradeName || metadata.trade_name || '',
        whatsapp: cached?.phone || metadata.whatsapp || metadata.phone || '',
        birth_date: cached?.birthDate || metadata.birth_date || '',
        contact_preference: cached?.contactPreference || metadata.contact_preference || 'whatsapp',
        person_type: customerType === 'juridica' ? 'juridica' : 'fisica'
      },
      created_at: currentSession.user.created_at || new Date().toISOString()
    };
  };

  const applySessionCustomerFallback = (currentSession: Session) => {
    const fallbackCustomer = createSessionCustomer(currentSession);
    setAccount({
      id: `session-${currentSession.user.id}`,
      company_id: company.id,
      customer_id: fallbackCustomer.id,
      auth_user_id: currentSession.user.id,
      status: 'active',
      customer: fallbackCustomer
    });
    setCustomer(fallbackCustomer);
    setAddresses(emptyAddressList);
    setOrders([]);
    setQuotes([]);
    setError(null);
  };

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

    if (!company.id || !data.document || !data.phone) return null;

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
    if (!nextSession?.user || !company.id) {
      setAccount(null);
      setCustomer(null);
      setAddresses(emptyAddressList);
      setOrders([]);
      setQuotes([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let ensureAccountError = '';
      const ensuredAccount = await ensureAccount(nextSession).catch((accountError) => {
        warnCaught('Conta de cliente final ainda incompleta:', accountError);
        ensureAccountError = accountError instanceof Error ? accountError.message : 'Nao foi possivel vincular sua conta do catalogo.';
        return null;
      });

      const { data: accountData, error: accountError } = await supabase
        .from('store_customer_accounts')
        .select('*, customer:customers(*)')
        .eq('company_id', company.id)
        .eq('auth_user_id', nextSession.user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (accountError) throw accountError;

      const accountCustomerId = accountData?.customer_id || ensuredAccount?.customer_id || '';
      let nextAccount = (accountData as StoreCustomerAccount | null) || null;
      let nextCustomer = nextAccount?.customer || null;

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

      if (!nextAccount) {
        if (company.id) {
          applySessionCustomerFallback(nextSession);
        } else {
          setAccount(null);
          setCustomer(null);
          setAddresses(emptyAddressList);
          setOrders([]);
          setQuotes([]);
          setError(ensureAccountError || 'Nao encontramos um cadastro de cliente vinculado a este login.');
        }
        setIsLoading(false);
        return;
      }

      setAccount(nextAccount);
      setCustomer(nextCustomer || null);

      if (!nextCustomer?.id) {
        applySessionCustomerFallback(nextSession);
        setIsLoading(false);
        return;
      }

      const [
        { data: addressesData, error: addressesError },
        { data: ordersData, error: ordersError },
        { data: quotesData, error: quotesError }
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
          .order('created_at', { ascending: false })
      ]);

      if (addressesError) throw addressesError;
      if (ordersError) throw ordersError;
      if (quotesError) throw quotesError;

      setAddresses((addressesData || []) as StoreCustomerAddress[]);
      setOrders((ordersData || []) as StoreCustomerOrder[]);
      setQuotes((quotesData || []) as StoreCustomerQuote[]);
    } catch (loadError) {
      warnCaught('Erro ao carregar area do cliente:', loadError);
      if (nextSession?.user && company.id) {
        applySessionCustomerFallback(nextSession);
      } else {
        setError('Nao foi possivel carregar sua conta agora.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      await loadStoreCustomer(data.session);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadStoreCustomer(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

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

  const saveAddress = async (address: Partial<StoreCustomerAddress>) => {
    if (!customer) throw new Error('Cliente nao autenticado.');

    const payload = {
      company_id: customer.company_id,
      customer_id: customer.id,
      label: address.label || 'Casa',
      recipient_name: address.recipient_name || customer.name,
      zip_code: address.zip_code || '',
      street: address.street || '',
      number: address.number || '',
      complement: address.complement || null,
      neighborhood: address.neighborhood || '',
      city: address.city || '',
      state: (address.state || '').toUpperCase(),
      reference: address.reference || null,
      is_default: address.is_default ?? addresses.length === 0
    };

    if (payload.is_default) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('company_id', customer.company_id)
        .eq('customer_id', customer.id);
    }

    const query = address.id
      ? supabase.from('customer_addresses').update(payload).eq('id', address.id)
      : supabase.from('customer_addresses').insert(payload);

    const { error: saveError } = await query;
    if (saveError) throw saveError;
    await loadStoreCustomer();
  };

  const deleteAddress = async (id: string) => {
    const { error: deleteError } = await supabase.from('customer_addresses').delete().eq('id', id);
    if (deleteError) throw deleteError;
    await loadStoreCustomer();
  };

  const setDefaultAddress = async (id: string) => {
    if (!customer) throw new Error('Cliente nao autenticado.');
    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('company_id', customer.company_id)
      .eq('customer_id', customer.id);

    const { error: updateError } = await supabase
      .from('customer_addresses')
      .update({ is_default: true })
      .eq('id', id);

    if (updateError) throw updateError;
    await loadStoreCustomer();
  };

  const value: StoreCustomerContextType = {
    session,
    user: session?.user || null,
    account,
    customer,
    addresses,
    orders,
    quotes,
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
    setDefaultAddress
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
