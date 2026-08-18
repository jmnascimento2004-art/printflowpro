'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, MessagesSquare, Save, Send, Settings2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CustomMessageEditor, CustomMessageList } from '@/components/whatsapp/custom-message-workspace';
import {
  MessageEditor,
  MessagePreview,
  SystemMessageContextSelector,
  SystemMessageList,
  type WhatsAppContextOption,
  type WhatsAppContextResolutionStatus
} from '@/components/whatsapp/system-message-workspace';
import { useAuth } from '@/context/auth-context';
import { DEFAULT_ROLE_PERMISSIONS, useDatabase } from '@/context/database-context';
import type { Customer } from '@/lib/dummy-data';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import {
  buildWhatsAppUrl,
  getWhatsAppCustomVariables,
  renderWhatsAppCustomMessage,
  validateWhatsAppCustomMessage,
  validateWhatsAppTemplate,
  WHATSAPP_TEMPLATE_MAX_LENGTH
} from '@/lib/whatsapp';
import {
  createWhatsAppCustomMessage,
  deleteWhatsAppCustomMessage,
  listWhatsAppCustomMessages,
  updateWhatsAppCustomMessage,
  WhatsAppCustomMessageDataError
} from '@/lib/whatsapp/custom-message-service';
import {
  getResolvedWhatsAppTemplates,
  loadWhatsAppCenter,
  restoreWhatsAppTemplate,
  saveWhatsAppSettings,
  saveWhatsAppTemplate
} from '@/lib/whatsapp/service';
import { WHATSAPP_TEMPLATE_REGISTRY } from '@/lib/whatsapp/template-registry';
import { formatWhatsAppProductionStatus } from '@/lib/whatsapp/derived-values';
import type {
  WhatsAppCustomMessage,
  WhatsAppCustomMessageContext,
  WhatsAppMessageTemplate,
  WhatsAppSettings
} from '@/lib/whatsapp/types';
import type { WhatsAppEventKey } from '@/lib/whatsapp/variable-contract';

type TabKey = 'templates' | 'custom' | 'settings';
type ContextualEventKey = Exclude<WhatsAppEventKey, 'store_product_request'>;
type ContextResolutionData = {
  eventKey: WhatsAppEventKey;
  renderedContent: string;
  variables: Record<string, string>;
  recipientAvailable: boolean;
  testHref: string;
  missing: string[];
  contextSummary: string;
  variablesState: 'complete' | 'partial';
};
type ContextResolution =
  | { status: 'idle'; requestKey: '' }
  | { status: 'loading'; requestKey: string }
  | { status: 'resolved'; requestKey: string; data: ContextResolutionData }
  | { status: 'error'; requestKey: string; message: string };

const CONTEXTUAL_EVENT_KEYS = new Set<WhatsAppEventKey>([
  'quote_proposal',
  'order_payment_pending',
  'production_status_changed'
]);

function isContextualEventKey(value: string): value is ContextualEventKey {
  return CONTEXTUAL_EVENT_KEYS.has(value as WhatsAppEventKey);
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function formatPaymentStatus(value: string) {
  const labels: Record<string, string> = {
    pendente: 'Pagamento pendente',
    parcial: 'Pagamento parcial',
    pago: 'Pago',
    reembolsado: 'Reembolsado'
  };
  return labels[value] || value;
}
type PendingNavigation =
  | { kind: 'template'; value: string }
  | { kind: 'custom'; value: string }
  | { kind: 'new-custom' }
  | { kind: 'route'; value: string }
  | { kind: 'tab'; value: TabKey };

type DiscardedWhatsAppDraftInput = {
  tab: TabKey;
  systemContent: string;
  systemActive: boolean;
  customMessage?: WhatsAppCustomMessage;
  persistedSettings: WhatsAppSettings | null;
};

function resolveDiscardedWhatsAppDraft({
  tab,
  systemContent,
  systemActive,
  customMessage,
  persistedSettings
}: DiscardedWhatsAppDraftInput) {
  if (tab === 'templates') {
    return { kind: 'templates' as const, content: systemContent, active: systemActive, dirty: false };
  }
  if (tab === 'custom') {
    return {
      kind: 'custom' as const,
      name: customMessage?.name || '',
      content: customMessage?.content || '',
      contextType: customMessage?.contextType || 'generic' as const,
      creating: false,
      dirty: false
    };
  }
  return { kind: 'settings' as const, settings: persistedSettings, dirty: false };
}

const CUSTOM_PREVIEW_VALUES = {
  'empresa.nome': 'Sem valor configurado',
  'empresa.whatsapp': 'Sem valor configurado',
  'empresa.telefone': 'Sem valor configurado',
  'empresa.email': 'Sem valor configurado',
  'cliente.nome': 'Sem contexto selecionado',
  'cliente.nome_fantasia': 'Sem contexto selecionado',
  'cliente.whatsapp': 'Sem contexto selecionado',
  'cliente.email': 'Sem contexto selecionado'
} as const;

function customerPreviewValues(customer: Customer | undefined, base: Record<string, string>) {
  if (!customer) return base;
  return {
    ...base,
    'cliente.nome': customer.name || base['cliente.nome'],
    'cliente.nome_fantasia': customer.corporate_additional_info?.nome_fantasia || customer.name || base['cliente.nome_fantasia'],
    'cliente.whatsapp': customer.corporate_additional_info?.whatsapp || customer.phone || base['cliente.whatsapp'],
    'cliente.email': customer.email || base['cliente.email']
  };
}

function sortCustomMessages(messages: readonly WhatsAppCustomMessage[]) {
  return [...messages].sort((left, right) => {
    const byDate = right.updatedAt.localeCompare(left.updatedAt);
    return byDate || left.id.localeCompare(right.id);
  });
}

export default function WhatsAppCenterPage() {
  const router = useRouter();
  const { company, customers, products, quotes, orders, production, rolePermissions } = useDatabase();
  const { activeProfile, session } = useAuth();
  const [tab, setTab] = useState<TabKey>('templates');
  const [templates, setTemplates] = useState<WhatsAppMessageTemplate[]>([]);
  const [customMessages, setCustomMessages] = useState<WhatsAppCustomMessage[]>([]);
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [persistedSettings, setPersistedSettings] = useState<WhatsAppSettings | null>(null);
  const [selectedEventKey, setSelectedEventKey] = useState<string>(WHATSAPP_TEMPLATE_REGISTRY[0].eventKey);
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [customCreating, setCustomCreating] = useState(false);
  const [content, setContent] = useState<string>(WHATSAPP_TEMPLATE_REGISTRY[0].defaultContent);
  const [active, setActive] = useState(true);
  const [customName, setCustomName] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [customContext, setCustomContext] = useState<WhatsAppCustomMessageContext>('generic');
  const [systemSearch, setSystemSearch] = useState('');
  const [customSearch, setCustomSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testCustomerId, setTestCustomerId] = useState('');
  const [selectedContextId, setSelectedContextId] = useState('');
  const [contextSearch, setContextSearch] = useState('');
  const [contextResolution, setContextResolution] = useState<ContextResolution>({ status: 'idle', requestKey: '' });
  const systemTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const customTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextRequestSequenceRef = useRef(0);
  const contextAbortRef = useRef<AbortController | null>(null);

  const allowedWhatsAppRoles = rolePermissions['/whatsapp'] || DEFAULT_ROLE_PERMISSIONS['/whatsapp'] || [];
  const canMutateCustomMessages = activeProfile.role === 'admin'
    || (activeProfile.role === 'gerente' && allowedWhatsAppRoles.includes('gerente'));

  const resolvedTemplates = useMemo(() => getResolvedWhatsAppTemplates(templates), [templates]);
  const selected = resolvedTemplates.find((item) => item.definition.eventKey === selectedEventKey) || resolvedTemplates[0];
  const systemValidation = useMemo(() => validateWhatsAppTemplate(content, selected.definition), [content, selected.definition]);
  const contextualEvent = isContextualEventKey(selectedEventKey);
  const storeSampleOnly = selectedEventKey === 'store_product_request';
  const contextLabel = selectedEventKey === 'quote_proposal'
    ? 'Orçamento'
    : selectedEventKey === 'order_payment_pending'
      ? 'Pedido'
      : selectedEventKey === 'production_status_changed'
        ? 'Item de produção'
        : 'Produto';
  const allContextOptions = useMemo<WhatsAppContextOption[]>(() => {
    if (selectedEventKey === 'quote_proposal') {
      return quotes.map((quote) => ({
        id: quote.id,
        label: `ORC #${quote.number} — ${quote.customer_name || 'Cliente vinculado'}`,
        searchable: `${quote.number} ${quote.customer_name || ''} ${quote.status}`
      }));
    }
    if (selectedEventKey === 'order_payment_pending') {
      return orders.map((order) => ({
        id: order.id,
        label: `Pedido ${formatOrderDisplayNumber(order.number)} — ${order.customer_name || 'Cliente vinculado'} — ${formatPaymentStatus(order.payment_status)}`,
        searchable: `${order.number} ${formatOrderDisplayNumber(order.number)} ${order.customer_name || ''} ${order.payment_status}`
      }));
    }
    if (selectedEventKey === 'production_status_changed') {
      return production.map((item) => ({
        id: item.id,
        label: `${formatOrderDisplayNumber(item.order_number)} — ${item.product_name} — ${formatWhatsAppProductionStatus(item.status)}`,
        searchable: `${item.order_number} ${formatOrderDisplayNumber(item.order_number)} ${item.product_name} ${formatWhatsAppProductionStatus(item.status)}`
      }));
    }
    if (selectedEventKey === 'store_product_request') {
      return products
        .filter((product) => product.active !== false && product.catalog_active !== false)
        .map((product) => ({
          id: product.id,
          label: product.name,
          searchable: `${product.name} ${product.description || ''}`
        }));
    }
    return [];
  }, [orders, production, products, quotes, selectedEventKey]);
  const contextOptions = useMemo(() => {
    const query = normalizeSearch(contextSearch);
    const matches = query
      ? allContextOptions.filter((option) => normalizeSearch(option.searchable).includes(query))
      : allContextOptions;
    const visible = matches.slice(0, 50);
    const selectedOption = allContextOptions.find((option) => option.id === selectedContextId);
    return selectedOption && !visible.some((option) => option.id === selectedOption.id)
      ? [selectedOption, ...visible.slice(0, 49)]
      : visible;
  }, [allContextOptions, contextSearch, selectedContextId]);
  const currentContextRequestKey = tab === 'templates'
    ? `${selectedEventKey}:${selectedContextId || 'no-context'}:${content}`
    : '';
  const currentContextResolution = contextResolution.requestKey === currentContextRequestKey
    ? contextResolution
    : { status: 'idle', requestKey: '' } as ContextResolution;
  const effectiveContextStatus: WhatsAppContextResolutionStatus = currentContextRequestKey && currentContextResolution.status === 'idle'
    ? 'loading'
    : currentContextResolution.status;
  const resolvedSystemContext = currentContextResolution.status === 'resolved'
    ? currentContextResolution.data
    : null;
  const systemPreview = resolvedSystemContext?.renderedContent
    || (currentContextResolution.status === 'error'
      ? currentContextResolution.message
      : 'Validando no servidor os valores disponíveis para este modelo...');
  const systemPreviewMode: 'sample' | 'real' | 'loading' | 'error' = resolvedSystemContext
    ? selectedContextId ? 'real' : 'sample'
    : effectiveContextStatus === 'loading'
      ? 'loading'
      : currentContextResolution.status === 'error'
        ? 'error'
        : 'sample';
  const systemCanTest = Boolean(
    contextualEvent
    && resolvedSystemContext?.recipientAvailable
    && resolvedSystemContext.testHref
  );
  const systemTestDisabledReason = storeSampleOnly
    ? 'O teste desta mensagem é feito somente no fluxo real da Loja.'
    : !selectedContextId
      ? `Selecione explicitamente um ${contextLabel.toLocaleLowerCase('pt-BR')} para habilitar o teste.`
      : effectiveContextStatus === 'loading'
        ? 'Aguarde a validação do contexto.'
        : currentContextResolution.status === 'error'
          ? 'Corrija o problema do contexto antes de testar.'
          : resolvedSystemContext && !resolvedSystemContext.recipientAvailable
            ? 'Cliente sem WhatsApp cadastrado.'
            : 'A mensagem precisa ser resolvida com dados reais antes do teste.';
  const categories = useMemo(() => ['Todas', ...new Set(WHATSAPP_TEMPLATE_REGISTRY.map((item) => item.category))], []);
  const filteredTemplates = resolvedTemplates.filter(({ definition }) => {
    const searchable = `${definition.name} ${definition.description} ${definition.eventKey}`.toLocaleLowerCase('pt-BR');
    return searchable.includes(systemSearch.trim().toLocaleLowerCase('pt-BR'))
      && (category === 'Todas' || definition.category === category);
  });

  const selectedCustom = customMessages.find((item) => item.id === selectedCustomId);
  const customVisible = customCreating || Boolean(selectedCustom);
  const customValidation = useMemo(
    () => validateWhatsAppCustomMessage({ name: customName, content: customContent, contextType: customContext }),
    [customContent, customContext, customName]
  );
  const duplicateCustomName = customValidation.normalizedName.length > 0 && customMessages.some((item) => (
    item.id !== selectedCustomId
    && item.name.trim().toLocaleLowerCase('pt-BR') === customValidation.normalizedName.toLocaleLowerCase('pt-BR')
  ));
  const customErrors = duplicateCustomName
    ? [...customValidation.errors, 'Já existe uma mensagem com esse nome.']
    : customValidation.errors;
  const customPreviewValues = useMemo<Record<string, string>>(() => ({
    ...CUSTOM_PREVIEW_VALUES,
    'empresa.nome': company.name || CUSTOM_PREVIEW_VALUES['empresa.nome'],
    'empresa.whatsapp': settings?.business_phone || company.phone || CUSTOM_PREVIEW_VALUES['empresa.whatsapp'],
    'empresa.telefone': company.phone || CUSTOM_PREVIEW_VALUES['empresa.telefone'],
    'empresa.email': company.email || CUSTOM_PREVIEW_VALUES['empresa.email']
  }), [company.email, company.name, company.phone, settings?.business_phone]);
  const customPreview = useMemo(
    () => renderWhatsAppCustomMessage(customContent, customContext, customPreviewValues),
    [customContent, customContext, customPreviewValues]
  );
  const filteredCustomMessages = customMessages.filter((item) => (
    `${item.name} ${item.contextType}`.toLocaleLowerCase('pt-BR').includes(customSearch.trim().toLocaleLowerCase('pt-BR'))
  ));
  const selectedTestCustomer = customers.find((item) => item.id === testCustomerId);
  const customerRecipientRequired = tab === 'custom' && customContext === 'customer';
  const customerRecipientPhone = selectedTestCustomer
    ? selectedTestCustomer.corporate_additional_info?.whatsapp || selectedTestCustomer.phone || ''
    : '';
  const testPreview = tab === 'custom'
    ? renderWhatsAppCustomMessage(customContent, customContext, customerPreviewValues(selectedTestCustomer, customPreviewValues))
    : resolvedSystemContext?.renderedContent || systemPreview;
  const activePreview = tab === 'custom' ? customPreview : systemPreview;
  const customerRecipientUrl = customerRecipientRequired
    ? buildWhatsAppUrl(customerRecipientPhone, testPreview, settings || undefined)
    : '';
  const customerRecipientError = customerRecipientRequired
    ? !selectedTestCustomer
      ? 'Selecione um cliente para testar esta mensagem.'
      : !customerRecipientUrl
        ? 'O cliente selecionado não possui um telefone ou WhatsApp válido.'
        : null
    : null;
  const effectiveTestPhone = tab === 'templates'
    ? ''
    : customerRecipientRequired ? customerRecipientPhone : testPhone;
  const testUrl = tab === 'templates'
    ? resolvedSystemContext?.testHref || ''
    : customerRecipientRequired
      ? customerRecipientError ? '' : customerRecipientUrl
      : buildWhatsAppUrl(testPhone, testPreview, settings || undefined);

  useEffect(() => {
    let mounted = true;
    if (!company.id) return;
    setLoading(true);
    setError(null);
    void Promise.all([loadWhatsAppCenter(company.id), listWhatsAppCustomMessages(company.id)])
      .then(([center, custom]) => {
        if (!mounted) return;
        setTemplates(center.templates);
        setSettings(center.settings);
        setPersistedSettings(center.settings);
        setUsedFallback(center.usedFallback);
        setCustomMessages(sortCustomMessages(custom));
        setTestCustomerId('');
        setTestPhone(center.settings.business_phone || '');
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a Central de WhatsApp.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
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

  useEffect(() => {
    contextRequestSequenceRef.current += 1;
    contextAbortRef.current?.abort();
    contextAbortRef.current = null;
    setSelectedContextId('');
    setContextSearch('');
    setContextResolution({ status: 'idle', requestKey: '' });
    setTestOpen(false);
  }, [selectedEventKey]);

  useEffect(() => {
    if (tab === 'templates') return;
    contextRequestSequenceRef.current += 1;
    contextAbortRef.current?.abort();
    contextAbortRef.current = null;
    setSelectedContextId('');
    setContextSearch('');
    setContextResolution({ status: 'idle', requestKey: '' });
  }, [tab]);

  useEffect(() => {
    const sequence = ++contextRequestSequenceRef.current;
    contextAbortRef.current?.abort();
    contextAbortRef.current = null;

    if (tab !== 'templates') {
      setContextResolution({ status: 'idle', requestKey: '' });
      return;
    }

    const requestKey = `${selectedEventKey}:${selectedContextId || 'no-context'}:${content}`;
    if (!systemValidation.valid) {
      setContextResolution({
        status: 'error',
        requestKey,
        message: 'Corrija o conteúdo do modelo antes de resolver os dados reais.'
      });
      return;
    }
    if (!session?.access_token) {
      setContextResolution({
        status: 'error',
        requestKey,
        message: 'A sessão autenticada não está disponível para validar o contexto.'
      });
      return;
    }

    const controller = new AbortController();
    contextAbortRef.current = controller;
    setContextResolution({ status: 'loading', requestKey });
    const timer = window.setTimeout(() => {
      void fetch('/api/whatsapp/system-message/resolve', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          eventKey: selectedEventKey,
          ...(selectedContextId ? { contextId: selectedContextId } : {}),
          draftContent: content
        }),
        signal: controller.signal
      })
        .then(async (response) => {
          const payload = await response.json() as Partial<ContextResolutionData> & { error?: string };
          if (!response.ok) throw new Error(payload.error || 'Não foi possível validar o contexto.');
          if (
            payload.eventKey !== selectedEventKey
            || typeof payload.renderedContent !== 'string'
            || typeof payload.recipientAvailable !== 'boolean'
            || typeof payload.testHref !== 'string'
            || typeof payload.contextSummary !== 'string'
            || !payload.variables
            || typeof payload.variables !== 'object'
            || Array.isArray(payload.variables)
            || !Array.isArray(payload.missing)
            || (payload.variablesState !== 'complete' && payload.variablesState !== 'partial')
          ) {
            throw new Error('A resposta do contexto é inválida.');
          }
          if (sequence !== contextRequestSequenceRef.current || controller.signal.aborted) return;
          setContextResolution({
            status: 'resolved',
            requestKey,
            data: payload as ContextResolutionData
          });
        })
        .catch((resolutionError: unknown) => {
          if (controller.signal.aborted || sequence !== contextRequestSequenceRef.current) return;
          setContextResolution({
            status: 'error',
            requestKey,
            message: resolutionError instanceof Error
              ? resolutionError.message
              : 'Não foi possível validar o contexto.'
          });
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [content, selectedContextId, selectedEventKey, session?.access_token, systemValidation.valid, tab]);

  useEffect(() => {
    if (customCreating || !selectedCustomId) return;
    const current = customMessages.find((item) => item.id === selectedCustomId);
    if (!current) {
      setSelectedCustomId(null);
      return;
    }
    setCustomName(current.name);
    setCustomContent(current.content);
    setCustomContext(current.contextType);
    setDirty(false);
    setMessage(null);
    setError(null);
  }, [customCreating, customMessages, selectedCustomId]);

  useEffect(() => {
    if (!dirty) return;
    const confirmExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmExit);
    return () => window.removeEventListener('beforeunload', confirmExit);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation({ kind: 'route', value: `${destination.pathname}${destination.search}${destination.hash}` });
    };
    document.addEventListener('click', guardInternalNavigation, true);
    return () => document.removeEventListener('click', guardInternalNavigation, true);
  }, [dirty]);

  const restoreCurrentDraft = () => {
    const restored = resolveDiscardedWhatsAppDraft({
      tab,
      systemContent: selected.content,
      systemActive: selected.active,
      customMessage: selectedCustom,
      persistedSettings
    });
    if (restored.kind === 'templates') {
      setContent(restored.content);
      setActive(restored.active);
    }
    if (restored.kind === 'custom') {
      setCustomName(restored.name);
      setCustomContent(restored.content);
      setCustomContext(restored.contextType);
      setCustomCreating(restored.creating);
    }
    if (restored.kind === 'settings' && restored.settings) setSettings(restored.settings);
    setDirty(restored.dirty);
  };

  const applyNavigation = (next: PendingNavigation, discard = false) => {
    if (discard) restoreCurrentDraft();
    if (next.kind === 'template') setSelectedEventKey(next.value);
    if (next.kind === 'custom') {
      setSelectedCustomId(next.value);
      setCustomCreating(false);
    }
    if (next.kind === 'new-custom') {
      setSelectedCustomId(null);
      setCustomCreating(true);
      setCustomName('');
      setCustomContent('');
      setCustomContext('generic');
    }
    if (next.kind === 'route') router.push(next.value);
    if (next.kind === 'tab') setTab(next.value);
    setPendingNavigation(null);
    setMessage(null);
    setError(null);
  };

  const requestNavigation = (next: PendingNavigation) => {
    if (dirty) setPendingNavigation(next);
    else applyNavigation(next);
  };

  const insertVariable = (variable: string, target: 'system' | 'custom') => {
    const textarea = target === 'system' ? systemTextareaRef.current : customTextareaRef.current;
    const currentContent = target === 'system' ? content : customContent;
    const token = `{{${variable}}}`;
    const start = textarea?.selectionStart ?? currentContent.length;
    const end = textarea?.selectionEnd ?? currentContent.length;
    const next = `${currentContent.slice(0, start)}${token}${currentContent.slice(end)}`;
    if (target === 'system') setContent(next);
    else setCustomContent(next);
    setDirty(true);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSaveTemplate = async () => {
    if (!systemValidation.valid || saving) return;
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

  const handleSaveCustom = async () => {
    if (!canMutateCustomMessages || saving || customErrors.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const input = { name: customName, content: customContent, contextType: customContext };
      const saved = selectedCustom
        ? await updateWhatsAppCustomMessage(company.id, selectedCustom.id, { ...input, expectedUpdatedAt: selectedCustom.updatedAt })
        : await createWhatsAppCustomMessage(company.id, input);
      setCustomMessages((current) => sortCustomMessages([saved, ...current.filter((item) => item.id !== saved.id)]));
      setSelectedCustomId(saved.id);
      setCustomCreating(false);
      setCustomName(saved.name);
      setCustomContent(saved.content);
      setCustomContext(saved.contextType);
      setDirty(false);
      setMessage(selectedCustom ? 'Mensagem personalizada atualizada.' : 'Mensagem personalizada criada.');
    } catch (saveError) {
      if (saveError instanceof WhatsAppCustomMessageDataError && saveError.code === 'CONFLICT') {
        setError(`Conflito de edição: ${saveError.message}`);
      } else if (saveError instanceof WhatsAppCustomMessageDataError && saveError.code === 'DUPLICATE_NAME') {
        setError('Já existe uma mensagem personalizada com esse nome.');
      } else {
        setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a mensagem personalizada.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustom = async () => {
    if (!selectedCustom || !canMutateCustomMessages || saving) return;
    setSaving(true);
    setError(null);
    try {
      await deleteWhatsAppCustomMessage(company.id, selectedCustom.id);
      setCustomMessages((current) => current.filter((item) => item.id !== selectedCustom.id));
      setSelectedCustomId(null);
      setCustomCreating(false);
      setCustomName('');
      setCustomContent('');
      setCustomContext('generic');
      setDirty(false);
      setDeleteConfirmOpen(false);
      setMessage('Mensagem personalizada excluída.');
    } catch (deleteError) {
      setDeleteConfirmOpen(false);
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir a mensagem personalizada.');
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
      setPersistedSettings(saved);
      setTestPhone(saved.business_phone || '');
      setDirty(false);
      setMessage('Configurações salvas.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const openTest = () => {
    if (tab === 'templates' && !systemCanTest) return;
    setTestOpen(true);
  };

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(activePreview);
      setMessage('Pré-visualização copiada.');
    } catch {
      setError('Não foi possível copiar a pré-visualização.');
    }
  };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center text-sm text-muted-foreground">Carregando Central de WhatsApp...</div>;
  if (!settings) return <div className="flex min-h-[55vh] items-center justify-center text-sm text-rose-600">{error || 'Não foi possível carregar a Central de WhatsApp.'}</div>;

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <div className="flex items-center gap-2 text-primary"><MessageCircle className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-wider">Atendimento</span></div>
        <h1 className="mt-2 text-xl font-black text-foreground">Central de WhatsApp</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Configure as mensagens utilizadas em orçamentos, pedidos, produção, pagamentos e atendimento ao cliente.</p>
      </header>

      {usedFallback && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Os modelos padrão continuam ativos. As personalizações estarão disponíveis quando a migration local for aplicada em um ambiente autorizado.</div>}
      {(message || error) && <div role="status" className={`rounded-xl border px-4 py-3 text-xs ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}

      <div className="grid grid-cols-1 gap-1 rounded-xl border border-border bg-card p-1 sm:flex">
        <TabButton active={tab === 'templates'} onClick={() => requestNavigation({ kind: 'tab', value: 'templates' })} icon={<MessageCircle className="h-4 w-4" />}>Mensagens do Sistema</TabButton>
        <TabButton active={tab === 'custom'} onClick={() => requestNavigation({ kind: 'tab', value: 'custom' })} icon={<MessagesSquare className="h-4 w-4" />}>Mensagens Personalizadas</TabButton>
        <TabButton active={tab === 'settings'} onClick={() => requestNavigation({ kind: 'tab', value: 'settings' })} icon={<Settings2 className="h-4 w-4" />}>Configurações</TabButton>
      </div>

      {tab === 'templates' && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
          <SystemMessageList messages={filteredTemplates} selectedEventKey={selectedEventKey} search={systemSearch} category={category} categories={categories} onSearchChange={setSystemSearch} onCategoryChange={setCategory} onSelect={(eventKey) => requestNavigation({ kind: 'template', value: eventKey })} />
          <div className="min-w-0 space-y-4">
            <SystemMessageContextSelector
              sampleOnly={false}
              label={contextLabel}
              help={storeSampleOnly
                ? 'Escolha um produto real para inspecionar os dados disponíveis. Quantidade, medidas, opções e total dependem da configuração concluída no fluxo real da Loja.'
                : `Escolha um ${contextLabel.toLocaleLowerCase('pt-BR')} para gerar a mensagem com dados reais. A lista local serve somente para seleção; o servidor revalida empresa, acesso e registro.`}
              options={contextOptions}
              selectedId={selectedContextId}
              search={contextSearch}
              status={effectiveContextStatus}
              statusMessage={currentContextResolution.status === 'resolved'
                ? selectedContextId
                  ? 'Contexto validado no servidor. Prévia e teste usam a mesma resolução.'
                  : 'Valores da empresa validados no servidor. Variáveis contextuais aguardam uma seleção explícita.'
                : currentContextResolution.status === 'error'
                  ? currentContextResolution.message
                  : contextualEvent && !selectedContextId
                    ? 'Nenhum registro é selecionado automaticamente; somente valores reais da empresa são exibidos.'
                    : undefined}
              onSearchChange={setContextSearch}
              onSelect={setSelectedContextId}
            />
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <MessageEditor message={selected} content={content} active={active} validation={systemValidation} maxLength={WHATSAPP_TEMPLATE_MAX_LENGTH} saving={saving} dirty={dirty} resolvedVariables={resolvedSystemContext?.variables} resolutionStatus={effectiveContextStatus} textareaRef={systemTextareaRef} onContentChange={(value) => { setContent(value); setDirty(true); setMessage(null); }} onActiveChange={(value) => { setActive(value); setDirty(true); }} onInsertVariable={(variable) => insertVariable(variable, 'system')} onRestore={() => void handleRestore()} onSave={() => void handleSaveTemplate()} />
              <MessagePreview
                preview={systemPreview}
                mode={systemPreviewMode}
                contextSummary={resolvedSystemContext?.contextSummary}
                help={systemPreviewMode === 'sample'
                  ? storeSampleOnly
                    ? 'Valores da empresa resolvidos no servidor; variáveis de produto aguardam o fluxo real da Loja.'
                    : 'Valores da empresa resolvidos no servidor. Selecione um contexto para completar os demais campos.'
                  : resolvedSystemContext?.variablesState === 'partial'
                    ? 'Dados reais validados. Campos opcionais ausentes permanecem vazios.'
                    : 'Dados reais validados pelo servidor.'}
                testDisabled={!systemCanTest}
                testDisabledReason={systemTestDisabledReason}
                onCopy={() => void copyPreview()}
                onTest={openTest}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'custom' && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[270px_minmax(0,1fr)_320px]">
          <CustomMessageList messages={filteredCustomMessages} selectedId={selectedCustomId} search={customSearch} canMutate={canMutateCustomMessages} onSearchChange={setCustomSearch} onSelect={(id) => requestNavigation({ kind: 'custom', value: id })} onCreate={() => requestNavigation({ kind: 'new-custom' })} />
          <CustomMessageEditor visible={customVisible} isNew={customCreating} name={customName} content={customContent} contextType={customContext} allowedVariables={getWhatsAppCustomVariables(customContext)} errors={customErrors} maxLength={WHATSAPP_TEMPLATE_MAX_LENGTH} saving={saving} dirty={dirty} canMutate={canMutateCustomMessages} textareaRef={customTextareaRef} onNameChange={(value) => { setCustomName(value); setDirty(true); setMessage(null); }} onContentChange={(value) => { setCustomContent(value); setDirty(true); setMessage(null); }} onContextChange={(value) => { setCustomContext(value); setDirty(true); setMessage(null); }} onInsertVariable={(variable) => insertVariable(variable, 'custom')} onSave={() => void handleSaveCustom()} onDelete={() => setDeleteConfirmOpen(true)} />
          <MessagePreview preview={customVisible ? customPreview : 'A pré-visualização aparecerá aqui.'} onCopy={() => void copyPreview()} onTest={openTest} />
        </div>
      )}

      {tab === 'settings' && <SettingsPanel settings={settings} onChange={(next) => { setSettings(next); setDirty(true); setMessage(null); }} saving={saving} onSave={handleSaveSettings} />}

      {pendingNavigation && <ConfirmDialog title="Descartar alterações?" description="Existem alterações não salvas." confirmLabel="Descartar e continuar" onCancel={() => setPendingNavigation(null)} onConfirm={() => applyNavigation(pendingNavigation, true)} />}
      {deleteConfirmOpen && selectedCustom && <ConfirmDialog title="Excluir mensagem personalizada?" description={`A mensagem “${selectedCustom.name}” será excluída permanentemente.`} confirmLabel="Excluir mensagem" onCancel={() => setDeleteConfirmOpen(false)} onConfirm={() => void handleDeleteCustom()} />}
      {testOpen && <TestMessageDialog preview={testPreview} phone={effectiveTestPhone} url={testUrl} recipientError={customerRecipientError} customers={customers} customerId={testCustomerId} showCustomer={customerRecipientRequired} showPhone={tab === 'custom'} contextSummary={tab === 'templates' ? resolvedSystemContext?.contextSummary : undefined} onPhoneChange={setTestPhone} onCustomerChange={setTestCustomerId} onClose={() => setTestOpen(false)} />}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary'}`}>{icon}{children}</button>;
}

function SettingsPanel({ settings, onChange, saving, onSave }: { settings: WhatsAppSettings; onChange: (settings: WhatsAppSettings) => void; saving: boolean; onSave: () => void }) {
  return <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold">Código do país<input value={settings.country_code} onChange={(event) => onChange({ ...settings, country_code: event.target.value })} inputMode="numeric" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary" /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Exemplo: 55 para Brasil.</span></label><label className="text-xs font-bold">Número oficial da empresa<input value={settings.business_phone || ''} onChange={(event) => onChange({ ...settings, business_phone: event.target.value })} inputMode="tel" placeholder="(51) 99999-9999" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary" /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Opcional quando o fluxo usa o telefone do cliente.</span></label></div><label className="mt-4 block text-xs font-bold">Assinatura padrão<textarea value={settings.signature || ''} onChange={(event) => onChange({ ...settings, signature: event.target.value })} maxLength={500} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-xs outline-none focus:border-primary" /></label><label className="mt-4 block text-xs font-bold">Forma de abertura<select value={settings.open_mode} onChange={(event) => onChange({ ...settings, open_mode: event.target.value as WhatsAppSettings['open_mode'] })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary"><option value="auto">Automática (wa.me)</option><option value="web">WhatsApp Web</option><option value="app">Aplicativo / wa.me</option></select></label><div className="mt-4 space-y-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={settings.confirm_before_open} onChange={(event) => onChange({ ...settings, confirm_before_open: event.target.checked })} className="h-4 w-4" />Confirmar antes de abrir o WhatsApp</label><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={settings.include_company_name} onChange={(event) => onChange({ ...settings, include_company_name: event.target.checked })} className="h-4 w-4" />Incluir nome da empresa automaticamente</label></div><div className="mt-5 flex justify-end"><button type="button" onClick={onSave} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar configurações'}</button></div></section>;
}

function TestMessageDialog({ preview, phone, url, recipientError, customers, customerId, showCustomer, showPhone, contextSummary, onPhoneChange, onCustomerChange, onClose }: { preview: string; phone: string; url: string; recipientError: string | null; customers: readonly Customer[]; customerId: string; showCustomer: boolean; showPhone: boolean; contextSummary?: string; onPhoneChange: (value: string) => void; onCustomerChange: (value: string) => void; onClose: () => void }) {
  const canOpen = Boolean(url) && !recipientError;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="test-whatsapp-title"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="test-whatsapp-title" className="text-sm font-black">Testar mensagem</h2><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-secondary" aria-label="Fechar"><X className="h-4 w-4" /></button></div><p className="mt-1 text-[11px] text-muted-foreground">Nenhuma mensagem será enviada automaticamente.</p>{contextSummary && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">Contexto validado: {contextSummary}</p>}{showCustomer && <label className="mt-4 block text-xs font-bold">Cliente<select value={customerId} onChange={(event) => onCustomerChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary"><option value="">Selecione um cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>{customers.length === 0 && <span className="mt-1 block text-[10px] font-normal text-amber-700">Nenhum cliente está disponível no contexto já carregado.</span>}</label>}{showPhone && <label className="mt-4 block text-xs font-bold">Número de teste<input value={phone} onChange={(event) => onPhoneChange(event.target.value)} readOnly={showCustomer} placeholder="(51) 99999-9999" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary read-only:cursor-default read-only:opacity-70" /></label>}{recipientError && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-600">{recipientError}</p>}<div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-secondary/50 p-3 text-[11px] leading-5">{preview}</div><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">Cancelar</button><a href={canOpen ? url : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!canOpen} onClick={(event) => { if (!canOpen) event.preventDefault(); else onClose(); }} className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white ${!canOpen ? 'pointer-events-none opacity-40' : 'hover:bg-emerald-700'}`}><Send className="h-4 w-4" />Confirmar e abrir</a></div></div></div>;
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"><h2 id="confirm-title" className="text-sm font-black">{title}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">Continuar editando</button><button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white">{confirmLabel}</button></div></div></div>;
}
