import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dataSubjectRequestLabels, DataSubjectRequestType } from '@/lib/privacy';

export const runtime = 'nodejs';

const rateLimit = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

const getClientIp = (request: NextRequest) => {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown';
};

const maskIdentifier = (value: string) => {
  const clean = value.replace(/\D/g, '');
  if (clean.length >= 11) return `***${clean.slice(-4)}`;
  return value.trim().slice(0, 24);
};

const checkRateLimit = (key: string) => {
  const now = Date.now();
  const current = rateLimit.get(key);
  if (!current || current.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
};

export async function POST(request: NextRequest) {
  const ipKey = getClientIp(request);
  if (!checkRateLimit(ipKey)) {
    return NextResponse.json(
      { error: 'Muitas solicitacoes em pouco tempo. Aguarde alguns minutos e tente novamente.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const companyId = String(body.companyId || '').trim();
  const requestType = String(body.requestType || '') as DataSubjectRequestType;
  const details = String(body.details || '').trim();
  const identityHint = String(body.identityHint || '').trim();
  const confirmation = Boolean(body.confirmation);

  if (!companyId || !name || !email || !details || !confirmation) {
    return NextResponse.json({ error: 'Preencha os campos obrigatorios.' }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Informe um e-mail valido.' }, { status: 400 });
  }

  if (!dataSubjectRequestLabels[requestType]) {
    return NextResponse.json({ error: 'Tipo de solicitacao invalido.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Servico indisponivel no momento.' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { error } = await supabase.from('data_subject_requests').insert({
    company_id: companyId,
    request_type: requestType,
    status: 'recebida',
    requester_name: name,
    requester_email: email,
    requester_identifier_hint: identityHint ? maskIdentifier(identityHint) : null,
    request_details: details,
    source: 'store_public_form'
  });

  if (error) {
    return NextResponse.json({ error: 'Nao foi possivel registrar a solicitacao agora.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Solicitacao registrada. A loja podera pedir confirmacao segura de identidade antes de responder.'
  });
}
