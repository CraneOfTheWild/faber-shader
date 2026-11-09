/*
 * faber-core.js - redraw a photo as a felt-tip marker painting, stroke by stroke, in the browser.
 *
 * A JavaScript port of faber_shader.py v1.8 (the "main" algorithm). ES module, no dependencies.
 * The Python function names are kept as comments above each port so the two can be read side by
 * side. Where the Python leans on OpenCV / scikit-image (mean shift, SLIC, hierarchical region
 * merging, structure tensor, findContours, approxPolyDP) the equivalent is implemented here in
 * plain JS; the README lists the simplifications.
 *
 *   import { generateStrokes } from './faber-core.js';
 *   const result = generateStrokes({ width, height, data }, { seed: 3 }, p => console.log(p));
 *   // result = { width, height, palette: { paper, pens: { name: '#hex' } }, strokes: [...] }
 *
 * Every stroke has the fields the viewer draws: x0,y0,x1,y1,width,pen,opacity,level,tilt,bow,amp,
 * waves,hook,hook_end,hook_len (same rounding as the Python .strokes.json).
 */

// ----------------------------------------------------------------------------
// palette (palette.json embedded, so a page needs no extra file)
// ----------------------------------------------------------------------------
export const DEFAULT_PALETTE = {"paper":"#f5f2ea","pens":{"c01r01":"#b3a4a3","c01r02":"#fbc9eb","c01r03":"#fda7b9","c01r04":"#fc9bbd","c01r05":"#f89adb","c01r06":"#ee68c4","c01r07":"#f97bcd","c01r08":"#ef4187","c01r09":"#be4166","c01r10":"#dc4770","c02r01":"#dfb8a7","c02r02":"#f9cac2","c02r03":"#fdbeb4","c02r04":"#d99c9d","c02r05":"#e497b4","c02r06":"#fd8a89","c02r07":"#fb7179","c02r08":"#f77690","c02r09":"#e34954","c02r10":"#f64c54","c03r01":"#f19455","c03r02":"#d88e3e","c03r03":"#f8bd6c","c03r04":"#f98f54","c03r05":"#fb9c5d","c03r06":"#fcb390","c03r07":"#fb8b7f","c03r08":"#fda4b7","c03r09":"#f56960","c03r10":"#f8836f","c04r01":"#dfad7d","c04r02":"#ba9a6c","c04r03":"#c58342","c04r04":"#d5815d","c04r05":"#da795e","c04r06":"#c76862","c04r07":"#c37b6a","c04r08":"#875e52","c04r09":"#6a453c","c04r10":"#806368","c05r01":"#edd9b5","c05r02":"#cbdc5d","c05r03":"#d8dd8a","c05r04":"#e7e999","c05r05":"#e7d760","c05r06":"#edb75e","c05r07":"#f3c74c","c05r08":"#f5bf74","c05r09":"#faa257","c05r10":"#f2ab5f","c06r01":"#b1b695","c06r02":"#b1d5ad","c06r03":"#12cca0","c06r04":"#0bd3b2","c06r05":"#06c284","c06r06":"#04a48a","c06r07":"#8ac39f","c06r08":"#899b6c","c06r09":"#808058","c06r10":"#558c77","c07r01":"#bceaf8","c07r02":"#9fa9b1","c07r03":"#5bdff0","c07r04":"#29b8dc","c07r05":"#05a9dd","c07r06":"#04c5ee","c07r07":"#05dcd4","c07r08":"#03c5d3","c07r09":"#04c2c8","c07r10":"#07a6b3","c08r01":"#b9d6e7","c08r02":"#68b8d9","c08r03":"#3e7ba4","c08r04":"#6fe2fd","c08r05":"#09d6fc","c08r06":"#08cffc","c08r07":"#06aafa","c08r08":"#4a89cc","c08r09":"#4572d5","c08r10":"#4663a1","c09r01":"#b69cb3","c09r02":"#e2c9f3","c09r03":"#c2a4bd","c09r04":"#aea9b7","c09r05":"#79728b","c09r06":"#9d82a4","c09r07":"#705cae","c09r08":"#9e77c5","c09r09":"#9254a9","c09r10":"#8a316d","c10r01":"#b6b7b8","c10r02":"#a4adb5","c10r03":"#b2aeb4","c10r04":"#8caabc","c10r05":"#a5a1a6","c10r06":"#8c898e","c10r07":"#73818e","c10r08":"#5c6971","c10r09":"#4f5761","c10r10":"#7e7d81"}};

// style 'realistic' = faber_shader_realistic.py: contours off, ink with body, longer strokes, smaller dabs.
// It is built on the older paint_level (no paper_show / lit tone / stroke_share / local-average checks).
export const REALISTIC = {
  style: 'realistic', contours: false, ink_body: 0.4, max_len: 40.0, min_len: 1.2, wobble_min: 0.25,
  paper_show: 0.0, lit_levels: 0, stroke_share: 1.0,
};

// ----------------------------------------------------------------------------
// options: the Python CLI flags with their argparse dest names and defaults
// ----------------------------------------------------------------------------
export const DEFAULTS = {
  max_size: 1200,            // downscale the input so its long side is at most this
  seed: 1,
  size_ref: 'long',          // 'long' | 'width' | 'height'
  // stage 0: contours
  contours: true,
  contour_width: 0.0045,
  contour_eps: 0.7,
  contour_opacity: 0.85,
  contour_pen: 'block',      // 'block' | 'dark'
  contour_darken: 0.55,
  contour_seg: 0.12,
  contour_min_area: 0.01,
  contour_merge: 55.0,
  segments: 150,
  compactness: 12.0,
  merge: 34.0,
  flatten_spatial: 16,
  flatten_colour: 36,
  // levels (coarse to fine); strings as in the CLI or arrays of numbers
  widths: '0.012,0.0072,0.004,0.0024',
  opacities: '0.95,0.85,0.7,0.55',
  thresholds: '14,12,10,9',
  blur: 0.6,
  grid: 1.0,
  order: 'random',           // 'random' | 'worst-first'
  stroke_share: 1.0,
  paper_show: 0.3,
  overlap_damp: 0.6,
  min_gain: 3.0,
  lit_levels: 2,
  lit_tone: 0.4,
  // strokes
  directions: 'auto',        // 'auto' | 'h' | 'v'
  coherence: 0.3,
  direction_scale: 'coarse', // 'coarse' | 'per-level'
  direction_sigma: 0.012,
  max_len: 20.0,
  min_len: 2.0,
  facet_len: 0.6,
  colour_tol: 0.22,
  wobble: 0.010,
  wobble_min: 0.05,
  bow: 0.015,
  hook: 0.7,
  hook_len: 1.5,
  hook_chance: 0.0,
  tilt: 3.0,
  bleed: 1.0,
  taper: 0.2,
  taper_len: 0.7,
  tip_fade: 0.3,
  streak: 0.25,
  paper: 0.02,
  // JS-only
  palette: null,             // { paper: '#hex', pens: { name: '#hex' } } or palette.json shape; null = embedded
  style: 'marker',           // 'marker' (faber_shader.py v1.8) | 'realistic' (faber_shader_realistic.py, see REALISTIC)
  ink_body: 0.0,             // 0..1 how much a stroke covers what is under it (realistic: 0.4)
  return_image: false,       // also return the simulated painting as RGBA (result.image)
  log: null,                 // function(string) for the per-level summaries (console.log in the test)
};

const listOf = v => (Array.isArray(v) ? v.map(Number) : String(v).split(',').map(Number));

// ----------------------------------------------------------------------------
// seeded RNG: sfc32 seeded through splitmix32 (stands in for np.random.default_rng)
// ----------------------------------------------------------------------------
class RNG {
  constructor(seed) {
    let s = (Number(seed) | 0) >>> 0;
    const sm = () => {
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16); t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
      return t >>> 0;
    };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
    for (let i = 0; i < 12; i++) this.random();
  }
  random() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  }
  uniform(lo, hi) { return lo + (hi - lo) * this.random(); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }
}

// ----------------------------------------------------------------------------
// colour: sRGB (0..1) -> CIE Lab, D65, as skimage.color.rgb2lab
// ----------------------------------------------------------------------------
const LIN = new Float32Array(4096);
for (let i = 0; i < 4096; i++) {
  const c = i / 4095;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const lin = c => LIN[(c <= 0 ? 0 : c >= 1 ? 4095 : (c * 4095 + 0.5)) | 0];
const labF = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

// rgb_to_lab / lab_of
function rgb2lab(r, g, b, out, o) {
  const rl = lin(r), gl = lin(g), bl = lin(b);
  const x = labF((rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047);
  const y = labF(rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750);
  const z = labF((rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883);
  out[o] = 116 * y - 16; out[o + 1] = 500 * (x - y); out[o + 2] = 200 * (y - z);
  return out;
}
function labOfImage(rgb) {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) rgb2lab(rgb[i], rgb[i + 1], rgb[i + 2], out, i);
  return out;
}
const dist3 = (a, ao, b, bo) => Math.hypot(a[ao] - b[bo], a[ao + 1] - b[bo + 1], a[ao + 2] - b[bo + 2]);

// hex_to_rgb
function hexToRgb(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

// load_palette: accepts the viewer shape {paper, pens:{name:hex}} or palette.json {paper, pens:[{name,rgb}]}
function loadPalette(pal) {
  const entries = Array.isArray(pal.pens) ? pal.pens.map(p => [p.name, p.rgb]) : Object.entries(pal.pens);
  const pens = entries.map(([name, hex]) => {
    const rgb = hexToRgb(hex);
    return { name, hex, rgb, lab: rgb2lab(rgb[0], rgb[1], rgb[2], new Float32Array(3), 0) };
  });
  const paperHex = pal.paper || '#f3efe4';
  return { pens, paper: hexToRgb(paperHex), viewerPalette: { paper: paperHex, pens: Object.fromEntries(entries) } };
}

// nearest_pen
function nearestPen(rgb, pens, chromaWeight = 1.0) {
  const t = rgb2lab(rgb[0], rgb[1], rgb[2], new Float32Array(3), 0);
  let best = 0, bestD = 1e9;
  for (let i = 0; i < pens.length; i++) {
    const p = pens[i].lab;
    const dl = p[0] - t[0], da = (p[1] - t[1]) * chromaWeight, db = (p[2] - t[2]) * chromaWeight;
    const d = dl * dl + da * da + db * db;
    if (d < bestD) { best = i; bestD = d; }
  }
  return best;
}

// shade_pen_for
function shadePenFor(primary, darkTarget, pens) {
  const t = rgb2lab(darkTarget[0], darkTarget[1], darkTarget[2], new Float32Array(3), 0);
  const m = new Float32Array(3);
  let best = 0, bestD = 1e9;
  for (let i = 0; i < pens.length; i++) {
    const q = pens[i].rgb;
    rgb2lab(primary.rgb[0] * q[0], primary.rgb[1] * q[1], primary.rgb[2] * q[2], m, 0);
    const d = (m[0] - t[0]) ** 2 + (m[1] - t[1]) ** 2 + (m[2] - t[2]) ** 2;
    if (d < bestD) { best = i; bestD = d; }
  }
  return best;
}

// ----------------------------------------------------------------------------
// image helpers (Float32Array images, interleaved channels)
// ----------------------------------------------------------------------------
function reflect(i, n) {                       // cv2 BORDER_REFLECT_101
  if (n === 1) return 0;
  while (i < 0 || i >= n) { if (i < 0) i = -i; if (i >= n) i = 2 * n - 2 - i; }
  return i;
}

// cv2.GaussianBlur(img, (0, 0), sigma): separable, reflect-101 borders, radius 3 sigma. A blur
// with sigma > 3 is done on a box-downsampled copy (sigma stays >= 1.5 there) and upsampled
// bilinearly; the difference from the full-resolution blur is far below what the algorithm sees.
function gaussianBlur(src, w, h, ch, sigma) {
  const f = Math.min(8, Math.floor(sigma / 1.5));
  if (f >= 2 && w >= 4 * f && h >= 4 * f) {
    const dw = Math.floor(w / f), dh = Math.floor(h / f);
    const small = new Float32Array(dw * dh * ch);
    const inv = 1 / (f * f);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) for (let c = 0; c < ch; c++) {
      let sum = 0;
      for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) sum += src[((y * f + yy) * w + x * f + xx) * ch + c];
      small[(y * dw + x) * ch + c] = sum * inv;
    }
    const blurred = gaussianBlurExact(small, dw, dh, ch, sigma / f);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(dh - 1.001, Math.max(0, (y + 0.5) / f - 0.5)), y0 = Math.floor(sy), ty = sy - y0;
      for (let x = 0; x < w; x++) {
        const sx = Math.min(dw - 1.001, Math.max(0, (x + 0.5) / f - 0.5)), x0 = Math.floor(sx), tx = sx - x0;
        const i00 = (y0 * dw + x0) * ch, i01 = i00 + ch, i10 = i00 + dw * ch, i11 = i10 + ch, o = (y * w + x) * ch;
        for (let c = 0; c < ch; c++) {
          out[o + c] = (blurred[i00 + c] * (1 - tx) + blurred[i01 + c] * tx) * (1 - ty) + (blurred[i10 + c] * (1 - tx) + blurred[i11 + c] * tx) * ty;
        }
      }
    }
    return out;
  }
  return gaussianBlurExact(src, w, h, ch, sigma);
}

function gaussianBlurExact(src, w, h, ch, sigma) {
  const r = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * r + 1);
  let ks = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); ks += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  // horizontal: per row and channel, a reflected padded copy, then a plain dot product
  const pad = new Float32Array(w + 2 * r);
  const xidx = new Int32Array(w + 2 * r);
  for (let x = 0; x < w + 2 * r; x++) xidx[x] = reflect(x - r, w);
  const rowLen = w * ch;
  for (let y = 0; y < h; y++) {
    const row = y * rowLen;
    for (let c = 0; c < ch; c++) {
      for (let x = 0; x < w + 2 * r; x++) pad[x] = src[row + xidx[x] * ch + c];
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = 0; i <= 2 * r; i++) s += k[i] * pad[x + i];
        tmp[row + x * ch + c] = s;
      }
    }
  }
  // vertical: accumulate whole rows (cache friendly)
  for (let y = 0; y < h; y++) {
    const o = y * rowLen;
    for (let i = 0; i <= 2 * r; i++) {
      const srow = reflect(y + i - r, h) * rowLen, kk = k[i];
      for (let j = 0; j < rowLen; j++) out[o + j] += kk * tmp[srow + j];
    }
  }
  return out;
}

// cv2.resize(..., INTER_AREA): box-average downscale of RGBA bytes to Float32 RGB 0..1
function areaWeights(sLen, dLen) {
  const scale = sLen / dLen, starts = new Int32Array(dLen), counts = new Int32Array(dLen), weights = [];
  for (let d = 0; d < dLen; d++) {
    const a = d * scale, b = Math.min(sLen, (d + 1) * scale);
    const s0 = Math.floor(a), s1 = Math.min(sLen - 1, Math.ceil(b) - 1);
    starts[d] = s0; counts[d] = s1 - s0 + 1;
    for (let s = s0; s <= s1; s++) weights.push((Math.min(s + 1, b) - Math.max(s, a)) / (b - a));
  }
  return { starts, counts, weights: Float32Array.from(weights) };
}
function resizeArea(rgba, sw, sh, dw, dh) {
  const wx = areaWeights(sw, dw), wy = areaWeights(sh, dh);
  const tmp = new Float32Array(sh * dw * 3);
  let wi = 0;
  for (let dx = 0; dx < dw; dx++) {
    const s0 = wx.starts[dx], n = wx.counts[dx], w0 = wi; wi += n;
    for (let y = 0; y < sh; y++) {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < n; i++) { const p = (y * sw + s0 + i) * 4, wgt = wx.weights[w0 + i]; r += rgba[p] * wgt; g += rgba[p + 1] * wgt; b += rgba[p + 2] * wgt; }
      const o = (y * dw + dx) * 3; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b;
    }
  }
  const out = new Float32Array(dh * dw * 3);
  wi = 0;
  for (let dy = 0; dy < dh; dy++) {
    const s0 = wy.starts[dy], n = wy.counts[dy], w0 = wi; wi += n;
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < n; i++) { const p = ((s0 + i) * dw + x) * 3, wgt = wy.weights[w0 + i]; r += tmp[p] * wgt; g += tmp[p + 1] * wgt; b += tmp[p + 2] * wgt; }
      const o = (dy * dw + x) * 3; out[o] = r / 255; out[o + 1] = g / 255; out[o + 2] = b / 255;
    }
  }
  return out;
}

// np.percentile(a, q) with linear interpolation
function percentile(arr, q) {
  const s = Float32Array.from(arr).sort();
  const pos = (s.length - 1) * q / 100, lo = Math.floor(pos), hi = Math.min(s.length - 1, lo + 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// smooth_noise: band-limited noise in [0,1], smooth over about scale pixels in each axis
// (bilinear upsampling of a coarse random grid instead of cv2 INTER_CUBIC)
function smoothNoise(rng, h, w, scaleY, scaleX) {
  const lh = Math.max(2, Math.ceil(h / scaleY) + 2), lw = Math.max(2, Math.ceil(w / scaleX) + 2);
  const low = new Float32Array(lh * lw);
  for (let i = 0; i < low.length; i++) low[i] = rng.random();
  const out = new Float32Array(h * w);
  const fx = lw / w, fy = lh / h;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(lh - 1.001, Math.max(0, (y + 0.5) * fy - 0.5)), y0 = Math.floor(sy), ty = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(lw - 1.001, Math.max(0, (x + 0.5) * fx - 0.5)), x0 = Math.floor(sx), tx = sx - x0;
      const a = low[y0 * lw + x0], b = low[y0 * lw + x0 + 1], c = low[(y0 + 1) * lw + x0], d = low[(y0 + 1) * lw + x0 + 1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

// make_paper
function makePaper(h, w, base, rng, strength) {
  const tone = smoothNoise(rng, h, w, 120, 120);
  let fibre = new Float32Array(h * w);
  for (let i = 0; i < fibre.length; i++) fibre[i] = rng.random() * 2 - 1;
  fibre = gaussianBlur(fibre, w, h, 1, 0.7);
  const grain = smoothNoise(rng, h, w, 3, 3);
  const paper = new Float32Array(h * w * 3);
  for (let i = 0; i < h * w; i++) {
    const lum = 1 + strength * (0.5 * (tone[i] * 2 - 1) + 0.6 * (grain[i] * 2 - 1) + 0.8 * fibre[i]);
    for (let c = 0; c < 3; c++) paper[i * 3 + c] = Math.min(1, Math.max(0, base[c] * lum));
  }
  return paper;
}

// ----------------------------------------------------------------------------
// segmentation into colour areas
// ----------------------------------------------------------------------------
// flatten: cv2.pyrMeanShiftFiltering(img, spatial, colour). Plain mean shift per pixel, as OpenCV
// does it (integer colour means, at most 5 iterations, stop when position and colour settle),
// but without the pyramid, and the spatial window is sampled every 2nd or 3rd pixel when it is
// large: 11x11 samples of a 33x33 window give the same modes at a fraction of the cost.
// img8 is Uint8Array RGB.
function flatten(img8, w, h, sp, sr, onStep) {
  if (sp <= 0) return img8;
  const stride = sp >= 12 ? 3 : sp >= 6 ? 2 : 1;
  const n = w * h, R = new Int32Array(n), G = new Int32Array(n), B = new Int32Array(n);
  for (let i = 0; i < n; i++) { R[i] = img8[i * 3]; G[i] = img8[i * 3 + 1]; B[i] = img8[i * 3 + 2]; }
  const out = new Uint8Array(img8.length);
  const sr2 = (sr * sr) | 0;
  for (let y = 0; y < h; y++) {
    if (onStep && (y & 31) === 0) onStep(y / h);
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let cx = x, cy = y, c0 = R[p], c1 = G[p], c2 = B[p];
      for (let iter = 0; iter < 5; iter++) {
        const x0 = Math.max(cx - sp, 0), x1 = Math.min(cx + sp, w - 1), y0 = Math.max(cy - sp, 0), y1 = Math.min(cy + sp, h - 1);
        let sx = 0, sy = 0, s0 = 0, s1 = 0, s2 = 0, cnt = 0;
        const xs = x0 + ((cx - x0) % stride);
        for (let yy = y0 + ((cy - y0) % stride); yy <= y1; yy += stride) {
          const row = yy * w;
          let rowN = 0, rowX = 0;
          for (let xx = xs; xx <= x1; xx += stride) {
            const q = row + xx;
            const d0 = R[q] - c0, d1 = G[q] - c1, d2 = B[q] - c2;
            if (d0 * d0 + d1 * d1 + d2 * d2 <= sr2) { rowX += xx; s0 += R[q]; s1 += G[q]; s2 += B[q]; rowN++; }
          }
          cnt += rowN; sy += yy * rowN; sx += rowX;
        }
        if (cnt === 0) break;
        const nx = Math.round(sx / cnt), ny = Math.round(sy / cnt);
        const n0 = Math.round(s0 / cnt), n1 = Math.round(s1 / cnt), n2 = Math.round(s2 / cnt);
        const stop = nx === cx && ny === cy && Math.abs(n0 - c0) + Math.abs(n1 - c1) + Math.abs(n2 - c2) <= 1;
        cx = nx; cy = ny; c0 = n0; c1 = n1; c2 = n2;
        if (stop) break;
      }
      out[p * 3] = c0; out[p * 3 + 1] = c1; out[p * 3 + 2] = c2;
    }
  }
  return out;
}

// connected components of equal label; 4- or 8-connectivity. Returns comp id per pixel (0..n-1),
// plus per component: label, size and first (topmost-leftmost) pixel index.
function components(labels, w, h, eight) {
  const comp = new Int32Array(w * h).fill(-1);
  const compLabel = [], compSize = [], compFirst = [];
  const stack = new Int32Array(w * h);
  let n = 0;
  for (let start = 0; start < w * h; start++) {
    if (comp[start] >= 0) continue;
    const lab = labels[start];
    let sp = 0, size = 0;
    stack[sp++] = start; comp[start] = n;
    while (sp > 0) {
      const i = stack[--sp]; size++;
      const x = i % w, y = (i - x) / w;
      const x0 = x > 0, x1 = x < w - 1, y0 = y > 0, y1 = y < h - 1;
      const visit = j => { if (comp[j] < 0 && labels[j] === lab) { comp[j] = n; stack[sp++] = j; } };
      if (x0) visit(i - 1);
      if (x1) visit(i + 1);
      if (y0) visit(i - w);
      if (y1) visit(i + w);
      if (eight) {
        if (x0 && y0) visit(i - w - 1);
        if (x1 && y0) visit(i - w + 1);
        if (x0 && y1) visit(i + w - 1);
        if (x1 && y1) visit(i + w + 1);
      }
    }
    compLabel.push(lab); compSize.push(size); compFirst.push(start); n++;
  }
  return { comp, count: n, label: compLabel, size: compSize, first: compFirst };
}

// segmentation.slic(img, n_segments, compactness, start_label=1): SLIC superpixels in Lab with
// the connectivity enforcement of scikit-image (fragments smaller than half a segment are
// attached to a neighbour). Returns Int32Array labels 1..n.
function slic(lab, w, h, nSegments, compactness, onStep) {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / nSegments)));
  const cx = [], cy = [];
  for (let y = Math.floor(step / 2); y < h; y += step) for (let x = Math.floor(step / 2); x < w; x += step) { cx.push(x); cy.push(y); }
  const K = cx.length;
  const cl = new Float32Array(K * 3);
  for (let k = 0; k < K; k++) { const p = (cy[k] * w + cx[k]) * 3; cl[k * 3] = lab[p]; cl[k * 3 + 1] = lab[p + 1]; cl[k * 3 + 2] = lab[p + 2]; }
  const assign = new Int32Array(w * h).fill(-1), best = new Float32Array(w * h);
  const invM2 = 1 / (compactness * compactness), invS2 = 1 / (step * step);
  const sumL = new Float64Array(K * 3), sumX = new Float64Array(K), sumY = new Float64Array(K), cnt = new Int32Array(K);
  for (let iter = 0; iter < 10; iter++) {
    if (onStep) onStep(iter / 10);
    best.fill(Infinity);
    for (let k = 0; k < K; k++) {
      const x0 = Math.max(0, Math.round(cx[k] - 2 * step)), x1 = Math.min(w - 1, Math.round(cx[k] + 2 * step));
      const y0 = Math.max(0, Math.round(cy[k] - 2 * step)), y1 = Math.min(h - 1, Math.round(cy[k] + 2 * step));
      const L = cl[k * 3], A = cl[k * 3 + 1], B = cl[k * 3 + 2], kx = cx[k], ky = cy[k];
      for (let y = y0; y <= y1; y++) {
        const dy = y - ky;
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x, p = i * 3, dx = x - kx;
          const dl = lab[p] - L, da = lab[p + 1] - A, db = lab[p + 2] - B;
          const d = (dl * dl + da * da + db * db) * invM2 + (dx * dx + dy * dy) * invS2;
          if (d < best[i]) { best[i] = d; assign[i] = k; }
        }
      }
    }
    sumL.fill(0); sumX.fill(0); sumY.fill(0); cnt.fill(0);
    for (let i = 0; i < w * h; i++) {
      const k = assign[i]; if (k < 0) continue;
      sumL[k * 3] += lab[i * 3]; sumL[k * 3 + 1] += lab[i * 3 + 1]; sumL[k * 3 + 2] += lab[i * 3 + 2];
      sumX[k] += i % w; sumY[k] += Math.floor(i / w); cnt[k]++;
    }
    for (let k = 0; k < K; k++) {
      if (!cnt[k]) continue;
      cl[k * 3] = sumL[k * 3] / cnt[k]; cl[k * 3 + 1] = sumL[k * 3 + 1] / cnt[k]; cl[k * 3 + 2] = sumL[k * 3 + 2] / cnt[k];
      cx[k] = sumX[k] / cnt[k]; cy[k] = sumY[k] / cnt[k];
    }
  }
  // _enforce_label_connectivity_cython: every connected piece gets its own label; pieces smaller
  // than min_size are given the label of an adjacent, already labelled piece
  const minSize = Math.floor(0.5 * (w * h) / nSegments);
  const cc = components(assign, w, h, false);
  const newLabel = new Int32Array(cc.count).fill(0);
  const out = new Int32Array(w * h);
  let next = 1;
  for (let c = 0; c < cc.count; c++) {
    if (cc.size[c] >= minSize && cc.label[c] >= 0) newLabel[c] = next++;
  }
  // small pieces: adopt the label of a neighbouring pixel that has one (scan twice so chains resolve)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < w * h; i++) {
      const c = cc.comp[i];
      if (newLabel[c] !== 0) continue;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < w * h ? i + w : -1];
      for (const j of nb) if (j >= 0 && newLabel[cc.comp[j]] !== 0) { newLabel[c] = newLabel[cc.comp[j]]; break; }
    }
  }
  for (let i = 0; i < w * h; i++) out[i] = newLabel[cc.comp[i]] || 1;
  return relabelSequential(out);
}

// segmentation.relabel_sequential(labels, offset=1)
function relabelSequential(labels) {
  const map = new Map();
  const out = new Int32Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    let v = map.get(labels[i]);
    if (v === undefined) { v = map.size + 1; map.set(labels[i], v); }
    out[i] = v;
  }
  return out;
}

// graph.rag_mean_color + graph.merge_hierarchical (thresh = colour distance, RGB 0..255):
// neighbouring regions are joined, nearest pair first, while the distance between the MEANS of
// the merged regions stays below the threshold. img8 is the flattened Uint8 RGB.
function mergeRegions(labels, w, h, img8, thresh) {
  if (!(thresh > 0)) return labels;
  let n = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i] > n) n = labels[i];
  const total = new Float64Array((n + 1) * 3), count = new Float64Array(n + 1);
  const nbr = Array.from({ length: n + 1 }, () => new Set());
  for (let i = 0; i < labels.length; i++) {
    const r = labels[i];
    total[r * 3] += img8[i * 3]; total[r * 3 + 1] += img8[i * 3 + 1]; total[r * 3 + 2] += img8[i * 3 + 2]; count[r]++;
    const x = i % w;
    if (x < w - 1 && labels[i + 1] !== r) { nbr[r].add(labels[i + 1]); nbr[labels[i + 1]].add(r); }
    if (i + w < labels.length && labels[i + w] !== r) { nbr[r].add(labels[i + w]); nbr[labels[i + w]].add(r); }
  }
  const mean = r => [total[r * 3] / count[r], total[r * 3 + 1] / count[r], total[r * 3 + 2] / count[r]];
  const weight = (a, b) => { const ma = mean(a), mb = mean(b); return Math.hypot(ma[0] - mb[0], ma[1] - mb[1], ma[2] - mb[2]); };
  const alias = new Int32Array(n + 1);
  for (let r = 0; r <= n; r++) alias[r] = r;
  const alive = new Uint8Array(n + 1).fill(1);
  alive[0] = 0;
  for (;;) {
    let bestA = -1, bestB = -1, bestW = thresh;
    for (let a = 1; a <= n; a++) {
      if (!alive[a]) continue;
      for (const b of nbr[a]) {
        if (b <= a) continue;
        const wgt = weight(a, b);
        if (wgt < bestW) { bestW = wgt; bestA = a; bestB = b; }
      }
    }
    if (bestA < 0) break;
    // _merge_mean_color: src = bestB into dst = bestA
    const src = bestB, dst = bestA;
    for (let c = 0; c < 3; c++) total[dst * 3 + c] += total[src * 3 + c];
    count[dst] += count[src];
    for (const m of nbr[src]) { nbr[m].delete(src); if (m !== dst) { nbr[m].add(dst); nbr[dst].add(m); } }
    nbr[dst].delete(src);
    nbr[src].clear();
    alive[src] = 0; alias[src] = dst;
  }
  const find = r => { while (alias[r] !== r) r = alias[r]; return r; };
  const out = new Int32Array(labels.length);
  for (let i = 0; i < labels.length; i++) out[i] = find(labels[i]);
  return relabelSequential(out);
}

// ----------------------------------------------------------------------------
// stroke direction
// ----------------------------------------------------------------------------
// direction_field: 0 = horizontal stroke, 1 = vertical stroke, per pixel. Strokes run along
// edges. Pixels without a clear edge direction copy the nearest pixel that has one (here a
// breadth-first fill instead of an exact distance transform).
function directionField(gray, w, h, sigma, coherenceMin) {
  const n = w * h;
  const gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      gx[i] = x === 0 ? gray[i + 1] - gray[i] : x === w - 1 ? gray[i] - gray[i - 1] : (gray[i + 1] - gray[i - 1]) / 2;
      gy[i] = y === 0 ? gray[i + w] - gray[i] : y === h - 1 ? gray[i] - gray[i - w] : (gray[i + w] - gray[i - w]) / 2;
    }
  }
  const pxx = new Float32Array(n), pxy = new Float32Array(n), pyy = new Float32Array(n);
  for (let i = 0; i < n; i++) { pxx[i] = gx[i] * gx[i]; pxy[i] = gx[i] * gy[i]; pyy[i] = gy[i] * gy[i]; }
  const Axx = gaussianBlur(pxx, w, h, 1, sigma), Axy = gaussianBlur(pxy, w, h, 1, sigma), Ayy = gaussianBlur(pyy, w, h, 1, sigma);
  const tr = new Float32Array(n), vertical = new Uint8Array(n), coh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    tr[i] = Axx[i] + Ayy[i] + 1e-12;
    coh[i] = Math.sqrt((Axx[i] - Ayy[i]) ** 2 + 4 * Axy[i] * Axy[i]) / tr[i];
    const ang = 0.5 * Math.atan2(2 * Axy[i], Axx[i] - Ayy[i]);
    vertical[i] = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? 1 : 0;
  }
  const trMin = percentile(tr, 40);
  const strong = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) if (coh[i] > coherenceMin && tr[i] > trMin) { strong[i] = 1; queue[qt++] = i; }
  if (qt > 0 && qt < n) {
    // ndimage.distance_transform_edt(~strong, return_indices=True): nearest strong pixel, approximated by BFS
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1];
      for (const j of nb) if (j >= 0 && !strong[j]) { strong[j] = 1; vertical[j] = vertical[i]; queue[qt++] = j; }
    }
  }
  return vertical;
}

// ----------------------------------------------------------------------------
// contours: cv2.findContours(RETR_EXTERNAL, CHAIN_APPROX_NONE) and cv2.approxPolyDP
// ----------------------------------------------------------------------------
// outer boundary of one 8-connected component, Moore neighbour tracing from its topmost-leftmost pixel
const DIRS = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // clockwise from W
function traceBoundary(isFg, w, h, startIdx) {
  const sx = startIdx % w, sy = (startIdx - sx) / w;
  const pts = [[sx, sy]];
  let px = sx, py = sy, d = 0, firstMove = -1;
  const maxSteps = 4 * (w + h) * 4 + w * h;
  for (let steps = 0; steps < maxSteps; steps++) {
    let found = -1;
    for (let k = 0; k < 8; k++) {
      const nd = (d + k) % 8, qx = px + DIRS[nd][0], qy = py + DIRS[nd][1];
      if (qx >= 0 && qy >= 0 && qx < w && qy < h && isFg(qy * w + qx)) { found = nd; break; }
    }
    if (found < 0) break;                       // isolated pixel
    const nx = px + DIRS[found][0], ny = py + DIRS[found][1];
    if (px === sx && py === sy) {
      if (firstMove < 0) firstMove = found;
      else if (found === firstMove) break;      // Jacob's stopping criterion
    }
    px = nx; py = ny; d = (found + 6) % 8;
    if (px === sx && py === sy) {
      // back at the start: continue once more to test the stopping criterion
      continue;
    }
    pts.push([px, py]);
  }
  return pts;
}

// cv2.approxPolyDP(curve, epsilon, closed=True): Douglas-Peucker on a closed curve
function approxPolyDP(pts, eps) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.sqrt(L2);
  };
  // split the ring at the point farthest from the start, as OpenCV does for closed curves
  let far = 0, farD = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > farD) { farD = d; far = i; } }
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[far] = 1;
  const stack = [[0, far], [far, n]];       // [far, n] wraps around to index 0
  while (stack.length) {
    const [a, b] = stack.pop();
    const pb = pts[b % n];
    let idx = -1, maxD = eps;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i % n], pts[a], pb); if (d > maxD) { maxD = d; idx = i; } }
    if (idx >= 0) { keep[idx % n] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

// ----------------------------------------------------------------------------
// the painter
// ----------------------------------------------------------------------------
class Painter {
  constructor(target, w, h, pens, paperRgb, args, progress) {
    this.t = target;                        // Float32 RGB 0..1
    this.w = w; this.h = h;
    this.ref = { long: Math.max(h, w), width: w, height: h }[args.size_ref] || Math.max(h, w);
    this.pens = pens;
    this.penRgb = pens.map(p => p.rgb);
    this.args = args;
    this.progress = progress;
    this.rng = new RNG(args.seed);
    this.ink = new Float32Array(w * h * 3).fill(1);
    this.coverage = new Float32Array(w * h);
    this.paperFlat = Float32Array.from(paperRgb);
    this.paper = args.return_image ? makePaper(h, w, this.paperFlat, this.rng, args.paper) : null;
    this.strokes = [];
    this.labels = null;
    this.gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) this.gray[i] = 0.299 * target[i * 3] + 0.587 * target[i * 3 + 1] + 0.114 * target[i * 3 + 2];
    this.tmpLab = new Float32Array(3);
    this.tmpLab2 = new Float32Array(3);
  }

  log(msg) { if (this.args.log) this.args.log(msg); }

  // canvas pixel = paper_flat * ink
  canvasPx(i, out) { out[0] = this.paperFlat[0] * this.ink[i * 3]; out[1] = this.paperFlat[1] * this.ink[i * 3 + 1]; out[2] = this.paperFlat[2] * this.ink[i * 3 + 2]; return out; }

  // box mean of paper_flat * ink around (x, y), radius r (numpy slicing clips at the borders)
  localMean(x, y, r, out) {
    const x0 = Math.max(x - r, 0), x1 = Math.min(x + r, this.w - 1), y0 = Math.max(y - r, 0), y1 = Math.min(y + r, this.h - 1);
    let s0 = 0, s1 = 0, s2 = 0, n = 0;
    for (let yy = y0; yy <= y1; yy++) {
      let p = (yy * this.w + x0) * 3;
      for (let xx = x0; xx <= x1; xx++, p += 3) { s0 += this.ink[p]; s1 += this.ink[p + 1]; s2 += this.ink[p + 2]; n++; }
    }
    out[0] = this.paperFlat[0] * s0 / n; out[1] = this.paperFlat[1] * s1 / n; out[2] = this.paperFlat[2] * s2 / n;
    return out;
  }

  // choose_pen: pen whose stroke, at this opacity over what is already there, lands nearest the target
  // stroke_result: colour after a stroke of pen p at this opacity over `under` (ink_body: partly covers instead of only darkening)
  strokeResult(under, p, opacity, out) {
    const b = this.args.ink_body;
    for (let c = 0; c < 3; c++) {
      const mul = under[c] * (1 - opacity * (1 - p[c]));
      out[c] = b > 0 ? mul * (1 - b) + (under[c] * (1 - opacity) + p[c] * opacity) * b : mul;
    }
    return out;
  }

  choosePen(target, under, opacity) {
    const t = rgb2lab(target[0], target[1], target[2], this.tmpLab, 0), m = this.tmpLab2, res = this.tmpRes || (this.tmpRes = [0, 0, 0]);
    let best = 0, bestD = 1e9;
    for (let i = 0; i < this.penRgb.length; i++) {
      const p = this.penRgb[i];
      this.strokeResult(under, p, opacity, res);
      rgb2lab(res[0], res[1], res[2], m, 0);
      const d = (m[0] - t[0]) ** 2 + (m[1] - t[1]) ** 2 + (m[2] - t[2]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // grow: extend the stroke both ways while the target there still wants this colour
  grow(x, y, vertical, strokeRgb, width, ref, maxLen) {
    const step = Math.max(width * 0.5, 1.0), tol = this.args.colour_tol;
    const ends = [0, 0], cv = [0, 0, 0];
    for (let s = 0; s < 2; s++) {
      const sgn = s === 0 ? -1 : 1;
      let dist = 0;
      while (dist + step <= maxLen / 2) {
        const nx = vertical ? x : x + sgn * (dist + step), ny = vertical ? y + sgn * (dist + step) : y;
        const ix = Math.round(nx), iy = Math.round(ny);
        if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) break;
        const i = iy * this.w + ix;
        this.canvasPx(i, cv);
        const dStroke = Math.hypot(ref[i * 3] - strokeRgb[0], ref[i * 3 + 1] - strokeRgb[1], ref[i * 3 + 2] - strokeRgb[2]);
        const dCanvas = Math.hypot(ref[i * 3] - cv[0], ref[i * 3 + 1] - cv[1], ref[i * 3 + 2] - cv[2]);
        if (dStroke > tol || dStroke > dCanvas) break;
        dist += step;
      }
      ends[s] = dist;
    }
    return ends;
  }

  // rasterise
  rasterise(x, y, vertical, back, fwd, width, pen, opacity, level) {
    if (vertical) this.drawSegment(x, y - back, x, y + fwd, width, pen, opacity, level);
    else this.drawSegment(x - back, y, x + fwd, y, width, pen, opacity, level);
  }

  // draw_segment: one stroke from (ax,ay) to (bx,by): a slightly wandering, slightly tilted band
  drawSegment(ax, ay, bx, by, width, pen, opacity, level) {
    const a = this.args, rng = this.rng;
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 0.5) return;
    const half = width / 2;
    const ux = (bx - ax) / length, uy = (by - ay) / length;
    const nx = -uy, ny = ux;
    const tilt = rng.uniform(-a.tilt, a.tilt) * Math.PI / 180;
    const bow = rng.uniform(-1, 1) * a.bow * length;
    const amp = a.wobble > 0 ? Math.max(a.wobble * length, a.wobble_min * width) : 0;
    const waves = amp > 0 ? [
      [rng.uniform(0, 2 * Math.PI), rng.uniform(0.5, 1.2), 1.0],
      [rng.uniform(0, 2 * Math.PI), rng.uniform(1.6, 2.8), 0.45],
      [rng.uniform(0, 2 * Math.PI), rng.uniform(3.5, 6.0), 0.2]] : [];
    const hook = rng.random() < a.hook_chance ? rng.uniform(-1, 1) * a.hook * width : 0.0;
    const hookEnd = rng.random() < 0.5 ? 1 : -1;
    const hookLen = Math.max(width * a.hook_len, 1.0);
    const tanT = Math.tan(tilt);
    const pad = Math.ceil(half + a.bleed + amp * 1.65 + Math.abs(bow) + Math.abs(hook) + Math.abs(tanT) * length / 2 + 2);
    let x0 = Math.trunc(Math.min(ax, bx)) - pad, x1 = Math.trunc(Math.max(ax, bx)) + pad + 1;
    let y0 = Math.trunc(Math.min(ay, by)) - pad, y1 = Math.trunc(Math.max(ay, by)) + pad + 1;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(this.w, x1); y1 = Math.min(this.h, y1);
    if (x1 <= x0 || y1 <= y0) return;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const bh = y1 - y0, bw = x1 - x0;
    const taperLen = Math.max(width * a.taper_len, 1.0);
    const invBleed = 1 / Math.max(a.bleed, 1e-3);
    // dry-tip streaks: fine across the band, long along it
    const streakN = Math.abs(uy) > Math.abs(ux) ? smoothNoise(rng, bh, bw, 28.0, 1.6) : smoothNoise(rng, bh, bw, 1.6, 28.0);
    const pr = this.penRgb[pen];
    const k0 = 1 - pr[0], k1 = 1 - pr[1], k2 = 1 - pr[2];
    const body = a.ink_body;
    const invHalf = 1 / Math.max(half, 1e-3);
    for (let yy = y0; yy < y1; yy++) {
      const ys = yy - my;
      for (let xx = x0; xx < x1; xx++) {
        const xs = xx - mx;
        const u = xs * ux + ys * uy, v = xs * nx + ys * ny;
        const s = u / Math.max(length, 1);
        let centre = u * tanT + bow * (1 - 4 * s * s);
        for (let wv = 0; wv < waves.length; wv++) centre += amp * waves[wv][2] * Math.sin(s * 2 * Math.PI * waves[wv][1] + waves[wv][0]);
        if (hook !== 0) {
          const th = Math.min(1, Math.max(0, (hookEnd * u - (length / 2 - hookLen)) / hookLen));
          centre += hook * th * th;
        }
        const across = Math.abs(v - centre);
        const absU = Math.abs(u);
        const tEnd = Math.min(1, Math.max(0, (absU - (length / 2 - taperLen)) / taperLen));
        const halfEff = half * (1 - a.taper * tEnd);
        const over = Math.max(absU - length / 2, 0);
        const d = Math.sqrt(over * over + across * across);
        let edge = Math.min(1, Math.max(0, (halfEff - d) * invBleed + 0.5));
        if (edge <= 0) continue;
        edge = edge * edge * (3 - 2 * edge);
        const endFall = 1 - a.tip_fade * tEnd * tEnd;
        const sn = streakN[(yy - y0) * bw + (xx - x0)];
        const streak = 1 - a.streak * sn * (0.4 + 0.6 * Math.min(1, across * invHalf));
        const alpha = edge * endFall * streak * opacity;
        const i = yy * this.w + xx;
        const cov = this.coverage[i];
        const alphaEff = alpha * (1 - a.overlap_damp * cov);
        if (body > 0) {
          const o = i * 3, ink = this.ink, ae = alphaEff;
          ink[o] = ink[o] * (1 - ae * k0) * (1 - body) + (ink[o] * (1 - ae) + pr[0] * ae) * body;
          ink[o + 1] = ink[o + 1] * (1 - ae * k1) * (1 - body) + (ink[o + 1] * (1 - ae) + pr[1] * ae) * body;
          ink[o + 2] = ink[o + 2] * (1 - ae * k2) * (1 - body) + (ink[o + 2] * (1 - ae) + pr[2] * ae) * body;
        } else {
          this.ink[i * 3] *= 1 - alphaEff * k0; this.ink[i * 3 + 1] *= 1 - alphaEff * k1; this.ink[i * 3 + 2] *= 1 - alphaEff * k2;
        }
        this.coverage[i] = Math.min(1, cov + alpha);
      }
    }
    const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
    this.strokes.push({
      x0: r1(ax), y0: r1(ay), x1: r1(bx), y1: r1(by),
      width: r1(width), pen: this.pens[pen].name, opacity: r2(opacity),
      level, tilt: r2(tilt * 180 / Math.PI), bow: r2(bow),
      amp: r2(amp), waves: waves.map(([p, f, wg]) => [r2(p), r2(f), wg]),
      hook: r2(hook), hook_end: hookEnd, hook_len: r2(hookLen),
    });
  }

  // -- stage 0: segment_areas -------------------------------------------------
  segmentAreas() {
    const a = this.args, w = this.w, h = this.h, n = w * h;
    const img8 = new Uint8Array(n * 3);
    for (let i = 0; i < n * 3; i++) img8[i] = Math.min(255, Math.trunc(this.t[i] * 255 + 0.5));
    this.progress('flatten', 0);
    const flat = flatten(img8, w, h, a.flatten_spatial, a.flatten_colour, f => this.progress('flatten', f));
    this.progress('segment', 0);
    const flatF = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) flatF[i] = flat[i] / 255;
    const flatLab = labOfImage(flatF);
    const slicLabels = slic(flatLab, w, h, a.segments, a.compactness, f => this.progress('segment', f * 0.8));
    // segment(flat, segments, compactness, merge): fine areas decide the stroke direction and cap the stroke length
    this.labels = mergeRegions(slicLabels, w, h, flat, a.merge);
    this.slicLabels = slicLabels;
    let nLab = 0;
    for (let i = 0; i < n; i++) if (this.labels[i] > nLab) nLab = this.labels[i];
    this.nLabels = nLab;
    // per area: width, height of its bounding box
    const bx0 = new Int32Array(nLab + 1).fill(1e9), bx1 = new Int32Array(nLab + 1).fill(-1), by0 = new Int32Array(nLab + 1).fill(1e9), by1 = new Int32Array(nLab + 1).fill(-1);
    for (let i = 0; i < n; i++) {
      const r = this.labels[i], x = i % w, y = (i - x) / w;
      if (x < bx0[r]) bx0[r] = x; if (x > bx1[r]) bx1[r] = x; if (y < by0[r]) by0[r] = y; if (y > by1[r]) by1[r] = y;
    }
    this.extent = new Float32Array((nLab + 1) * 2);
    for (let r = 1; r <= nLab; r++) if (bx1[r] >= 0) { this.extent[r * 2] = bx1[r] - bx0[r] + 1; this.extent[r * 2 + 1] = by1[r] - by0[r] + 1; }
    // lit image: every area in the colour of its brighter part
    this.lit = Float32Array.from(this.t);
    if (a.lit_levels > 0) {
      const L = new Float32Array(n), lab = new Float32Array(3);
      for (let i = 0; i < n; i++) L[i] = rgb2lab(this.t[i * 3], this.t[i * 3 + 1], this.t[i * 3 + 2], lab, 0)[0];
      // CSR of pixel indices per label
      const cnt = new Int32Array(nLab + 2);
      for (let i = 0; i < n; i++) cnt[this.labels[i] + 1]++;
      for (let r = 1; r <= nLab + 1; r++) cnt[r] += cnt[r - 1];
      const order = new Int32Array(n), fill = Int32Array.from(cnt);
      for (let i = 0; i < n; i++) order[fill[this.labels[i]]++] = i;
      for (let r = 1; r <= nLab; r++) {
        const s = cnt[r], e = cnt[r + 1];
        if (e - s < 4) continue;
        const Lr = new Float32Array(e - s);
        for (let k = s; k < e; k++) Lr[k - s] = L[order[k]];
        const thr = percentile(Lr, 100 * (1 - a.lit_tone));
        let s0 = 0, s1 = 0, s2 = 0, m = 0;
        for (let k = s; k < e; k++) if (L[order[k]] >= thr) { const p = order[k] * 3; s0 += this.t[p]; s1 += this.t[p + 1]; s2 += this.t[p + 2]; m++; }
        if (!m) continue;
        for (let k = s; k < e; k++) { const p = order[k] * 3; this.lit[p] = s0 / m; this.lit[p + 1] = s1 / m; this.lit[p + 2] = s2 / m; }
      }
    }
    this.progress('segment', 1);
    return flat;
  }

  // Outlines of the areas the strokes follow (this.labels), for a pencil underdrawing in the viewer.
  // Each 8-connected piece of an area is traced like a contour and simplified with Douglas-Peucker (eps ~0.7 px);
  // runs along the image border are dropped. Uses no random numbers, so the strokes are unaffected.
  regionPolylines(eps = 0.7) {
    const w = this.w, h = this.h, labels = this.labels, out = [];
    const cc = components(labels, w, h, true);
    const r1 = v => Math.round(v * 10) / 10;
    for (let c = 0; c < cc.count; c++) {
      const r = cc.label[c];
      const contour = traceBoundary(i => labels[i] === r, w, h, cc.first[c]);
      if (contour.length < 12) continue;
      const poly = approxPolyDP(contour, eps);
      if (poly.length < 3) continue;
      let run = [];
      const flush = () => { if (run.length >= 4) out.push(run); run = []; };
      for (let i = 0; i <= poly.length; i++) {
        const p0 = poly[i % poly.length], p1 = poly[(i + 1) % poly.length];
        const onBorder = (p0[0] < 1 && p1[0] < 1) || (p0[1] < 1 && p1[1] < 1) ||
          (p0[0] > w - 2 && p1[0] > w - 2) || (p0[1] > h - 2 && p1[1] > h - 2);
        if (onBorder) { flush(); continue; }
        if (i === poly.length) { run.push(r1(p0[0]), r1(p0[1])); break; }
        if (!run.length) run.push(r1(p0[0]), r1(p0[1]));
        run.push(r1(p1[0]), r1(p1[1]));
      }
      flush();
    }
    return out;
  }

  // paint_contours: surround the big areas with a line
  paintContours() {
    const a = this.args, w = this.w, h = this.h, n = w * h;
    const longSide = this.ref, width = longSide * a.contour_width;
    const flat = this.segmentAreas();
    this.progress('contours', 0);
    // a coarser merge decides which big shapes get a contour line
    const labels = mergeRegions(this.slicLabels, w, h, flat, a.contour_merge);
    let nBlocks = 0;
    for (let i = 0; i < n; i++) if (labels[i] > nBlocks) nBlocks = labels[i];
    nBlocks += 1;
    const minArea = h * w * a.contour_min_area;
    const primaryIdx = new Int32Array(nBlocks), light = new Float32Array(nBlocks), big = new Uint8Array(nBlocks);
    const sum = new Float64Array(nBlocks * 3), cnt = new Int32Array(nBlocks);
    for (let i = 0; i < n; i++) { const r = labels[i]; sum[r * 3] += flat[i * 3]; sum[r * 3 + 1] += flat[i * 3 + 1]; sum[r * 3 + 2] += flat[i * 3 + 2]; cnt[r]++; }
    for (let r = 1; r < nBlocks; r++) {
      if (!cnt[r]) continue;
      const mean = [sum[r * 3] / cnt[r] / 255, sum[r * 3 + 1] / cnt[r] / 255, sum[r * 3 + 2] / cnt[r] / 255];
      primaryIdx[r] = nearestPen(mean, this.pens, 1.3);
      light[r] = this.pens[primaryIdx[r]].lab[0];
      big[r] = cnt[r] >= minArea ? 1 : 0;
    }
    const cc = components(labels, w, h, true);
    const compsOf = new Map();
    for (let c = 0; c < cc.count; c++) {
      const r = cc.label[c];
      if (!big[r]) continue;
      if (!compsOf.has(r)) compsOf.set(r, []);
      compsOf.get(r).push(c);
    }
    let count = 0;
    const segMax = longSide * a.contour_seg;
    const bigList = [...compsOf.keys()];
    for (let bi = 0; bi < bigList.length; bi++) {
      const r = bigList[bi];
      this.progress('contours', bi / bigList.length);
      const primary = this.pens[primaryIdx[r]];
      let penIdx = primaryIdx[r];
      if (a.contour_pen === 'dark') {
        const darkTarget = primary.rgb.map(v => v * a.contour_darken);
        let linePen = nearestPen(darkTarget, this.pens, 2.5);
        if (linePen === primaryIdx[r]) linePen = shadePenFor(primary, darkTarget, this.pens);
        penIdx = linePen;
      }
      const isFg = i => labels[i] === r;
      for (const c of compsOf.get(r)) {
        const contour = traceBoundary(isFg, w, h, cc.first[c]);
        if (contour.length < 8) continue;
        const poly = approxPolyDP(contour, Math.max(width * a.contour_eps, 1.5));
        if (poly.length < 2) continue;
        // split long edges so each stroke is a hand-sized segment; skip image borders
        const pts = [];
        for (let i = 0; i < poly.length; i++) {
          const p0 = poly[i], p1 = poly[(i + 1) % poly.length];
          const onBorder = (p0[0] < 1 && p1[0] < 1) || (p0[1] < 1 && p1[1] < 1) ||
            (p0[0] > w - 2 && p1[0] > w - 2) || (p0[1] > h - 2 && p1[1] > h - 2);
          if (onBorder) continue;
          const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          const k = Math.max(1, Math.ceil(L / segMax));
          for (let s = 0; s < k; s++) {
            pts.push([[p0[0] + (p1[0] - p0[0]) * s / k, p0[1] + (p1[1] - p0[1]) * s / k],
                      [p0[0] + (p1[0] - p0[0]) * (s + 1) / k, p0[1] + (p1[1] - p0[1]) * (s + 1) / k]]);
          }
        }
        for (const [q0, q1] of pts) {
          const dx = q1[0] - q0[0], dy = q1[1] - q0[1];
          const L = Math.hypot(dx, dy) + 1e-6;
          if (a.contour_pen === 'block') {
            // which block lies on the other side of this piece of the line?
            const midx = (q0[0] + q1[0]) / 2, midy = (q0[1] + q1[1]) / 2;
            const nrx = -dy / L, nry = dx / L, off = Math.max(width * 2, 3);
            let px = Math.round(midx + nrx * off), py = Math.round(midy + nry * off);
            let other = (px >= 0 && px < w && py >= 0 && py < h) ? labels[py * w + px] : 0;
            if (other === r) {
              px = Math.round(midx - nrx * off); py = Math.round(midy - nry * off);
              other = (px >= 0 && px < w && py >= 0 && py < h) ? labels[py * w + px] : 0;
            }
            if (other > 0 && light[other] < light[r]) {
              if (big[other]) continue;                 // the darker block draws this edge itself
              penIdx = primaryIdx[other];               // a small dark neighbour: lend its pen
            } else {
              penIdx = primaryIdx[r];
            }
          }
          // overshoot a touch, like a pen that does not stop exactly at the corner
          const o = width * this.rng.uniform(0, 1), ox = dx / L * o, oy = dy / L * o;
          this.drawSegment(q0[0] - ox, q0[1] - oy, q1[0] + ox, q1[1] + oy, width, penIdx, a.contour_opacity, -1);
          count++;
        }
      }
    }
    this.log(`contours: ${count} strokes along ${nBlocks - 1} regions`);
    this.progress('contours', 1);
    return count;
  }

  // -- main loop: paint_level ------------------------------------------------
  paintLevel(level, width, opacity, threshold) {
    const a = this.args, w = this.w, h = this.h, n = w * h;
    const real = a.style === 'realistic';   // older paint_level: no paper_show, local-average checks or stroke_share
    const sigma = Math.max(width * a.blur, 0.5);
    const ref = gaussianBlur(level < a.lit_levels ? this.lit : this.t, w, h, 3, sigma);
    if (a.direction_scale === 'per-level' || !this.verticalMap) {
      const s = a.direction_scale === 'coarse' ? this.ref * a.direction_sigma : Math.max(width * 0.75, 1.5);
      this.verticalMap = directionField(gaussianBlur(this.gray, w, h, 1, Math.max(sigma, 1.0)), w, h, s, a.coherence);
      if (a.direction_scale === 'coarse' && this.labels) {
        // one direction per area: majority vote inside each segmented area
        const cnt = new Int32Array(this.nLabels + 1), vsum = new Int32Array(this.nLabels + 1);
        for (let i = 0; i < n; i++) { cnt[this.labels[i]]++; vsum[this.labels[i]] += this.verticalMap[i]; }
        for (let i = 0; i < n; i++) { const r = this.labels[i]; if (cnt[r] >= 64) this.verticalMap[i] = vsum[r] / cnt[r] > 0.5 ? 1 : 0; }
      }
    }
    const verticalMap = this.verticalMap;
    const canvas = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) canvas[i * 3 + c] = this.paperFlat[c] * this.ink[i * 3 + c];
    // v1.8: a share of the area stays paper, so strokes aim deeper than the photo colour
    const sh = a.paper_show, inv = 1 / Math.max(1 - sh, 1e-3);
    let deep = ref;
    if (!real) {
      deep = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) deep[i] = Math.min(1, Math.max(0, (ref[i] - sh * this.paperFlat[i % 3]) * inv));
    }
    // done-ness is judged on the local average (realistic: on the canvas itself)
    const avgSigma = Math.max(width * a.grid, 1.0);
    const avg = real ? canvas : gaussianBlur(canvas, w, h, 3, avgSigma);
    const err = new Float32Array(n), la = new Float32Array(3), lb = new Float32Array(3);
    for (let i = 0; i < n; i++) {
      rgb2lab(avg[i * 3], avg[i * 3 + 1], avg[i * 3 + 2], la, 0);
      rgb2lab(ref[i * 3], ref[i * 3 + 1], ref[i * 3 + 2], lb, 0);
      err[i] = dist3(la, 0, lb, 0);
    }
    // candidate seeds: one per grid cell, at the cell's worst pixel, if the cell is bad enough
    const g = Math.max(Math.round(width * a.grid), 1);
    let seeds = [];
    for (let cy = 0; cy < h; cy += g) {
      for (let cx = 0; cx < w; cx += g) {
        let sum = 0, cnt = 0, mx = -1, mi = -1;
        for (let y = cy; y < Math.min(cy + g, h); y++) {
          for (let x = cx; x < Math.min(cx + g, w); x++) {
            const e = err[y * w + x]; sum += e; cnt++;
            if (e > mx) { mx = e; mi = y * w + x; }
          }
        }
        const mean = sum / cnt;
        if (mean > threshold) seeds.push([mi % w, Math.floor(mi / w), mean]);
      }
    }
    this.rng.shuffle(seeds);
    if (!real && seeds.length) seeds = seeds.slice(0, Math.max(1, Math.round(seeds.length * a.stroke_share)));
    if (a.order === 'worst-first') seeds.sort((p, q) => q[2] - p[2]);

    let painted = 0;
    const maxLen = width * a.max_len;
    const r = Math.trunc(avgSigma);
    const canvasPx = [0, 0, 0], local = [0, 0, 0], strokeRgb = [0, 0, 0], tgt = [0, 0, 0];
    const tgtLab = new Float32Array(3), t1 = new Float32Array(3), t2 = new Float32Array(3), t3 = new Float32Array(3);
    const under = [0, 0, 0], after = [0, 0, 0], locB = [0, 0, 0], locA = [0, 0, 0];
    const every = Math.max(1, Math.floor(seeds.length / 50));
    for (let si = 0; si < seeds.length; si++) {
      if (si % every === 0) this.progress(`level ${level}`, si / seeds.length, { painted });
      const sx = seeds[si][0], sy = seeds[si][1], sidx = sy * w + sx;
      // re-check: an earlier stroke of this level may already have fixed this spot
      this.canvasPx(sidx, canvasPx);
      if (real) { local[0] = canvasPx[0]; local[1] = canvasPx[1]; local[2] = canvasPx[2]; } else this.localMean(sx, sy, r, local);
      rgb2lab(local[0], local[1], local[2], t1, 0);
      rgb2lab(ref[sidx * 3], ref[sidx * 3 + 1], ref[sidx * 3 + 2], t2, 0);
      if (dist3(t1, 0, t2, 0) < threshold * 0.6) continue;
      const vert = a.directions === 'auto' ? verticalMap[sidx] === 1 : a.directions === 'v';
      tgt[0] = deep[sidx * 3]; tgt[1] = deep[sidx * 3 + 1]; tgt[2] = deep[sidx * 3 + 2];
      const pen = this.choosePen(tgt, canvasPx, opacity);
      const pr = this.penRgb[pen];
      this.strokeResult(canvasPx, pr, opacity, strokeRgb);
      // ink only darkens: paint only if the best pen actually brings us closer to the deep target
      rgb2lab(tgt[0], tgt[1], tgt[2], tgtLab, 0);
      rgb2lab(canvasPx[0], canvasPx[1], canvasPx[2], t1, 0);
      rgb2lab(strokeRgb[0], strokeRgb[1], strokeRgb[2], t2, 0);
      const errBefore = dist3(t1, 0, tgtLab, 0), errAfter = dist3(t2, 0, tgtLab, 0);
      if (errAfter > errBefore - a.min_gain) continue;
      // a stroke stays in proportion to its facet
      const ext = this.extent[this.labels[sidx] * 2 + (vert ? 1 : 0)];
      const seedMax = Math.max(Math.min(maxLen, ext * a.facet_len), width * a.min_len);
      let [back, fwd] = this.grow(sx, sy, vert, strokeRgb, width, deep, seedMax);
      if (back + fwd < width * a.min_len) { back = fwd = width * a.min_len / 2; }
      // ... and the whole stroke must help on average, not just its seed point
      const nS = Math.max(3, Math.trunc((back + fwd) / Math.max(width, 1)));
      const cover = Math.min(width / (2 * r + 1), 1.0);
      let gainSum = 0, locGainSum = 0;
      for (let k = 0; k < nS; k++) {
        const ts = -back + (back + fwd) * k / (nS - 1);
        const px = Math.min(w - 1, Math.max(0, Math.round(sx + (vert ? 0 : ts))));
        const py = Math.min(h - 1, Math.max(0, Math.round(sy + (vert ? ts : 0))));
        const i = py * w + px;
        this.canvasPx(i, under);
        this.strokeResult(under, pr, opacity, after);
        rgb2lab(deep[i * 3], deep[i * 3 + 1], deep[i * 3 + 2], t3, 0);
        rgb2lab(under[0], under[1], under[2], t1, 0);
        rgb2lab(after[0], after[1], after[2], t2, 0);
        gainSum += dist3(t1, 0, t3, 0) - dist3(t2, 0, t3, 0);
        if (real) continue;
        // v1.8: the local average (stroke plus the paper around it) must not overshoot the real target
        this.localMean(px, py, r, locB);
        for (let c = 0; c < 3; c++) locA[c] = locB[c] + cover * (after[c] - under[c]);
        rgb2lab(ref[i * 3], ref[i * 3 + 1], ref[i * 3 + 2], t3, 0);
        rgb2lab(locB[0], locB[1], locB[2], t1, 0);
        rgb2lab(locA[0], locA[1], locA[2], t2, 0);
        locGainSum += dist3(t1, 0, t3, 0) - dist3(t2, 0, t3, 0);
      }
      if (gainSum / nS < a.min_gain) continue;
      if (locGainSum / nS < 0) continue;
      this.rasterise(sx, sy, vert, back, fwd, width, pen, opacity, level);
      painted++;
    }
    this.progress(`level ${level}`, 1, { painted });
    return [painted, seeds.length];
  }

  // run
  run() {
    const a = this.args;
    const widths = listOf(a.widths).map(f => this.ref * f);
    const opacities = listOf(a.opacities), thresholds = listOf(a.thresholds);
    if (a.contours) this.paintContours(); else this.segmentAreas();
    this.regions = this.regionPolylines();
    for (let level = 0; level < widths.length; level++) {
      const op = opacities[Math.min(level, opacities.length - 1)], th = thresholds[Math.min(level, thresholds.length - 1)];
      const [painted, cand] = this.paintLevel(level, widths[level], op, th);
      this.log(`level ${level}: width ${widths[level].toFixed(1)}px opacity ${op.toFixed(2)} threshold ${th}: ${painted} strokes (${cand} candidates)`);
    }
  }

  // the simulated painting, paper * ink, as RGBA bytes
  image() {
    const n = this.w * this.h, out = new Uint8ClampedArray(n * 4);
    const paper = this.paper || makePaper(this.h, this.w, this.paperFlat, this.rng, this.args.paper);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.min(1, Math.max(0, paper[i * 3 + c] * this.ink[i * 3 + c])) * 255 + 0.5;
      out[i * 4 + 3] = 255;
    }
    return out;
  }
}

// ----------------------------------------------------------------------------
// entry point
// ----------------------------------------------------------------------------
/**
 * generateStrokes(imageData, options, onProgress)
 *   imageData : { width, height, data: Uint8ClampedArray RGBA } (a canvas ImageData works as is)
 *   options   : any subset of DEFAULTS (Python CLI names)
 *   onProgress: optional function({ phase, fraction, overall, painted })
 * returns { width, height, palette: { paper, pens: { name: hex } }, strokes: [...], image? }
 */
export function generateStrokes(imageData, options = {}, onProgress = null) {
  const args = { ...DEFAULTS, ...(options.style === 'realistic' ? REALISTIC : {}), ...options };
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { pens, paper, viewerPalette } = loadPalette(args.palette || DEFAULT_PALETTE);
  // main(): downscale so the long side is at most max_size
  const sw = imageData.width, sh = imageData.height;
  const s = args.max_size / Math.max(sw, sh);
  const w = s < 1 ? Math.trunc(sw * s) : sw, h = s < 1 ? Math.trunc(sh * s) : sh;
  const target = resizeArea(imageData.data, sw, sh, w, h);

  // progress: phases weighted roughly by their share of the runtime
  const nLevels = listOf(args.widths).length;
  const phases = ['flatten', 'segment', 'contours'];
  for (let i = 0; i < nLevels; i++) phases.push(`level ${i}`);
  const weights = { flatten: 0.25, segment: 0.1, contours: 0.05 };
  const levelW = 0.6 / nLevels;
  const start = {};
  let acc = 0;
  for (const p of phases) { start[p] = acc; acc += weights[p] ?? levelW; }
  const progress = (phase, fraction, extra = {}) => {
    if (!onProgress) return;
    const wgt = weights[phase] ?? levelW;
    onProgress({ phase, fraction, overall: Math.min(1, (start[phase] ?? 0) + wgt * fraction), ...extra });
  };

  const painter = new Painter(target, w, h, pens, paper, args, progress);
  painter.run();
  const result = { width: w, height: h, palette: viewerPalette, strokes: painter.strokes, style: args.style,
                   ink_body: args.ink_body, contours: args.contours, regions: painter.regions };
  if (args.return_image) result.image = painter.image();
  result.seconds = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) / 1000;
  if (onProgress) onProgress({ phase: 'done', fraction: 1, overall: 1 });
  return result;
}

export default generateStrokes;
