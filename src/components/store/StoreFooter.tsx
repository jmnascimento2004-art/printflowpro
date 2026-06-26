'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Clock, Mail, Phone } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import type { Company, Settings } from '@/lib/dummy-data';
import { STORE_ROUTES, withStoreRedirect } from '@/lib/store-routes';

type StoreFooterProps = {
  company: Company;
  settings: Settings;
  storeCustomerAuthenticated?: boolean;
  onOpenCart?: () => void;
  onShowAllServices?: () => void;
  onOpenPickupPoints?: () => void;
  onOpenRefundPolicy?: () => void;
  showFloatingWhatsApp?: boolean;
};

type FooterActionProps = {
  children: ReactNode;
  href: string;
  onClick?: () => void;
};

const normalizeFooterColor = (color?: string) => {
  if (!color) return '#1d35c9';
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  const palette: Record<string, string> = {
    blue: '#2563eb',
    violet: '#5b3df4',
    purple: '#5b3df4',
    emerald: '#5b3df4',
    green: '#5b3df4',
    red: '#dc2626',
    orange: '#ea580c'
  };
  return palette[color.toLowerCase()] || '#1d35c9';
};

const whatsappHref = (phone?: string) => `https://wa.me/55${(phone || '51987654321').replace(/\D/g, '')}`;

const socialUrl = (
  platform: 'instagram' | 'facebook' | 'youtube',
  value?: string
) => {
  if (!value) return '#';

  const username = value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^instagram\.com\//, '')
    .replace(/^facebook\.com\//, '')
    .replace(/^youtube\.com\//, '')
    .replace(/^@/, '')
    .replace(/^\/+/, '')
    .trim();

  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${username}`;
    case 'facebook':
      return `https://facebook.com/${username}`;
    case 'youtube':
      return `https://youtube.com/${username}`;
    default:
      return '#';
  }
};

function FooterAction({ children, href, onClick }: FooterActionProps) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
        {children}
      </button>
    );
  }

  return (
    <Link href={href} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
      {children}
    </Link>
  );
}

function FooterBadge({ label, image }: { label: string; image?: string }) {
  if (image) {
    return (
      <img
        src={image}
        className="h-8 w-auto object-contain select-none rounded-none shadow-sm hover:scale-[1.03] transition-transform bg-white"
        alt={label}
        title={label}
      />
    );
  }

  return (
    <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700/30 rounded-lg text-[10px] font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors">
      {label}
    </span>
  );
}

export function StoreFooter({
  company,
  settings,
  storeCustomerAuthenticated = false,
  onOpenCart,
  onShowAllServices,
  onOpenPickupPoints,
  onOpenRefundPolicy,
  showFloatingWhatsApp = true
}: StoreFooterProps) {
  const whatsapp = whatsappHref(company.phone);
  const accent = normalizeFooterColor(company.theme_color);
  const accentSoft = `${accent}1a`;

  return (
    <footer
      className="bg-slate-900 text-slate-400 py-[15px] border-t border-slate-800 text-xs select-none"
      style={{
        '--store-footer-accent': accent,
        '--store-footer-accent-soft': accentSoft
      } as CSSProperties}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-16">
        <div className="space-y-4">
          <div>
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Contatos</h4>
          </div>
          <div className="space-y-3.5">
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">WhatsApp Vendas</span>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-200 hover:text-[var(--store-footer-accent)] font-semibold transition-colors">
                <svg className="h-3.5 w-3.5 fill-current text-[var(--store-footer-accent)] shrink-0" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z"/>
                </svg>
                <span>{company.phone || '(51) 98765-4321'}</span>
              </a>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">Telefone Comercial</span>
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <Phone className="h-3.5 w-3.5 text-[var(--store-footer-accent)] shrink-0" />
                <span>{company.phone || '(51) 3785-3525'}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">E-mail Vendas</span>
              <a href={`mailto:${company.email || 'comercial@printflowpro.com.br'}`} className="flex items-center gap-2 text-slate-200 hover:text-[var(--store-footer-accent)] font-semibold transition-colors break-all">
                <Mail className="h-3.5 w-3.5 text-[var(--store-footer-accent)] shrink-0" />
                <span>{company.email || 'comercial@printflowpro.com.br'}</span>
              </a>
            </div>

            {(company.instagram_url || company.facebook_url || company.youtube_url) && (
              <div className="pt-2 flex items-center gap-3">
                {company.instagram_url && (
                  <a href={socialUrl('instagram', company.instagram_url)} target="_blank" rel="noopener noreferrer" className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-[var(--store-footer-accent)] text-slate-300 hover:text-white flex items-center justify-center transition-all hover:scale-105" title="Instagram">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                    </svg>
                  </a>
                )}
                {company.facebook_url && (
                  <a href={socialUrl('facebook', company.facebook_url)} target="_blank" rel="noopener noreferrer" className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-[var(--store-footer-accent)] text-slate-300 hover:text-white flex items-center justify-center transition-all hover:scale-105" title="Facebook">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                    </svg>
                  </a>
                )}
                {company.youtube_url && (
                  <a href={socialUrl('youtube', company.youtube_url)} target="_blank" rel="noopener noreferrer" className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-[var(--store-footer-accent)] text-slate-300 hover:text-white flex items-center justify-center transition-all hover:scale-105" title="YouTube">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Endereco</h4>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block">Sede / Matriz</span>
              {settings?.footer_show_address !== false ? (
                <p className="text-slate-200 font-medium leading-relaxed">
                  {company.street ? (
                    <>
                      {company.street}, {company.number}<br />
                      {company.neighborhood} - {company.city}/{company.state}<br />
                      CEP {company.cep}
                    </>
                  ) : (
                    <>
                      Avenida das Industrias, 1200 - Igara<br />
                      Porto Alegre - RS | CEP 90200-290
                    </>
                  )}
                </p>
              ) : (
                <p className="text-slate-200 font-medium leading-relaxed italic">
                  Atendimento apenas online
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Horario de Atendimento</h4>
          </div>
          <div className="space-y-3.5 text-slate-200 font-medium leading-relaxed">
            {settings?.footer_hours_message && (
              <div className="p-2 bg-slate-800/40 border border-slate-800 rounded-xl text-[10px] text-slate-400 italic">
                {settings.footer_hours_message}
              </div>
            )}
            <div className="space-y-2">
              <div className="space-y-0.5">
                <p className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Clock className="h-3.5 w-3.5 text-[var(--store-footer-accent)] shrink-0" />
                  <span>{settings?.footer_hours_week || '8h as 12h / 13h30 as 18h'}</span>
                </p>
                <p className="text-slate-400 text-[10px] uppercase font-bold pl-5.5">{settings?.footer_hours_sat || 'Segunda a Sexta-feira'}</p>
              </div>
              {settings?.footer_hours_sat_time && (
                <div className="space-y-0.5">
                  <p className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Clock className="h-3.5 w-3.5 text-[var(--store-footer-accent)] shrink-0" />
                    <span>{settings.footer_hours_sat_time}</span>
                  </p>
                  <p className="text-slate-400 text-[10px] uppercase font-bold pl-5.5">{settings?.footer_hours_sat_desc || 'Sabado'}</p>
                </div>
              )}
            </div>
            {settings?.footer_show_address !== false && (
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                LOJA FISICA | MATRIZ {company.city || 'PORTO ALEGRE'} - {company.state || 'RS'}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider pb-2 border-b border-slate-800/60">Institucional</h4>
          </div>
          <div className="flex flex-col gap-2.5 font-semibold">
            <FooterAction href={STORE_ROUTES.checkout} onClick={onOpenCart}>Carrinho de Orcamentos</FooterAction>
            <FooterAction href={STORE_ROUTES.home} onClick={onShowAllServices}>Todos os Servicos</FooterAction>
            <FooterAction href={STORE_ROUTES.home} onClick={onOpenPickupPoints}>Balcoes de Retirada</FooterAction>
            <FooterAction href="/store/termos" onClick={onOpenRefundPolicy}>Politica de devolucao e reembolso</FooterAction>
            {storeCustomerAuthenticated ? (
              <>
                <Link href={STORE_ROUTES.account} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
                  Minha conta
                </Link>
                <Link href={STORE_ROUTES.orders} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
                  Meus pedidos
                </Link>
              </>
            ) : (
              <>
                <Link href={STORE_ROUTES.login} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
                  Entrar
                </Link>
                <Link href={STORE_ROUTES.signup} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
                  Criar conta
                </Link>
                <Link href={withStoreRedirect(STORE_ROUTES.login, STORE_ROUTES.account)} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
                  Minha conta
                </Link>
                <Link href={withStoreRedirect(STORE_ROUTES.login, STORE_ROUTES.orders)} className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
                  Meus pedidos
                </Link>
              </>
            )}
            <Link href="/store/privacidade" className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
              Politica de Privacidade
            </Link>
            <Link href="/store/cookies" className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
              Politica de Cookies
            </Link>
            <Link href="/store/termos" className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
              Termos de Uso
            </Link>
            <Link href="/store/privacidade#cookies" className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
              Gerenciar Cookies
            </Link>
            <Link href="/store/privacidade/solicitar" className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
              Solicitacoes de Privacidade
            </Link>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-left text-slate-300 hover:text-[var(--store-footer-accent)] transition-colors">
              Atendimento
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 border-t border-slate-800/80 pt-[15px] mt-[15px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-16">
        <div className="space-y-3.5 lg:col-span-2">
          <h4 className="font-extrabold text-[var(--store-footer-accent)] text-xs uppercase tracking-wider">Formas de Pagamento</h4>
          <div className="flex flex-wrap gap-2">
            {company.show_payments_visa !== false && <FooterBadge label="Visa" image={company.img_payments_visa} />}
            {company.show_payments_mastercard !== false && <FooterBadge label="Mastercard" image={company.img_payments_mastercard} />}
            {company.show_payments_elo !== false && <FooterBadge label="Elo" image={company.img_payments_elo} />}
            {company.show_payments_hipercard !== false && <FooterBadge label="Hipercard" image={company.img_payments_hipercard} />}
            {false && company.show_payments_diners !== false && <FooterBadge label="Diners" image={company.img_payments_diners} />}
            {false && company.show_payments_amex !== false && <FooterBadge label="Amex" image={company.img_payments_amex} />}
            {false && company.show_payments_boleto !== false && <FooterBadge label="Boleto" image={company.img_payments_boleto} />}
            {false && company.show_payments_transferencia !== false && <FooterBadge label="Transferencia" image={company.img_payments_transferencia} />}
            {company.show_payments_pix !== false && <FooterBadge label="PIX" image={company.img_payments_pix} />}
          </div>
        </div>

        <div className="space-y-3.5">
          <h4 className="font-extrabold text-[var(--store-footer-accent)] text-xs uppercase tracking-wider">Formas de Entrega</h4>
          <div className="flex flex-wrap gap-2">
            {company.show_delivery_sedex !== false && <FooterBadge label="SEDEX" image={company.img_delivery_sedex} />}
            {false && company.show_delivery_pac !== false && <FooterBadge label="PAC" image={company.img_delivery_pac} />}
            {company.show_delivery_correios !== false && <FooterBadge label="Correios" image={company.img_delivery_correios} />}
            {company.show_delivery_jadlog !== false && <FooterBadge label="Jadlog" image={company.img_delivery_jadlog} />}
            {company.show_delivery_motoboy !== false && <FooterBadge label="Motoboy" image={company.img_delivery_motoboy} />}
          </div>
        </div>

        <div className="space-y-3.5">
          <h4 className="font-extrabold text-[var(--store-footer-accent)] text-xs uppercase tracking-wider">Seguranca</h4>
          <div className="flex flex-wrap gap-2">
            {company.show_security_letsencrypt !== false && <FooterBadge label="SSL Seguro" image={company.img_security_letsencrypt} />}
            {company.show_security_google !== false && <FooterBadge label="Google Safe" image={company.img_security_google} />}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 border-t border-slate-800/80 pt-[15px] mt-[15px] text-center text-[10px] md:text-xs text-slate-500 font-medium flex flex-col items-center gap-4">
        <p>
          {new Date().getFullYear()} - Copyright © - {company.name || 'PrintFlowPRO'}
          {company.document ? ` - CNPJ: ${company.document}` : ''} | Desenvolvido para Alta Lucratividade de Graficas e Comunicacao Visual.
        </p>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600 bg-slate-950/40 px-3 py-1.5 rounded-full border border-slate-800/60 select-none">
          <span>Desenvolvido e Hospedado por</span>
          <BrandMark className="h-4 w-4 rounded-md" />
          <span className="font-extrabold uppercase tracking-widest text-[var(--store-footer-accent)]">PrintFlowPRO</span>
          <span className="text-[8px] bg-[var(--store-footer-accent-soft)] text-[var(--store-footer-accent)] px-1.5 py-0.5 rounded font-bold">SaaS v1.0</span>
        </div>
      </div>

      {showFloatingWhatsApp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] right-4 z-40 bg-[#25D366] hover:bg-[#20ba5a] text-white p-3.5 rounded-full shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center group md:bottom-6 md:right-6"
          title="Fale Conosco no WhatsApp"
        >
          <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z"/>
          </svg>
        </a>
      )}
    </footer>
  );
}
