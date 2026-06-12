'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDatabase } from '@/context/database-context';

const THEME_PRESETS: Record<string, string> = {
  emerald: '#059669',
  blue: '#2563eb',
  violet: '#5b3df4',
  amber: '#d97706',
  rose: '#e11d48'
};

const DEFAULT_THEME_COLOR = '#5b3df4';

function normalizeThemeColor(themeColor?: string) {
  const color = themeColor || DEFAULT_THEME_COLOR;
  return THEME_PRESETS[color] || color;
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '').trim();
  const normalized = value.length === 3
    ? value.split('').map((char) => char + char).join('')
    : value;

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case red:
        h = (green - blue) / delta + (green < blue ? 6 : 0);
        break;
      case green:
        h = (blue - red) / delta + 2;
        break;
      default:
        h = (red - green) / delta + 4;
        break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function getReadableForeground(r: number, g: number, b: number) {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? '224 71% 4%' : '210 20% 98%';
}

function normalizeDomain(value: string = '') {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '');
}

function getHostname() {
  if (typeof window === 'undefined') return '';
  return normalizeDomain(window.location.hostname);
}

export function CompanyThemeSync() {
  const { company } = useDatabase();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const rgb = hexToRgb(normalizeThemeColor(company.theme_color));
    if (!rgb) return;

    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const root = document.documentElement;
    const primary = `${h} ${s}% ${l}%`;
    const accentLightness = Math.min(97, Math.max(90, l + 42));

    root.style.setProperty('--primary', primary);
    root.style.setProperty('--ring', primary);
    root.style.setProperty('--accent', `${h} ${Math.max(45, s)}% ${accentLightness}%`);
    root.style.setProperty('--accent-foreground', `${h} ${s}% ${Math.max(24, l - 20)}%`);
    root.style.setProperty('--primary-foreground', getReadableForeground(rgb.r, rgb.g, rgb.b));
  }, [company.theme_color]);

  useEffect(() => {
    const companyName = company.name?.trim();
    if (!companyName) return;

    const suffix = pathname === '/store' ? 'Catalogo Online' : 'ERP';
    document.title = `${companyName} - ${suffix}`;
  }, [company.name, pathname]);

  useEffect(() => {
    const hostname = getHostname();
    const adminDomain = normalizeDomain(company.admin_domain);
    const storeDomain = normalizeDomain(company.store_domain || company.custom_domain);
    if (!hostname || (!adminDomain && !storeDomain)) return;

    const isStoreHost = storeDomain && hostname === storeDomain;
    const isAdminHost = adminDomain && hostname === adminDomain;

    if (isStoreHost && pathname !== '/store') {
      router.replace('/store');
      return;
    }

    if (isAdminHost && (pathname === '/' || pathname === '/store')) {
      router.replace('/dashboard');
    }
  }, [company.admin_domain, company.custom_domain, company.store_domain, pathname, router]);

  return null;
}
