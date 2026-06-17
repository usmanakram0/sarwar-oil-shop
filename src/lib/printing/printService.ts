const JOB_GAP_MS = 1400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function printReceiptHtml(html: string): Promise<void> {
  await printViaIframe(html);
}

export async function printReceiptBatch(htmlDocuments: string[]): Promise<void> {
  for (let index = 0; index < htmlDocuments.length; index += 1) {
    await printReceiptHtml(htmlDocuments[index]);
    if (index < htmlDocuments.length - 1) {
      await delay(JOB_GAP_MS);
    }
  }
}
