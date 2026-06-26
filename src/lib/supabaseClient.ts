import { createBrowserClient } from '@supabase/ssr';
import type { AuthResponse, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase credentials are missing. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your environment.'
  );
}

declare global {
  // Keep one browser auth client across providers and Fast Refresh.
  var __printflowSupabaseBrowserClient: SupabaseClient | undefined;
  var __printflowSupabaseInvalidSessionGuardedClient: SupabaseClient | undefined;
  var __printflowSupabaseInvalidSessionWarned: boolean | undefined;
}

type SupabaseAuthClient = SupabaseClient['auth'];

const supabaseProjectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
})();

const supabaseAuthStorageKey = supabaseProjectRef ? `sb-${supabaseProjectRef}-auth-token` : '';

const isInvalidRefreshSessionError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');

  return /invalid refresh token|refresh token not found/i.test(message);
};

const warnInvalidSessionOnce = () => {
  if (process.env.NODE_ENV === 'production' || globalThis.__printflowSupabaseInvalidSessionWarned) return;

  globalThis.__printflowSupabaseInvalidSessionWarned = true;
  console.warn('Sessao expirada ou invalida. Faca login novamente.');
};

const clearSupabaseAuthStorage = () => {
  if (typeof window === 'undefined' || !supabaseAuthStorageKey) return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.removeItem(supabaseAuthStorageKey);
      storage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
    } catch {
      // Storage cleanup is best effort; signOut local handles the normal path.
    }
  }
};

const clearInvalidSupabaseSession = async (auth: SupabaseAuthClient) => {
  clearSupabaseAuthStorage();

  try {
    await auth.signOut({ scope: 'local' });
  } catch {
    // The session is already invalid; avoid rethrowing and looping refresh attempts.
  } finally {
    clearSupabaseAuthStorage();
    warnInvalidSessionOnce();
  }
};

const guardInvalidRefreshSession = (client: SupabaseClient) => {
  if (globalThis.__printflowSupabaseInvalidSessionGuardedClient === client) return client;

  const auth = client.auth;
  const getSession = auth.getSession.bind(auth);
  const refreshSession = auth.refreshSession.bind(auth);

  auth.getSession = async () => {
    let response: Awaited<ReturnType<SupabaseAuthClient['getSession']>>;

    try {
      response = await getSession();
    } catch (sessionError) {
      if (isInvalidRefreshSessionError(sessionError)) {
        await clearInvalidSupabaseSession(auth);
        return { data: { session: null }, error: null };
      }

      throw sessionError;
    }

    if (isInvalidRefreshSessionError(response.error)) {
      await clearInvalidSupabaseSession(auth);
      return { data: { session: null }, error: null };
    }

    return response;
  };

  auth.refreshSession = async (currentSession) => {
    let response: AuthResponse;

    try {
      response = await refreshSession(currentSession);
    } catch (sessionError) {
      if (isInvalidRefreshSessionError(sessionError)) {
        await clearInvalidSupabaseSession(auth);
        return { data: { session: null, user: null }, error: null } as AuthResponse;
      }

      throw sessionError;
    }

    if (isInvalidRefreshSessionError(response.error)) {
      await clearInvalidSupabaseSession(auth);
      return { data: { session: null, user: null }, error: null } as AuthResponse;
    }

    return response;
  };

  globalThis.__printflowSupabaseInvalidSessionGuardedClient = client;
  return client;
};

export function getSupabaseBrowserClient() {
  if (!globalThis.__printflowSupabaseBrowserClient) {
    globalThis.__printflowSupabaseBrowserClient = createBrowserClient(supabaseUrl, supabasePublishableKey);
  }

  return guardInvalidRefreshSession(globalThis.__printflowSupabaseBrowserClient);
}

export const supabase = getSupabaseBrowserClient();
