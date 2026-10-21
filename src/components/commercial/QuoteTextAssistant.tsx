'use client';
import { useState } from 'react';
import type { Customer, Product, QuoteItem } from '@/lib/dummy-data';
import { interpretQuoteText, buildAssistedQuoteItem, type QuoteIntent } from '@/lib/quote-text-assistant';
import { resolveProductPrice, formatCurrency, type PricingConfig } from '@/lib/pricing';
import { ProductConfiguratorModal } from '@/components/store/ProductConfiguratorModal';

type ReviewItem = QuoteIntent & { config: PricingConfig; reviewed: boolean };
export function QuoteTextAssistant({ products, customers, onDraft, onClose }: {
  products: Product[]; customers: Customer[]; onDraft: (customerId: string, items: Omit<QuoteItem, 'id'>[]) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [configuring, setConfiguring] = useState<number | null>(null);
  const [error, setError] = useState('');
  const interpret = () => {
    const result = interpretQuoteText(text, products, customers);
    setItems(result.truncated ? [] : result.items.map(item => ({ ...item, config: { quantity: item.quantity, width: item.width, height: item.height, length: item.length }, reviewed: false })));
    setCustomerId(result.customerId);
    setError(result.truncated ? 'Texto muito longo. Use até 4.000 caracteres e 20 itens.' : '');
  };
  const update = (index: number, patch: Partial<ReviewItem>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const generate = () => {
    try {
      if (!items.length || items.some(item => !item.reviewed || item.measureNeedsReview)) throw new Error('Revise e confirme todos os itens antes de gerar o rascunho.');
      const draft = items.map(item => {
        const product = products.find(product => product.id === item.productId);
        if (!product) throw new Error('Selecione um produto cadastrado para cada item.');
        return buildAssistedQuoteItem(product, item.config, item.text);
      });
      onDraft(customerId, draft);
    } catch (error) { setError(error instanceof Error ? error.message : 'Revise os itens.'); }
  };
  const current = configuring === null ? null : items[configuring];
  const currentProduct = current ? products.find(product => product.id === current.productId) || null : null;
  return <section className="space-y-4 rounded-2xl border border-primary/20 bg-card p-5">
    <div className="flex justify-between gap-3"><h2 className="text-lg font-bold">Assistente de Orçamentos</h2><button type="button" onClick={onClose} className="text-sm text-muted-foreground">Fechar assistente</button></div>
    <p className="text-sm text-muted-foreground">Descreva os itens. A interpretação acontece neste navegador, sem serviço de IA externo. Você confirma produtos e medidas antes de abrir o editor. Nada é salvo ou enviado automaticamente.</p>
    <label className="block text-sm font-semibold">Texto do pedido<textarea aria-label="Texto do pedido" maxLength={4000} rows={3} value={text} onChange={event => { setText(event.target.value); setItems([]); }} placeholder="2 banners 1,20 x 0,80 e 500 cartões frente e verso" className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label>
    <button type="button" disabled={!text.trim()} onClick={interpret} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">Interpretar texto</button>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {items.length > 0 && <>
      <label className="block text-sm">Cliente (opcional nesta etapa)<select value={customerId} onChange={event => setCustomerId(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background p-2"><option value="">Selecionar no editor</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      {items.map((item, index) => {
        const product = products.find(product => product.id === item.productId);
        const resolution = product ? resolveProductPrice(product, item.config) : null;
        let valid = false;
        try { if (product) { buildAssistedQuoteItem(product, item.config, item.text); valid = true; } } catch { /* incomplete intent remains explicitly unresolved */ }
        return <article key={index} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{item.text}</p><span className="text-xs text-muted-foreground">Confiança {item.confidence.toLowerCase()}</span></div>
          <p className="text-xs text-muted-foreground">{item.warning}</p>
          <label className="block text-sm">Produto candidato<select aria-label={`Produto do item ${index + 1}`} value={item.productId} onChange={event => update(index, { productId: event.target.value, reviewed: false, config: { quantity: item.quantity, width: item.width, height: item.height, length: item.length } })} className="mt-1 block w-full rounded-lg border border-border bg-background p-2"><option value="">Escolha um produto</option>{products.map(product => <option key={product.id} value={product.id}>{item.candidateIds.includes(product.id) ? 'Sugestão: ' : ''}{product.name}</option>)}</select></label>
          <p className="text-sm">Quantidade interpretada: {item.quantity}. Configuração atual: {item.config.quantity} un{item.config.width ? ` · ${item.config.width} × ${item.config.height || '?'} m` : ''}{item.config.length ? ` · ${item.config.length} m` : ''}.</p>
          {item.measureNeedsReview && <p className="text-sm text-amber-700">Unidade ambígua: abra a configuração e informe as medidas em metros (ex.: 5 cm = 0,05 m).</p>}
          <button type="button" disabled={!product} onClick={() => setConfiguring(index)} className="rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">Revisar medidas e opções</button>
          <p className="text-sm font-bold">{valid && !item.measureNeedsReview ? `Preço canônico: ${formatCurrency(resolution?.totalPrice || 0)}` : 'Preço pendente de configuração'}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!valid || item.measureNeedsReview} checked={item.reviewed} onChange={event => update(index, { reviewed: event.target.checked })} />Conferi produto, quantidade, medidas e opções deste item</label>
        </article>;
      })}
      <button type="button" onClick={generate} disabled={items.some(item => !item.reviewed)} className="rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50">Gerar rascunho</button>
      <p className="text-xs text-muted-foreground">O rascunho abre no editor normal. Revise e salve por lá. Leitura de imagem/print fica para uma etapa futura.</p>
    </>}
    {currentProduct && current && configuring !== null && <ProductConfiguratorModal key={configuring} product={currentProduct} initialConfig={current.config} confirmLabel="Confirmar configuração" isOpen compact isFavorite={false} isFavoritePending={false} onToggleFavorite={() => {}} onClose={() => setConfiguring(null)} onAddToCart={payload => { update(configuring, { config: payload.pricing_config, measureNeedsReview: false, reviewed: false }); setConfiguring(null); }} />}
  </section>;
}
