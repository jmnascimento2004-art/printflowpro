'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, MessageCircle, RotateCcw, Save, Search, Send, Settings2, Variable, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useDatabase } from '@/context/database-context';
import { buildWhatsAppUrl, renderConfiguredWhatsAppTemplate, resolveWhatsAppPreviewVariables, validateWhatsAppTemplate, WHATSAPP_TEMPLATE_MAX_LENGTH } from '@/lib/whatsapp';
import { getResolvedWhatsAppTemplates, loadWhatsAppCenter, restoreWhatsAppTemplate, saveWhatsAppSettings, saveWhatsAppTemplate } from '@/lib/whatsapp/service';
import { WHATSAPP_TEMPLATE_REGISTRY } from '@/lib/whatsapp/template-registry';
import type { WhatsAppMessageTemplate, WhatsAppSettings } from '@/lib/whatsapp/types';

type TabKey = 'templates' | 'settings';
type PendingNavigation = { kind: 'template'; value: string } | { kind: 'tab'; value: TabKey };

export default function WhatsAppCenterPage() {
  const { company } = useDatabase();
  const { activeProfile } = useAuth();
  const [tab, setTab] = useState<TabKey>('templates');
  const [templates, setTemplates] = useState<WhatsAppMessageTemplate[]>([]);
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [selectedEventKey, setSelectedEventKey] = useState<string>(WHATSAPP_TEMPLATE_REGISTRY[0].eventKey);
  const [content, setContent] = useState<string>(WHATSAPP_TEMPLATE_REGISTRY[0].defaultContent);
  const [active, setActive] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resolvedTemplates = useMemo(() => getResolvedWhatsAppTemplates(templates), [templates]);
  const selected = resolvedTemplates.find((item) => item.definition.eventKey === selectedEventKey) || resolvedTemplates[0];
  const validation = useMemo(() => validateWhatsAppTemplate(content, selected.definition), [content, selected.definition]);
  const previewVariables = useMemo(
    () => resolveWhatsAppPreviewVariables(selected.definition, company.name),
    [company.name, selected.definition]
  );
  const preview = useMemo(
    () => renderConfiguredWhatsAppTemplate(content, selected.definition, previewVariables, settings || undefined),
    [content, previewVariables, selected.definition, settings]
  );
  const categories = useMemo(() => ['Todas', ...new Set(WHATSAPP_TEMPLATE_REGISTRY.map((item) => item.category))], []);
  const filteredTemplates = resolvedTemplates.filter(({ definition }) => {
    const matchesSearch = `${definition.name} ${definition.description} ${definition.eventKey}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (category === 'Todas' || definition.category === category);
  });

  useEffect(() => {
    let mounted = true;
    if (!company.id) return;
    setLoading(true);
    void loadWhatsAppCenter(company.id).then((result) => {
      if (!mounted) return;
      setTemplates(result.templates);
      setSettings(result.settings);
      setUsedFallback(result.usedFallback);
      setTestPhone(result.settings.business_phone || '');
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [company.id]);

  useEffect(() => {
    const definition = WHATSAPP_TEMPLATE_REGISTRY.find((item) => item.eventKey === selectedEventKey) || WHATSAPP_TEMPLATE_REGISTRY[0];
    const custom = templates.find((item) => item.event_key === selectedEventKey);
    setContent(custom?.content || definition.defaultContent);
    setActive(custom?.active ?? definition.enabledByDefault);
    setDirty(false);
    setMessage(null);
    setError(null);
  }, [selectedEventKey, templates]);

  const requestNavigation = (next: PendingNavigation) => {
    if (dirty) setPendingNavigation(next);
    else applyNavigation(next);
  };

  const applyNavigation = (next: PendingNavigation) => {
    if (next.kind === 'template') setSelectedEventKey(next.value);
    else setTab(next.value);
    setPendingNavigation(null);
    setDirty(false);
  };

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    const token = `{{${variable}}}`;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${token}${content.slice(end)}`;
    setContent(next);
    setDirty(true);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSaveTemplate = async () => {
    if (!validation.valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveWhatsAppTemplate({
        companyId: company.id,
        eventKey: selected.definition.eventKey,
        content,
        active,
        userId: activeProfile.auth_user_id
      });
      setTemplates((current) => [...current.filter((item) => item.event_key !== saved.event_key), saved]);
      setDirty(false);
      setMessage('Modelo salvo para esta empresa.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o modelo.');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    setSaving(true);
    setError(null);
    try {
      await restoreWhatsAppTemplate(company.id, selected.definition.eventKey);
      setTemplates((current) => current.filter((item) => item.event_key !== selected.definition.eventKey));
      setContent(selected.definition.defaultContent);
      setActive(selected.definition.enabledByDefault);
      setDirty(false);
      setMessage('Texto padrão restaurado.');
    } catch {
      setError('Não foi possível restaurar o modelo.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveWhatsAppSettings(settings, activeProfile.auth_user_id);
      setSettings(saved);
      setTestPhone(saved.business_phone || '');
      setDirty(false);
      setMessage('Configurações salvas.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const testUrl = buildWhatsAppUrl(testPhone, preview, settings || undefined);

  if (loading || !settings) {
    return <div className="flex min-h-[55vh] items-center justify-center text-sm text-muted-foreground">Carregando Central de WhatsApp...</div>;
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 text-primary"><MessageCircle className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-wider">Atendimento</span></div>
        <h1 className="mt-2 text-xl font-black text-foreground">Central de WhatsApp</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Configure as mensagens utilizadas em orçamentos, pedidos, produção, pagamentos e atendimento ao cliente.</p>
      </header>

      {usedFallback && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Os modelos padrão continuam ativos. As personalizações estarão disponíveis quando a migration local for aplicada em um ambiente autorizado.</div>}
      {(message || error) && <div className={`rounded-xl border px-4 py-3 text-xs ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        <TabButton active={tab === 'templates'} onClick={() => requestNavigation({ kind: 'tab', value: 'templates' })} icon={<MessageCircle className="h-4 w-4" />}>Modelos de mensagens</TabButton>
        <TabButton active={tab === 'settings'} onClick={() => requestNavigation({ kind: 'tab', value: 'settings' })} icon={<Settings2 className="h-4 w-4" />}>Configurações</TabButton>
      </div>

      {tab === 'templates' ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[270px_minmax(0,1fr)_320px]">
          <aside className="rounded-2xl border border-border bg-card p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelo" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary" /></div>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary">{categories.map((item) => <option key={item}>{item}</option>)}</select>
            <div className="mt-3 space-y-2">
              {filteredTemplates.map(({ definition, custom }) => (
                <button key={definition.eventKey} type="button" onClick={() => requestNavigation({ kind: 'template', value: definition.eventKey })} className={`w-full rounded-xl border p-3 text-left transition ${selectedEventKey === definition.eventKey ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/60'}`}>
                  <div className="flex items-start justify-between gap-2"><span className="text-xs font-bold text-foreground">{definition.name}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${custom ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{custom ? 'Personalizado' : 'Padrão'}</span></div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{definition.category}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-black text-foreground">{selected.definition.name}</h2><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{selected.definition.description}</p><code className="mt-2 inline-block rounded bg-secondary px-2 py-1 text-[10px]">{selected.definition.eventKey}</code></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={active} onChange={(event) => { setActive(event.target.checked); setDirty(true); }} className="h-4 w-4" />Ativo</label></div>
            <textarea ref={textareaRef} value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); setMessage(null); }} maxLength={WHATSAPP_TEMPLATE_MAX_LENGTH + 100} className={`mt-4 min-h-[300px] w-full resize-y rounded-xl border bg-background p-3 font-mono text-xs leading-5 outline-none ${validation.valid ? 'border-border focus:border-primary' : 'border-rose-400'}`} aria-label="Conteúdo da mensagem" />
            <div className="mt-2 flex justify-between text-[10px]"><span className={validation.valid ? 'text-muted-foreground' : 'text-rose-600'}>{validation.errors[0] || 'Mensagem válida.'}</span><span className={content.length > WHATSAPP_TEMPLATE_MAX_LENGTH ? 'font-bold text-rose-600' : 'text-muted-foreground'}>{content.length}/{WHATSAPP_TEMPLATE_MAX_LENGTH}</span></div>
            <div className="mt-4"><div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-foreground"><Variable className="h-4 w-4" />Variáveis disponíveis</div><div className="flex flex-wrap gap-2">{selected.definition.allowedVariables.map((variable) => <button key={variable} type="button" onClick={() => insertVariable(variable)} className="min-h-11 rounded-lg border border-primary/20 bg-primary/5 px-2.5 font-mono text-[10px] text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{`{{${variable}}}`}</button>)}</div></div>
            <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={handleRestore} disabled={saving || !selected.custom} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40"><RotateCcw className="h-4 w-4" />Restaurar padrão</button><button type="button" onClick={handleSaveTemplate} disabled={saving || !validation.valid || !dirty} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar modelo'}</button></div>
          </section>

          <aside className="min-w-0 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="text-xs font-black text-foreground">Pré-visualização</h2><button type="button" aria-label="Copiar pré-visualização" onClick={() => void navigator.clipboard.writeText(preview)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-[10px] font-bold transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Clipboard className="h-3.5 w-3.5" />Copiar</button></div>
            <div className="mt-3 rounded-2xl bg-[#efeae2] p-3"><div className="ml-auto max-w-[95%] whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-[#d9fdd3] p-3 text-[11px] leading-5 text-slate-800 shadow-sm">{preview}</div></div>
            <button type="button" onClick={() => setTestOpen(true)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700"><Send className="h-4 w-4" />Testar mensagem</button>
          </aside>
        </div>
      ) : (
        <SettingsPanel settings={settings} onChange={(next) => { setSettings(next); setDirty(true); setMessage(null); }} saving={saving} onSave={handleSaveSettings} />
      )}

      {pendingNavigation && <ConfirmDialog title="Descartar alterações?" description="Existem alterações não salvas neste modelo." confirmLabel="Descartar e continuar" onCancel={() => setPendingNavigation(null)} onConfirm={() => applyNavigation(pendingNavigation)} />}
      {testOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="test-whatsapp-title">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="test-whatsapp-title" className="text-sm font-black">Testar mensagem</h2><button type="button" onClick={() => setTestOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-secondary" aria-label="Fechar"><X className="h-4 w-4" /></button></div><p className="mt-1 text-[11px] text-muted-foreground">Nenhuma mensagem será enviada automaticamente.</p><label className="mt-4 block text-xs font-bold">Número de teste<input value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="(51) 99999-9999" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary" /></label><div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-secondary/50 p-3 text-[11px] leading-5">{preview}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setTestOpen(false)} className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">Cancelar</button><a href={testUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!testUrl} onClick={(event) => { if (!testUrl) event.preventDefault(); else setTestOpen(false); }} className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white ${!testUrl ? 'pointer-events-none opacity-40' : 'hover:bg-emerald-700'}`}><Send className="h-4 w-4" />Confirmar e abrir</a></div></div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition sm:flex-none ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary'}`}>{icon}{children}</button>;
}

function SettingsPanel({ settings, onChange, saving, onSave }: { settings: WhatsAppSettings; onChange: (settings: WhatsAppSettings) => void; saving: boolean; onSave: () => void }) {
  return <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold">Código do país<input value={settings.country_code} onChange={(event) => onChange({ ...settings, country_code: event.target.value })} inputMode="numeric" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary" /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Exemplo: 55 para Brasil.</span></label><label className="text-xs font-bold">Número oficial da empresa<input value={settings.business_phone || ''} onChange={(event) => onChange({ ...settings, business_phone: event.target.value })} inputMode="tel" placeholder="(51) 99999-9999" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary" /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Opcional quando o fluxo usa o telefone do cliente.</span></label></div><label className="mt-4 block text-xs font-bold">Assinatura padrão<textarea value={settings.signature || ''} onChange={(event) => onChange({ ...settings, signature: event.target.value })} maxLength={500} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-xs outline-none focus:border-primary" /></label><label className="mt-4 block text-xs font-bold">Forma de abertura<select value={settings.open_mode} onChange={(event) => onChange({ ...settings, open_mode: event.target.value as WhatsAppSettings['open_mode'] })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary"><option value="auto">Automática (wa.me)</option><option value="web">WhatsApp Web</option><option value="app">Aplicativo / wa.me</option></select></label><div className="mt-4 space-y-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={settings.confirm_before_open} onChange={(event) => onChange({ ...settings, confirm_before_open: event.target.checked })} className="h-4 w-4" />Confirmar antes de abrir o WhatsApp</label><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={settings.include_company_name} onChange={(event) => onChange({ ...settings, include_company_name: event.target.checked })} className="h-4 w-4" />Incluir nome da empresa automaticamente</label></div><div className="mt-5 flex justify-end"><button type="button" onClick={onSave} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar configurações'}</button></div></section>;
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"><h2 id="confirm-title" className="text-sm font-black">{title}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">Continuar editando</button><button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white">{confirmLabel}</button></div></div></div>;
}
