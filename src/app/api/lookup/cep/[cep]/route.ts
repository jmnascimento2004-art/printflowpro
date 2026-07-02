import { NextResponse } from 'next/server';
import { formatCEP, validateCEP } from '@/lib/utils';

type ViaCEPResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

const jsonHeaders = {
  Accept: 'application/json',
  'User-Agent': 'PrintFlowPRO/1.0'
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cep: string }> }
) {
  const { cep } = await params;
  const cleanCEP = cep.replace(/\D/g, '');

  if (!validateCEP(cleanCEP)) {
    return NextResponse.json({ error: 'Informe um CEP valido com 8 digitos.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`, {
      headers: jsonHeaders,
      next: { revalidate: 60 * 60 * 24 }
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Erro ao consultar CEP.' }, { status: response.status });
    }

    const data = await response.json() as ViaCEPResponse;

    if (data.erro) {
      return NextResponse.json(
        { error: 'CEP nao encontrado. Preencha o endereco manualmente.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
      zip_code: formatCEP(data.cep || cleanCEP)
    });
  } catch {
    return NextResponse.json({ error: 'Servico de consulta CEP indisponivel.' }, { status: 502 });
  }
}
