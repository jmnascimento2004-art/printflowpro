'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useDatabase } from '@/context/database-context';
import {
  createBrandManifestUrl,
  createStoreBrandManifestUrl,
  resolveBranding
} from '@/lib/branding/resolveBranding';

function ensureLink(rel: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function getPublicBrandIconUrl(size: number, version: string) {
  return `/api/public/branding/icon?size=${size}&v=${encodeURIComponent(version)}`;
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
    const isStorePath = pathname === '/store' || pathname.startsWith('/store/');
    const appTitle = isStorePath ? `Catálogo - ${branding.appName}` : `Dashboard - ${branding.appName}`;
    const shortTitle = isStorePath ? 'Catálogo' : 'Dashboard';
    const iconUrl = absoluteUrl(branding.effectiveIconUrl);
    const publicIconUrl = getPublicBrandIconUrl(192, branding.brandingVersion);
    const manifestBranding = {
      ...branding,
      effectiveIconUrl: iconUrl || branding.effectiveIconUrl
    };
    const manifestUrl = isStorePath
      ? createStoreBrandManifestUrl(manifestBranding)
      : createBrandManifestUrl(manifestBranding);

    document.title = appTitle;

    ensureLink('manifest').href = manifestUrl;

    ensureLink('icon').href = iconUrl || publicIconUrl;
    ensureLink('shortcut icon').href = iconUrl || publicIconUrl;
    ensureLink('apple-touch-icon').href = publicIconUrl;

    ensureMeta('meta[name="theme-color"]', { name: 'theme-color' }).content = branding.themeColor;
    ensureMeta('meta[name="application-name"]', { name: 'application-name' }).content = appTitle;
    ensureMeta('meta[name="apple-mobile-web-app-title"]', { name: 'apple-mobile-web-app-title' }).content = shortTitle;
    ensureMeta('meta[name="description"]', { name: 'description' }).content = branding.description;
    ensureMeta('meta[property="og:title"]', { property: 'og:title' }).content = appTitle;
    ensureMeta('meta[property="og:description"]', { property: 'og:description' }).content = branding.description;
    ensureMeta('meta[property="og:image"]', { property: 'og:image' }).content = new URL(getPublicBrandIconUrl(512, branding.brandingVersion), window.location.origin).href;
    ensureMeta('meta[property="og:site_name"]', { property: 'og:site_name' }).content = appTitle;
  }, [company, settings, pathname]);

  return null;
}
