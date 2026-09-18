// Color + small-matrix helpers shared by the separator and the renderer.

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16).padStart(2, '0')).join('');
}

export function srgbToLinear(c) {
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
}

export function linearToSrgb(c) {
  return c.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
}

export function hexToLinear(hex) {
  return srgbToLinear(hexToRgb(hex));
}

// Oklab, for perceptually-sane ink-fit scoring.
export function linearToOklab(c) {
  const l = 0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2];
  const m = 0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2];
  const s = 0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2];
  const l_ = Math.cbrt(Math.max(l, 0)), m_ = Math.cbrt(Math.max(m, 0)), s_ = Math.cbrt(Math.max(s, 0));
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

export function luminance(linear) {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

// Invert a small (1..3) symmetric matrix given as nested arrays. Returns null if singular.
export function invertSmall(G, n) {
  if (n === 1) return Math.abs(G[0][0]) < 1e-12 ? null : [[1 / G[0][0]]];
  if (n === 2) {
    const det = G[0][0] * G[1][1] - G[0][1] * G[1][0];
    if (Math.abs(det) < 1e-12) return null;
    return [[G[1][1] / det, -G[0][1] / det], [-G[1][0] / det, G[0][0] / det]];
  }
  const [a, b, c] = G[0], [d, e, f] = G[1], [g, h, i] = G[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [
    [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}
