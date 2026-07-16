import { formatCEP } from './utils';

export interface CEPLookupResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
}

type ViaCEPResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

const normalizeCEPResult = (data: Record<string, unknown>): CEPLookupResult => ({
  street: String(data.street || data.logradouro || ''),
  neighborhood: String(data.neighborhood || data.bairro || ''),
  city: String(data.city || data.localidade || ''),
  state: String(data.state || data.uf || ''),
  zip_code: data.zip_code || data.cep
    ? formatCEP(String(data.zip_code || data.cep))
    : ''
});

export async function lookupCEP(cep: string): Promise<CEPLookupResult> {
  const clean = cep.replace(/\D/g, '');
  let internalResponse: Response | null = null;
  let internalError = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';

  try {
    internalResponse = await fetch(`/api/lookup/cep/${clean}`);
  } catch {
    internalResponse = null;
  }

  if (internalResponse?.ok) {
    return normalizeCEPResult(await internalResponse.json() as Record<string, unknown>);
  }

  if (internalResponse) {
    const error = await internalResponse.json().catch(() => null);
    internalError = error?.error || internalError;

    if (internalResponse.status >= 400 && internalResponse.status < 500) {
      throw new Error(internalError);
    }
  }

  try {
    const fallbackResponse = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (!fallbackResponse.ok) throw new Error(internalError);

    const fallbackData = await fallbackResponse.json() as ViaCEPResponse;
    if (fallbackData.erro) {
      throw new Error('CEP não encontrado. Verifique o número informado.');
    }

    return normalizeCEPResult(fallbackData as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CEP não encontrado')) {
      throw error;
    }
    throw new Error(internalError);
  }
}
