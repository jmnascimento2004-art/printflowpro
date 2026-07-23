import type { SupabaseClient } from '@supabase/supabase-js';

export class PdfAccessError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string);
}

export type PdfAccessProfile = {
  id: string;
  companyId: string;
  role: string;
};

export function requireActivePdfProfile(
  supabase: SupabaseClient
): Promise<PdfAccessProfile>;
