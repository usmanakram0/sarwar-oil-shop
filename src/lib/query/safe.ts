export function safeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

export function safeNumber(value: number | undefined | null, fallback = 0): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return value;
}

export function safeString(value: string | undefined | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function safeQueryFn<T>(fn: () => T, fallback: T): () => T {
  return () => {
    try {
      const result = fn();
      return result ?? fallback;
    } catch {
      return fallback;
    }
  };
}
