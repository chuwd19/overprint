// Spot-colour separation.
//
// Physical model. A screened tint of coverage a is a fraction of the area printed
// solid, so its reflectance is linear in coverage (Murray-Davies). A solid dot is
// not a pure filter, though: ink has hiding power h, so the dot's colour is a mix
// of the base seen through the ink and the ink's own colour,
//   dot = (1 - h) * base * C + h * C,       R = base * (1 - a) + a * dot.
// Inks go down in order, each on the result of the last. With h = 0 this is the
// familiar R = P * prod(1 - a_i (1 - C_i)); with h > 0 a light ink can lighten a
// dark stock, which is how white works.
//
// The separator inverts that product per pixel: a least-squares seed from the
// model linearised around bare paper, then Gauss-Newton on the relative residual
// (R_target - R) / R, which is the density error to first order and converges in
// three or four steps. The shader in render.js runs the same steps.

import { hexToLinear, linearToOklab, luminance } from './color.js';

const EPS = 0.0035;
const GN_ITERS = 4;

// The fit is weighted toward the channels the eye reads as lightness, so when a
// colour falls outside the ink set's gamut the error lands in hue rather than tone.
const W = [0.26, 0.62, 0.12];

/** An ink ready for the solver: linear colour, hiding, and 1 - C with a floor. */
export function prepInk(ink) {
  const linear = hexToLinear(ink.hex);
  return { name: ink.name, linear, hiding: ink.hiding ?? 0.2, c: linear.map((v) => Math.min(v, 1 - EPS)) };
}

/** What the press lays down for those amounts, ink by ink. */
export function overprint(amounts, inks, paperLinear, out) {
  out[0] = paperLinear[0]; out[1] = paperLinear[1]; out[2] = paperLinear[2];
  for (let i = 0; i < inks.length; i++) {
    const a = amounts[i], { c, hiding: h } = inks[i];
    for (let k = 0; k < 3; k++) {
      const dot = (1 - h) * out[k] * c[k] + h * c[k];
      out[k] += a * (dot - out[k]);
    }
  }
  return out;
}

// Scratch for the solver, one set per ink count, so a fit allocates nothing:
// it runs once per pixel sample, tens of thousands of times per Auto-pick.
const scratch = [];
function scratchFor(n) {
  return scratch[n] || (scratch[n] = {
    G: new Float64Array(n * n), b: new Float64Array(n), B: new Float64Array(n * 3),
    D: new Float64Array(n * 3), M: new Float64Array(n * 3), J: new Float64Array(n * 3),
    R: new Float64Array(3), res: new Float64Array(3), acc: new Float64Array(3), x: new Float64Array(n),
  });
}

/** Solve (G + ridge) x = b in place for n <= 3 by elimination with pivoting; false if singular. */
function solveNormal(G, b, n, x) {
  let trace = 0;
  for (let i = 0; i < n; i++) trace += G[i * n + i];
  const ridge = Math.max(trace * 1e-3, 1e-6);
  for (let i = 0; i < n; i++) { G[i * n + i] += ridge; x[i] = b[i]; }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(G[r * n + col]) > Math.abs(G[piv * n + col])) piv = r;
    if (Math.abs(G[piv * n + col]) < 1e-12) return false;
    if (piv !== col) {
      for (let k = 0; k < n; k++) { const t = G[col * n + k]; G[col * n + k] = G[piv * n + k]; G[piv * n + k] = t; }
      const t = x[col]; x[col] = x[piv]; x[piv] = t;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = G[r * n + col] / G[col * n + col];
      if (f === 0) continue;
      for (let k = col; k < n; k++) G[r * n + k] -= f * G[col * n + k];
      x[r] -= f * x[col];
    }
  }
  for (let i = 0; i < n; i++) x[i] /= G[i * n + i];
  return true;
}

/**
 * Ink coverages reproducing `target` (linear) on `paperLinear`, clamped to a
 * printable 0..1. `inks` come from prepInk() and are laid down in that order.
 */
export function solveAmounts(inks, target, paperLinear, out) {
  const n = inks.length;
  const { G, b, B, D, M, J, R, res, acc, x } = scratchFor(n);

  // Seed: every ink linearised around bare paper, R ~ P + sum a_i (dot_i(P) - P).
  for (let i = 0; i < n; i++) {
    const { c, hiding: h } = inks[i];
    for (let k = 0; k < 3; k++) B[i * 3 + k] = (1 - h) * paperLinear[k] * c[k] + h * c[k] - paperLinear[k];
  }
  for (let i = 0; i < n; i++) {
    let bi = 0;
    for (let k = 0; k < 3; k++) bi += W[k] * B[i * 3 + k] * (target[k] - paperLinear[k]);
    b[i] = bi;
    for (let j = 0; j < n; j++) {
      G[i * n + j] = W[0] * B[i * 3] * B[j * 3] + W[1] * B[i * 3 + 1] * B[j * 3 + 1] + W[2] * B[i * 3 + 2] * B[j * 3 + 2];
    }
  }
  if (solveNormal(G, b, n, x)) for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, x[i]));
  else for (let i = 0; i < n; i++) out[i] = 0;

  // Gauss-Newton on the relative residual.
  for (let iter = 0; iter < GN_ITERS; iter++) {
    R[0] = paperLinear[0]; R[1] = paperLinear[1]; R[2] = paperLinear[2];
    for (let i = 0; i < n; i++) {
      const a = out[i], { c, hiding: h } = inks[i];
      for (let k = 0; k < 3; k++) {
        const dot = (1 - h) * R[k] * c[k] + h * c[k];
        D[i * 3 + k] = dot - R[k];                       // d(layer)/d(coverage)
        M[i * 3 + k] = 1 - a * (1 - (1 - h) * c[k]);     // d(layer)/d(base)
        R[k] += a * D[i * 3 + k];
      }
    }
    acc[0] = 1; acc[1] = 1; acc[2] = 1;
    for (let i = n - 1; i >= 0; i--) {
      for (let k = 0; k < 3; k++) { J[i * 3 + k] = D[i * 3 + k] * acc[k]; acc[k] *= M[i * 3 + k]; }
    }
    for (let k = 0; k < 3; k++) {
      const inv = 1 / Math.max(R[k], 0.004);
      res[k] = (target[k] - R[k]) * inv;
      for (let i = 0; i < n; i++) J[i * 3 + k] *= inv;
    }
    for (let i = 0; i < n; i++) {
      b[i] = W[0] * J[i * 3] * res[0] + W[1] * J[i * 3 + 1] * res[1] + W[2] * J[i * 3 + 2] * res[2];
      for (let j = 0; j < n; j++) {
        G[i * n + j] = W[0] * J[i * 3] * J[j * 3] + W[1] * J[i * 3 + 1] * J[j * 3 + 1] + W[2] * J[i * 3 + 2] * J[j * 3 + 2];
      }
    }
    if (!solveNormal(G, b, n, x)) break;
    for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, out[i] + Math.min(0.6, Math.max(-0.6, x[i]))));
  }
  return out;
}

/**
 * Stratified linear-light samples of an image, for fitting inks against.
 * Returns a flat Float32Array of rgb triples.
 */
export function sampleImage(source, maxSamples = 1400) {
  const w = 110, h = 110;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const total = w * h;
  const stride = Math.max(1, Math.floor(total / maxSamples));
  const count = Math.floor(total / stride);
  const out = new Float32Array(count * 3);
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  for (let s = 0, i = 0; s < count; s++, i += stride) {
    out[s * 3 + 0] = toLin(px[i * 4 + 0] / 255);
    out[s * 3 + 1] = toLin(px[i * 4 + 1] / 255);
    out[s * 3 + 2] = toLin(px[i * 4 + 2] / 255);
  }
  return out;
}

export function comboError(indices, lib, samples, paperLinear, stride = 3) {
  const inks = indices.map((i) => lib[i]);
  const amounts = new Float32Array(indices.length);
  const recon = [0, 0, 0];
  const target = [0, 0, 0];
  let err = 0, n = 0;
  for (let s = 0; s < samples.length; s += stride, n++) {
    target[0] = samples[s]; target[1] = samples[s + 1]; target[2] = samples[s + 2];
    solveAmounts(inks, target, paperLinear, amounts);
    overprint(amounts, inks, paperLinear, recon);
    const a = linearToOklab(target), b = linearToOklab(recon);
    const dL = a[0] - b[0], dA = a[1] - b[1], dB = a[2] - b[2];
    err += dL * dL + dA * dA + dB * dB;
  }
  return err / n;
}

/**
 * Pick the ink set that reproduces this photo most faithfully on this paper.
 * Every pair is screened on a few of the samples, the survivors re-scored on
 * more, and the last few on all of them; for three inks every triple gets the
 * same treatment when the pool is small, and the best pair grows by one ink
 * when it is not, followed by slot-by-slot swaps until none helps.
 */
export const FUNNEL = { rough: 27, coarse: 9, pairs: [150, 14], thirds: [40, 8], swaps: [30, 6], allTriples: 32, tripleRough: 27 };

export function autoPickInks(inkLibrary, samples, paperLinear, count, opts = {}) {
  const F = { ...FUNNEL, ...opts };
  // The stock is the print's white. An ink that only lightens it (White, on
  // anything pale) would be chosen to brighten highlights beyond the paper, which
  // is true to the model and wrong for a print; it joins the search only on stock
  // dark enough that lightening is the point, kraft and darker.
  const paperLum = luminance(paperLinear);
  const solid = [0, 0, 0];
  const lib = inkLibrary.map(prepInk).filter((ink) =>
    paperLum < 0.45 || luminance(overprint([1], [ink], paperLinear, solid)) < paperLum - 0.01);
  const n = lib.length;
  const rough = (idx) => comboError(idx, lib, samples, paperLinear, F.rough);
  const coarse = (idx) => comboError(idx, lib, samples, paperLinear, F.coarse);
  const score = (idx) => comboError(idx, lib, samples, paperLinear, 3);
  const funnel = (cands, [keepA, keepB]) => {
    cands.sort((a, b) => a.e - b.e);
    const mid = cands.slice(0, keepA).map((c) => ({ idx: c.idx, e: coarse(c.idx) })).sort((a, b) => a.e - b.e);
    return mid.slice(0, keepB).map((c) => ({ idx: c.idx, e: score(c.idx) })).sort((a, b) => a.e - b.e)[0];
  };

  let best = null, bestErr = Infinity;

  if (count === 1) {
    for (let i = 0; i < n; i++) {
      const e = score([i]);
      if (e < bestErr) { bestErr = e; best = [i]; }
    }
  } else {
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push({ idx: [i, j], e: rough([i, j]) });
    const top = funnel(pairs, F.pairs);
    best = top.idx; bestErr = top.e;
    if (count === 3) {
      // A small pool affords a rough look at every triple; a large one grows
      // the best pair by a third ink instead.
      const thirds = [];
      if (n <= F.allTriples) {
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
          thirds.push({ idx: [i, j, k], e: comboError([i, j, k], lib, samples, paperLinear, F.tripleRough) });
        }
      } else {
        for (let k = 0; k < n; k++) if (!best.includes(k)) thirds.push({ idx: [...best, k], e: rough([...best, k]) });
      }
      const t = funnel(thirds, F.thirds);
      best = t.idx; bestErr = t.e;
      for (let pass = 0; pass < 2; pass++) {
        for (let slot = 0; slot < 3; slot++) {
          const cands = [];
          for (let k = 0; k < n; k++) {
            if (best.includes(k)) continue;
            const trial = best.slice();
            trial[slot] = k;
            cands.push({ idx: trial, e: rough(trial) });
          }
          const c = funnel(cands, F.swaps);
          if (c.e < bestErr - 1e-9) { bestErr = c.e; best = c.idx; }
        }
      }
    }
  }

  // Darkest ink first: it carries the structure, so it gets the dominant screen angle.
  best.sort((a, b) => luminance(lib[a].linear) - luminance(lib[b].linear));
  return { inks: best.map((i) => lib[i].name), error: bestErr };
}
