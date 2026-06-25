'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Mail, ShieldCheck } from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { useStorePrivacy } from '@/context/store-privacy-context';
import {
  COOKIE_POLICY_VERSION,
  DATA_INVENTORY,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  cookieCategoryLabels,
  getPrivacyContact
} from '@/lib/privacy';

type StoreLegalPageProps = {
  type: 'privacy' | 'cookies' | 'terms';
};

const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const titleClass = 'text-sm font-black uppercase tracking-wide text-slate-950';
const paragraphClass = 'mt-2 text-sm leading-7 text-slate-600';

export function StoreLegalPage({ type }: StoreLegalPageProps) {
  const { company } = useDatabase();
  const { resetCookieChoice } = useStorePrivacy();
  const contact = getPrivacyContact(company);
  const storeName = company.name || 'Loja online';
  const companyDocument = company.document || 'CNPJ nao informado no cadastro da loja';
  const address = [company.street, company.number, company.neighborhood, company.city, company.state]
    .filter(Boolean)
    .join(', ');
  const version = type === 'cookies' ? COOKIE_POLICY_VERSION : type === 'terms' ? TERMS_VERSION : PRIVACY_POLICY_VERSION;
  const pageTitle = type === 'privacy'
    ? 'Politica de Privacidade'
    : type === 'cookies'
      ? 'Politica de Cookies'
      : 'Termos de Uso';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <Link href="/store" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao catalogo
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5" />
                Versao {version}
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">{pageTitle}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Esta pagina descreve o funcionamento tecnico atual do catalogo de {storeName}. O texto e a configuracao
                devem ser revisados pela loja e por profissional juridico antes da publicacao definitiva.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600 sm:w-72">
              <p className="font-black text-slate-950">{storeName}</p>
              <p>{companyDocument}</p>
              {address && <p>{address}</p>}
              <p className="mt-2">{contact.email}</p>
            </div>
          </div>
        </header>

        {type === 'privacy' && (
          <>
            <section className={sectionClass}>
              <h2 className={titleClass}>Dados tratados e finalidades</h2>
              <div className="mt-4 grid gap-3">
                {DATA_INVENTORY.map((item) => (
                  <article key={item.category} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-black text-slate-950">{item.category}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong>Dados:</strong> {item.data}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong>Finalidade:</strong> {item.purpose}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong>Base legal:</strong> {item.legalBasis}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong>Armazenamento:</strong> {item.storage}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong>Acesso:</strong> {item.access}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong>Retencao:</strong> {item.retention}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong>Compartilhamento:</strong> {item.sharing}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className={sectionClass} id="cookies">
              <h2 className={titleClass}>Cookies e armazenamento local</h2>
              <p className={paragraphClass}>
                Cookies e armazenamento local necessarios mantem login, carrinho, seguranca, preferencias tecnicas e
                funcionamento do PWA. Cookies analiticos e de marketing nao devem ser ativados sem consentimento
                especifico e sem a respectiva ferramenta estar configurada pela loja.
              </p>
              <button
                type="button"
                onClick={resetCookieChoice}
                className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700"
              >
                Gerenciar cookies
              </button>
            </section>

            <section className={sectionClass}>
              <h2 className={titleClass}>Direitos do titular</h2>
              <p className={paragraphClass}>
                Voce pode solicitar acesso, correcao, exclusao, anonimização, portabilidade, revogacao de consentimento,
                informacoes sobre compartilhamento ou oposicao ao tratamento. A loja pode manter dados necessarios para
                obrigacoes fiscais, contabeis, legais, defesa de direitos ou prevencao a fraude.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link href="/store/privacidade/solicitar" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white">
                  <FileText className="h-4 w-4" />
                  Solicitar atendimento LGPD
                </Link>
                <a href={`mailto:${contact.email}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-black text-slate-700">
                  <Mail className="h-4 w-4" />
                  Falar sobre privacidade
                </a>
              </div>
            </section>
          </>
        )}

        {type === 'cookies' && (
          <section className={sectionClass}>
            <h2 className={titleClass}>Categorias de cookies</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Object.entries(cookieCategoryLabels).map(([key, item]) => (
                <article key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-black text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {item.required ? 'Sempre ativo' : 'Depende de consentimento'}
                  </p>
                </article>
              ))}
            </div>
            <p className={paragraphClass}>
              O catalogo nao deve carregar Google Analytics, Meta Pixel, tags de remarketing ou scripts similares antes
              do consentimento da categoria correspondente. Quando a loja adicionar novas integracoes, elas devem ser
              registradas e revisadas antes de receber dados pessoais.
            </p>
            <button
              type="button"
              onClick={resetCookieChoice}
              className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white"
            >
              Alterar minhas preferencias
            </button>
          </section>
        )}

        {type === 'terms' && (
          <>
            <section className={sectionClass}>
              <h2 className={titleClass}>Uso do catalogo</h2>
              <p className={paragraphClass}>
                O catalogo permite consultar produtos, configurar itens, solicitar orcamentos, acompanhar pedidos e
                manter dados da conta do cliente. As informacoes enviadas devem ser verdadeiras e atualizadas para que
                a loja consiga processar atendimento, entrega e suporte.
              </p>
            </section>
            <section className={sectionClass}>
              <h2 className={titleClass}>Pedidos, pagamentos e atendimento</h2>
              <p className={paragraphClass}>
                Orcamentos e pedidos ficam sujeitos a confirmacao da loja. Dados completos de cartao, CVV ou senhas de
                pagamento nao devem ser armazenados no PrintFlowPRO; pagamentos devem ser tratados pelo gateway
                configurado pela loja quando houver integracao.
              </p>
            </section>
            <section className={sectionClass}>
              <h2 className={titleClass}>Privacidade</h2>
              <p className={paragraphClass}>
                O tratamento de dados pessoais segue a Politica de Privacidade desta loja e as preferencias registradas
                pelo cliente. Consentimento promocional e opcional e pode ser revogado.
              </p>
              <Link href="/store/privacidade" className="mt-4 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700">
                Ler politica de privacidade
              </Link>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
