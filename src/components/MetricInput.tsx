'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { parseMetricInput } from '@/lib/metric.mjs';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
};

/** Keep the draft string while typing so a decimal comma and trailing zero survive. */
export function MetricInput({ value, onValueChange, onBlur, onFocus, ...props }: Props) {
  const focused = useRef(false);
  const [draft, setDraft] = useState(String(value).replace('.', ','));
  useEffect(() => {
    if (focused.current) return;
    setDraft(current => parseMetricInput(current) === value ? current : String(value).replace('.', ','));
  }, [value]);
  return <input {...props} type="text" inputMode="decimal" value={draft}
    onFocus={event => { focused.current = true; onFocus?.(event); }}
    onChange={event => {
      const text = event.target.value;
      // Reject invalid characters instead of turning 1,25 into 125 or accepting negatives.
      if (text !== '' && !/^(?:\d*(?:[.,]\d*)?)$/.test(text)) return;
      setDraft(text);
      onValueChange(parseMetricInput(text) ?? 0);
    }}
    onBlur={event => {
      focused.current = false;
      if (parseMetricInput(draft) === null) setDraft(String(value).replace('.', ','));
      onBlur?.(event);
    }} />;
}
