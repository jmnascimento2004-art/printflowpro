import { NextResponse } from 'next/server';

type NormalizedCNPJResponse = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  telefone: string;
  email: string;
  inscricao_estadual: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
};

const jsonHeaders = {
  Accept: 'application/json',
  'User-Agent': 'PrintFlowPRO/1.0',
};

function normalizeBrasilApi(data: any, cleanCNPJ: string): NormalizedCNPJResponse {
  return {
    cnpj: data.cnpj || cleanCNPJ,
    razao_social: data.razao_social || '',
    nome_fantasia: data.nome_fantasia || '',
    telefone: data.telefone || '',
    email: data.email || '',
    inscricao_estadual: data.inscricao_estadual || '',
    cep: data.cep || '',
    logradouro: data.logradouro || '',
    numero: data.numero || '',
    bairro: data.bairro || '',
    municipio: data.municipio || '',
    uf: data.uf || '',
  };
}

function normalizeReceitaWs(data: any, cleanCNPJ: string): NormalizedCNPJResponse {
  return {
    cnpj: data.cnpj || cleanCNPJ,
    razao_social: data.nome || '',
    nome_fantasia: data.fantasia || '',
    telefone: data.telefone || '',
    email: data.email || '',
    inscricao_estadual: data.inscricao_estadual || '',
    cep: data.cep || '',
    logradouro: data.logradouro || '',
    numero: data.numero || '',
    bairro: data.bairro || '',
    municipio: data.municipio || '',
    uf: data.uf || '',
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cnpj: string }> }
) {
  const { cnpj } = await params;
  const cleanCNPJ = cnpj.replace(/\D/g, '');

  if (cleanCNPJ.length !== 14) {
    return NextResponse.json({ error: 'CNPJ invalido ou incompleto.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCNPJ}`, {
      headers: jsonHeaders,
      next: { revalidate: 60 * 60 * 24 },
    });

    if (response.ok) {
      return NextResponse.json(normalizeBrasilApi(await response.json(), cleanCNPJ));
    }

    if (response.status === 404) {
      return NextResponse.json({ error: 'CNPJ nao encontrado.' }, { status: 404 });
    }
  } catch {
    // Fall through to ReceitaWS fallback below.
  }

  try {
    const fallbackResponse = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cleanCNPJ}`, {
      headers: jsonHeaders,
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!fallbackResponse.ok) {
      return NextResponse.json({ error: 'Erro ao consultar CNPJ.' }, { status: fallbackResponse.status });
    }

    const fallbackData = await fallbackResponse.json();

    if (fallbackData.status === 'ERROR') {
      return NextResponse.json(
        { error: fallbackData.message || 'CNPJ nao encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json(normalizeReceitaWs(fallbackData, cleanCNPJ));
  } catch {
    return NextResponse.json({ error: 'Servico de consulta CNPJ indisponivel.' }, { status: 502 });
  }
}
