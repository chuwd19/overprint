// Spot-colour separation.
//
// Physical model (Murray-Davies / Neugebauer): a screened tint of coverage a is a
// fraction of the area printed solid, so its reflectance is linear in coverage --
//   R = P * prod_i (1 - a_i * (1 - C_i))
// for ink colours C on paper P. That product is what the renderer composites, so the
// separator inverts exactly it: a cheap linear-absorbance estimate seeds a few
// Gauss-Newton steps in density space, which converges in 2-3 iterations.

import { hexToLinear, invertSmall, linearToOklab, luminance } from './color.js';

const EPS = 0.0035;

// The fit is weighted toward the channels the eye reads as lightness, so when a
// colour falls outside the ink set's gamut the error lands in hue rather than tone.
const W = [0.26, 0.62, 0.12];

/**
 * Seed matrix: least-squares inverse of the first-order model 1 - R/P = sum a_i (1-C_i).
 * Exact for a single ink; for several it ignores the overlap term, which the
 * Gauss-Newton refinement below puts back.
 */
export function separationRows(inkLinears) {
  const n = inkLinears.length;
  const A = inkLinears.map((c) => c.map((v) => 1 - Math.min(v, 1 - EPS)));

  const G = [];
  let trace = 0;
  for (let i = 0; i < n; i++) {
    G.push([]);
    for (let j = 0; j < n; j++) {
      G[i][j] = W[0] * A[i][0] * A[j][0] + W[1] * A[i][1] * A[j][1] + W[2] * A[i][2] * A[j][2];
    }
    trace += G[i][i];
  }
  const ridge = Math.max(trace * 1e-3, 1e-6);
  for (let i = 0; i < n; i++) G[i][i] += ridge;

  const Gi = invertSmall(G, n);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = [0, 0, 0];
    if (Gi) for (let j = 0; j < n; j++) for (let k = 0; k < 3; k++) r[k] += Gi[i][j] * A[j][k] * W[k];
    rows.push(r);
  }
  return rows;
}

const GN_ITERS = 3;

/**
 * Ink coverages reproducing `linear` on `paperLinear`, clamped to a printable 0..1.
 * `rows` comes from separationRows() for the same ink set.
 */
export function solveAmounts(rows, inkLinears, linear, paperLinear, out) {
  const n = rows.length;

  // Seed from the linear model.
  const t0 = 1 - Math.min(linear[0] / Math.max(paperLinear[0], 1e-4), 4);
  const t1 = 1 - Math.min(linear[1] / Math.max(paperLinear[1], 1e-4), 4);
  const t2 = 1 - Math.min(linear[2] / Math.max(paperLinear[2], 1e-4), 4);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    out[i] = Math.min(1, Math.max(0, r[0] * t0 + r[1] * t1 + r[2] * t2));
  }

  // Target optical density relative to the paper.
  const D = [
    -Math.log(Math.max(linear[0], 1e-4) / Math.max(paperLinear[0], 1e-4)),
    -Math.log(Math.max(linear[1], 1e-4) / Math.max(paperLinear[1], 1e-4)),
    -Math.log(Math.max(linear[2], 1e-4) / Math.max(paperLinear[2], 1e-4)),
  ];

  const J = [];
  for (let i = 0; i < n; i++) J.push([0, 0, 0]);
  const res = [0, 0, 0];
  const G = [];
  for (let i = 0; i < n; i++) G.push(new Array(n).fill(0));
  const b = new Array(n).fill(0);

  for (let iter = 0; iter < GN_ITERS; iter++) {
    for (let k = 0; k < 3; k++) res[k] = D[k];
    for (let i = 0; i < n; i++) {
      const c = inkLinears[i], a = out[i];
      for (let k = 0; k < 3; k++) {
        const absorb = 1 - Math.min(c[k], 1 - EPS);
        const t = Math.max(1 - a * absorb, 0.02);   // this ink's transmittance
        res[k] += Math.log(t);                       // subtract density already placed
        J[i][k] = absorb / t;                        // d(density)/d(coverage)
      }
    }
    let trace = 0;
    for (let i = 0; i < n; i++) {
      b[i] = W[0] * J[i][0] * res[0] + W[1] * J[i][1] * res[1] + W[2] * J[i][2] * res[2];
      for (let j = 0; j < n; j++) {
        G[i][j] = W[0] * J[i][0] * J[j][0] + W[1] * J[i][1] * J[j][1] + W[2] * J[i][2] * J[j][2];
      }
      trace += G[i][i];
    }
    const ridge = Math.max(trace * 1e-3, 1e-6);
    for (let i = 0; i < n; i++) G[i][i] += ridge;

    const Gi = invertSmall(G, n);
    if (!Gi) break;
    for (let i = 0; i < n; i++) {
      let step = 0;
      for (let j = 0; j < n; j++) step += Gi[i][j] * b[j];
      out[i] = Math.min(1, Math.max(0, out[i] + Math.min(0.6, Math.max(-0.6, step))));
    }
  }
  return out;
}

/** What the press would actually lay down for those amounts. */
export function overprint(amounts, inkLinears, paperLinear, out) {
  out[0] = paperLinear[0]; out[1] = paperLinear[1]; out[2] = paperLinear[2];
  for (let i = 0; i < inkLinears.length; i++) {
    const a = amounts[i], c = inkLinears[i];
    out[0] *= 1 + a * (c[0] - 1);
    out[1] *= 1 + a * (c[1] - 1);
    out[2] *= 1 + a * (c[2] - 1);
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

function comboError(indices, lib, samples, paperLinear) {
  const inkLinears = indices.map((i) => lib[i].linear);
  const rows = separationRows(inkLinears);
  const amounts = new Float32Array(indices.length);
  const recon = [0, 0, 0];
  const target = [0, 0, 0];
  let err = 0;
  for (let s = 0; s < samples.length; s += 3) {
    target[0] = samples[s]; target[1] = samples[s + 1]; target[2] = samples[s + 2];
    solveAmounts(rows, inkLinears, target, paperLinear, amounts);
    overprint(amounts, inkLinears, paperLinear, recon);
    const a = linearToOklab(target), b = linearToOklab(recon);
    const dL = a[0] - b[0], dA = a[1] - b[1], dB = a[2] - b[2];
    err += dL * dL + dA * dA + dB * dB;
  }
  return err / (samples.length / 3);
}

/**
 * Pick the ink set that reproduces this photo most faithfully on this paper.
 * Exhaustive for 1 and 2 inks; for 3 it seeds from the best pair and then refines
 * each slot against the whole library until no swap helps.
 */
export function autoPickInks(inkLibrary, samples, paperLinear, count) {
  const lib = inkLibrary.map((ink) => ({ ...ink, linear: hexToLinear(ink.hex) }));
  const n = lib.length;
  const score = (idx) => comboError(idx, lib, samples, paperLinear);

  let best = null, bestErr = Infinity;

  if (count === 1) {
    for (let i = 0; i < n; i++) {
      const e = score([i]);
      if (e < bestErr) { bestErr = e; best = [i]; }
    }
  } else {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const e = score([i, j]);
        if (e < bestErr) { bestErr = e; best = [i, j]; }
      }
    }
    if (count === 3) {
      let third = -1;
      for (let k = 0; k < n; k++) {
        if (best.includes(k)) continue;
        const e = score([...best, k]);
        if (e < bestErr || third === -1) { bestErr = e; third = k; }
      }
      best = [...best, third];
      for (let pass = 0; pass < 2; pass++) {
        for (let slot = 0; slot < 3; slot++) {
          for (let k = 0; k < n; k++) {
            if (best.includes(k)) continue;
            const trial = best.slice();
            trial[slot] = k;
            const e = score(trial);
            if (e < bestErr - 1e-9) { bestErr = e; best = trial; }
          }
        }
      }
    }
  }

  // Darkest ink first: it carries the structure, so it gets the dominant screen angle.
  best.sort((a, b) => luminance(lib[a].linear) - luminance(lib[b].linear));
  return { inks: best.map((i) => inkLibrary[i].name), error: bestErr };
}
