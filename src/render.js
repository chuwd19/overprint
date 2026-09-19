// WebGL2 press. One fragment shader does the whole job per pixel: separate the
// photo into ink coverages, screen each ink through its own halftone, then
// overprint them onto the paper.
//
// Error-diffusion screens take a detour, because each art pixel depends on the
// ones before it. The same shader first renders an ink's coverage with one
// fragment per art pixel, the CPU diffuses that, and the print pass reads the
// 1-bit result back as a texture.

import { hexToLinear } from './color.js';
import { diffuse, DIFFUSION } from './dither.js';
import { PAPERS, PIXEL_SHAPE, DIFFUSED_SHAPE, inkByName } from './inks.js';

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
uniform sampler2D uDith0, uDith1, uDith2;   // diffused coverage, one texel per art pixel
uniform vec2  uRes;        // viewport size in shader px
uniform vec2  uOrigin;     // viewport origin in window px
uniform float uPxScale;    // sheet px per shader px; above 1 only in the coverage pass
uniform vec4  uArt;        // artwork rect x,y,w,h in sheet px (y down from the paper's top edge)
uniform vec2  uUvScale, uUvOff;
uniform vec3  uPaper;
uniform int   uInkCount, uSolo, uMode, uScreenOn, uHasImage, uNoMisreg;
uniform vec3  uInkCol[3];
uniform vec3  uInkCol2[3];  // far end of a split fountain
uniform vec4  uFount[3];    // kind (0 solid, 1 linear, 2 radial), dir.x, dir.y, unused
uniform vec4  uInkA[3];     // density, gamma, hiding, cell px
uniform vec4  uInkB[3];     // angle, shape, art-pixel px, unused
uniform vec2  uMis[3];
uniform vec2  uDithSize[3]; // texels in each diffused texture
uniform int   uFloodKind, uFloodShow;   // kind: 0 none, 1 solid, 2 linear, 3 radial
uniform vec3  uFloodA, uFloodB;
uniform vec2  uFloodH;      // hiding of the two flood inks
uniform vec2  uFloodDir;
uniform float uInkLimit, uInkMottle, uCorner, uDeckle, uDeckleScale, uSeed;
uniform vec3  uAdjust;     // exposure, contrast, saturation
uniform vec3  uGrain;      // fine, mottle, cell px
uniform mat3  uUvXform;    // the photo's rotation and flips, applied to the sampling uv
uniform vec3  uPress;      // ink fade, roller streaks, highlight knockout
uniform int   uMarks;      // 0 none, 1 crop marks, 2 crop and registration marks
uniform vec2  uMark;       // mark line width in sheet px, and the sheet's ppi

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
  uv = (uUvXform * vec3(uv, 1.0)).xy;
  vec3 lin = srgbToLinear(texture(uImage, uv).rgb) * uAdjust.x;
  lin = mix(vec3(dot(lin, vec3(0.2126, 0.7152, 0.0722))), lin, uAdjust.z);
  vec3 s = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  s = (s - 0.5) * uAdjust.y + 0.5;
  return pow(max(s, 0.0), vec3(2.2));
}

// 0..1 across the artwork: a sweep along dir (kind 1) or outwards from the centre (kind 2).
float ramp(vec2 p, int kind, vec2 dir){
  vec2 n = (p - uArt.xy) / uArt.zw - 0.5;
  if (kind == 2) return clamp(length(n * 2.0), 0.0, 1.0);
  return clamp(dot(n, dir) / (abs(dir.x) + abs(dir.y) + 1e-6) + 0.5, 0.0, 1.0);
}
// Two inks blended in the tray. Interpolating densities rather than reflectances
// keeps a blue-to-yellow fountain green in the middle instead of grey.
vec3 blendInks(vec3 a, vec3 b, float t){
  return exp(mix(log(max(a, vec3(0.002))), log(max(b, vec3(0.002))), t));
}
// One ink laid at coverage a over a base. A dot is the base seen through the ink,
// pulled toward the ink's own colour by its hiding power.
vec3 layer(vec3 base, vec3 c, float h, float a){ return mix(base, mix(base * c, c, h), a); }

// The base the picture prints on: paper, or paper under a solid flood coat.
vec3 floodBase(vec3 base, vec2 p){
  if (uFloodKind == 0) return base;
  if (uFloodKind == 1) return layer(base, uFloodA, uFloodH.x, 1.0);
  float t = ramp(p, uFloodKind - 1, uFloodDir);
  return layer(base, blendInks(uFloodA, uFloodB, t), mix(uFloodH.x, uFloodH.y, t), 1.0);
}
vec3 inkColAt(int i, vec2 p){
  int kind = int(uFount[i].x + 0.5);
  if (kind == 0) return uInkCol[i];
  return blendInks(uInkCol[i], uInkCol2[i], ramp(p, kind, uFount[i].yz));
}
float dith(int i, vec2 uv){
  if (i == 0) return texture(uDith0, uv).r;
  if (i == 1) return texture(uDith1, uv).r;
  return texture(uDith2, uv).r;
}

// Invert the overprint for the ink coverages: a least-squares seed from the model
// linearised around bare paper, then Gauss-Newton on the relative residual, which
// is the density error to first order. Inks past uInkCount get an identity row so
// the 3x3 solve stays well posed for 1- and 2-ink jobs.
void solveInks(vec2 p, vec3 paper, out vec3 amt){
  vec2 uv = (p - uArt.xy) / uArt.zw * uUvScale + uUvOff;
  vec3 target = sampleAdj(uv);

  vec3 B[3];
  for (int i = 0; i < 3; i++){
    vec3 c = min(uInkCol[i], vec3(1.0 - EPS));
    B[i] = (i < uInkCount) ? mix(paper * c, c, uInkA[i].z) - paper : vec3(0.0);
  }
  mat3 G; vec3 b;
  for (int i = 0; i < 3; i++){
    bool ai = i < uInkCount;
    b[i] = ai ? dot(W * B[i], target - paper) : 0.0;
    for (int j = 0; j < 3; j++){
      G[i][j] = (ai && j < uInkCount) ? dot(W * B[i], B[j]) : ((i == j) ? 1.0 : 0.0);
    }
  }
  float ridge = max((G[0][0] + G[1][1] + G[2][2]) * 1e-3, 1e-6);
  G[0][0] += ridge; G[1][1] += ridge; G[2][2] += ridge;
  amt = clamp(inverse(G) * b, vec3(0.0), vec3(1.0));

  vec3 D[3], M[3], J[3];
  for (int it = 0; it < 4; it++){
    vec3 R = paper;
    for (int i = 0; i < 3; i++){
      if (i >= uInkCount){ D[i] = vec3(0.0); M[i] = vec3(1.0); continue; }
      vec3 c = min(uInkCol[i], vec3(1.0 - EPS));
      float h = uInkA[i].z;
      vec3 dotc = mix(R * c, c, h);
      D[i] = dotc - R;                               // d(layer) / d(coverage)
      M[i] = 1.0 - amt[i] * (1.0 - (1.0 - h) * c);   // d(layer) / d(base)
      R += amt[i] * D[i];
    }
    vec3 acc = vec3(1.0);
    for (int i = 2; i >= 0; i--){ J[i] = D[i] * acc; acc *= M[i]; }
    vec3 inv = 1.0 / max(R, vec3(0.004));
    vec3 res = (target - R) * inv;
    for (int i = 0; i < 3; i++){
      bool ai = i < uInkCount;
      vec3 Ji = J[i] * inv;
      b[i] = ai ? dot(W * Ji, res) : 0.0;
      for (int j = 0; j < 3; j++){
        G[i][j] = (ai && j < uInkCount) ? dot(W * Ji, J[j] * inv) : ((i == j) ? 1.0 : 0.0);
      }
    }
    ridge = max((G[0][0] + G[1][1] + G[2][2]) * 1e-3, 1e-6);
    G[0][0] += ridge; G[1][1] += ridge; G[2][2] += ridge;
    amt = clamp(amt + clamp(inverse(G) * b, vec3(-0.6), vec3(0.6)), vec3(0.0), vec3(1.0));
  }
}

// Density, tone curve, the press's habits and the ink limit, applied to a raw coverage.
float inkTone(int i, float d, vec2 pi, float gs){
  d = pow(clamp(d, 0.0, 1.0), uInkA[i].y) * uInkA[i].x;
  if (uInkMottle > 0.0){
    float m = vnoise(pi / max(gs * 3.0, 1.0) + float(i) * 17.3 + uSeed * 5.0);
    d *= 1.0 + (m - 0.5) * uInkMottle;
  }
  if (uPress.y > 0.0){                               // roller streaks: bands across the feed
    float y = pi.y / (gs * 60.0);
    float s = vnoise(vec2(y, float(i) * 5.7 + uSeed * 23.0)) * 0.65
            + vnoise(vec2(y * 4.0, float(i) * 9.1 + uSeed * 31.0)) * 0.35;
    d *= 1.0 + (s - 0.5) * uPress.y * 0.9;
  }
  if (uPress.x > 0.0){                               // ink fade: the drum running low toward the trailing edge
    float t = pi.y / (uRes.y * uPxScale);
    float n = 0.8 + 0.4 * vnoise(vec2(pi.x / (gs * 40.0), float(i) * 3.3 + uSeed * 3.0));
    d *= 1.0 - uPress.x * smoothstep(0.15, 1.0, t) * n;
  }
  if (uPress.z > 0.0) d *= smoothstep(uPress.z * 0.5, uPress.z, d);   // knockout: no ink in the highlights
  return clamp(d, 0.0, uInkLimit);
}

float seg(vec2 p, vec2 a, vec2 b, float w){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return 1.0 - smoothstep(w * 0.5 - 0.6, w * 0.5 + 0.6, length(pa - ba * h));
}
// Crop marks at the corners and, if asked, registration targets on each side, all in the margin.
float marks(vec2 p){
  float w = uMark.x, inch = uMark.y;
  float gap = inch * 0.05, len = inch * 0.16;
  float x0 = uArt.x, x1 = uArt.x + uArt.z, y0 = uArt.y, y1 = uArt.y + uArt.w;
  float m = 0.0;
  for (int k = 0; k < 4; k++){
    float cx = (k & 1) == 0 ? x0 : x1, cy = k < 2 ? y0 : y1;
    float sx = (k & 1) == 0 ? -1.0 : 1.0, sy = k < 2 ? -1.0 : 1.0;
    m = max(m, seg(p, vec2(cx + sx * gap, cy), vec2(cx + sx * (gap + len), cy), w));
    m = max(m, seg(p, vec2(cx, cy + sy * gap), vec2(cx, cy + sy * (gap + len)), w));
  }
  if (uMarks == 2){
    float r = inch * 0.05, off = gap + r * 1.4;
    for (int k = 0; k < 4; k++){
      vec2 c = k == 0 ? vec2((x0 + x1) * 0.5, y0 - off) : k == 1 ? vec2((x0 + x1) * 0.5, y1 + off)
             : k == 2 ? vec2(x0 - off, (y0 + y1) * 0.5) : vec2(x1 + off, (y0 + y1) * 0.5);
      m = max(m, 1.0 - smoothstep(w * 0.5 - 0.6, w * 0.5 + 0.6, abs(length(p - c) - r)));
      m = max(m, seg(p, c - vec2(r * 1.6, 0.0), c + vec2(r * 1.6, 0.0), w));
      m = max(m, seg(p, c - vec2(0.0, r * 1.6), c + vec2(0.0, r * 1.6), w));
    }
  }
  return m;
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
  if (shape == 5){                                   // ordered dither: the 8x8 Bayer matrix
    ivec2 c = ivec2(floor(p / max(grainPx, 1.0))) & 7;
    int v = 0;
    for (int k = 0; k < 3; k++){
      int xb = (c.x >> k) & 1, yb = (c.y >> k) & 1;
      v = v * 4 + (((xb ^ yb) << 1) | yb);
    }
    return step((float(v) + 0.5) / 64.0, d);
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
  vec2 p  = vec2(fc.x, uRes.y - fc.y) * uPxScale;
  float gs = max(uGrain.z, 0.6);

  if (uMode == 2){                                   // one ink's coverage, one art pixel per fragment
    vec3 amt;
    solveInks(p, floodBase(uPaper, p), amt);
    float d = inkTone(uSolo, amt[uSolo], p, gs);
    outColor = vec4(vec3(d), 1.0);
    return;
  }

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
    } else if (uMode == 3){                          // the flood's own film: solid ink over the block
      art = layer(col, uFloodA, uFloodH.x, 1.0);
    } else {
      vec3 base = floodBase(uPaper, p);
      if (uFloodShow == 1) art = floodBase(art, p);
      vec3 shared;
      if (uNoMisreg == 1) solveInks(p, base, shared); else shared = vec3(0.0);
      for (int i = 0; i < 3; i++){
        if (i >= uInkCount) break;
        if (uSolo >= 0 && i != uSolo) continue;
        vec2 pi = p + uMis[i];
        float d;
        if (uNoMisreg == 1) d = shared[i];
        else { vec3 t; solveInks(pi, floodBase(uPaper, pi), t); d = t[i]; }
        d = inkTone(i, d, pi, gs);

        int shape = int(uInkB[i].y + 0.5);
        float cov;
        if (uScreenOn == 0) cov = d;
        else if (shape >= 6) cov = dith(i, vec2(pi.x / uInkB[i].z, uDithSize[i].y - pi.y / uInkB[i].z) / uDithSize[i]);
        else cov = screenCov(pi, d, uInkA[i].w, uInkB[i].x, shape, uInkB[i].z, uSeed + float(i));
        art = layer(art, inkColAt(i, pi), uInkA[i].z, cov);
      }
    }
    col = mix(col, art, mask);
  }

  // Printer's marks go down with every ink, so they carry its misregistration.
  if (uMarks > 0 && uHasImage == 1 && uMode != 1 && uMode != 2){
    if (uMode == 3) col = layer(col, uFloodA, uFloodH.x, marks(p));
    else for (int i = 0; i < 3; i++){
      if (i >= uInkCount) break;
      if (uSolo >= 0 && i != uSolo) continue;
      col = layer(col, uInkCol[i], uInkA[i].z, marks(p + uMis[i]));
    }
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

const inkLinear = (name) => hexToLinear(inkByName(name).hex);
const dirOf = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];

/** Column-major 3x3 taking a uv on the sheet to a uv in the photo: flips, then quarter turns. */
function uvXform(state) {
  const f = (u, v) => {
    if (state.flipH) u = 1 - u;
    if (state.flipV) v = 1 - v;
    switch (state.rot & 3) {
      case 1: return [v, 1 - u];
      case 2: return [1 - u, 1 - v];
      case 3: return [1 - v, u];
      default: return [u, v];
    }
  };
  const o = f(0, 0), x = f(1, 0), y = f(0, 1);
  return new Float32Array([x[0] - o[0], x[1] - o[1], 0, y[0] - o[0], y[1] - o[1], 0, o[0], o[1], 1]);
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

/** Size of one art pixel in sheet px for an ink's frequency screen. */
export function artPixel(k, ppi) {
  const px = k.grain * ppi / 150;
  return k.shape >= PIXEL_SHAPE ? Math.max(1, px) : px;
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

    this.u = new Proxy({}, {
      get: (cache, name) => {
        if (!(name in cache)) cache[name] = gl.getUniformLocation(prog, name);
        return cache[name];
      },
    });

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // Unit 0: the photo.
    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.u.uImage, 0);

    // Units 1-3: one diffused-coverage texture per ink, sampled nearest so art
    // pixels stay hard-edged. Start them as a single dark texel so they're complete.
    this.dith = [0, 1, 2].map((i) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      gl.uniform1i(this.u[`uDith${i}`], 1 + i);
      return t;
    });
    gl.activeTexture(gl.TEXTURE0);
    this.dithSize = [[1, 1], [1, 1], [1, 1]];
    this.dithKey = '';

    // Scratch framebuffer the coverage pass renders into.
    this.fbo = gl.createFramebuffer();
    this.covTex = gl.createTexture();
    this.covSize = [0, 0];

    this.imageAspect = 0;
    this.hasImage = false;
    this.imageId = 0;
  }

  setImage(bitmap) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.imageAspect = bitmap.width / bitmap.height;
    this.hasImage = true;
    this.imageId++;
  }

  /** The photo's aspect as laid on the sheet, after any quarter turns. */
  viewAspect(state) {
    if (!this.imageAspect) return 0;
    return state.rot & 1 ? 1 / this.imageAspect : this.imageAspect;
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
    const inkLin = state.inks.slice(0, state.inkCount).map(inkLinear);

    const col = new Float32Array(9), col2 = new Float32Array(9);
    const ia = new Float32Array(12), ib = new Float32Array(12), fo = new Float32Array(12);
    const mis = new Float32Array(6), ds = new Float32Array(6);
    const offsets = Renderer.misregOffsets(state, ppi);
    let noMis = 1;
    for (let i = 0; i < state.inkCount; i++) {
      col.set(inkLin[i], i * 3);
      const k = state.ink[i];
      ia.set([k.density, k.gamma, k.hiding, ppi / Math.max(k.lpi, 1)], i * 4);
      ib.set([k.angle * Math.PI / 180, k.shape, artPixel(k, ppi), 0], i * 4);
      const f = k.fountain;
      col2.set(inkLinear(f.kind ? f.to : state.inks[i]), i * 3);
      fo.set([f.kind, ...dirOf(f.angle), 0], i * 4);
      ds.set(this.dithSize[i], i * 2);
      const m = state.misreg > 0 && i > 0 ? offsets[i] : [0, 0];
      mis.set(m, i * 2);
      if (m[0] !== 0 || m[1] !== 0) noMis = 0;
    }

    gl.uniform2f(u.uRes, opts.w, opts.h);
    gl.uniform2f(u.uOrigin, opts.x, opts.y);
    gl.uniform1f(u.uPxScale, opts.pxScale ?? 1);
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
    gl.uniform3fv(u['uInkCol2[0]'], col2);
    gl.uniform4fv(u['uFount[0]'], fo);
    gl.uniform4fv(u['uInkA[0]'], ia);
    gl.uniform4fv(u['uInkB[0]'], ib);
    gl.uniform2fv(u['uMis[0]'], mis);
    gl.uniform2fv(u['uDithSize[0]'], ds);

    const fl = state.flood;
    gl.uniform1i(u.uFloodKind, fl.kind);
    gl.uniform1i(u.uFloodShow, opts.showFlood === false ? 0 : 1);
    gl.uniform3fv(u.uFloodA, inkLinear(fl.inks[0]));
    gl.uniform3fv(u.uFloodB, inkLinear(fl.inks[1]));
    gl.uniform2f(u.uFloodH, inkByName(fl.inks[0]).hiding, inkByName(fl.inks[1]).hiding);
    gl.uniform2fv(u.uFloodDir, dirOf(fl.angle));

    gl.uniform1f(u.uInkLimit, state.inkLimit);
    gl.uniform1f(u.uInkMottle, state.inkMottle);
    gl.uniform1f(u.uCorner, state.corner * Math.min(art.w, art.h) * 0.5);
    gl.uniform1f(u.uDeckle, state.deckle * (ppi / 150) * 6);
    gl.uniform1f(u.uDeckleScale, Math.max(6, (ppi / 150) * 14));
    gl.uniform1f(u.uSeed, state.seed);
    gl.uniform3f(u.uAdjust, state.exposure, state.contrast, state.saturation);
    gl.uniform3f(u.uGrain, paper.grain * state.paperGrain, paper.mottle * state.paperGrain, Math.max(0.8, ppi / 190));
    gl.uniformMatrix3fv(u.uUvXform, false, uvXform(state));
    gl.uniform3f(u.uPress, state.inkFade, state.streaks, state.knockout);
    gl.uniform1i(u.uMarks, state.marks);
    gl.uniform2f(u.uMark, Math.max(1, ppi / 150), ppi);

    for (let i = 0; i < 3; i++) {
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.dith[i]);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * For every ink on an error-diffusion screen: render its coverage with one
   * fragment per art pixel, read that back, diffuse it on the CPU, and upload the
   * 1-bit result for the print pass. Skipped when nothing relevant has changed.
   */
  prepareDither(state, geom, pw, ph) {
    const gl = this.gl;
    const jobs = [];
    for (let i = 0; i < state.inkCount; i++) if (state.ink[i].shape >= DIFFUSED_SHAPE) jobs.push(i);
    if (!jobs.length || !this.hasImage) return;
    const key = JSON.stringify([state, pw, ph, this.imageId]);
    if (key === this.dithKey) return;
    this.dithKey = key;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    for (const i of jobs) {
      const k = state.ink[i];
      const cell = artPixel(k, geom.ppi);
      const gw = Math.ceil(pw / cell), gh = Math.ceil(ph / cell);
      if (gw !== this.covSize[0] || gh !== this.covSize[1]) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.covTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.covTex, 0);
        this.covSize = [gw, gh];
      }
      gl.viewport(0, 0, gw, gh);
      this.drawPass(state, geom, { x: 0, y: 0, w: gw, h: gh, solo: i, mode: 2, pxScale: cell });

      const rgba = new Uint8Array(gw * gh * 4);
      gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      const src = new Uint8Array(gw * gh);
      for (let n = 0; n < src.length; n++) src[n] = rgba[n * 4];
      const kernel = k.shape === DIFFUSED_SHAPE ? DIFFUSION.atkinson : DIFFUSION.floyd;
      const bits = diffuse(src, gw, gh, kernel, undefined, { flipY: true });

      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.dith[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gw, gh, 0, gl.RED, gl.UNSIGNED_BYTE, bits);
      this.dithSize[i] = [gw, gh];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** One sheet of paper at `longEdge`, optionally printing a single ink. */
  renderSheet(state, longEdge, { solo = -1, screen = true, mode = 0, showFlood = true } = {}) {
    const gl = this.gl;
    const [pw, ph] = paperSize(state, this.viewAspect(state), longEdge);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw; this.canvas.height = ph;
    }
    gl.useProgram(this.prog);
    const geom = layout(state, this.viewAspect(state), pw, ph);
    this.prepareDither(state, geom, pw, ph);
    gl.viewport(0, 0, pw, ph);
    this.drawPass(state, geom, { x: 0, y: 0, w: pw, h: ph, solo, mode, screen, showFlood });
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
    const [pw, ph] = paperSize(state, this.viewAspect(state), longEdge);
    const gap = split ? Math.round(pw * 0.045) : 0;

    const cw = pw * n + gap * (n - 1), chh = ph;
    if (this.canvas.width !== cw || this.canvas.height !== chh) {
      this.canvas.width = cw; this.canvas.height = chh;
    }
    gl.useProgram(this.prog);
    const geom = layout(state, this.viewAspect(state), pw, ph);
    this.prepareDither(state, geom, pw, ph);

    gl.clearColor(0.13, 0.135, 0.135, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
