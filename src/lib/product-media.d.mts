export const MAX_IMAGES: number;
export const MAX_IMAGE_BYTES: number;
export type ProductVideo = {provider:'youtube'|'vimeo';id:string;url:string;embed:string;thumbnail:string|null};
export function parseProductVideo(value:unknown):ProductVideo|null;
export function parseReview(value:unknown):{rating:number;comment:string};
