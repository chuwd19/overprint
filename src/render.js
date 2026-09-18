// WebGL2 press. One fragment shader does the whole job per pixel: separate the
// photo into ink coverages, screen each ink through its own halftone, then
// overprint them onto the paper.

import { hexToLinear } from './color.js';
import { separationRows } from './separate.js';
import { INKS, PAPERS } from './inks.js';

// The artwork's long edge in inches. Screen frequency is specified in lines per
// inch, so every control stays physical and a 3x export prints identical dots.
export const DOC_LONG_EDGE_IN = 7;

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform sampler2D uImage;
uniform vec2  uRes;        // viewport size in px
uniform vec2  uOrigin;     // viewport origin in window px
uniform vec4  uArt;        // artwork rect x,y,w,h (y down from the paper's top edge)
uniform vec2  uUvScale, uUvOff;
uniform vec3  uPaper;
uniform int   uInkCount, uSolo, uMode, uScreenOn, uHasImage, uNoMisreg;
uniform vec3  uInkCol[3];
uniform vec3  uSepRow[3];
uniform vec4  uInkA[3];    // density, gamma, opacity, cell px
uniform vec4  uInkB[3];    // angle, shape, grain px, unused
uniform vec2  uMis[3];
uniform float uInkLimit, uInkMottle, uCorner, uDeckle, uDeckleScale, uSeed;
uniform vec3  uAdjust;     // exposure, contrast, saturation
uniform vec3  uGrain;      // fine, mottle, cell px

const float PI = 3.14159265359;
const vec3  W  = vec3(0.26, 0.62, 0.12);
const float EPS = 0.0035;

float hash21(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
vec3 srgbToLinear(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c){
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
mat2 rot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

vec3 sampleAdj(vec2 uv){
  vec3 lin = srgbToLinear(texture(uImage, uv).rgb) * uAdjust.x;
  lin = mix(vec3(dot(lin, vec3(0.2126, 0.7152, 0.0722))), lin, uAdjust.z);
  vec3 s = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  s = (s - 0.5) * uAdjust.y + 0.5;
  return pow(max(s, 0.0), vec3(2.2));
}

// Invert the overprint  R = P * prod(1 - a_i (1 - C_i))  for the ink coverages a.
// Linear-absorbance seed, then Gauss-Newton in density space. Inks past uInkCount
// get an identity row so the 3x3 solve stays well posed for 1- and 2-ink jobs.
void solveInks(vec2 p, out vec3 amt){
  vec2 uv = (p - uArt.xy) / uArt.zw * uUvScale + uUvOff;
  vec3 ratio = sampleAdj(uv) / max(uPaper, vec3(1e-4));
  vec3 seed = 1.0 - min(ratio, vec3(4.0));

  amt = vec3(0.0);
  for (int i = 0; i < 3; i++){
    if (i < uInkCount) amt[i] = clamp(dot(uSepRow[i], seed), 0.0, 1.0);
  }

  vec3 D = -log(max(ratio, vec3(1e-4)));
  for (int it = 0; it < 3; it++){
    vec3 res = D;
    mat3 J = mat3(0.0);
    for (int i = 0; i < 3; i++){
      if (i >= uInkCount) continue;
      vec3 absorb = 1.0 - min(uInkCol[i], vec3(1.0 - EPS));
      vec3 tr = max(1.0 - amt[i] * absorb, vec3(0.02));
      res += log(tr);
      J[i] = absorb / tr;
    }
    mat3 G; vec3 b;
    for (int i = 0; i < 3; i++){
      bool ai = i < uInkCount;
      b[i] = ai ? dot(W * J[i], res) : 0.0;
      for (int j = 0; j < 3; j++){
        G[i][j] = (ai && j < uInkCount) ? dot(W * J[i], J[j]) : ((i == j) ? 1.0 : 0.0);
      }
    }
    float ridge = max((G[0][0] + G[1][1] + G[2][2]) * 1e-3, 1e-6);
    G[0][0] += ridge; G[1][1] += ridge; G[2][2] += ridge;
    amt = clamp(amt + clamp(inverse(G) * b, vec3(-0.6), vec3(0.6)), vec3(0.0), vec3(1.0));
  }
}

float spotEdge(vec2 c, int shape){
  if (shape == 0) return length(c);
  if (shape == 1) return abs(c.x) + abs(c.y);
  if (shape == 2) return max(abs(c.x), abs(c.y));
  return abs(c.y);
}
// Half-size of a spot covering fraction d of its cell, so tone stays true to the photo.
float spotRadius(float d, int shape){
  d = clamp(d, 0.0, 1.0);
  if (shape == 0) return sqrt(d / PI);
  if (shape == 1) return sqrt(d * 0.5);
  if (shape == 2) return sqrt(d) * 0.5;
  return d * 0.5;
}

float screenCov(vec2 p, float d, float cellPx, float angle, int shape, float grainPx, float seed){
  d = clamp(d, 0.0, 1.0);
  if (d <= 0.0) return 0.0;
  if (d >= 1.0) return 1.0;

  if (shape == 4){                                   // stochastic grain
    vec2 q = rot(angle) * p / max(grainPx, 0.35);
    float n = hash21(floor(q) + vec2(seed * 37.0, seed * 17.0));
    return mix(d, step(n, d), smoothstep(0.55, 1.4, grainPx));
  }

  cellPx = max(cellPx, 1.2);
  vec2 q  = rot(angle) * p / cellPx;
  vec2 c  = fract(q) - 0.5;
  vec2 c2 = fract(q + 0.5) - 0.5;
  float aa = 0.85 / cellPx;                          // ~1px of antialiasing, in cell units

  float rD = spotRadius(d, shape);
  float covD = 1.0 - smoothstep(rD - aa, rD + aa, spotEdge(c, shape));
  if (shape == 2 || shape == 3) return covD;         // squares and lines tile exactly

  // Past 50% the dots merge, so switch to shrinking holes on the cell corners.
  float rL = spotRadius(1.0 - d, shape);
  float covL = smoothstep(rL - aa, rL + aa, spotEdge(c2, shape));
  return mix(covD, covL, smoothstep(0.40, 0.60, d));
}

void main(){
  vec2 fc = gl_FragCoord.xy - uOrigin;
  vec2 p  = vec2(fc.x, uRes.y - fc.y);

  float gs = max(uGrain.z, 0.6);
  float fine = vnoise(p / gs + uSeed * 91.0);
  float mott = vnoise(p / (gs * 52.0) + uSeed * 7.0);
  vec3 col = uPaper * (1.0 + (fine - 0.5) * uGrain.x + (mott - 0.5) * uGrain.y);

  vec2 ctr = uArt.xy + uArt.zw * 0.5;
  vec2 q = abs(p - ctr) - uArt.zw * 0.5 + uCorner;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner;
  if (uDeckle > 0.0){
    float n = vnoise(p / uDeckleScale + uSeed * 13.0) * 0.6
            + vnoise(p / (uDeckleScale * 0.34) + uSeed * 29.0) * 0.4;
    sd += (n - 0.5) * uDeckle;
  }
  float mask = 1.0 - smoothstep(-0.7, 0.7, sd);

  if (mask > 0.001 && uHasImage == 1){
    vec3 art = col;
    if (uMode == 1){
      art = sampleAdj((p - uArt.xy) / uArt.zw * uUvScale + uUvOff);
    } else {
      vec3 shared;
      if (uNoMisreg == 1) solveInks(p, shared); else shared = vec3(0.0);
      for (int i = 0; i < 3; i++){
        if (i >= uInkCount) break;
        if (uSolo >= 0 && i != uSolo) continue;
        vec2 pi = p + uMis[i];
        float d;
        if (uNoMisreg == 1) d = shared[i];
        else { vec3 t; solveInks(pi, t); d = t[i]; }

        d = pow(clamp(d, 0.0, 1.0), uInkA[i].y) * uInkA[i].x;
        if (uInkMottle > 0.0){
          float m = vnoise(pi / max(gs * 3.0, 1.0) + float(i) * 17.3 + uSeed * 5.0);
          d *= 1.0 + (m - 0.5) * uInkMottle;
        }
        d = clamp(d, 0.0, uInkLimit);
        float cov = (uScreenOn == 1)
          ? screenCov(pi, d, uInkA[i].w, uInkB[i].x, int(uInkB[i].y + 0.5), uInkB[i].z, uSeed + float(i))
          : d;
        art *= mix(vec3(1.0), uInkCol[i], cov * uInkA[i].z);
      }
    }
    col = mix(col, art, mask);
  }
  outColor = vec4(linearToSrgb(col), 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) + '\n' + src.split('\n').map((l, i) => `${i + 1} ${l}`).join('\n'));
  }
  return sh;
}

/** Paper size, artwork rect and image fit for a given output size. */
export function layout(state, imageAspect, paperW, paperH) {
  const inset = Math.min(paperW, paperH) * state.margin;
  const art = { x: inset, y: inset, w: Math.max(1, paperW - inset * 2), h: Math.max(1, paperH - inset * 2) };
  const artAspect = art.w / art.h;
  const ia = imageAspect || artAspect;

  // Cover-fit the photo into the artwork rect, then apply zoom and pan.
  let sx = 1, sy = 1;
  if (ia > artAspect) sx = artAspect / ia; else sy = ia / artAspect;
  sx /= state.zoom; sy /= state.zoom;
  const ox = Math.min(Math.max((1 - sx) * 0.5 + state.panX, 0), Math.max(0, 1 - sx));
  const oy = Math.min(Math.max((1 - sy) * 0.5 + state.panY, 0), Math.max(0, 1 - sy));
  return { art, uvScale: [sx, sy], uvOff: [ox, oy], ppi: Math.max(paperW, paperH) / DOC_LONG_EDGE_IN };
}

/** Paper dimensions for a requested long edge, honouring the chosen aspect ratio. */
export function paperSize(state, imageAspect, longEdge) {
  let a = state.aspect || imageAspect || 1;
  // The chosen ratio is applied to the artwork; margins are uniform so paper matches.
  if (a >= 1) return [Math.round(longEdge), Math.round(longEdge / a)];
  return [Math.round(longEdge * a), Math.round(longEdge)];
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false,
    });
    if (!gl) throw new Error('This browser has no WebGL2.');
    this.gl = gl; this.canvas = canvas;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.u = new Proxy({}, {
      get: (cache, name) => {
        if (!(name in cache)) cache[name] = gl.getUniformLocation(prog, name);
        return cache[name];
      },
    });
    this.imageAspect = 0;
    this.hasImage = false;
  }

  setImage(bitmap) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.imageAspect = bitmap.width / bitmap.height;
    this.hasImage = true;
  }

  /** Per-ink misregistration offsets, stable for a given seed. */
  static misregOffsets(state, ppi) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const a = (state.seed * 91.7 + i * 2.399) % (Math.PI * 2);
      const r = state.misreg * (0.55 + ((state.seed * 37 + i * 13) % 1) * 0.9) * (ppi / 150);
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }

  /** Draw one pass into the current viewport. */
  drawPass(state, geom, opts) {
    const gl = this.gl, u = this.u;
    const { art, uvScale, uvOff, ppi } = geom;
    const paper = PAPERS[state.paper];
    const paperLin = hexToLinear(paper.hex);
    const inkLin = state.inks.slice(0, state.inkCount).map((n) => hexToLinear((INKS.find((k) => k.name === n) || INKS[0]).hex));
    const rows = separationRows(inkLin);

    const col = new Float32Array(9), sep = new Float32Array(9);
    const ia = new Float32Array(12), ib = new Float32Array(12), mis = new Float32Array(6);
    const offsets = Renderer.misregOffsets(state, ppi);
    let noMis = 1;
    for (let i = 0; i < state.inkCount; i++) {
      col.set(inkLin[i], i * 3);
      sep.set(rows[i], i * 3);
      const k = state.ink[i];
      ia.set([k.density, k.gamma, k.opacity, ppi / Math.max(k.lpi, 1)], i * 4);
      ib.set([k.angle * Math.PI / 180, k.shape, k.grain * ppi / 150, 0], i * 4);
      const m = state.misreg > 0 && i > 0 ? offsets[i] : [0, 0];
      mis.set(m, i * 2);
      if (m[0] !== 0 || m[1] !== 0) noMis = 0;
    }

    gl.uniform2f(u.uRes, opts.w, opts.h);
    gl.uniform2f(u.uOrigin, opts.x, opts.y);
    gl.uniform4f(u.uArt, art.x, art.y, art.w, art.h);
    gl.uniform2f(u.uUvScale, uvScale[0], uvScale[1]);
    gl.uniform2f(u.uUvOff, uvOff[0], uvOff[1]);
    gl.uniform3fv(u.uPaper, paperLin);
    gl.uniform1i(u.uInkCount, state.inkCount);
    gl.uniform1i(u.uSolo, opts.solo ?? -1);
    gl.uniform1i(u.uMode, opts.mode ?? 0);
    gl.uniform1i(u.uScreenOn, opts.screen === false ? 0 : 1);
    gl.uniform1i(u.uHasImage, this.hasImage ? 1 : 0);
    gl.uniform1i(u.uNoMisreg, noMis);
    gl.uniform3fv(u['uInkCol[0]'], col);
    gl.uniform3fv(u['uSepRow[0]'], sep);
    gl.uniform4fv(u['uInkA[0]'], ia);
    gl.uniform4fv(u['uInkB[0]'], ib);
    gl.uniform2fv(u['uMis[0]'], mis);
    gl.uniform1f(u.uInkLimit, state.inkLimit);
    gl.uniform1f(u.uInkMottle, state.inkMottle);
    gl.uniform1f(u.uCorner, state.corner * Math.min(art.w, art.h) * 0.5);
    gl.uniform1f(u.uDeckle, state.deckle * (ppi / 150) * 6);
    gl.uniform1f(u.uDeckleScale, Math.max(6, (ppi / 150) * 14));
    gl.uniform1f(u.uSeed, state.seed);
    gl.uniform3f(u.uAdjust, state.exposure, state.contrast, state.saturation);
    gl.uniform3f(u.uGrain, paper.grain * state.paperGrain, paper.mottle * state.paperGrain, Math.max(0.8, ppi / 190));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.uImage, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** One sheet of paper at `longEdge`, optionally printing a single ink. */
  renderSheet(state, longEdge, solo = -1, screen = true, mode = 0) {
    const gl = this.gl;
    const [pw, ph] = paperSize(state, this.imageAspect, longEdge);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw; this.canvas.height = ph;
    }
    gl.useProgram(this.prog);
    gl.viewport(0, 0, pw, ph);
    this.drawPass(state, layout(state, this.imageAspect, pw, ph), { x: 0, y: 0, w: pw, h: ph, solo, mode, screen });
    return { width: pw, height: ph };
  }

  /**
   * Render the whole view. Separation and screen views print each ink onto its own
   * sheet, laid out side by side at full paper aspect.
   */
  render(state, longEdge) {
    const gl = this.gl;
    const split = state.view === 'separation' || state.view === 'screens';
    const n = split ? state.inkCount : 1;
    const [pw, ph] = paperSize(state, this.imageAspect, longEdge);
    const gap = split ? Math.round(pw * 0.045) : 0;

    const cw = pw * n + gap * (n - 1), chh = ph;
    if (this.canvas.width !== cw || this.canvas.height !== chh) {
      this.canvas.width = cw; this.canvas.height = chh;
    }
    gl.useProgram(this.prog);
    gl.clearColor(0.13, 0.135, 0.135, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const geom = layout(state, this.imageAspect, pw, ph);
    for (let i = 0; i < n; i++) {
      const x = i * (pw + gap);
      gl.viewport(x, 0, pw, ph);
      this.drawPass(state, geom, {
        x, y: 0, w: pw, h: ph,
        solo: split ? i : -1,
        mode: state.view === 'photo' ? 1 : 0,
        screen: state.view === 'separation' ? false : true,
      });
    }
    return { width: cw, height: chh, paperW: pw, paperH: ph };
  }
}
