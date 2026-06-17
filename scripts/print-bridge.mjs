import http from 'node:http';
import { existsSync, mkdtempSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const PORT = Number(process.env.PRINT_BRIDGE_PORT || 9876);
const HOST = '127.0.0.1';
const RECEIPT_WIDTH_MM = 98.425;
const RECEIPT_WIDTH_PX = Math.round((RECEIPT_WIDTH_MM / 25.4) * 96);

const BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const VIRTUAL_PRINTER_HINTS = [
  'microsoft print to pdf',
  'microsoft xps',
  'onenote',
  'fax',
  'pdf',
  'xps',
  'generic / text only',
];

function findBrowser() {
  return BROWSER_PATHS.find((path) => existsSync(path)) || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyVirtualPrinter(name) {
  const lower = name.toLowerCase();
  return VIRTUAL_PRINTER_HINTS.some((hint) => lower.includes(hint));
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

function log(message) {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  console.log(`[${time}] ${message}`);
}

async function loadPdfToPrinter() {
  const module = await import('pdf-to-printer');
  const print = module.print ?? module.default?.print;
  const getPrinters = module.getPrinters ?? module.default?.getPrinters;
  const getDefaultPrinter = module.getDefaultPrinter ?? module.default?.getDefaultPrinter;

  if (typeof print !== 'function') {
    throw new Error('Could not load pdf-to-printer. Try running npm install again.');
  }

  return { print, getPrinters, getDefaultPrinter };
}

async function listPrinters() {
  const { getPrinters, getDefaultPrinter } = await loadPdfToPrinter();
  const [printers, defaultPrinter] = await Promise.all([getPrinters(), getDefaultPrinter()]);
  const defaultName = defaultPrinter?.name || '';

  return printers.map((printer) => ({
    name: printer.name,
    deviceId: printer.deviceId,
    paperSizes: printer.paperSizes,
    isDefault: printer.name === defaultName,
    isLikelyVirtual: isLikelyVirtualPrinter(printer.name),
  }));
}

async function resolvePrinter(requestedName) {
  const trimmed = typeof requestedName === 'string' ? requestedName.trim() : '';
  const envName = typeof process.env.PRINT_BRIDGE_PRINTER === 'string'
    ? process.env.PRINT_BRIDGE_PRINTER.trim()
    : '';
  const preferredName = trimmed || envName;

  const printers = await listPrinters();
  if (printers.length === 0) {
    throw new Error('No Windows printers were found on this PC.');
  }

  const names = printers.map((printer) => printer.name);

  if (preferredName) {
    const exact = printers.find((printer) => printer.name === preferredName);
    if (exact) return exact.name;

    const caseInsensitive = printers.find(
      (printer) => printer.name.toLowerCase() === preferredName.toLowerCase()
    );
    if (caseInsensitive) return caseInsensitive.name;

    throw new Error(
      `Printer "${preferredName}" was not found. Available printers: ${names.join(', ')}`
    );
  }

  const defaultPrinter = printers.find((printer) => printer.isDefault);
  if (!defaultPrinter?.name) {
    throw new Error(
      `No receipt printer selected. Set one in Settings, or choose from: ${names.join(', ')}`
    );
  }

  if (defaultPrinter.isLikelyVirtual) {
    throw new Error(
      `Windows default printer is "${defaultPrinter.name}", which is not a physical receipt printer. Open Settings in the app and choose your thermal printer. Available printers: ${names.join(', ')}`
    );
  }

  return defaultPrinter.name;
}

async function htmlToPdf(html, pdfPath) {
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('Chrome or Edge is required for silent printing on this PC.');
  }

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: RECEIPT_WIDTH_PX,
      height: 1200,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.emulateMediaType('print');

    const contentHeight = await page.evaluate(() => {
      const receipt = document.querySelector('.receipt-container') || document.body;
      return Math.ceil(receipt.scrollHeight);
    });
    const pdfHeightPx = Math.max(contentHeight + 16, 120);

    await page.pdf({
      path: pdfPath,
      width: `${RECEIPT_WIDTH_PX}px`,
      height: `${pdfHeightPx}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }
}

async function printPdf(pdfPath, printerName) {
  const { print } = await loadPdfToPrinter();
  await print(pdfPath, {
    printer: printerName,
    silent: true,
    scale: 'fit',
    monochrome: true,
  });
}

async function handlePrintRequest(body) {
  const html = typeof body.html === 'string' ? body.html : '';
  if (!html.trim()) {
    throw new Error('Missing receipt HTML');
  }

  const printerName = await resolvePrinter(body.printerName);
  const tempDir = mkdtempSync(join(tmpdir(), 'oilshop-print-job-'));
  const pdfPath = join(tempDir, 'receipt.pdf');

  try {
    log(`Generating PDF for printer "${printerName}"...`);
    await htmlToPdf(html, pdfPath);

    if (!existsSync(pdfPath)) {
      throw new Error('Could not generate receipt PDF from HTML.');
    }

    const pdfSize = statSync(pdfPath).size;
    if (pdfSize < 500) {
      throw new Error('Generated receipt PDF looks empty. Check Chrome/Edge installation.');
    }

    log(`Sending ${pdfSize} byte PDF to "${printerName}"...`);
    await printPdf(pdfPath, printerName);
    log(`Print job sent to "${printerName}".`);

    if (process.env.PRINT_BRIDGE_DEBUG === '1') {
      const debugPath = join(tmpdir(), `oilshop-receipt-debug-${Date.now()}.pdf`);
      copyFileSync(pdfPath, debugPath);
      log(`Debug PDF saved to ${debugPath}`);
    }

    return { printerName, pdfSize };
  } finally {
    await delay(1500);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function getStatusPayload() {
  const browser = findBrowser();
  let printers = [];
  let printerWarning = '';

  try {
    printers = await listPrinters();
    const defaultPrinter = printers.find((printer) => printer.isDefault);
    if (defaultPrinter?.isLikelyVirtual) {
      printerWarning = `Default Windows printer "${defaultPrinter.name}" is virtual. Set your thermal printer in app Settings.`;
    }
  } catch (error) {
    printerWarning = error instanceof Error ? error.message : 'Could not read Windows printers.';
  }

  return {
    ok: true,
    service: 'Oil Shop Print Bridge',
    status: 'running',
    port: PORT,
    browser,
    browserReady: Boolean(browser),
    printers,
    printerWarning,
    endpoints: {
      health: 'GET /health',
      printers: 'GET /printers',
      print: 'POST /print',
    },
    message: browser
      ? 'Bridge is running. Choose your receipt printer in app Settings.'
      : 'Bridge is running but Chrome/Edge was not found. Install Chrome or Edge for silent printing.',
  };
}

const server = http.createServer(async (request, response) => {
  const path = request.url?.split('?')[0] || '/';

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, { ok: true });
    return;
  }

  if (request.method === 'GET' && (path === '/' || path === '/health')) {
    try {
      sendJson(response, 200, await getStatusPayload());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed';
      sendJson(response, 500, { ok: false, message });
    }
    return;
  }

  if (request.method === 'GET' && path === '/printers') {
    try {
      const printers = await listPrinters();
      sendJson(response, 200, { ok: true, printers });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not list printers';
      sendJson(response, 500, { ok: false, message });
    }
    return;
  }

  if (request.method === 'POST' && path === '/print') {
    let rawBody = '';
    request.on('data', (chunk) => {
      rawBody += chunk;
    });

    request.on('end', async () => {
      try {
        const body = rawBody ? JSON.parse(rawBody) : {};
        const result = await handlePrintRequest(body);
        sendJson(response, 200, { ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Print failed';
        log(`Print failed: ${message}`);
        sendJson(response, 500, { ok: false, message });
      }
    });
    return;
  }

  sendJson(response, 404, { ok: false, message: 'Not found' });
});

server.listen(PORT, HOST, () => {
  log(`Oil Shop print bridge running on http://${HOST}:${PORT}`);
  log(`Status check: http://${HOST}:${PORT}/health`);
  log('Keep this window open while printing from the app.');
});
