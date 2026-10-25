import type {Company} from '@/lib/dummy-data';
type LogoFields=Pick<Company,'logo_url'|'logo_light'|'logo_dark'>;
/** Server-rendered documents only fetch images from this project's Storage. */
export function sanitizePdfLogos(company:LogoFields,storageUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://invalid.local'):LogoFields{
 const logos={logo_url:company.logo_url,logo_light:company.logo_light,logo_dark:company.logo_dark};
 for(const key of ['logo_url','logo_light','logo_dark'] as const){const value=logos[key];if(!value)continue;try{const url=new URL(value),storage=new URL(storageUrl);if(!(url.protocol==='https:'&&url.origin===storage.origin&&url.pathname.startsWith('/storage/v1/object/'))&&!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value))logos[key]=undefined;}catch{logos[key]=undefined;}}
 return logos;
}
