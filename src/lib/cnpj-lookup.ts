import { formatCEP } from './utils';

export interface CNPJLookupResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  telefone: string;
  email: string;
  inscricaoEstadual: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
}

export async function lookupCNPJ(cnpj: string): Promise<CNPJLookupResult> {
  const clean = cnpj.replace(/\D/g, '');
  const response = await fetch(`/api/cnpj/${clean}`);

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    if (response.status === 404) {
      throw new Error('CNPJ válido, mas não foi possível buscar os dados automaticamente. Preencha manualmente.');
    }
    throw new Error(error?.error || 'Não foi possível consultar o CNPJ.');
  }

  const data = await response.json();

  return {
    cnpj: data.cnpj || clean,
    razaoSocial: data.razao_social || '',
    nomeFantasia: data.nome_fantasia || '',
    telefone: data.telefone || '',
    email: data.email || '',
    inscricaoEstadual: data.inscricao_estadual || '',
    cep: data.cep ? formatCEP(data.cep) : '',
    logradouro: data.logradouro || '',
    numero: data.numero || '',
    complemento: data.complemento || '',
    bairro: data.bairro || '',
    municipio: data.municipio || '',
    uf: data.uf || '',
  };
}
