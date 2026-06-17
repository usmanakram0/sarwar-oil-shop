import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PRINT_BRIDGE_PORT || 9876);
const HOST = '127.0.0.1';

const BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findBrowser() {
  return BROWSER_PATHS.find((path) => existsSync(path)) || null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

async function htmlToPdf(html, pdfPath) {
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('Chrome or Edge is required for silent printing on this PC.');
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'oilshop-print-'));
  const htmlPath = join(tempDir, 'receipt.html');
  writeFileSync(htmlPath, html, 'utf8');

  try {
    await execFileAsync(
      browserPath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=10000',
        `--print-to-pdf=${pdfPath}`,
        htmlPath,
      ],
      { timeout: 45000, windowsHide: true }
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function printPdf(pdfPath, printerName) {
  const { print } = await import('pdf-to-printer');
  await print(pdfPath, {
    printer: printerName || undefined,
    silent: true,
  });
}

async function handlePrintRequest(body) {
  const html = typeof body.html === 'string' ? body.html : '';
  if (!html.trim()) {
    throw new Error('Missing receipt HTML');
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'oilshop-print-job-'));
  const pdfPath = join(tempDir, 'receipt.pdf');

  try {
    await htmlToPdf(html, pdfPath);
    await printPdf(pdfPath, body.printerName || process.env.PRINT_BRIDGE_PRINTER || '');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, { ok: true });
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, {
      ok: true,
      port: PORT,
      browser: findBrowser(),
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/print') {
    let rawBody = '';
    request.on('data', (chunk) => {
      rawBody += chunk;
    });

    request.on('end', async () => {
      try {
        const body = rawBody ? JSON.parse(rawBody) : {};
        await handlePrintRequest(body);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Print failed';
        sendJson(response, 500, { ok: false, message });
      }
    });
    return;
  }

  sendJson(response, 404, { ok: false, message: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Oil Shop print bridge running on http://${HOST}:${PORT}`);
  console.log('Keep this window open while printing from the app.');
});
