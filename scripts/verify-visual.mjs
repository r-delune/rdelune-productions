#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const DEFAULT_URL = 'http://127.0.0.1:8084';
const BASE_URL = process.env.VISUAL_SMOKE_URL || DEFAULT_URL;
const RECIPE_FIXTURES = [
  { id: 'three-caustics', kind: 'three-fullscreen' },
  { id: 'three-curl-flow', kind: 'three-instanced' },
  { id: 'three-artwork-flux', kind: 'three-fbo-artwork' },
  { id: 'three-volumetric-fog', kind: 'three-raymarch', reducedMotion: true },
  { id: 'cong-lateral-current', kind: 'legacy-canvas2d' },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const CHROME_RENDER_ERROR_PATTERN = /\bGL_INVALID_|WebGL.*(feedback loop|error|invalid)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(url, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(url, { method: 'HEAD' });
      if (response.ok || response.status < 500) return true;
    } catch {
      // Server is not up yet.
    }
    await sleep(500);
  }
  return false;
}

async function ensureServer() {
  if (await waitForServer(BASE_URL, 1500)) return null;

  console.log(`[visual-smoke] ${BASE_URL} is not responding; starting npm run dev`);
  const child = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || '.next-visual-smoke' },
  });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (/ready|started server|localhost/i.test(text)) process.stdout.write(`[dev] ${text}`);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (/error|failed|EADDRINUSE/i.test(text)) process.stderr.write(`[dev] ${text}`);
  });

  const ready = await waitForServer(BASE_URL, 45_000);
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error(`Timed out waiting for ${BASE_URL}. Start npm run dev:productions manually and rerun npm run verify:visual.`);
  }
  return child;
}

function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => candidate && existsSync(candidate));
  if (!found) {
    throw new Error('No Chrome/Chromium binary found. Set CHROME_BIN to run npm run verify:visual.');
  }
  return found;
}

async function launchChrome() {
  const chrome = findChrome();
  const port = 9222 + Math.floor(Math.random() * 1000);
  const userDataDir = join(tmpdir(), `rdelune-visual-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const renderErrors = [];
  console.log(`[visual-smoke] launching Chrome on CDP port ${port}`);
  const child = spawn(chrome, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (CHROME_RENDER_ERROR_PATTERN.test(text)) renderErrors.push(text.trim());
    if (/ERROR|FATAL/i.test(text)) process.stderr.write(`[chrome] ${text}`);
  });
  let exited = false;
  child.on('exit', () => { exited = true; });

  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (exited) {
      await rm(userDataDir, { recursive: true, force: true });
      throw new Error(`Chrome exited before opening the remote debugging endpoint. Close existing Chrome instances or set CHROME_BIN to a Chromium binary that supports headless remote debugging.`);
    }
    try {
      const response = await fetchWithTimeout(versionUrl);
      if (response.ok) {
        console.log(`[visual-smoke] Chrome CDP ready on port ${port}`);
        return { child, port, userDataDir, renderErrors };
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }

  child.kill('SIGTERM');
  await rm(userDataDir, { recursive: true, force: true });
  throw new Error('Timed out waiting for Chrome remote debugging endpoint.');
}

async function openPageWebSocket(port) {
  const response = await fetchWithTimeout(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }, 3000);
  if (!response.ok) throw new Error(`Chrome target creation failed: ${response.status}`);
  const target = await response.json();
  console.log('[visual-smoke] Chrome target created');
  return target.webSocketDebuggerUrl;
}

class CdpPage {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      this.handleMessage(event).catch((error) => {
        for (const { reject } of this.pending.values()) reject(error);
        this.pending.clear();
      });
    });
  }

  async decodeMessageData(data) {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
    if (data && typeof data.text === 'function') return data.text();
    return String(data);
  }

  async handleMessage(event) {
    const message = JSON.parse(await this.decodeMessageData(event.data));
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ''}`));
      else resolve(message.result ?? {});
      return;
    }
    if (message.method) {
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    }
  }

  async send(method, params = {}) {
    await this.opened;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 20_000);
    });
  }

  on(method, listener) {
    const list = this.listeners.get(method) ?? [];
    list.push(listener);
    this.listeners.set(method, list);
  }

  close() {
    this.ws.close();
  }
}

function makeRecipeUrl(fixture) {
  const url = new URL(BASE_URL);
  url.searchParams.set('lab', '1');
  url.searchParams.set('recipe', fixture.id);
  url.searchParams.set('visualSmoke', '1');
  return url.href;
}

async function waitForRuntime(page, recipeId, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const root = document.querySelector('[data-productions-theme="dark"]');
        const telemetry = window.__PRODUCTIONS_RENDER_QUALITY__ || null;
        const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }).filter((rect) => rect.width >= 320 && rect.height >= 240);
        return {
          recipe: root?.getAttribute('data-current-recipe-id') || null,
          telemetry,
          canvasCount: canvases.length,
          largestCanvas: canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null,
        };
      })()`,
    });
    const value = result.result?.value;
    if (value?.recipe === recipeId && value.telemetry?.recipeId === recipeId && value.canvasCount > 0) return value;
    await sleep(350);
  }
  throw new Error(`Timed out waiting for recipe "${recipeId}" to render.`);
}

function parsePng(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('Screenshot is not a PNG.');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * channels);
  let src = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src++];
    const row = y * rowBytes;
    const prev = y > 0 ? row - rowBytes : -1;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[src++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = prev >= 0 ? pixels[prev + x] : 0;
      const upLeft = prev >= 0 && x >= channels ? pixels[prev + x - channels] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
      pixels[row + x] = value & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

function analyzeScreenshot(base64) {
  const png = parsePng(Buffer.from(base64, 'base64'));
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const unique = new Set();
  const step = Math.max(1, Math.floor((png.width * png.height) / 12_000));

  for (let pixelIndex = 0; pixelIndex < png.width * png.height; pixelIndex += step) {
    const offset = pixelIndex * png.channels;
    const r = png.pixels[offset];
    const g = png.pixels[offset + 1];
    const b = png.pixels[offset + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
    sumSq += luma * luma;
    count += 1;
    unique.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }

  const mean = sum / Math.max(count, 1);
  const variance = sumSq / Math.max(count, 1) - mean * mean;
  return { mean, variance, uniqueBuckets: unique.size, width: png.width, height: png.height };
}

async function captureCanvasStats(page, rect) {
  const screenshot = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      scale: 1,
    },
  });
  return analyzeScreenshot(screenshot.data);
}

async function runFixture(page, fixture) {
  console.log(`[visual-smoke] checking ${fixture.id} (${fixture.kind})${fixture.reducedMotion ? ' with reduced motion' : ''}`);
  const errors = [];
  page.on('Runtime.exceptionThrown', (params) => {
    errors.push(params.exceptionDetails?.text || 'Runtime exception');
  });
  page.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') errors.push(params.entry.text);
  });
  page.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      errors.push(params.args?.map((arg) => arg.value || arg.description || '').join(' ') || 'console.error');
    }
  });

  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Emulation.setEmulatedMedia', {
    features: fixture.reducedMotion ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
  });
  await page.send('Page.navigate', { url: makeRecipeUrl(fixture) });
  await sleep(1500);

  const runtime = await waitForRuntime(page, fixture.id);
  await sleep(fixture.reducedMotion ? 600 : 1200);
  const stats = await captureCanvasStats(page, runtime.largestCanvas);
  const telemetry = runtime.telemetry;

  if (stats.uniqueBuckets < 8 || stats.variance < 4) {
    throw new Error(`${fixture.id} appears blank or nearly blank: unique=${stats.uniqueBuckets} variance=${stats.variance.toFixed(2)}`);
  }
  if (!Number.isFinite(telemetry.qualityScale) || telemetry.qualityScale < 0.5 || telemetry.qualityScale > 1.01) {
    throw new Error(`${fixture.id} reported invalid qualityScale: ${telemetry.qualityScale}`);
  }
  if (!Number.isFinite(telemetry.frameEma) || telemetry.frameEma <= 0) {
    throw new Error(`${fixture.id} reported invalid frameEma: ${telemetry.frameEma}`);
  }

  if (fixture.id === RECIPE_FIXTURES[0].id) {
    await page.send('Runtime.evaluate', {
      expression: `document.querySelector('[aria-label="Next track"]')?.click()`,
    });
    await sleep(1200);
  }

  if (errors.length) {
    throw new Error(`${fixture.id} console/runtime errors:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  }

  console.log(`[visual-smoke] ${fixture.id} (${fixture.kind}) OK · quality ${telemetry.qualityScale.toFixed(2)} · ${telemetry.frameEma.toFixed(1)}ms · variance ${stats.variance.toFixed(1)}`);
}

async function main() {
  const server = await ensureServer();
  const chrome = await launchChrome();
  let page;

  try {
    page = new CdpPage(await openPageWebSocket(chrome.port));
    console.log('[visual-smoke] enabling CDP domains');
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable');

    for (const fixture of RECIPE_FIXTURES) {
      await runFixture(page, fixture);
    }
    if (chrome.renderErrors.length) {
      throw new Error(`Chrome reported render errors:\n${chrome.renderErrors.map((error) => `  - ${error}`).join('\n')}`);
    }
  } finally {
    page?.close();
    chrome.child.kill('SIGTERM');
    if (server) server.kill('SIGTERM');
    await sleep(500);
    await rm(chrome.userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`[visual-smoke] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
