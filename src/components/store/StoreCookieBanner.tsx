'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Cookie, Settings2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useStorePrivacy } from '@/context/store-privacy-context';
import { CookiePreferences, cookieCategoryLabels } from '@/lib/privacy';

export function StoreCookieBanner() {
  const pathname = usePathname();
  const {
    cookiePreferences,
    hasCookieChoice,
    saveCookiePreferences,
    acceptAllCookies,
    rejectNonEssentialCookies
  } = useStorePrivacy();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CookiePreferences>(cookiePreferences);
  const [saving, setSaving] = useState(false);

  if (!pathname?.startsWith('/store') || hasCookieChoice) return null;

  const updateDraft = (key: keyof CookiePreferences, value: boolean) => {
    if (key === 'necessary') return;
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    await saveCookiePreferences({ ...draft, necessary: true }, 'banner_preferences');
    setSaving(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[90] mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl md:bottom-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
          <Cookie className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-950">Preferências de cookies</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Usamos cookies necessários para login, carrinho, segurança e checkout. Cookies de preferências,
                análise e marketing só devem ser ativados com sua escolha.
              </p>
            </div>
            {open && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
                aria-label="Fechar preferências"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {open && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(Object.keys(cookieCategoryLabels) as Array<keyof CookiePreferences>).map((key) => {
                const item = cookieCategoryLabels[key];
                return (
                  <label key={key} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      disabled={key === 'necessary'}
                      onChange={(event) => updateDraft(key, event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs font-black text-slate-900">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => acceptAllCookies('banner_accept_all')}
              className="pf-button-primary min-h-11 px-4 text-xs"
            >
              Aceitar todos
            </button>
            <button
              type="button"
              onClick={() => rejectNonEssentialCookies('banner_reject_non_essential')}
              className="min-h-11 rounded-xl border border-slate-300 px-4 text-xs font-black text-slate-700"
            >
              Recusar não essenciais
            </button>
            {open ? (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="pf-button-primary min-h-11 px-4 text-xs disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar preferências'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-black text-slate-700"
              >
                <Settings2 className="h-4 w-4" />
                Gerenciar preferências
              </button>
            )}
            <Link href="/store/cookies" className="px-1 text-xs font-bold text-slate-500 underline-offset-4 hover:underline">
              Política de cookies
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
