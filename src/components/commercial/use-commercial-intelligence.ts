'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';

export function useCommercialIntelligence<T>(mode: 'dashboard' | 'ranking', period: string) {
  const { session, activeProfile } = useAuth();
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>({ key: '' });
  const [revision, setRevision] = useState(0);
  const key = `${activeProfile.company_id}:${session?.user.id}:${activeProfile.role}:${activeProfile.active}:${mode}:${period}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    if (!session?.access_token || !activeProfile.active) return;
    fetch(`/api/commercial-intelligence?mode=${mode}&period=${period}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: controller.signal
    }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Falha ao consultar indicadores.');
      if (!controller.signal.aborted) setResult({ key, data: value });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, mode, period, session?.access_token, activeProfile.active]);
  return { data: result.key === key ? result.data : undefined, error: result.key === key ? result.error : undefined, refresh: () => setRevision(value => value + 1) };
}
