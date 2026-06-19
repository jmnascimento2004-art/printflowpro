'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useDatabase } from '@/context/database-context';
import { createBrandManifestUrl, resolveBranding } from '@/lib/branding/resolveBranding';

function ensureLink(rel: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function ensureMeta(selector: string, attrs: Record<string, string>) {
  let meta = document.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement('meta');
    Object.entries(attrs).forEach(([key, value]) => meta?.setAttribute(key, value));
    document.head.appendChild(meta);
  }
  return meta;
}

function absoluteUrl(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value, window.location.origin).href;
  } catch {
    return null;
  }
}

export function BrandingHeadSync() {
  const { company, settings } = useDatabase();
  const pathname = usePathname();

  useEffect(() => {
    const branding = resolveBranding(company, settings);
    const suffix = pathname === '/store' ? 'Catalogo Online' : 'ERP';
    const iconUrl = absoluteUrl(branding.faviconUrl || branding.logoUrl || branding.pwaIconUrl);
    const manifestUrl = createBrandManifestUrl({
      ...branding,
      pwaIconUrl: iconUrl || branding.pwaIconUrl
    });

    document.title = `${branding.appName} - ${suffix}`;

    ensureLink('manifest').href = manifestUrl;

    if (iconUrl) {
      ensureLink('icon').href = iconUrl;
      ensureLink('apple-touch-icon').href = `/api/pwa/icon?src=${encodeURIComponent(iconUrl)}&size=192`;
    }

    ensureMeta('meta[name="theme-color"]', { name: 'theme-color' }).content = branding.themeColor;
    ensureMeta('meta[name="application-name"]', { name: 'application-name' }).content = branding.appName;
    ensureMeta('meta[name="apple-mobile-web-app-title"]', { name: 'apple-mobile-web-app-title' }).content = branding.shortName;
    ensureMeta('meta[name="description"]', { name: 'description' }).content = branding.description;
  }, [company, settings, pathname]);

  return null;
}
