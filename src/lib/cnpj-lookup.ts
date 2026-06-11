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
  bairro: string;
  municipio: string;
  uf: string;
}

export async function lookupCNPJ(cnpj: string): Promise<CNPJLookupResult> {
  const clean = cnpj.replace(/\D/g, '');
  const response = await fetch(`/api/cnpj/${clean}`);

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Nao foi possivel consultar o CNPJ.');
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
    bairro: data.bairro || '',
    municipio: data.municipio || '',
    uf: data.uf || '',
  };
}
