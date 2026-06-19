const BACKUP_SUFFIX = '__bak';

export class LocalStorageQuotaError extends Error {
  constructor(message = 'Device storage is full') {
    super(message);
    this.name = 'LocalStorageQuotaError';
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.code === 22 ||
    error.code === 1014
  );
}

/** Write primary value and keep the previous primary as backup. */
export function safeSetItem(key: string, value: string): void {
  try {
    const previous = localStorage.getItem(key);
    if (previous !== null && previous !== value) {
      localStorage.setItem(`${key}${BACKUP_SUFFIX}`, previous);
    }
    localStorage.setItem(key, value);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new LocalStorageQuotaError();
    }
    throw error;
  }
}

export function safeGetItem(key: string): string | null {
  return localStorage.getItem(key);
}

export function readJsonValue<T>(
  key: string,
  fallback: T,
  options?: { onRecovered?: () => void },
): T {
  const primaryRaw = localStorage.getItem(key);
  if (primaryRaw === null) return fallback;

  const parsed = tryParseJson<T>(primaryRaw);
  if (parsed !== undefined) return parsed;

  const backupRaw = localStorage.getItem(`${key}${BACKUP_SUFFIX}`);
  if (backupRaw) {
    const recovered = tryParseJson<T>(backupRaw);
    if (recovered !== undefined) {
      try {
        localStorage.setItem(key, backupRaw);
        options?.onRecovered?.();
      } catch {
        /* still return recovered value */
      }
      return recovered;
    }
  }

  return fallback;
}

export function writeJsonValue<T>(key: string, value: T): void {
  safeSetItem(key, JSON.stringify(value));
}

function tryParseJson<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
