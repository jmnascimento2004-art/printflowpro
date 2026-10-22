// Presentation boundary: never display backend diagnostics in a toast.
export function feedbackMessage(message) {
  if (typeof message !== 'string' || !message.trim()) return 'Não foi possível concluir a ação. Tente novamente.';
  if (/\b(SQL|SQLSTATE|SELECT|INSERT|UPDATE|DELETE|PostgREST|Supabase|PGRST\w*|JWT|stack|service_role|access_token|refresh_token)\b|\bat\s+\w+\s*\(|eyJ[A-Za-z0-9_-]{12,}/i.test(message)) {
    return 'Não foi possível concluir a ação. Tente novamente.';
  }
  return message;
}
