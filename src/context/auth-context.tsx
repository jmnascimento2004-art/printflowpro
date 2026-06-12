'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { UserProfile, DUMMY_PROFILES } from '@/lib/dummy-data';
import { warnCaught } from '@/lib/safe-log';

interface AuthContextType {
  activeProfile: UserProfile;
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  setActiveProfile: (profile: UserProfile) => void;
  hasRole: (roles: UserProfile['role'][]) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, companyName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const EMPTY_PROFILE: UserProfile = {
  ...DUMMY_PROFILES[0],
  id: 'auth-pending',
  company_id: '',
  auth_user_id: null,
  name: 'Usuario sem perfil',
  email: '',
  role: 'vendas',
  active: false,
};

const provisionCurrentAuthUser = async (): Promise<UserProfile | null> => {
  const { data, error } = await supabase.rpc('provision_current_auth_user');

  if (error || !data) {
    warnCaught('Erro ao provisionar perfil do usuario autenticado:', error);
    return null;
  }

  return data as UserProfile;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [activeProfile, setActiveProfileState] = useState<UserProfile>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const applyProvisionedProfile = async () => {
    const provisionedProfile = await provisionCurrentAuthUser();

    if (provisionedProfile?.active) {
      setActiveProfileState(provisionedProfile);
      setAuthError(null);
      return true;
    }

    return false;
  };

  const loadProfile = async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setActiveProfileState(EMPTY_PROFILE);
      setAuthError(null);
      return;
    }

    const userId = currentSession.user.id;
    const userEmail = currentSession.user.email || '';

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`auth_user_id.eq.${userId},email.eq.${userEmail}`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      const repaired = await applyProvisionedProfile();
      if (repaired) return;

      setActiveProfileState(EMPTY_PROFILE);
      setAuthError('Nao foi possivel carregar ou reparar o perfil vinculado a esta sessao. Execute o SQL de reparo de Auth/Profiles no Supabase e tente novamente.');
      return;
    }

    if (!data) {
      const repaired = await applyProvisionedProfile();
      if (repaired) return;

      setActiveProfileState({
        ...EMPTY_PROFILE,
        auth_user_id: userId,
        email: userEmail,
      });
      setAuthError('Sua conta existe, mas ainda nao possui um perfil ativo no ERP. Execute o SQL de reparo de Auth/Profiles no Supabase e tente novamente.');
      return;
    }

    if (!data.auth_user_id) {
      const { data: claimedProfile, error: claimError } = await supabase
        .from('profiles')
        .update({ auth_user_id: userId, active: true })
        .eq('id', data.id)
        .select('*')
        .maybeSingle();

      if (!claimError && claimedProfile) {
        setActiveProfileState(claimedProfile as UserProfile);
        setAuthError(null);
        return;
      }

      const repaired = await applyProvisionedProfile();
      if (repaired) return;
    }

    setActiveProfileState(data as UserProfile);
    setAuthError(null);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        setAuthError('Nao foi possivel restaurar a sessao.');
      }

      setSession(data.session);
      await loadProfile(data.session);
      if (mounted) setIsLoading(false);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadProfile(nextSession).finally(() => setIsLoading(false));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    setAuthError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setIsLoading(false);
      setAuthError(error.message);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name: string, companyName?: string) => {
    setIsLoading(true);
    setAuthError(null);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: name.trim(),
          company_name: companyName?.trim() || 'Minha empresa',
        },
      },
    });

    if (error) {
      setIsLoading(false);
      setAuthError(error.message);
      throw error;
    }

    if (!data.session) {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setActiveProfileState(EMPTY_PROFILE);
    setIsLoading(false);
  };

  const setActiveProfile = (profile: UserProfile) => {
    if (profile.id === activeProfile.id) {
      setActiveProfileState(profile);
    }
  };

  const hasRole = (roles: UserProfile['role'][]): boolean => {
    return Boolean(session?.user && activeProfile.active && roles.includes(activeProfile.role));
  };

  return (
    <AuthContext.Provider
      value={{
        activeProfile,
        user: session?.user || null,
        session,
        isAuthenticated: Boolean(session?.user && activeProfile.active),
        isLoading,
        authError,
        setActiveProfile,
        hasRole,
        signIn,
        signUp,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
