import type { Product, Category } from './dummy-data';
import { getNormalizedVariantPricingMatrix, getNormalizedVolumePricing, getProductConfigurator,resolveProductPrice } from './pricing';
import { normalizePublicProductSlug } from './store/product-permalink';

export const CATALOG_EVENTS = ['session_started','page_viewed','product_viewed','product_clicked','cart_item_added','cart_item_removed','checkout_started','search_performed','category_viewed','banner_clicked','coupon_applied'] as const;
export type CatalogEventType = typeof CATALOG_EVENTS[number];
export type CatalogEvent = { id: string; type: CatalogEventType; productId?: string; categoryId?: string; bannerId?: string; term?: string; results?: number };
export const catalogRate = (count: number, base: number) => base > 0 ? Math.round(count / base * 10000) / 100 : null;
/** Reject rather than retain accidentally entered contact/document/sensitive content. */
export function sanitizeCatalogSearch(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 60 || !/^[\p{L}\d -]{2,60}$/u.test(value) || /\d{5}/.test(value) || (value.match(/\d/g)||[]).length>=8) return null;
  const clean = value.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
  if (clean.length < 2 || /\b(email|e-mail|telefone|whatsapp|cpf|cnpj|senha|password|endereço|rua|avenida|cep|hiv|diagnóstico|religião)\b|cartão de crédito/iu.test(clean)) return null;
  return clean;
}
export function parseCatalogEvents(value: unknown): CatalogEvent[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Eventos inválidos.');
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || !CATALOG_EVENTS.includes(raw.type) || !/^[0-9a-f-]{36}$/i.test(raw.id)) throw new Error('Evento inválido.');
    if (Object.keys(raw).some(key=>!['id','type','productId','categoryId','bannerId','term','results'].includes(key))) throw new Error('Payload inválido.');
    const event: CatalogEvent = {id: raw.id, type: raw.type};
    for (const key of ['productId','categoryId','bannerId'] as const) {
      if (raw[key] !== undefined) {if(typeof raw[key]!=='string'||raw[key].length>128)throw new Error('Referência inválida.'); event[key]=raw[key];}
    }
    if (raw.type==='search_performed') {
      const term=sanitizeCatalogSearch(raw.term);
      if(!term || !Number.isInteger(raw.results) || raw.results<0 || raw.results>100000)throw new Error('Busca inválida.');
      event.term=term;event.results=raw.results;
    } else if(raw.term!==undefined || raw.results!==undefined)throw new Error('Metadados inválidos.');
    return event;
  });
}

export type CatalogMarketing = {
  active:boolean; text:string; background:string; foreground:string; cta:string; destination:string;
  couponCode:string; countdown:boolean; endsAt:string; sticky:boolean;
  socialActive:boolean; socialInterval:number; socialDuration:number; socialPosition:'top-left'|'top-right'; socialMax:1;
};
export const DEFAULT_CATALOG_MARKETING: CatalogMarketing = {active:false,text:'',background:'#5b3df4',foreground:'#ffffff',cta:'',destination:'',couponCode:'',countdown:false,endsAt:'',sticky:false,socialActive:false,socialInterval:30,socialDuration:5,socialPosition:'top-left',socialMax:1};
export function parseCatalogMarketing(raw: unknown): CatalogMarketing {
  const value = raw && typeof raw==='object' ? raw as Record<string,unknown> : {};
  const text = (key:string,max:number) => typeof value[key]==='string' ? String(value[key]).trim().slice(0,max) : '';
  const color = (key:string,fallback:string) => /^#[0-9a-f]{6}$/i.test(text(key,7)) ? text(key,7) : fallback;
  const destination=text('destination',1000);
  // Only controlled Store paths, explicit HTTP(S), WhatsApp; never protocol-relative URLs.
  if(destination && !/^\/store(?:[/?]|$)/.test(destination) && !/^https?:\/\/[^\s\\]+$/i.test(destination))throw new Error('Destino inválido.');
  const endsAt=text('endsAt',40);
  if(endsAt && !Number.isFinite(Date.parse(endsAt)))throw new Error('Data inválida.');
  return {active:value.active===true,text:text('text',240),background:color('background','#5b3df4'),foreground:color('foreground','#ffffff'),cta:text('cta',40),destination,couponCode:text('couponCode',32).toUpperCase(),countdown:value.countdown===true,endsAt,sticky:value.sticky===true,socialActive:value.socialActive===true,socialInterval:Math.max(15,Math.min(300,Number(value.socialInterval)||30)),socialDuration:Math.max(3,Math.min(10,Number(value.socialDuration)||5)),socialPosition:value.socialPosition==='top-right'?'top-right':'top-left',socialMax:1};
}
export function marketingVisible(marketing:CatalogMarketing,now=Date.now()) { return marketing.active && Boolean(marketing.text) && (!marketing.endsAt || Date.parse(marketing.endsAt)>now); }

export function catalogQuality(products: Product[], categories: Category[]) {
  const categoryIds=new Set(categories.map(c=>c.id));
  return products.map(p=>{
    const issues:string[]=[]; const details=p.pricing_details;
    if(!p.image_url && !details?.gallery_images?.length)issues.push('Sem imagem');
    if(!p.description?.replace(/<[^>]*>/g,'').trim())issues.push('Sem descrição');
    if(!p.category_id || !categoryIds.has(p.category_id))issues.push('Sem categoria');
    const matrix=getNormalizedVariantPricingMatrix(p),tiers=getNormalizedVolumePricing(p);
    const quoteOnly=Boolean(details?.configurator_options?.quote_on_request);
    if(!quoteOnly && !(Number(p.sales_price)>0) && !tiers.some(t=>t.total>0) && !matrix.some(r=>r.tiers.some(t=>t.total>0)))issues.push('Sem preço');
    if(resolveProductPrice(p).productionTimeSource==='fallback' && !matrix.some(r=>r.tiers.some(t=>t.productionTime)) && !tiers.some(t=>t.productionTime))issues.push('Sem prazo');
    if(p.stock_controlled && !(Number(p.current_stock)>0))issues.push('Sem estoque');
    if(!p.slug || normalizePublicProductSlug(p.slug)!==p.slug)issues.push('Permalink inválido');
    const config=getProductConfigurator(p);
    if(config?.option_groups?.some(g=>g.required && !g.options?.length))issues.push('Configuração obrigatória incompleta');
    if(p.active===false || p.catalog_active===false)issues.push('Inativo no catálogo');
    if(!(Number(p.base_cost)>0))issues.push('Sem custo para margem');
    return {product:p,issues};
  }).filter(row=>row.issues.length);
}

export function emptyCatalogCategories(products:Product[],categories:Category[]) {
 const parents=new Map(categories.map(category=>[category.id,category.parent_id]));
 const populated=new Set<string>();
 for(const product of products){
  if(!product.active||product.catalog_active===false)continue;
  let id:string|undefined|null=product.category_id;const visited=new Set<string>();
  while(id&&!visited.has(id)){visited.add(id);populated.add(id);id=parents.get(id);}
 }
 return categories.filter(category=>category.show_in_catalog!==false&&!populated.has(category.id));
}
