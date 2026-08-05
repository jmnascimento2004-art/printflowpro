export async function withProductRequestLock<T>(
  locks: Set<string>,
  productId: string,
  operation: () => Promise<T>
): Promise<{ executed: false } | { executed: true; value: T }> {
  const lockKey = String(productId || '').trim();
  if (!lockKey || locks.has(lockKey)) return { executed: false };

  locks.add(lockKey);
  try {
    return { executed: true, value: await operation() };
  } finally {
    locks.delete(lockKey);
  }
}
