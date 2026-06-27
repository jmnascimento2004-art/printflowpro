'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';
import { supabase } from '@/lib/supabaseClient';
import {
  COOKIE_POLICY_VERSION,
  CookiePreferences,
  ConsentType,
  allCookiePreferences,
  defaultCookiePreferences
} from '@/lib/privacy';
import { warnCaught } from '@/lib/safe-log';

type StorePrivacyContextType = {
  anonymousIdentifier: string;
  cookiePreferences: CookiePreferences;
  hasCookieChoice: boolean;
  saveCookiePreferences: (preferences: CookiePreferences, source?: string) => Promise<void>;
  acceptAllCookies: (source?: string) => Promise<void>;
  rejectNonEssentialCookies: (source?: string) => Promise<void>;
  resetCookieChoice: () => void;
  recordConsent: (type: ConsentType, granted: boolean, source?: string, policyVersion?: string) => Promise<void>;
};

const StorePrivacyContext = createContext<StorePrivacyContextType | undefined>(undefined);
const COOKIE_STORAGE_KEY = 'printflow_store_cookie_preferences';
const ANON_ID_STORAGE_KEY = 'printflow_store_privacy_id';

const readStoredCookiePreferences = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
    return {
      necessary: true as const,
      preferences: Boolean(parsed.preferences),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing)
    };
  } catch {
    return null;
  }
};

const getAnonymousIdentifier = () => {
  if (typeof window === 'undefined') return 'server';
  try {
    const stored = window.localStorage.getItem(ANON_ID_STORAGE_KEY);
    if (stored) return stored;
    const next = window.crypto?.randomUUID?.() || `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(ANON_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return `anon-${Date.now()}`;
  }
};

export function StorePrivacyProvider({ children }: { children: React.ReactNode }) {
  const { company } = useDatabase();
  const { customer, user } = useStoreCustomer();
  const [anonymousIdentifier, setAnonymousIdentifier] = useState('server');
  const [cookiePreferences, setCookiePreferences] = useState<CookiePreferences>(defaultCookiePreferences);
  const [hasCookieChoice, setHasCookieChoice] = useState(false);

  useEffect(() => {
    const identifier = getAnonymousIdentifier();
    const stored = readStoredCookiePreferences();
    setAnonymousIdentifier(identifier);
    if (stored) {
      setCookiePreferences(stored);
      setHasCookieChoice(true);
    }
  }, []);

  const persistCookiePreferences = async (preferences: CookiePreferences, source = 'banner') => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify({
        ...preferences,
        policyVersion: COOKIE_POLICY_VERSION,
        updatedAt: new Date().toISOString()
      }));
    }

    setCookiePreferences(preferences);
    setHasCookieChoice(true);

    if (!company.id || anonymousIdentifier === 'server') return;

    const payload = {
      company_id: company.id,
      anonymous_identifier: anonymousIdentifier,
      customer_id: customer?.id || null,
      auth_user_id: user?.id || null,
      necessary: true,
      preferences: preferences.preferences,
      analytics: preferences.analytics,
      marketing: preferences.marketing,
      policy_version: COOKIE_POLICY_VERSION,
      source
    };

    const { error } = await supabase.from('cookie_preferences').insert(payload);
    if (error) warnCaught('Nao foi possivel registrar preferencias de cookies:', error);
  };

  const recordConsent = async (
    type: ConsentType,
    granted: boolean,
    source = 'store',
    policyVersion = COOKIE_POLICY_VERSION
  ) => {
    if (!company.id) return;

    const { error } = await supabase.from('customer_consents').insert({
      company_id: company.id,
      customer_id: customer?.id || null,
      auth_user_id: user?.id || null,
      anonymous_identifier: anonymousIdentifier === 'server' ? null : anonymousIdentifier,
      consent_type: type,
      granted,
      policy_version: policyVersion,
      source,
      granted_at: granted ? new Date().toISOString() : null,
      revoked_at: granted ? null : new Date().toISOString()
    });

    if (error) {
      warnCaught('Não foi possível registrar consentimento:', error);
      throw new Error('Não foi possível salvar suas preferências de privacidade agora.');
    }
  };

  const value = useMemo<StorePrivacyContextType>(() => ({
    anonymousIdentifier,
    cookiePreferences,
    hasCookieChoice,
    saveCookiePreferences: persistCookiePreferences,
    acceptAllCookies: (source = 'banner') => persistCookiePreferences(allCookiePreferences, source),
    rejectNonEssentialCookies: (source = 'banner') => persistCookiePreferences(defaultCookiePreferences, source),
    resetCookieChoice: () => {
      if (typeof window !== 'undefined') window.localStorage.removeItem(COOKIE_STORAGE_KEY);
      setCookiePreferences(defaultCookiePreferences);
      setHasCookieChoice(false);
    },
    recordConsent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [anonymousIdentifier, cookiePreferences, company.id, customer?.id, hasCookieChoice, user?.id]);

  return (
    <StorePrivacyContext.Provider value={value}>
      {children}
    </StorePrivacyContext.Provider>
  );
}

export function useStorePrivacy() {
  const context = useContext(StorePrivacyContext);
  if (!context) {
    throw new Error('useStorePrivacy must be used within StorePrivacyProvider');
  }
  return context;
}
