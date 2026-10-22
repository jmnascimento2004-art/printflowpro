import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveProductPrice,getProductConfigurator } from '@/lib/pricing';
import { resolveProductFields, type ProductFieldValues } from '@/lib/product-custom-fields';
import { parseStoreProductRequestInput } from './whatsapp-product-request';
import type { Product } from '@/lib/dummy-data';
import { rehydrateSizeGridPricingConfig } from '@/lib/whatsapp/customer-product-variable-resolver.server';
import { legacyStoreConfiguredMeters } from '@/lib/metric.mjs';

export async function priceStoreCart(client:SupabaseClient,companyId:string,raw:unknown) {
 if(!Array.isArray(raw)||!raw.length||raw.length>100)throw new Error('Carrinho inválido.');
 const inputs=raw.map(item=>{const input=parseStoreProductRequestInput(item);if(!input||!Number.isInteger(input.quantity))throw new Error('Configuração inválida.');return input;});
 const ids=[...new Set(inputs.map(i=>String(i.productId)))];
 const {data,error}=await client.from('products').select('id,company_id,category_id,name,pricing_type,sales_price,active,catalog_active,pricing_details,volume_pricing,updated_at,stock_controlled,current_stock').eq('company_id',companyId).in('id',ids).eq('active',true).eq('catalog_active',true);
 if(error || data?.length!==ids.length)throw new Error('Produto indisponível.');
 return inputs.map(input=>{
  const product=data.find(p=>p.id===input.productId) as Product;
  const fields=resolveProductFields(getProductConfigurator(product)?.custom_fields,input.fieldValues as ProductFieldValues||{});
  if(fields.errors.length)throw new Error(fields.errors[0]);
  const dimensions=input.dimensions as {width?:number;height?:number;length?:number}|undefined;
  const configurator=getProductConfigurator(product);const quantity=Number(input.quantity);
  if(configurator?.quote_on_request || quantity<Number(configurator?.min_quantity||1))throw new Error('Revise a configuração do produto.');
  if(product.stock_controlled&&quantity>Number(product.current_stock||0))throw new Error('Produto indisponível.');
  if(product.pricing_type==='m2' && !(Number(dimensions?.width)>0&&Number(dimensions?.height)>0))throw new Error('Revise a configuração do produto.');
  const linearArea=product.pricing_type==='linear'&&Number(configurator?.max_width)>0;
  if(product.pricing_type==='linear' && !linearArea && !(Number(dimensions?.length)>0))throw new Error('Revise a configuração do produto.');
  const measured=product.pricing_type==='m2'||product.pricing_type==='linear';
  if(measured && configurator){
   for(const [key,min,max] of [['width','min_width','max_width'],['height','min_height','max_height'],['length','min_length',null]] as const){
    const amount=Number(dimensions?.[key]||0);if(!amount)continue;
    const lower=legacyStoreConfiguredMeters(configurator[min],configurator.dimension_unit,0);
    const upper=max?legacyStoreConfiguredMeters(configurator[max],configurator.dimension_unit,0):0;
    if((lower&&amount<lower)||(upper&&amount>upper))throw new Error('Revise a configuração do produto.');
   }
  }
  const canonicalDimensions={...dimensions};
  if(linearArea){if(!(Number(dimensions?.width)>0&&Number(dimensions?.height)>0)||Number(dimensions?.height)<legacyStoreConfiguredMeters(configurator?.min_length,configurator?.dimension_unit,0))throw new Error('Revise a configuração do produto.');delete canonicalDimensions.length;}
  const grid=rehydrateSizeGridPricingConfig(product,{quantity,...canonicalDimensions,customOptions:{selectedOptions:input.selectedOptions as [],variantSelection:input.configurationSnapshot as object}});
  if(grid.isSizeGrid&&!grid.selectionRehydrated)throw new Error('Revise a configuração do produto.');
  const resolved=resolveProductPrice(product,grid.pricingConfig);
  if(!resolved.canPurchase || !resolved.isComplete || !Number.isFinite(resolved.totalPrice) || resolved.totalPrice<=0)throw new Error('Revise a configuração do produto.');
  const matrix=resolved.matchedMatrixRow;
  const configurationSnapshot=matrix||resolved.matchedTier||resolved.selectedQuantityTier?{sale_mode:matrix?'variant_matrix':'volume',material:matrix?.material,size:matrix?.size,colors:matrix?.colors,finishing:matrix?.finishing,quantity_tier:quantity,unit_price:resolved.unitPrice,total_price:resolved.totalPrice,display_label:matrix?[matrix.material,matrix.size,matrix.colors,matrix.finishing].filter(Boolean).join(' · '):`${quantity} unidades`,matrix_row_id:matrix?.id,production_time:resolved.productionTime,production_time_source:resolved.productionTimeSource}:undefined;
  return {product_id:product.id,product_version:product.updated_at,category_id:product.category_id,product_name:product.name,quantity,unit_price:resolved.unitPrice,total_price:resolved.totalPrice,
   details:{...canonicalDimensions,pricing_type:product.pricing_type,selected_options:resolved.selectedOptionsSnapshot,configuration_snapshot:configurationSnapshot,production_time:resolved.productionTime,production_time_source:resolved.productionTimeSource,pricing_snapshot:{quantity,unit_price:resolved.unitPrice,total_price:resolved.totalPrice,dimension_unit:'m',custom_fields:fields.snapshot}}};
 });
}
