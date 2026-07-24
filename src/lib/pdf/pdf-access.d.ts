import type { SupabaseClient } from '@supabase/supabase-js';

export class PdfAccessError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string);
}

export type PdfAccessProfile = {
  userId: string;
  profileId: string;
  companyId: string;
  role: string;
};

export function getPdfBearerToken(request: Request): string | null;

export function requireActivePdfProfile(
  supabase: SupabaseClient,
  accessToken?: string
): Promise<PdfAccessProfile>;
