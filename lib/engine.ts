// Mesin inferensi di browser: opencv.js untuk preprocessing, onnxruntime-web untuk model.
// Semua berjalan di perangkat pengguna, tanpa server.
import * as P from './preprocess.js';

// Naikkan angka ini setiap kali file model di /public/models diganti,
// supaya browser pengunjung mengunduh versi baru (file model di-cache lama).
const MODEL_VERSION = '1';

export type Mode = 'aksara' | 'ocr';
export type Token = { label: string; aksara: string; confidence: number };
export type AksaraResult = { kind: 'aksara'; top: Token[]; processed: string; ms: number };
export type OcrResult = { kind: 'ocr'; tokens: Token[]; processed: string; ms: number };
export type Result = AksaraResult | OcrResult;

// Urutan kelas = sorted() label train di notebook (jangan diubah)
export const CLASSES = ['ba', 'ca', 'da', 'dha', 'ga', 'ha', 'ja', 'ka', 'la', 'ma',
  'na', 'nga', 'nya', 'pa', 'ra', 'sa', 'ta', 'tha', 'wa', 'ya'];

export const JAVANESE: Record<string, string> = {
  ha: 'ꦲ', na: 'ꦤ', ca: 'ꦕ', ra: 'ꦫ', ka: 'ꦏ',
  da: 'ꦢ', ta: 'ꦠ', sa: 'ꦱ', wa: 'ꦮ', la: 'ꦭ',
  pa: 'ꦥ', dha: 'ꦝ', ja: 'ꦗ', ya: 'ꦪ', nya: 'ꦚ',
  ma: 'ꦩ', ga: 'ꦒ', ba: 'ꦧ', tha: 'ꦛ', nga: 'ꦔ',
};

// Urutan tradisional hanacaraka (4 baris x 5)
export const HANACARAKA = [
  ['ha', 'na', 'ca', 'ra', 'ka'],
  ['da', 'ta', 'sa', 'wa', 'la'],
  ['pa', 'dha', 'ja', 'ya', 'nya'],
  ['ma', 'ga', 'ba', 'tha', 'nga'],
];

const MAX_SIDE = 2000; // foto HP yang sangat besar diperkecil dulu
const PART_SIZE = 5 * 1024 * 1024;

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { cv: any; ort: any }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded) resolve();
      else existing.addEventListener('load', () => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(s);
  });
}

// File besar disimpan terpecah (maks 5 MB per potongan) supaya bisa diunggah lewat web GitHub.
// Daftar potongan ada di /models/models.json dan /vendor/vendor.json.
type PartInfo = { parts: number; bytes: number };
const manifests: Record<string, Promise<Record<string, PartInfo>>> = {};
function manifest(url: string) {
  manifests[url] ??= fetch(`${url}?v=${MODEL_VERSION}`).then((r) => {
    if (!r.ok) throw new Error(`Gagal memuat ${url}`);
    return r.json();
  }).catch((e) => { delete manifests[url]; throw e; });
  return manifests[url];
}

async function fetchParts(dir: '/models' | '/vendor', name: string, onProgress?: (p: number) => void) {
  const list = await manifest(dir === '/models' ? '/models/models.json' : '/vendor/vendor.json');
  const info = list[name];
  if (!info) throw new Error(`Berkas ${name} tidak ada di daftar`);
  const out = new Uint8Array(info.bytes);
  const loaded = new Array(info.parts).fill(0);
  const report = () => onProgress?.(Math.min(1, loaded.reduce((a, b) => a + b, 0) / info.bytes));
  await Promise.all(
    Array.from({ length: info.parts }, async (_, i) => {
      const res = await fetch(`${dir}/${name}.${String(i).padStart(3, '0')}?v=${MODEL_VERSION}`);
      if (!res.ok || !res.body) throw new Error(`Gagal mengunduh ${name} bagian ${i + 1}`);
      const reader = res.body.getReader();
      let off = i * PART_SIZE;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out.set(value, off);
        off += value.length;
        loaded[i] += value.length;
        report();
      }
    }),
  );
  onProgress?.(1);
  return out;
}

let cvPromise: Promise<any> | null = null;
function getCv(): Promise<any> {
  cvPromise ??= fetchParts('/vendor', 'opencv.js')
    .then((bytes) => loadScript(URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }))))
    .then(
      () =>
        new Promise((resolve) => {
          const m = window.cv;
          // opencv.js adalah "thenable"; bungkus dalam objek supaya await tidak berputar terus
          const done = (cv: any) => { if (cv.then) delete cv.then; resolve({ cv }); };
          if (m?.Mat) done(m);
          else if (typeof m?.then === 'function') m.then(done);
          else m.onRuntimeInitialized = () => done(m);
        }),
    )
    .then((o: any) => o.cv)
    .catch((e) => { cvPromise = null; throw e; });
  return cvPromise;
}

let ortPromise: Promise<any> | null = null;
function getOrt(): Promise<any> {
  ortPromise ??= Promise.all([
    loadScript('/vendor/ort/ort.wasm.min.js'),
    fetchParts('/vendor', 'ort-wasm-simd-threaded.wasm'),
  ])
    .then(([, wasm]) => {
      const ort = window.ort;
      ort.env.wasm.wasmPaths = '/vendor/ort/';
      ort.env.wasm.wasmBinary = wasm; // file .wasm dirakit dari potongan
      ort.env.wasm.numThreads = 1;
      return ort;
    })
    .catch((e) => { ortPromise = null; throw e; });
  return ortPromise;
}

const sessions: Partial<Record<Mode, Promise<any>>> = {};
export function loadModel(mode: Mode, onProgress?: (p: number) => void): Promise<any> {
  sessions[mode] ??= (async () => {
    const [ort, bytes] = await Promise.all([
      getOrt(),
      fetchParts('/models', `aksara-${mode === 'aksara' ? 'cls' : 'ocr'}.onnx`, onProgress),
      getCv(),
    ]);
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  })().catch((e) => { delete sessions[mode]; throw e; });
  return sessions[mode]!;
}

// Sumber gambar (file atau canvas gambar tangan) -> data RGBA
export async function imageToRgba(src: File | HTMLCanvasElement) {
  let w: number, h: number;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (src instanceof HTMLCanvasElement) {
    w = src.width; h = src.height;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(src, 0, 0);
  } else {
    const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    w = Math.max(1, Math.round(bmp.width * scale));
    h = Math.max(1, Math.round(bmp.height * scale));
    canvas.width = w; canvas.height = h;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
  }
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

function matToDataUrl(cv: any, m: any): string {
  const c = document.createElement('canvas');
  cv.imshow(c, m);
  return c.toDataURL('image/png');
}

export async function predict(mode: Mode, src: File | HTMLCanvasElement): Promise<Result> {
  const [session, cv] = await Promise.all([loadModel(mode), getCv()]);
  const ort = await getOrt();
  const { data, w, h } = await imageToRgba(src);
  const t0 = performance.now();
  const gray = P.rgbaToGray(cv, data, w, h);
  const prepped = mode === 'aksara' ? P.prepCls(cv, gray) : P.prepOcr(cv, gray);
  gray.delete();
  const input = new ort.Tensor('float32', P.matToInput(prepped), [1, 1, prepped.rows, prepped.cols]);
  const width = prepped.cols;
  const processed = matToDataUrl(cv, prepped);
  prepped.delete();
  const out = await session.run({ input });
  const probs: Float32Array = out.probs.data;
  const ms = Math.round(performance.now() - t0);

  if (mode === 'aksara') {
    const top = Array.from(probs)
      .map((p, i) => ({ label: CLASSES[i], aksara: JAVANESE[CLASSES[i]], confidence: p }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
    return { kind: 'aksara', top, processed, ms };
  }

  // Dekode CTC greedy (sama dengan notebook), plus keyakinan per suku kata
  const K = CLASSES.length + 1;
  const T = Math.min(out.probs.dims[1], Math.floor(width / 4));
  const tokens: Token[] = [];
  let prev = 0;
  let cur: Token | null = null;
  for (let t = 0; t < T; t++) {
    let best = 0, bp = -1;
    for (let k = 0; k < K; k++) { const p = probs[t * K + k]; if (p > bp) { bp = p; best = k; } }
    if (best !== 0 && best !== prev) {
      cur = { label: CLASSES[best - 1], aksara: JAVANESE[CLASSES[best - 1]], confidence: bp };
      tokens.push(cur);
    } else if (best !== 0 && best === prev && cur) {
      cur.confidence = Math.max(cur.confidence, bp);
    }
    prev = best;
  }
  return { kind: 'ocr', tokens, processed, ms };
}
