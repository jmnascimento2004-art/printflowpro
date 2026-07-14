import { formatCEP } from './utils';

export interface CEPLookupResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
}

export async function lookupCEP(cep: string): Promise<CEPLookupResult> {
  const clean = cep.replace(/\D/g, '');
  const response = await fetch(`/api/lookup/cep/${clean}`);

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
  }

  const data = await response.json();

  return {
    street: data.street || '',
    neighborhood: data.neighborhood || '',
    city: data.city || '',
    state: data.state || '',
    zip_code: data.zip_code ? formatCEP(data.zip_code) : ''
  };
}
