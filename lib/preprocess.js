// Preprocessing aksara Jawa, port 1:1 dari notebook (Python + OpenCV) ke opencv.js.
// Semua fungsi menerima objek `cv` (opencv.js yang sudah siap) dan cv.Mat grayscale CV_8UC1.

export const CLS_IMG = 128;
export const OCR_H = 64;
export const OCR_VPAD = 4;
export const OCR_HPAD = 8;
export const OCR_MAX_W = 1280;

// round() Python = round half to even
function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// np.percentile (interpolasi linear) untuk data uint8, lewat histogram
function percentileU8(data, qs) {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const cum = new Float64Array(256);
  let c = 0;
  for (let v = 0; v < 256; v++) { c += hist[v]; cum[v] = c; }
  const N = data.length;
  const at = (idx) => { // nilai ke-idx (0-based) pada data terurut
    for (let v = 0; v < 256; v++) if (cum[v] > idx) return v;
    return 255;
  };
  return qs.map((q) => {
    const pos = (q / 100) * (N - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, N - 1);
    const vlo = at(lo), vhi = at(hi);
    return vlo + (vhi - vlo) * (pos - lo);
  });
}

export function cleanGray(cv, gIn) {
  const g = gIn.clone();
  if (cv.mean(g)[0] < 110) cv.bitwise_not(g, g);
  const k = Math.max(15, Math.floor(Math.min(g.rows, g.cols) / 6) | 1);
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const dil = new cv.Mat();
  cv.dilate(g, dil, kernel, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
  const bg = new cv.Mat();
  cv.medianBlur(dil, bg, Math.min(k, 255));
  const n = new cv.Mat();
  cv.divide(g, bg, n, 255, -1);
  kernel.delete(); dil.delete(); bg.delete(); g.delete();

  const [lo, hi] = percentileU8(n.data, [1, 99.5]);
  if (hi - lo < 10) return n;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const x = ((v - lo) * 255) / (hi - lo);
    lut[v] = Math.trunc(Math.min(255, Math.max(0, x)));
  }
  const d = n.data;
  for (let i = 0; i < d.length; i++) d[i] = lut[d[i]];
  return n;
}

export function contentBbox(cv, g, minRel = 0.03, pad = 3) {
  const blur = new cv.Mat();
  cv.GaussianBlur(g, blur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
  const th = new cv.Mat();
  cv.threshold(blur, th, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  const labels = new cv.Mat(), stats = new cv.Mat(), cents = new cv.Mat();
  const n = cv.connectedComponentsWithStats(th, labels, stats, cents, 8, cv.CV_32S);
  const W = g.cols, H = g.rows;
  let box = [0, 0, W, H];
  if (n > 1) {
    const s = stats.data32S; // baris per komponen: left, top, width, height, area
    let maxA = 0;
    for (let i = 1; i < n; i++) maxA = Math.max(maxA, s[i * 5 + 4]);
    const thr = Math.max(4, minRel * maxA);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 1; i < n; i++) {
      if (s[i * 5 + 4] < thr) continue;
      const l = s[i * 5], t = s[i * 5 + 1], w = s[i * 5 + 2], h = s[i * 5 + 3];
      x0 = Math.min(x0, l); y0 = Math.min(y0, t);
      x1 = Math.max(x1, l + w); y1 = Math.max(y1, t + h);
    }
    box = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W, x1 + pad), Math.min(H, y1 + pad)];
  }
  blur.delete(); th.delete(); labels.delete(); stats.delete(); cents.delete();
  return box;
}

export function tightCrop(cv, gray) {
  const c = cleanGray(cv, gray);
  const [x0, y0, x1, y1] = contentBbox(cv, c);
  const roi = c.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0)).clone();
  c.delete();
  return roi;
}

export function toSquare(cv, g, size = CLS_IMG, margin = 0.08) {
  const h = g.rows, w = g.cols;
  const s = Math.trunc(Math.max(h, w) * (1 + 2 * margin)) + 1;
  const canvas = new cv.Mat(s, s, cv.CV_8UC1, new cv.Scalar(255));
  const y = Math.floor((s - h) / 2), x = Math.floor((s - w) / 2);
  const dst = canvas.roi(new cv.Rect(x, y, w, h));
  g.copyTo(dst); dst.delete();
  const out = new cv.Mat();
  cv.resize(canvas, out, new cv.Size(size, size), 0, 0, cv.INTER_AREA);
  canvas.delete();
  return out;
}

export function fitHeight(cv, g) {
  const inner = OCR_H - 2 * OCR_VPAD;
  const h = g.rows, w = g.cols;
  const nw = Math.min(Math.max(pyRound((w * inner) / h), 8), OCR_MAX_W - 2 * OCR_HPAD);
  const r = new cv.Mat();
  cv.resize(g, r, new cv.Size(nw, inner), 0, 0, cv.INTER_AREA);
  const canvas = new cv.Mat(OCR_H, nw + 2 * OCR_HPAD, cv.CV_8UC1, new cv.Scalar(255));
  const dst = canvas.roi(new cv.Rect(OCR_HPAD, OCR_VPAD, nw, inner));
  r.copyTo(dst); dst.delete(); r.delete();
  return canvas;
}

export function prepCls(cv, gray) {
  const c = tightCrop(cv, gray);
  const out = toSquare(cv, c);
  c.delete();
  return out;
}

export function prepOcr(cv, gray) {
  const c = tightCrop(cv, gray);
  const out = fitHeight(cv, c);
  c.delete();
  return out;
}

// RGBA (dari canvas browser) -> grayscale, sama dengan read_gray di notebook
export function rgbaToGray(cv, rgba, width, height) {
  const rgb = new Uint8Array(width * height * 3);
  let opaque = true;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break; }
  for (let p = 0, q = 0; p < rgba.length; p += 4, q += 3) {
    if (opaque) {
      rgb[q] = rgba[p]; rgb[q + 1] = rgba[p + 1]; rgb[q + 2] = rgba[p + 2];
    } else {
      const a = rgba[p + 3] / 255;
      for (let k = 0; k < 3; k++) rgb[q + k] = Math.trunc(Math.fround(rgba[p + k] * a + 255 * (1 - a)));
    }
  }
  const m = cv.matFromArray(height, width, cv.CV_8UC3, rgb);
  const g = new cv.Mat();
  cv.cvtColor(m, g, cv.COLOR_RGB2GRAY);
  m.delete();
  return g;
}

// Mat 0..255 -> Float32 tensor (tinta = 1, latar = 0)
export function matToInput(m) {
  const d = m.data, out = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = Math.fround(1 - Math.fround(d[i] / 255));
  return out;
}
