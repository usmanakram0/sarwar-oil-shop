import { settingsStorage } from '@/lib/storage';

export const PRINT_BRIDGE_URL = 'http://127.0.0.1:9876';
const PRINT_BRIDGE_HEALTH_URL = `${PRINT_BRIDGE_URL}/health`;
const JOB_GAP_MS = 1400;

export type PrintMode = 'silent' | 'dialog';

export interface PrintJobOptions {
  printerName?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isPrintBridgeAvailable(): Promise<boolean> {
  try {
    const response = await fetch(PRINT_BRIDGE_HEALTH_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function printViaBridge(html: string, options?: PrintJobOptions): Promise<void> {
  const settings = settingsStorage.get();
  const printerName = options?.printerName || settings.printerName || undefined;

  const response = await fetch(`${PRINT_BRIDGE_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, printerName }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Print bridge failed');
  }
}

function printViaIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(() => {
        iframe.remove();
        resolve();
      }, 150);
    };

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        iframe.remove();
        reject(new Error('Could not open print frame'));
        return;
      }

      frameWindow.onafterprint = cleanup;
      window.setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } catch (error) {
          iframe.remove();
          reject(error instanceof Error ? error : new Error('Print failed'));
          return;
        }

        window.setTimeout(cleanup, 3000);
      }, 200);
    };

    iframe.onerror = () => {
      iframe.remove();
      reject(new Error('Could not load print frame'));
    };

    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

export async function printReceiptHtml(html: string, options?: PrintJobOptions): Promise<PrintMode> {
  const bridgeAvailable = await isPrintBridgeAvailable();

  if (bridgeAvailable) {
    await printViaBridge(html, options);
    return 'silent';
  }

  await printViaIframe(html);
  return 'dialog';
}

export async function printReceiptBatch(htmlDocuments: string[], options?: PrintJobOptions): Promise<PrintMode> {
  let mode: PrintMode = 'silent';

  for (let index = 0; index < htmlDocuments.length; index += 1) {
    const result = await printReceiptHtml(htmlDocuments[index], options);
    if (result === 'dialog') mode = 'dialog';
    if (index < htmlDocuments.length - 1) {
      await delay(JOB_GAP_MS);
    }
  }

  return mode;
}
