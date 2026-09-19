// Error-diffusion screens.
//
// An amplitude screen decides each pixel on its own, so it lives in the fragment
// shader. Error diffusion can't: every pixel is rounded to ink or paper and the
// rounding error handed to pixels not yet visited, so tone is kept on average
// across a neighbourhood rather than inside a cell. That order dependence is why
// these run on the CPU, over a coverage map the GPU rendered at art-pixel size.
//
// No browser dependencies; imports fine in node.

export const DIFFUSION = {
  // Bill Atkinson's kernel from the original Macintosh. Only 6/8 of the error
  // travels, so near-white and near-black clip to clean paper and solid ink
  // instead of filling with stray specks.
  atkinson: {
    div: 8, serpentine: false,
    taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]],
  },
  // Floyd–Steinberg: all of the error travels. Scanned boustrophedon so the
  // characteristic diagonal worms don't all lean the same way.
  floyd: {
    div: 16, serpentine: true,
    taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]],
  },
};

/**
 * Threshold `src` (coverage 0..255, w×h, row-major) to 0 or 255 in `dst`.
 *
 * Rows are visited starting from the last one when `flipY` is set, so a buffer
 * read back from GL (bottom scanline first) is still swept from the top of the
 * sheet downwards, the way the classic implementations did it.
 */
export function diffuse(src, w, h, kernel, dst = new Uint8Array(w * h), { flipY = false } = {}) {
  const { div, taps, serpentine } = kernel;
  const n = taps.length;
  const tdx = new Int32Array(n), tdy = new Int32Array(n), tw = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    tdx[t] = taps[t][0]; tdy[t] = taps[t][1] * (flipY ? -1 : 1); tw[t] = taps[t][2] / div;
  }

  const acc = new Float32Array(w * h);
  for (let i = 0; i < acc.length; i++) acc[i] = src[i] / 255;

  for (let row = 0; row < h; row++) {
    const y = flipY ? h - 1 - row : row;
    const rev = serpentine && (row & 1) === 1;
    const x0 = rev ? w - 1 : 0, x1 = rev ? -1 : w, xs = rev ? -1 : 1;
    for (let x = x0; x !== x1; x += xs) {
      const i = y * w + x;
      const v = acc[i];
      const on = v >= 0.5;
      dst[i] = on ? 255 : 0;
      const err = on ? v - 1 : v;
      for (let t = 0; t < n; t++) {
        const tx = x + tdx[t] * xs, ty = y + tdy[t];
        if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue;
        acc[ty * w + tx] += err * tw[t];
      }
    }
  }
  return dst;
}
