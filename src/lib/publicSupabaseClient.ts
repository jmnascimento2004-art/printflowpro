import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase credentials are missing. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your environment.'
  );
}

const supabasePublicKey = supabasePublishableKey;

export const publicSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
    storageKey: 'printflow-public-supabase'
  }
});

export async function publicStoreSelect<T>(table: string, query = 'select=*') {
  const separator = query.startsWith('?') ? '' : '?';
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${separator}${query}`, {
    headers: {
      apikey: supabasePublicKey,
      Authorization: `Bearer ${supabasePublicKey}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Public Supabase select failed for ${table}: ${response.status} ${message}`);
  }

  return { data: (await response.json()) as T[] };
}
