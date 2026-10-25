'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
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

function syncIconLinks(rel: string, href: string) {
  ensureLink(rel);
  document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`).forEach((link) => {
    const absoluteHref = new URL(href, window.location.origin).href;
    if (link.href !== absoluteHref) link.href = absoluteHref;
  });
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
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const branding = resolveBranding(company, settings);
    const isStorePath = pathname === '/store' || pathname.startsWith('/store/');
    const isStoreProductPath = pathname.startsWith('/store/product/');
    const appTitle = isStorePath ? `Catálogo - ${branding.appName}` : `Dashboard - ${branding.appName}`;
    const shortTitle = isStorePath ? 'Catálogo' : 'Dashboard';
    const isLogin = !isStorePath && !isAuthenticated;
    const loginIcon = '/brands/printflowpro-favicon.png';
    const iconUrl = absoluteUrl(isLogin ? loginIcon : branding.effectiveIconUrl);
    const publicIconUrl = getPublicBrandIconUrl(192, branding.brandingVersion);
    const manifestBranding = {
      ...branding,
      effectiveIconUrl: iconUrl || branding.effectiveIconUrl
    };
    const manifestUrl = isStorePath
      ? createStoreBrandManifestUrl(manifestBranding)
      : createBrandManifestUrl(manifestBranding);

    if (!isStoreProductPath) document.title = appTitle;

    ensureLink('manifest').href = manifestUrl;

    const syncIcons = () => {
      syncIconLinks('icon', iconUrl || publicIconUrl);
      syncIconLinks('shortcut icon', iconUrl || publicIconUrl);
      syncIconLinks('apple-touch-icon', isLogin ? loginIcon : publicIconUrl);
    };
    syncIcons();

    ensureMeta('meta[name="theme-color"]', { name: 'theme-color' }).content = branding.themeColor;
    ensureMeta('meta[name="application-name"]', { name: 'application-name' }).content = appTitle;
    ensureMeta('meta[name="apple-mobile-web-app-title"]', { name: 'apple-mobile-web-app-title' }).content = shortTitle;
    if (!isStoreProductPath) {
      ensureMeta('meta[name="description"]', { name: 'description' }).content = branding.description;
      ensureMeta('meta[property="og:title"]', { property: 'og:title' }).content = appTitle;
      ensureMeta('meta[property="og:description"]', { property: 'og:description' }).content = branding.description;
      ensureMeta('meta[property="og:image"]', { property: 'og:image' }).content = new URL(getPublicBrandIconUrl(512, branding.brandingVersion), window.location.origin).href;
    }
    ensureMeta('meta[property="og:site_name"]', { property: 'og:site_name' }).content = appTitle;

    // Next may stream additional metadata links after the login has mounted.
    if (isLogin) {
      const observer = new MutationObserver(syncIcons);
      observer.observe(document.head, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
  }, [company, settings, pathname, isAuthenticated]);

  return null;
}
