const NETWORK_PROBE_URL = 'https://www.gstatic.com/generate_204';

export function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('load failed')
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('network request failed') ||
      message.includes('err_network')
    );
  }

  return false;
}

export function formatCloudSyncError(error: unknown, table?: string): string {
  if (isRetryableNetworkError(error)) {
    return table
      ? `Cloud upload paused (${table}) — internet was not ready. Your data is safe on this device.`
      : 'Cloud upload paused — internet was not ready. Your data is safe on this device.';
  }

  if (error instanceof Error) {
    if (table && error.message.startsWith(`${table}:`)) {
      return `Cloud upload failed (${table}). Your data is safe on this device.`;
    }
    return `Cloud upload failed: ${error.message}. Your data is safe on this device.`;
  }

  return 'Cloud upload failed. Your data is safe on this device.';
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the browser reports online and a lightweight probe succeeds. */
export async function waitForNetworkReady(options?: {
  maxAttempts?: number;
  delayMs?: number;
}): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const delayMs = options?.delayMs ?? 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!navigator.onLine) {
      await delay(delayMs);
      continue;
    }

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      await fetch(NETWORK_PROBE_URL, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      return true;
    } catch {
      await delay(delayMs);
    }
  }

  return navigator.onLine;
}

export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1200;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const canRetry = isRetryableNetworkError(error) && attempt < attempts - 1;
      if (!canRetry) break;
      await delay(baseDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}
