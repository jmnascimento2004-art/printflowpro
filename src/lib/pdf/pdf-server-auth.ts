import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getPdfBearerToken,
  requireActivePdfProfile
} from '@/lib/pdf/pdf-access.mjs';

export type PdfAccessProfile = {
  userId: string;
  profileId: string;
  companyId: string;
  role: string;
};

export type PdfRequestContext = {
  supabase: SupabaseClient;
  access: PdfAccessProfile;
};

const requestClients = new WeakMap<Request, SupabaseClient>();

function getSupabaseCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || '';

  if (!url || !key) throw new Error('Supabase credentials are missing for PDF generation.');
  return { url, key };
}

function createBearerClient(accessToken: string) {
  const { url, key } = getSupabaseCredentials();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

function createCookieClient() {
  const { url, key } = getSupabaseCredentials();
  return createServerClient(url, key, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      setAll() {
        // Route handlers only consume an already established cookie session.
      }
    }
  });
}

function createPdfRequestClient(request: Request) {
  const accessToken = getPdfBearerToken(request);
  const supabase = accessToken ? createBearerClient(accessToken) : createCookieClient();
  return { supabase, accessToken };
}

export function getAuthenticatedPdfClient(request: Request): SupabaseClient {
  const supabase = requestClients.get(request);
  if (!supabase) throw new Error('PDF request has not been authenticated.');
  return supabase;
}

export async function authenticatePdfRequest(request: Request): Promise<PdfAccessProfile> {
  const { supabase, accessToken } = createPdfRequestClient(request);
  const access = await requireActivePdfProfile(supabase, accessToken || undefined);
  requestClients.set(request, supabase);
  return access;
}
