export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export function parseProductVideo(value) {
  if (value === '' || value == null) return null;
  if (typeof value !== 'string' || value.length > 500) throw new Error('URL de vídeo inválida.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Use uma URL HTTPS do YouTube ou Vimeo.');
  let id;
  if (['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed)\/([^/]+)$/.exec(url.pathname)?.[1];
    if (!/^[\w-]{11}$/.test(id || '')) throw new Error('Vídeo YouTube inválido.');
    return {provider:'youtube',id,url:`https://www.youtube.com/watch?v=${id}`,embed:`https://www.youtube-nocookie.com/embed/${id}?autoplay=0`,thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`};
  }
  if (url.hostname === 'youtu.be' && /^\/[\w-]{11}$/.test(url.pathname)) return parseProductVideo(`https://www.youtube.com/watch?v=${url.pathname.slice(1)}`);
  if (['vimeo.com','www.vimeo.com'].includes(url.hostname) && /^\/[0-9]{6,12}$/.test(url.pathname)) {
    id=url.pathname.slice(1);return {provider:'vimeo',id,url:`https://vimeo.com/${id}`,embed:`https://player.vimeo.com/video/${id}?autoplay=0&dnt=1`,thumbnail:null};
  }
  throw new Error('Use somente YouTube ou Vimeo.');
}
export function parseReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!['rating','comment'].includes(k))) throw new Error('Avaliação inválida.');
  if (!Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5) throw new Error('Selecione uma nota de 1 a 5.');
  if (value.comment !== undefined && typeof value.comment !== 'string') throw new Error('Comentário inválido.');
  const comment=(value.comment || '').replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
  if ([...comment].length>1000 || /@|(?:\d[ .()+/-]*){8,}|https?:\/\//i.test(comment)) throw new Error('Use até 1.000 caracteres, sem dados pessoais ou links.');
  return {rating:value.rating,comment};
}
