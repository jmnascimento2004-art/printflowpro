import { uploadManagedImage } from '@/lib/media-upload-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export const EMPLOYEE_AVATAR_BUCKET = 'product-images';
export const MAX_EMPLOYEE_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

const ACCEPTED_EMPLOYEE_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export function validateEmployeeAvatar(file: File) {
  if (!ACCEPTED_EMPLOYEE_AVATAR_TYPES.has(file.type)) {
    return { valid: false as const, message: 'Selecione uma imagem JPG, PNG ou WEBP.' };
  }

  if (file.size > MAX_EMPLOYEE_AVATAR_SIZE_BYTES) {
    return { valid: false as const, message: 'A foto deve ter no máximo 2 MB.' };
  }

  return { valid: true as const };
}

export async function uploadEmployeeAvatar(client:SupabaseClient,file:File,options:{companyId:string;profileId:string}) {
 const validation=validateEmployeeAvatar(file);if(!validation.valid)throw new Error(validation.message);
 const asset=await uploadManagedImage(client,file,'avatars',options.profileId);return {publicUrl:asset.url,path:asset.path};
}

export function getEmployeeAvatarStoragePath(url: string | null | undefined) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${EMPLOYEE_AVATAR_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;

  const encodedPath = url.slice(markerIndex + marker.length).split('?')[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

/** Detach happens on the profile. Retain shared assets; automated physical deletion is intentionally disabled. */
export async function removeEmployeeAvatar(client:SupabaseClient,path:string|null|undefined) { void client; void path; }
