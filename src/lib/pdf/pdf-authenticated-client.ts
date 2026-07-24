'use client';

import { supabase } from '@/lib/supabaseClient';
import { fetchAuthenticatedPdf as fetchPdfWithToken } from '@/lib/pdf/pdf-authenticated-fetch.mjs';

type AuthenticatedPdfResult = { blob: Blob; filename: string };

export async function fetchAuthenticatedPdf(
  url: string,
  fallbackFilename = 'download.pdf'
): Promise<AuthenticatedPdfResult> {
  return fetchPdfWithToken(url, {
    fallbackFilename,
    async getAccessToken() {
      const { data, error } = await supabase.auth.getSession();
      if (error) return null;
      return data.session?.access_token || null;
    }
  });
}
