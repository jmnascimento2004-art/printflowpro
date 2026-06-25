const hasBrowser = () => typeof window !== 'undefined';

// Operational demo domains that still pass through DatabaseContext.
// Keep this list central while each domain is extracted to dedicated services/hooks.
export const OPERATIONAL_DEMO_STORAGE_KEYS = [
  'customers',
  'suppliers',
  'categories',
  'products',
  'quotes',
  'orders',
  'production',
  'financial',
  'shipments',
  'stockMovements',
  'pickupPoints',
  'banners',
  'sessions',
  'registerTransactions'
] as const;

export const isDemoFallbackAllowed = () => {
  if (!hasBrowser()) return false;
  return process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA === 'true';
};

export const persistDemoSnapshot = (key: string, value: unknown) => {
  if (!isDemoFallbackAllowed()) return;
  window.localStorage.setItem(`printflow_${key}`, JSON.stringify(value));
};

export const readDemoSnapshot = <T,>(key: string): T | null => {
  if (!isDemoFallbackAllowed()) return null;

  const stored = window.localStorage.getItem(`printflow_${key}`);
  if (!stored) return null;

  const parsed = JSON.parse(stored) as T | null | undefined;
  return parsed ?? null;
};

export const getOrSetDemoSnapshot = <T,>(key: string, defaultValue: T): T => {
  const stored = readDemoSnapshot<T>(key);
  if (stored !== null && stored !== undefined) return stored;

  persistDemoSnapshot(key, defaultValue);
  return defaultValue;
};

export const clearOperationalDemoSnapshots = () => {
  if (!isDemoFallbackAllowed()) return;
  OPERATIONAL_DEMO_STORAGE_KEYS.forEach((key) => {
    window.localStorage.setItem(`printflow_${key}`, '[]');
  });
};
