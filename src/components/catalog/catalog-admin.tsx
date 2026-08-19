'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Eye,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Megaphone,
  Menu,
  Palette,
  Save,
  Share2,
  Sparkles
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import type { Company } from '@/lib/dummy-data';
import { onlyPhoneDigits, getBrazilianPhoneDisplay, normalizeRichTextHtml } from '@/lib/utils';
import { RichTextEditor } from '@/components/rich-text-editor';
import { CatalogBannerManager } from '@/components/catalog/catalog-banner-manager';
import { CatalogNavigationSettings } from '@/components/settings/catalog-navigation-settings';
import {
  CATALOG_BENEFIT_ICON_OPTIONS,
  catalogBenefitCardsToCompanyPatch,
  getCatalogBenefitCards,
  type CatalogBenefitCard
} from '@/lib/store/catalog-visual-settings';

type CatalogTab = 'overview' | 'banners' | 'navigation' | 'merchandising' | 'benefits' | 'appearance' | 'footer' | 'policies';

const TABS: Array<{ id: CatalogTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'banners', label: 'Banners', icon: ImageIcon },
  { id: 'navigation', label: 'Navegação & Mega Menu', icon: Menu },
  { id: 'merchandising', label: 'Seções & Merchandising', icon: Megaphone },
  { id: 'benefits', label: 'Benefícios', icon: BadgeCheck },
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'footer', label: 'Rodapé & Redes', icon: Share2 },
  { id: 'policies', label: 'Políticas', icon: FileText }
];

const fieldClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-primary';

const normalizeSocialHandle = (value: string) => {
  const clean = value.trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/^(instagram|facebook|youtube)\.com\//i, '').replace(/^@/, '').replace(/^\/+/, '');
  return clean ? `/${clean}` : '';
};

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl border border-border bg-secondary/15 p-4">
      <div><span className="block text-xs font-black text-foreground">{label}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{help}</span></div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'border border-border bg-secondary'}`}><span className={`absolute h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></button>
    </div>
  );
}

function SectionCard({ title, description, children, testId }: { title: string; description?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" data-testid={testId}>
      <div className="border-b border-border pb-3"><h3 className="text-sm font-black uppercase tracking-wide text-foreground">{title}</h3>{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}</div>
      {children}
    </section>
  );
}

function SaveButton({ onClick, label = 'Salvar alterações' }: { onClick: () => void; label?: string }) {
  return <div className="flex justify-end"><button type="button" onClick={onClick} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm shadow-primary/15"><Save className="h-4 w-4" />{label}</button></div>;
}

export function CatalogAdmin() {
  const {
    company,
    settings,
    products,
    categories,
    banners,
    updateSettings,
    updateCompany,
    addBanner,
    updateBanner,
    deleteBanner,
    updateCategoryCatalogPresentation
  } = useDatabase();
  const [activeTab, setActiveTab] = useState<CatalogTab>('overview');
  const [notification, setNotification] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(() => ({
    topBarHours: settings.top_bar_hours || '',
    topBarShowPickup: settings.top_bar_show_pickup !== false,
    topBarPhone: settings.top_bar_phone || '',
    catalogWhatsApp: getBrazilianPhoneDisplay(settings.catalog_whatsapp || ''),
    footerShowAddress: settings.footer_show_address !== false,
    footerHoursMessage: settings.footer_hours_message || '',
    footerHoursWeek: settings.footer_hours_week || '',
    footerHoursSat: settings.footer_hours_sat || '',
    footerHoursSatTime: settings.footer_hours_sat_time || '',
    footerHoursSatDesc: settings.footer_hours_sat_desc || '',
    bestsellers: settings.catalog_bestsellers_section_enabled !== false,
    promotions: settings.catalog_promotions_section_enabled !== false,
    highlights: settings.catalog_highlights_section_enabled !== false
  }));
  const [companyDraft, setCompanyDraft] = useState(() => ({
    instagram: company.instagram_url || '',
    facebook: company.facebook_url || '',
    youtube: company.youtube_url || '',
    refundPolicy: normalizeRichTextHtml(company.refund_policy || '')
  }));
  const [benefitCards, setBenefitCards] = useState<CatalogBenefitCard[]>(() => getCatalogBenefitCards(company));
  const [footerDisplay, setFooterDisplay] = useState(() => ({
    show_payments_visa: company.show_payments_visa !== false,
    show_payments_mastercard: company.show_payments_mastercard !== false,
    show_payments_elo: company.show_payments_elo !== false,
    show_payments_hipercard: company.show_payments_hipercard !== false,
    show_payments_pix: company.show_payments_pix !== false,
    show_delivery_sedex: company.show_delivery_sedex !== false,
    show_delivery_correios: company.show_delivery_correios !== false,
    show_delivery_jadlog: company.show_delivery_jadlog !== false,
    show_delivery_motoboy: company.show_delivery_motoboy !== false,
    show_security_letsencrypt: company.show_security_letsencrypt !== false,
    show_security_google: company.show_security_google !== false
  }));

  useEffect(() => {
    setSettingsDraft({
      topBarHours: settings.top_bar_hours || '',
      topBarShowPickup: settings.top_bar_show_pickup !== false,
      topBarPhone: settings.top_bar_phone || '',
      catalogWhatsApp: getBrazilianPhoneDisplay(settings.catalog_whatsapp || ''),
      footerShowAddress: settings.footer_show_address !== false,
      footerHoursMessage: settings.footer_hours_message || '',
      footerHoursWeek: settings.footer_hours_week || '',
      footerHoursSat: settings.footer_hours_sat || '',
      footerHoursSatTime: settings.footer_hours_sat_time || '',
      footerHoursSatDesc: settings.footer_hours_sat_desc || '',
      bestsellers: settings.catalog_bestsellers_section_enabled !== false,
      promotions: settings.catalog_promotions_section_enabled !== false,
      highlights: settings.catalog_highlights_section_enabled !== false
    });
  }, [settings]);

  useEffect(() => {
    setCompanyDraft({ instagram: company.instagram_url || '', facebook: company.facebook_url || '', youtube: company.youtube_url || '', refundPolicy: normalizeRichTextHtml(company.refund_policy || '') });
    setBenefitCards(getCatalogBenefitCards(company));
    setFooterDisplay({
      show_payments_visa: company.show_payments_visa !== false,
      show_payments_mastercard: company.show_payments_mastercard !== false,
      show_payments_elo: company.show_payments_elo !== false,
      show_payments_hipercard: company.show_payments_hipercard !== false,
      show_payments_pix: company.show_payments_pix !== false,
      show_delivery_sedex: company.show_delivery_sedex !== false,
      show_delivery_correios: company.show_delivery_correios !== false,
      show_delivery_jadlog: company.show_delivery_jadlog !== false,
      show_delivery_motoboy: company.show_delivery_motoboy !== false,
      show_security_letsencrypt: company.show_security_letsencrypt !== false,
      show_security_google: company.show_security_google !== false
    });
  }, [company]);

  const notify = (message: string) => {
    setNotification(message);
    window.setTimeout(() => setNotification(null), 3500);
  };
  const patchSettings = (patch: Partial<typeof settingsDraft>) => setSettingsDraft((current) => ({ ...current, ...patch }));
  const updateBenefitCard = (slot: CatalogBenefitCard['slot'], patch: Partial<CatalogBenefitCard>) => setBenefitCards((cards) => cards.map((card) => card.slot === slot ? { ...card, ...patch } : card));
  const moveBenefitCard = (slot: CatalogBenefitCard['slot'], direction: -1 | 1) => setBenefitCards((cards) => {
    const index = cards.findIndex((card) => card.slot === slot);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= cards.length) return cards;
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const patchCompany = (patch: Partial<Company>) => updateCompany({ ...company, ...patch } as Company);

  const visibleProducts = products.filter((product) => product.active !== false && product.catalog_active !== false).length;
  const activeBanners = banners.filter((banner) => banner.active !== false).length;
  const featuredCategories = categories.filter((category) => category.catalog_featured === true).length;
  const activeSections = [settingsDraft.bestsellers, settingsDraft.promotions, settingsDraft.highlights].filter(Boolean).length;
  const storeDomain = (company.store_domain || company.custom_domain || '').trim();
  const storeHref = storeDomain ? `https://${storeDomain.replace(/^https?:\/\//, '')}/store` : '/store';

  const overviewCards = [
    { label: 'Produtos visíveis', value: visibleProducts, help: `${products.length} produtos cadastrados` },
    { label: 'Banners ativos', value: activeBanners, help: `${banners.length} banners configurados` },
    { label: 'Categorias em destaque', value: featuredCategories, help: `${categories.length} categorias cadastradas` },
    { label: 'Seções ativas', value: `${activeSections}/3`, help: '+Vendidos, Promoções e Destaques' }
  ];

  const saveAppearance = () => {
    updateSettings({ top_bar_hours: settingsDraft.topBarHours, top_bar_show_pickup: settingsDraft.topBarShowPickup, top_bar_phone: settingsDraft.topBarPhone, catalog_whatsapp: onlyPhoneDigits(settingsDraft.catalogWhatsApp) });
    notify('Aparência do catálogo salva.');
  };
  const saveMerchandising = () => {
    updateSettings({ catalog_bestsellers_section_enabled: settingsDraft.bestsellers, catalog_promotions_section_enabled: settingsDraft.promotions, catalog_highlights_section_enabled: settingsDraft.highlights });
    notify('Seções do catálogo salvas.');
  };
  const saveFooter = () => {
    updateSettings({ footer_show_address: settingsDraft.footerShowAddress, footer_hours_message: settingsDraft.footerHoursMessage, footer_hours_week: settingsDraft.footerHoursWeek, footer_hours_sat: settingsDraft.footerHoursSat, footer_hours_sat_time: settingsDraft.footerHoursSatTime, footer_hours_sat_desc: settingsDraft.footerHoursSatDesc });
    patchCompany({ ...footerDisplay, instagram_url: normalizeSocialHandle(companyDraft.instagram), facebook_url: normalizeSocialHandle(companyDraft.facebook), youtube_url: normalizeSocialHandle(companyDraft.youtube) });
    notify('Rodapé e redes sociais salvos.');
  };
  const saveBenefits = () => { patchCompany(catalogBenefitCardsToCompanyPatch(benefitCards)); notify('Sete cards de benefícios salvos.'); };
  const savePolicies = () => { patchCompany({ refund_policy: normalizeRichTextHtml(companyDraft.refundPolicy) }); notify('Política de devolução e reembolso salva.'); };

  const footerGroups = useMemo(() => [
    { title: 'Formas de pagamento', items: [['show_payments_visa', 'Visa'], ['show_payments_mastercard', 'Mastercard'], ['show_payments_elo', 'Elo'], ['show_payments_hipercard', 'Hipercard'], ['show_payments_pix', 'PIX']] as const },
    { title: 'Formas de entrega', items: [['show_delivery_sedex', 'SEDEX'], ['show_delivery_correios', 'Correios'], ['show_delivery_jadlog', 'Jadlog'], ['show_delivery_motoboy', 'Motoboy']] as const },
    { title: 'Selos de segurança', items: [['show_security_letsencrypt', "Let's Encrypt"], ['show_security_google', 'Google Safe Browsing']] as const }
  ], []);

  return (
    <div className="w-full min-w-0 space-y-5" data-testid="catalog-admin-module">
      {notification && <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-600">{notification}</div>}
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Administração da loja pública</p><h2 className="mt-1 text-xl font-black text-foreground">Catálogo</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Organize banners, navegação, merchandising e aparência sem duplicar produtos ou categorias.</p></div>
        <a href={storeHref} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 text-xs font-bold text-primary"><Eye className="h-4 w-4" />Ver Loja</a>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2 scrollbar-none" aria-label="Seções do Catálogo">
        {TABS.map((tab) => { const Icon = tab.icon; const active = activeTab === tab.id; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`} aria-current={active ? 'page' : undefined}><Icon className="h-4 w-4" />{tab.label}</button>; })}
      </nav>

      {activeTab === 'overview' && (
        <div className="space-y-5" data-testid="catalog-overview">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{overviewCards.map((card) => <article key={card.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><span className="text-[10px] font-black uppercase text-muted-foreground">{card.label}</span><strong className="mt-2 block text-2xl font-black text-foreground">{card.value}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{card.help}</span></article>)}</div>
          <SectionCard title="Atalhos" description="Acesse diretamente as áreas mais usadas do catálogo."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><a href={storeHref} target="_blank" rel="noopener noreferrer" className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-background p-4 text-xs font-bold text-foreground"><Eye className="h-5 w-5 text-primary" />Ver Loja</a>{[{ id: 'banners' as const, label: 'Banners', icon: ImageIcon }, { id: 'navigation' as const, label: 'Navegação', icon: Menu }, { id: 'appearance' as const, label: 'Personalização', icon: Palette }].map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setActiveTab(item.id)} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-background p-4 text-left text-xs font-bold text-foreground"><Icon className="h-5 w-5 text-primary" />{item.label}</button>; })}</div></SectionCard>
          <SectionCard title="Separação dos módulos" description="Cada dado permanece na sua fonte canônica."><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-border bg-secondary/10 p-4"><p className="text-xs font-black text-foreground">Produtos</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Cadastro, categorias estruturais, preço, SKU, estoque, ficha e imagens do item vendido.</p><Link href="/products" className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-primary">Abrir Produtos</Link></div><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-black text-foreground">Catálogo</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Apresentação pública, banners, destaques, Mega Menu, benefícios e políticas.</p></div></div></SectionCard>
        </div>
      )}

      {activeTab === 'banners' && <CatalogBannerManager companyId={company.id} banners={banners} addBanner={addBanner} updateBanner={updateBanner} deleteBanner={deleteBanner} notify={notify} />}
      {activeTab === 'navigation' && <CatalogNavigationSettings companyId={company.id} categories={categories} updateCategory={updateCategoryCatalogPresentation} notify={notify} />}

      {activeTab === 'merchandising' && <SectionCard title="Seções & Merchandising" description="Controle somente a visibilidade. A classificação dos produtos permanece inalterada." testId="catalog-showcase-toggles"><div className="grid gap-3 md:grid-cols-3"><Toggle label="+ Vendidos" help="Exibe o ranking atual de produtos mais vendidos." checked={settingsDraft.bestsellers} onChange={(value) => patchSettings({ bestsellers: value })} /><Toggle label="Promoções" help="Exibe produtos já marcados como promoção." checked={settingsDraft.promotions} onChange={(value) => patchSettings({ promotions: value })} /><Toggle label="Destaques" help="Exibe produtos já marcados como destaque." checked={settingsDraft.highlights} onChange={(value) => patchSettings({ highlights: value })} /></div><SaveButton onClick={saveMerchandising} label="Salvar merchandising" /></SectionCard>}

      {activeTab === 'benefits' && <SectionCard title="Cards de Benefícios" description="Os sete slots existentes continuam na mesma fonte persistente." testId="catalog-benefit-card-settings"><div className="grid gap-4 md:grid-cols-2">{benefitCards.map((card, index) => <article key={card.slot} className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4"><div className="flex items-center justify-between gap-3"><div><span className="block text-[10px] font-black uppercase text-primary">Card {index + 1}</span><span className="text-[10px] text-muted-foreground">Slot persistente {card.slot}</span></div><div className="flex items-center gap-1"><button type="button" disabled={index === 0} onClick={() => moveBenefitCard(card.slot, -1)} className="min-h-11 rounded-lg border border-border px-3 text-xs font-bold disabled:opacity-30" aria-label={`Mover ${card.title} para cima`}>↑</button><button type="button" disabled={index === benefitCards.length - 1} onClick={() => moveBenefitCard(card.slot, 1)} className="min-h-11 rounded-lg border border-border px-3 text-xs font-bold disabled:opacity-30" aria-label={`Mover ${card.title} para baixo`}>↓</button></div></div><Toggle label={card.active ? 'Ativo' : 'Inativo'} help="Controla a exibição deste benefício na Store." checked={card.active} onChange={(active) => updateBenefitCard(card.slot, { active })} /><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]"><label className="text-[10px] font-bold uppercase text-muted-foreground">Título<input className={`${fieldClass} mt-1`} value={card.title} onChange={(event) => updateBenefitCard(card.slot, { title: event.target.value })} /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">Ícone<select className={`${fieldClass} mt-1`} value={card.icon} onChange={(event) => updateBenefitCard(card.slot, { icon: event.target.value as CatalogBenefitCard['icon'] })}>{CATALOG_BENEFIT_ICON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><label className="block text-[10px] font-bold uppercase text-muted-foreground">Texto auxiliar<input className={`${fieldClass} mt-1`} value={card.subtitle} onChange={(event) => updateBenefitCard(card.slot, { subtitle: event.target.value })} /></label></article>)}</div><SaveButton onClick={saveBenefits} label="Salvar benefícios" /></SectionCard>}

      {activeTab === 'appearance' && <div className="space-y-5"><SectionCard title="Barra superior" description="Elementos visuais exclusivos da Store."><div className="grid gap-4 md:grid-cols-2"><label className="text-[10px] font-bold uppercase text-muted-foreground">Mensagem/horário<input className={`${fieldClass} mt-1`} value={settingsDraft.topBarHours} onChange={(event) => patchSettings({ topBarHours: event.target.value })} /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">Telefone<input className={`${fieldClass} mt-1`} value={settingsDraft.topBarPhone} onChange={(event) => patchSettings({ topBarPhone: event.target.value })} /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">WhatsApp do catálogo<input className={`${fieldClass} mt-1`} value={settingsDraft.catalogWhatsApp} onChange={(event) => patchSettings({ catalogWhatsApp: getBrazilianPhoneDisplay(event.target.value) })} /></label></div><Toggle label="Alerta de retirada grátis" help="Exibe o aviso de retirada nos balcões autorizados." checked={settingsDraft.topBarShowPickup} onChange={(value) => patchSettings({ topBarShowPickup: value })} /><SaveButton onClick={saveAppearance} label="Salvar aparência" /></SectionCard><SectionCard title="Identidade global" description="Logo, cor principal e domínios pertencem à Empresa & Marca e não são duplicados aqui."><Link href="/settings" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-xs font-bold text-primary"><Sparkles className="h-4 w-4" />Abrir Empresa & Marca</Link></SectionCard></div>}

      {activeTab === 'footer' && <div className="space-y-5"><SectionCard title="Dados exibidos no rodapé" description="Endereço e contatos continuam usando o cadastro canônico da empresa."><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border bg-secondary/10 p-4 text-xs"><span className="block text-[10px] font-black uppercase text-muted-foreground">Endereço da empresa</span><p className="mt-2 font-semibold text-foreground">{[company.street, company.number, company.neighborhood, company.city, company.state].filter(Boolean).join(', ') || 'Não informado'}</p></div><div className="rounded-xl border border-border bg-secondary/10 p-4 text-xs"><span className="block text-[10px] font-black uppercase text-muted-foreground">Contato da empresa</span><p className="mt-2 font-semibold text-foreground">{company.phone || company.email || 'Não informado'}</p></div></div><Toggle label="Exibir endereço físico" help="Desative para operações exclusivamente online." checked={settingsDraft.footerShowAddress} onChange={(value) => patchSettings({ footerShowAddress: value })} /><Link href="/settings" className="inline-flex min-h-11 items-center text-xs font-bold text-primary">Editar dados em Empresa & Marca</Link></SectionCard><SectionCard title="Horários do rodapé"><div className="grid gap-4 md:grid-cols-2"><label className="text-[10px] font-bold uppercase text-muted-foreground">Aviso de atendimento<input className={`${fieldClass} mt-1`} value={settingsDraft.footerHoursMessage} onChange={(event) => patchSettings({ footerHoursMessage: event.target.value })} /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">Horário da semana<input className={`${fieldClass} mt-1`} value={settingsDraft.footerHoursWeek} onChange={(event) => patchSettings({ footerHoursWeek: event.target.value })} /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">Descrição da semana<input className={`${fieldClass} mt-1`} value={settingsDraft.footerHoursSat} onChange={(event) => patchSettings({ footerHoursSat: event.target.value })} /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">Horário de sábado<input className={`${fieldClass} mt-1`} value={settingsDraft.footerHoursSatTime} onChange={(event) => patchSettings({ footerHoursSatTime: event.target.value })} /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">Descrição de sábado<input className={`${fieldClass} mt-1`} value={settingsDraft.footerHoursSatDesc} onChange={(event) => patchSettings({ footerHoursSatDesc: event.target.value })} /></label></div></SectionCard><SectionCard title="Redes sociais"><div className="grid gap-4 md:grid-cols-3"><label className="text-[10px] font-bold uppercase text-muted-foreground">Instagram<input className={`${fieldClass} mt-1`} value={companyDraft.instagram} onChange={(event) => setCompanyDraft((current) => ({ ...current, instagram: event.target.value }))} placeholder="/suapagina" /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">Facebook<input className={`${fieldClass} mt-1`} value={companyDraft.facebook} onChange={(event) => setCompanyDraft((current) => ({ ...current, facebook: event.target.value }))} placeholder="/suapagina" /></label><label className="text-[10px] font-bold uppercase text-muted-foreground">YouTube<input className={`${fieldClass} mt-1`} value={companyDraft.youtube} onChange={(event) => setCompanyDraft((current) => ({ ...current, youtube: event.target.value }))} placeholder="/seucanal" /></label></div></SectionCard>{footerGroups.map((group) => <SectionCard key={group.title} title={group.title}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{group.items.map(([key, label]) => <Toggle key={key} label={label} help="Controla a exibição no rodapé público." checked={footerDisplay[key]} onChange={(value) => setFooterDisplay((current) => ({ ...current, [key]: value }))} />)}</div></SectionCard>)}<SaveButton onClick={saveFooter} label="Salvar rodapé e redes" /></div>}

      {activeTab === 'policies' && <SectionCard title="Política de Devolução e Reembolso" description="O conteúdo existente é preservado no mesmo campo e exibido pela Store."><RichTextEditor value={companyDraft.refundPolicy} onChange={(refundPolicy) => setCompanyDraft((current) => ({ ...current, refundPolicy }))} placeholder="Escreva a política de troca, reembolso e devolução…" minHeightClass="min-h-[220px]" /><SaveButton onClick={savePolicies} label="Salvar política" /></SectionCard>}
    </div>
  );
}
