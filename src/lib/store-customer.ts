import type { Customer, Order, Quote } from '@/lib/dummy-data';

export type StoreCustomerType = 'fisica' | 'juridica';

export interface StoreCustomerAddress {
  id: string;
  company_id: string;
  customer_id: string;
  label: string;
  recipient_name: string | null;
  zip_code: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference: string | null;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
}

export interface StoreCustomerAccount {
  id: string;
  company_id: string;
  customer_id: string;
  auth_user_id: string;
  status: 'active' | 'blocked' | 'pending';
  customer?: Customer;
}

export interface StoreCustomerFavorite {
  id: string;
  company_id: string;
  customer_id: string;
  product_id: string;
  created_at: string;
}

export type StoreCustomerOrder = Order & { items?: Order['items'] };
export type StoreCustomerQuote = Quote & { items?: Quote['items'] };

export interface StoreSignupInput {
  name: string;
  customerType: StoreCustomerType;
  document: string;
  email: string;
  phone: string;
  password: string;
  tradeName?: string;
  birthDate?: string;
  contactPreference?: 'whatsapp' | 'email' | 'telefone';
  privacyAccepted: boolean;
  termsAccepted: boolean;
  marketingEmailAccepted?: boolean;
  marketingWhatsappAccepted?: boolean;
}

export const cleanDigits = (value: string) => value.replace(/\D/g, '');

export const validateCPF = (cpf: string) => {
  const clean = cleanDigits(cpf);
  if (clean.length !== 11 || /^(\d)\1+$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(clean[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(clean[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(clean[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === Number(clean[10]);
};

export const validateCNPJ = (cnpj: string) => {
  const clean = cleanDigits(cnpj);
  if (clean.length !== 14 || /^(\d)\1+$/.test(clean)) return false;

  const calc = (base: string, weights: number[]) => {
    const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const digit1 = calc(clean.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digit2 = calc(clean.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digit1 === Number(clean[12]) && digit2 === Number(clean[13]);
};

export const validateStoreSignup = (input: StoreSignupInput) => {
  if (!input.name.trim()) return 'Informe seu nome completo ou razao social.';
  if (input.customerType === 'fisica' && !validateCPF(input.document)) return 'Informe um CPF valido.';
  if (input.customerType === 'juridica' && !validateCNPJ(input.document)) return 'Informe um CNPJ valido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Informe um e-mail valido.';
  if (cleanDigits(input.phone).length < 10) return 'Informe um telefone/WhatsApp valido.';
  if (input.password.length < 8 || !/[a-zA-Z]/.test(input.password) || !/\d/.test(input.password)) {
    return 'A senha precisa ter pelo menos 8 caracteres, com letras e numeros.';
  }
  if (!input.privacyAccepted) return 'Aceite a politica de privacidade para criar sua conta.';
  if (!input.termsAccepted) return 'Aceite os termos de uso para continuar.';
  return '';
};

export const maskDocument = (document: string) => {
  const clean = cleanDigits(document);
  if (clean.length === 11) return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
  if (clean.length === 14) return `**.${clean.slice(2, 5)}.${clean.slice(5, 8)}/****-${clean.slice(12)}`;
  return document;
};

export const getOrderStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    orcamento: 'Em analise',
    aguardando_aprovacao: 'Aguardando aprovacao',
    aguardando_pagamento: 'Aguardando pagamento',
    producao: 'Em producao',
    impressao: 'Em impressao',
    acabamento: 'Em acabamento',
    expedicao: 'Em expedicao',
    entregue: 'Entregue',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
    pendente: 'Em analise',
    aprovado: 'Aprovado',
    reprovado: 'Reprovado'
  };
  return labels[status] || status;
};

export const formatStoreAddress = (address?: StoreCustomerAddress | null) => {
  if (!address) return '';
  return [
    `${address.street}, ${address.number}`,
    address.complement,
    `${address.neighborhood} - ${address.city}/${address.state}`,
    `CEP ${address.zip_code}`,
    address.reference ? `Ref.: ${address.reference}` : ''
  ].filter(Boolean).join(' - ');
};
