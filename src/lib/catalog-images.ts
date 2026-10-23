import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadManagedImage } from '@/lib/media-upload-client';
import { validateProductImage } from '@/lib/product-images';
export async function uploadCatalogImage(client:SupabaseClient,file:File,options:{companyId:string;purpose:'hero-banner'|'commercial-banner'|'mega-menu';label?:string}) {
 const validation=validateProductImage(file);if(!validation.valid)throw new Error(validation.message);
 return (await uploadManagedImage(client,file,'catalog',options.purpose)).url;
}
