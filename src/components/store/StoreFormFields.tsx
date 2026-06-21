'use client';

export function StoreField({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const storeInputClass =
  'pf-input bg-white text-slate-900';

export const storeTextareaClass =
  'pf-textarea bg-white text-slate-900';
