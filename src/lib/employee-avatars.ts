import type { SupabaseClient } from '@supabase/supabase-js';

export const EMPLOYEE_AVATAR_BUCKET = 'product-images';
export const MAX_EMPLOYEE_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

const ACCEPTED_EMPLOYEE_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const safePathSegment = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'registro';

const getExtension = (file: File) => {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

export function validateEmployeeAvatar(file: File) {
  if (!ACCEPTED_EMPLOYEE_AVATAR_TYPES.has(file.type)) {
    return { valid: false as const, message: 'Selecione uma imagem JPG, PNG ou WEBP.' };
  }

  if (file.size > MAX_EMPLOYEE_AVATAR_SIZE_BYTES) {
    return { valid: false as const, message: 'A foto deve ter no máximo 2 MB.' };
  }

  return { valid: true as const };
}

export async function uploadEmployeeAvatar(
  supabaseClient: SupabaseClient,
  file: File,
  options: { companyId: string; profileId: string }
) {
  const validation = validateEmployeeAvatar(file);
  if (!validation.valid) throw new Error(validation.message);

  const extension = getExtension(file);
  const path = `${safePathSegment(options.companyId)}/avatars/${safePathSegment(options.profileId)}/${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage
    .from(EMPLOYEE_AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Não foi possível enviar a foto: ${error.message}`);
  }

  const { data } = supabaseClient.storage.from(EMPLOYEE_AVATAR_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    await supabaseClient.storage.from(EMPLOYEE_AVATAR_BUCKET).remove([path]);
    throw new Error('Não foi possível gerar o endereço público da foto.');
  }

  return { publicUrl: data.publicUrl, path };
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

export async function removeEmployeeAvatar(supabaseClient: SupabaseClient, path: string | null | undefined) {
  if (!path) return;
  const { error } = await supabaseClient.storage.from(EMPLOYEE_AVATAR_BUCKET).remove([path]);
  if (error) throw new Error(`Não foi possível remover a foto anterior: ${error.message}`);
}
