import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  decodeImageDataUrl,
  fetchValidatedRemoteImage,
  parseAllowedImageHosts
} from '@/lib/security/remote-image.mjs';

export const runtime = 'nodejs';

const ALLOWED_SIZES = new Set([72, 96, 128, 144, 152, 192, 384, 512]);

function parseSize(value: string | null) {
  const size = Number(value || 192);
  return ALLOWED_SIZES.has(size) ? size : 192;
}

async function loadFallbackIcon() {
  return fs.readFile(path.join(process.cwd(), 'public', 'printflowpro-mark.svg'));
}

async function loadSourceImage(src: string) {
  if (!src) return loadFallbackIcon();

  if (src.startsWith('data:image/')) {
    return decodeImageDataUrl(src) || loadFallbackIcon();
  }

  const remoteImage = await fetchValidatedRemoteImage(src, {
    allowedHosts: parseAllowedImageHosts(process.env.PWA_ICON_ALLOWED_HOSTS)
  });
  return remoteImage || loadFallbackIcon();
}

export async function GET(request: NextRequest) {
  const size = parseSize(request.nextUrl.searchParams.get('size'));
  const src = request.nextUrl.searchParams.get('src') || '';

  try {
    const sourceImage = await loadSourceImage(src);
    const png = await sharp(sourceImage)
      .resize(size, size, { fit: 'contain', background: { r: 247, g: 249, b: 252, alpha: 1 } })
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    const fallback = await sharp(await loadFallbackIcon())
      .resize(size, size)
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(fallback), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store'
      }
    });
  }
}
