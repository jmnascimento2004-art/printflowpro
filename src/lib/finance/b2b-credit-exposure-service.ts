import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export async function getB2BCreditExposure(
  client: SupabaseClient = supabase
): Promise<number> {
  const { data, error } = await client.rpc('get_b2b_credit_exposure');
  if (error) throw new Error('Não foi possível carregar o faturado B2B utilizado.');

  const value = Number(data ?? 0);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('O servidor retornou um valor B2B inválido.');
  }

  return Math.round(value * 100) / 100;
}
