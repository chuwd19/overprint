import { INKS, PAPERS, SHAPES, ASPECTS, ANGLE_SETS, PRESETS } from './inks.js';
import { Renderer, paperSize, DOC_LONG_EDGE_IN } from './render.js';
import { autoPickInks, sampleImage } from './separate.js';
import { hexToLinear, luminance } from './color.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';

/* ── state ─────────────────────────────────────────────────────────────── */

function defaultState() {
  return {
    mode: 'custom', view: 'print', bg: 'dark',
    paper: 1, paperGrain: 1,
    inkCount: 2,
    inks: ['Black', 'Red', 'Blue'],
    ink: [0, 1, 2].map((i) => ({
      lpi: 34, angle: ANGLE_SETS[2][i], shape: 0,
      density: 1, gamma: 1, opacity: 1, grain: 2,
    })),
    inkLimit: 1, inkMottle: 0.10, misreg: 1.0,
    exposure: 1, contrast: 1.06, saturation: 1,
    aspect: 0, margin: 0.06, corner: 0, deckle: 0,
    zoom: 1, panX: 0, panY: 0,
    seed: Math.random(),
    exportScale: 2,
  };
}

let state = defaultState();
let bitmap = null;
let samples = null;
let renderer = null;
let exportRenderer = null;
let lastDims = null;

/* ── persistence ───────────────────────────────────────────────────────── */

const DB = 'overprint';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('img');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, val) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const t = db.transaction('img', 'readwrite');
      t.objectStore('img').put(val, key);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch { /* private browsing, quota — the session just won't restore */ }
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const t = db.transaction('img', 'readonly');
      const q = t.objectStore('img').get(key);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } catch { return null; }
}

let saveTimer = 0;
function saveSession() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem('overprint.state', JSON.stringify(state)); } catch { /* ignore */ }
  }, 250);
}

/* ── rendering ─────────────────────────────────────────────────────────── */

let frame = 0;
function draw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const stage = $('stage').getBoundingClientRect();
    const availW = Math.max(120, stage.width - 56);
    const availH = Math.max(120, stage.height - 56);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longEdge = Math.min(1800, Math.round(Math.max(availW, availH) * dpr));

    lastDims = renderer.render(state, longEdge);
    const s = Math.min(availW / lastDims.width, availH / lastDims.height);
    const view = $('view');
    view.style.width = `${Math.round(lastDims.width * s)}px`;
    view.style.height = `${Math.round(lastDims.height * s)}px`;
    updateStats();
    saveSession();
  });
}

function updateStats() {
  const [pw, ph] = paperSize(state, renderer.imageAspect, 1600 * state.exportScale);
  $('statSize').textContent = bitmap ? `${pw} × ${ph} px at ${state.exportScale}×` : '—';
  $('statInks').textContent = state.inks.slice(0, state.inkCount).join(' + ');
  const k = state.ink[0];
  const ppi = Math.max(pw, ph) / DOC_LONG_EDGE_IN;
  $('statScreen').textContent = k.shape === 4
    ? `grain ${k.grain.toFixed(1)}`
    : `${k.lpi} lpi · ${(ppi / k.lpi).toFixed(1)} px cell`;
}

/* ── small DOM helpers ─────────────────────────────────────────────────── */

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

function section(parent, title, note, open) {
  const d = el('details', 'sect', parent);
  d.open = open;
  const s = el('summary', null, d);
  el('span', null, s, title);
  if (note) el('span', 'note', s, note);
  d.addEventListener('toggle', () => { openSections[title] = d.open; });
  return el('div', 'sect-body', d);
}

function slider(parent, label, obj, key, o) {
  const row = el('div', 'row', parent);
  const head = el('div', 'row-head', row);
  el('span', null, head, label);
  const val = el('span', 'val', head);
  const input = el('input', null, row);
  input.type = 'range';
  input.min = o.min; input.max = o.max; input.step = o.step;
  input.value = obj[key];
  input.setAttribute('aria-label', label);
  const show = () => { val.textContent = o.fmt(Number(obj[key])); };
  show();
  input.addEventListener('input', () => {
    obj[key] = Number(input.value);
    show();
    o.onInput?.();
    draw();
  });
  return row;
}

function chips(parent, items, isOn, onPick) {
  const wrap = el('div', 'chips', parent);
  items.forEach((it, i) => {
    const b = el('button', 'chip', wrap, it.name);
    b.type = 'button';
    if (isOn(it, i)) b.classList.add('on');
    b.addEventListener('click', () => onPick(it, i));
  });
  return wrap;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ── screen-angle dial ─────────────────────────────────────────────────── */

function angleDial(parent, ink) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'dial');
  svg.setAttribute('viewBox', '0 0 52 52');
  svg.setAttribute('role', 'slider');
  svg.setAttribute('aria-label', 'Screen angle');
  svg.setAttribute('tabindex', '0');

  const defs = document.createElementNS(SVG, 'defs');
  const clip = document.createElementNS(SVG, 'clipPath');
  const cid = `dc${Math.random().toString(36).slice(2, 8)}`;
  clip.setAttribute('id', cid);
  const cc = document.createElementNS(SVG, 'circle');
  cc.setAttribute('cx', 26); cc.setAttribute('cy', 26); cc.setAttribute('r', 24);
  clip.appendChild(cc); defs.appendChild(clip); svg.appendChild(defs);

  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('clip-path', `url(#${cid})`);
  for (let i = -4; i <= 4; i++) {
    const l = document.createElementNS(SVG, 'line');
    l.setAttribute('x1', -4); l.setAttribute('x2', 56);
    l.setAttribute('y1', 26 + i * 6); l.setAttribute('y2', 26 + i * 6);
    l.setAttribute('stroke-width', i === 0 ? 2.2 : 1.2);
    g.appendChild(l);
  }
  svg.appendChild(g);

  const paint = () => {
    g.setAttribute('transform', `rotate(${-ink.angle} 26 26)`);
    const hex = inkHex(ink);
    [...g.children].forEach((l, i) => l.setAttribute('stroke', i === 4 ? hex : 'rgba(255,255,255,.26)'));
    svg.setAttribute('aria-valuenow', Math.round(ink.angle));
    svg.setAttribute('aria-valuetext', `${Math.round(ink.angle)} degrees`);
  };

  const set = (deg, snap) => {
    let d = ((deg % 180) + 180) % 180;
    if (snap) d = Math.round(d / 7.5) * 7.5;
    ink.angle = Math.round(d * 10) / 10;
    paint();
    onAngleChange?.();
    draw();
  };

  const fromEvent = (e) => {
    const r = svg.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return -Math.atan2(dy, dx) * 180 / Math.PI;
  };

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    set(fromEvent(e), e.shiftKey);
    const move = (ev) => set(fromEvent(ev), ev.shiftKey);
    const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
  });
  svg.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    set(ink.angle + d * (e.shiftKey ? 7.5 : 1));
  });

  let onAngleChange = null;
  paint();
  parent.appendChild(svg);
  return { paint, setOnChange: (f) => { onAngleChange = f; } };
}

/* ── ink picker ────────────────────────────────────────────────────────── */

function inkHex(inkOrName) {
  const name = typeof inkOrName === 'string' ? inkOrName : inkOrName.name;
  return (INKS.find((k) => k.name === name) || INKS[0]).hex;
}

function openInkPicker(anchor, slot) {
  const pop = $('popover');
  pop.hidden = false;
  pop.innerHTML = '';
  const grid = el('div', 'pop-grid', pop);
  const name = el('div', 'pop-name', pop, state.inks[slot]);

  INKS.forEach((ink) => {
    const b = el('button', 'pop-sw', grid);
    b.type = 'button';
    b.style.background = ink.hex;
    b.title = ink.name;
    b.setAttribute('aria-label', ink.name);
    if (ink.name === state.inks[slot]) b.classList.add('on');
    b.addEventListener('mouseenter', () => { name.textContent = ink.name; });
    b.addEventListener('click', () => {
      state.inks[slot] = ink.name;
      closePopover();
      buildRail();
      draw();
    });
  });

  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(r.left, window.innerWidth - 258)}px`;
  pop.style.top = `${Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 10)}px`;
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);

  function outside(e) { if (!pop.contains(e.target)) closePopover(); }
  function closePopover() {
    pop.hidden = true;
    document.removeEventListener('pointerdown', outside);
  }
  $('popover')._close = closePopover;
}

/* ── the rail ──────────────────────────────────────────────────────────── */

const openSections = { Photo: true, Paper: true, Inks: true, Press: false, Frame: false, Output: false };

function ang(i) { return state.ink[i].angle; }

function buildRail() {
  const rail = $('railScroll');
  rail.innerHTML = '';
  const simple = state.mode === 'simple';

  /* Presets */
  const pb = section(rail, 'Start', null, true);
  chips(pb, PRESETS, () => false, (p) => applyPreset(p));
  if (simple) el('p', 'hint', pb, 'Shuffle keeps your photo and reprints it with new inks, screen and frame.');

  /* Photo */
  const ph = section(rail, 'Photo', null, openSections.Photo);
  const act = el('div', 'chips', ph);
  const pick = el('button', 'chip', act, bitmap ? 'Replace photo' : 'Choose photo');
  pick.addEventListener('click', () => $('fileInput').click());
  slider(ph, 'Exposure', state, 'exposure', { min: 0.3, max: 2.5, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` });
  slider(ph, 'Contrast', state, 'contrast', { min: 0.4, max: 2.2, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` });
  slider(ph, 'Saturation', state, 'saturation', { min: 0, max: 2, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` });
  if (!simple) {
    slider(ph, 'Zoom', state, 'zoom', { min: 1, max: 4, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` });
    el('p', 'hint', ph, 'Drag the print to reposition the photo. Scroll to zoom.');
  }

  /* Paper */
  const pa = section(rail, 'Paper', PAPERS[state.paper].name, openSections.Paper);
  const sw = el('div', 'papers', pa);
  PAPERS.forEach((p, i) => {
    const b = el('button', 'paper-sw', sw);
    b.type = 'button';
    b.style.background = p.hex;
    b.title = p.name;
    b.setAttribute('aria-label', p.name);
    if (i === state.paper) b.classList.add('on');
    b.addEventListener('click', () => { state.paper = i; buildRail(); draw(); });
  });
  if (!simple) slider(pa, 'Grain', state, 'paperGrain', { min: 0, max: 2.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` });

  /* Inks */
  const ik = section(rail, 'Inks', `${state.inkCount} colour${state.inkCount > 1 ? 's' : ''}`, openSections.Inks);
  const head = el('div', 'chips', ik);
  [1, 2, 3].forEach((n) => {
    const b = el('button', 'chip', head, `${n} ink${n > 1 ? 's' : ''}`);
    b.type = 'button';
    if (n === state.inkCount) b.classList.add('on');
    b.addEventListener('click', () => { setInkCount(n); });
  });
  const autoBtn = el('button', 'chip', head, 'Auto-pick');
  autoBtn.type = 'button';
  autoBtn.title = 'Choose the inks that reproduce this photo most closely';
  autoBtn.addEventListener('click', () => autoPick());

  for (let i = 0; i < state.inkCount; i++) {
    const ink = state.ink[i];
    const hex = inkHex(state.inks[i]);
    const box = el('div', 'ink', ik);
    const hd = el('div', 'ink-head', box);
    hd.style.background = `linear-gradient(90deg, ${hex}26, transparent 70%)`;

    const drum = el('button', 'ink-drum', hd);
    drum.type = 'button';
    drum.style.background = hex;
    drum.setAttribute('aria-label', `Change ink ${i + 1}`);
    const nameBtn = el('button', 'ink-name', hd, state.inks[i]);
    nameBtn.type = 'button';
    drum.addEventListener('click', () => openInkPicker(drum, i));
    nameBtn.addEventListener('click', () => openInkPicker(nameBtn, i));

    const body = el('div', 'ink-body', box);

    const dr = el('div', 'dial-row', body);
    const dial = angleDial(dr, ink);
    const meta = el('div', 'dial-meta', dr);
    const angleRow = slider(meta, 'Screen angle', ink, 'angle',
      { min: 0, max: 179.5, step: 0.5, fmt: (v) => `${v.toFixed(1)}°`, onInput: () => dial.paint() });
    dial.setOnChange(() => {
      const inp = angleRow.querySelector('input');
      inp.value = ink.angle;
      angleRow.querySelector('.val').textContent = `${ink.angle.toFixed(1)}°`;
    });

    chips(body, SHAPES, (s) => s.id === ink.shape, (s) => { ink.shape = s.id; buildRail(); draw(); });

    if (ink.shape === 4) {
      slider(body, 'Grain size', ink, 'grain', { min: 0.6, max: 10, step: 0.05, fmt: (v) => `${v.toFixed(1)} px` });
    } else {
      slider(body, 'Frequency', ink, 'lpi', { min: 8, max: 120, step: 1, fmt: (v) => `${v} lpi` });
    }
    if (!simple) {
      slider(body, 'Density', ink, 'density', { min: 0, max: 1.8, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` });
      slider(body, 'Tone curve', ink, 'gamma', { min: 0.4, max: 2.4, step: 0.01, fmt: (v) => `γ ${v.toFixed(2)}` });
      slider(body, 'Opacity', ink, 'opacity', { min: 0.3, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` });
    }
  }

  /* Press */
  if (!simple) {
    const pr = section(rail, 'Press', null, openSections.Press);
    slider(pr, 'Misregistration', state, 'misreg', { min: 0, max: 6, step: 0.05, fmt: (v) => (v ? `${v.toFixed(2)} px` : 'exact') });
    slider(pr, 'Ink mottle', state, 'inkMottle', { min: 0, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` });
    slider(pr, 'Ink limit', state, 'inkLimit', { min: 0.4, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` });
    el('p', 'hint', pr, 'Misregistration shifts every ink but the first, the way a second pass through the drum would.');
  }

  /* Frame */
  const fr = section(rail, 'Frame', null, openSections.Frame);
  chips(fr, ASPECTS, (a) => a.value === state.aspect, (a) => { state.aspect = a.value; buildRail(); draw(); });
  slider(fr, 'Margin', state, 'margin', { min: 0, max: 0.2, step: 0.002, fmt: (v) => `${(v * 100).toFixed(1)}%` });
  slider(fr, 'Corner radius', state, 'corner', { min: 0, max: 1, step: 0.005, fmt: (v) => (v ? `${(v * 100).toFixed(0)}%` : 'square') });
  slider(fr, 'Hand-cut edge', state, 'deckle', { min: 0, max: 3, step: 0.02, fmt: (v) => (v ? v.toFixed(2) : 'clean') });

  /* Output */
  const ou = section(rail, 'Output', null, openSections.Output);
  chips(ou, [{ name: '1×' }, { name: '2×' }, { name: '3×' }], (x, i) => i + 1 === state.exportScale,
    (x, i) => { state.exportScale = i + 1; buildRail(); updateStats(); });
  const outActs = el('div', 'chips', ou);
  const b1 = el('button', 'chip', outActs, 'Save print');
  b1.addEventListener('click', () => exportPNG('sheet'));
  const b2 = el('button', 'chip', outActs, 'Save separations');
  b2.addEventListener('click', () => exportPNG('separations'));
  el('p', 'hint', ou, `The artwork is ${DOC_LONG_EDGE_IN} in on its long edge, so screen frequency stays true at any export size.`);
}

/* ── actions ───────────────────────────────────────────────────────────── */

function setInkCount(n) {
  state.inkCount = n;
  ANGLE_SETS[n - 1].forEach((a, i) => { state.ink[i].angle = a; });
  buildRail();
  draw();
}

function autoPick() {
  if (!samples) { toast('Load a photo first'); return; }
  const paperLin = hexToLinear(PAPERS[state.paper].hex);
  const t0 = performance.now();
  const { inks } = autoPickInks(INKS, samples, paperLin, state.inkCount);
  inks.forEach((n, i) => { state.inks[i] = n; });
  buildRail();
  draw();
  toast(`${inks.join(' + ')} · ${Math.round(performance.now() - t0)} ms`);
}

function applyPreset(p) {
  state.paper = p.paper;
  state.inkCount = p.inkCount;
  state.margin = p.margin ?? state.margin;
  state.misreg = p.misreg ?? state.misreg;
  state.inkMottle = p.inkMottle ?? state.inkMottle;
  state.deckle = p.deckle ?? 0;
  state.contrast = p.contrast ?? 1.06;
  state.saturation = p.saturation ?? 1;
  ANGLE_SETS[p.inkCount - 1].forEach((a, i) => { state.ink[i].angle = a; });
  (p.ink || []).forEach((k, i) => Object.assign(state.ink[i], k));
  if (p.inks) p.inks.forEach((n, i) => { state.inks[i] = n; });
  if (p.auto && samples) {
    const { inks } = autoPickInks(INKS, samples, hexToLinear(PAPERS[state.paper].hex), state.inkCount);
    inks.forEach((n, i) => { state.inks[i] = n; });
  }
  buildRail();
  draw();
}

function shuffle() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  state.seed = Math.random();
  state.paper = Math.floor(Math.random() * (PAPERS.length - 1));
  state.inkCount = pick([1, 2, 2, 2, 3]);
  const shape = pick([0, 0, 0, 1, 2, 3, 4]);
  const lpi = Math.round(14 + Math.random() * 54);
  ANGLE_SETS[state.inkCount - 1].forEach((a, i) => {
    Object.assign(state.ink[i], { angle: a, shape, lpi, grain: 1 + Math.random() * 3 });
  });
  state.margin = pick([0, 0.03, 0.06, 0.09, 0.13]);
  state.corner = Math.random() < 0.22 ? Math.random() * 0.3 : 0;
  state.deckle = Math.random() < 0.3 ? Math.random() * 1.4 : 0;
  state.misreg = Math.random() < 0.7 ? Math.random() * 2.4 : 0;
  state.inkMottle = Math.random() * 0.25;

  if (samples && Math.random() < 0.65) {
    const { inks } = autoPickInks(INKS, samples, hexToLinear(PAPERS[state.paper].hex), state.inkCount);
    inks.forEach((n, i) => { state.inks[i] = n; });
  } else {
    const chosen = [];
    while (chosen.length < state.inkCount) {
      const c = pick(INKS).name;
      if (!chosen.includes(c)) chosen.push(c);
    }
    chosen.sort((a, b) => luminance(hexToLinear(inkHex(a))) - luminance(hexToLinear(inkHex(b))));
    chosen.forEach((n, i) => { state.inks[i] = n; });
  }
  buildRail();
  draw();
}

/* ── image loading ─────────────────────────────────────────────────────── */

async function loadBlob(blob, { persist = true } = {}) {
  const bmp = await createImageBitmap(blob);
  bitmap = bmp;
  renderer.setImage(bmp);
  exportRenderer?.setImage(bmp);
  samples = sampleImage(bmp);
  state.zoom = 1; state.panX = 0; state.panY = 0;
  $('empty').hidden = true;
  $('view').classList.remove('hidden');
  if (persist) idbPut('current', blob);
  buildRail();
  draw();
}

/** A tonal test target, so the press is usable before you bring a photo. */
function testImage() {
  const c = document.createElement('canvas');
  c.width = 1100; c.height = 1375;
  const x = c.getContext('2d');

  const bg = x.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, '#1d3b4a');
  bg.addColorStop(0.55, '#5e7f84');
  bg.addColorStop(1, '#d9c9a8');
  x.fillStyle = bg;
  x.fillRect(0, 0, c.width, c.height);

  x.fillStyle = 'rgba(28,20,16,.34)';
  x.beginPath();
  x.ellipse(560, 1010, 350, 62, 0, 0, Math.PI * 2);
  x.fill();

  const sph = x.createRadialGradient(420, 620, 30, 560, 780, 430);
  sph.addColorStop(0, '#fff4dc');
  sph.addColorStop(0.28, '#f0a24e');
  sph.addColorStop(0.68, '#b4442f');
  sph.addColorStop(1, '#2a1630');
  x.fillStyle = sph;
  x.beginPath();
  x.arc(560, 760, 300, 0, Math.PI * 2);
  x.fill();

  x.save();
  x.beginPath();
  x.arc(560, 760, 300, 0, Math.PI * 2);
  x.clip();
  const rim = x.createRadialGradient(830, 980, 10, 700, 860, 430);
  rim.addColorStop(0, 'rgba(150,210,235,.58)');
  rim.addColorStop(1, 'rgba(150,210,235,0)');
  x.fillStyle = rim;
  x.fillRect(260, 460, 600, 600);
  x.restore();

  // A stepped grey wedge reads the tone curve at a glance.
  for (let i = 0; i < 11; i++) {
    const v = Math.round((i / 10) * 255);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(90 + i * 84, 1180, 84, 96);
  }
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

/* ── export ────────────────────────────────────────────────────────────── */

function download(canvas, name) {
  return new Promise((res) => canvas.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    res();
  }, 'image/png'));
}

async function exportPNG(kind) {
  if (!bitmap) { toast('Load a photo first'); return; }
  if (!exportRenderer) {
    exportRenderer = new Renderer(document.createElement('canvas'));
    exportRenderer.setImage(bitmap);
  }
  const busy = el('div', 'busy', document.body, 'Printing…');
  await new Promise((r) => setTimeout(r, 16));
  try {
    const longEdge = 1600 * state.exportScale;
    const tag = `${state.inks.slice(0, state.inkCount).join('-').toLowerCase().replace(/\s+/g, '')}`;
    if (kind === 'sheet') {
      exportRenderer.renderSheet(state, longEdge, -1, state.view !== 'separation', state.view === 'photo' ? 1 : 0);
      await download(exportRenderer.canvas, `overprint-${tag}-${state.exportScale}x.png`);
      toast('Print saved');
    } else {
      for (let i = 0; i < state.inkCount; i++) {
        exportRenderer.renderSheet(state, longEdge, i, true);
        await download(exportRenderer.canvas,
          `overprint-${tag}-${i + 1}-${state.inks[i].toLowerCase().replace(/\s+/g, '')}.png`);
        await new Promise((r) => setTimeout(r, 160));
      }
      toast(`${state.inkCount} separations saved`);
    }
  } finally {
    busy.remove();
  }
}

/* ── wiring ────────────────────────────────────────────────────────────── */

function segment(id, attr, apply) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    [...e.currentTarget.children].forEach((c) => c.classList.toggle('on', c === b));
    apply(b.dataset[attr]);
  });
}

function init() {
  try {
    renderer = new Renderer($('view'));
  } catch (err) {
    document.body.innerHTML = `<div class="busy">${err.message}</div>`;
    return;
  }

  try {
    const saved = JSON.parse(localStorage.getItem('overprint.state') || 'null');
    if (saved && saved.ink?.length === 3) state = { ...defaultState(), ...saved };
  } catch { /* fall back to defaults */ }

  segment('modeSeg', 'mode', (m) => { state.mode = m; buildRail(); });
  segment('viewSeg', 'view', (v) => { state.view = v; draw(); });
  segment('surroundSeg', 'bg', (b) => { state.bg = b; $('bed').dataset.bg = b; saveSession(); });
  $('bed').dataset.bg = state.bg;
  [...$('modeSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
  [...$('viewSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  [...$('surroundSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.bg === state.bg));

  $('shuffleBtn').addEventListener('click', shuffle);
  $('exportBtn').addEventListener('click', () => exportPNG('sheet'));
  $('chooseBtn').addEventListener('click', () => $('fileInput').click());
  $('sampleBtn').addEventListener('click', async () => loadBlob(await testImage()));
  $('fileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) loadBlob(e.target.files[0]);
    e.target.value = '';
  });

  const bed = $('bed');
  ['dragenter', 'dragover'].forEach((t) => bed.addEventListener(t, (e) => {
    e.preventDefault(); bed.classList.add('drop');
  }));
  ['dragleave', 'drop'].forEach((t) => bed.addEventListener(t, (e) => {
    e.preventDefault();
    if (t === 'dragleave' && bed.contains(e.relatedTarget)) return;
    bed.classList.remove('drop');
  }));
  bed.addEventListener('drop', (e) => {
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) loadBlob(f); else toast('That file is not an image');
  });

  // Drag to reposition, scroll to zoom.
  const view = $('view');
  view.addEventListener('pointerdown', (e) => {
    if (!bitmap || state.view !== 'print') return;
    view.setPointerCapture(e.pointerId);
    view.classList.add('dragging');
    const start = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY };
    const w = view.getBoundingClientRect().width;
    const move = (ev) => {
      const sx = 1 / state.zoom;
      state.panX = start.px - (ev.clientX - start.x) / w * sx;
      state.panY = start.py - (ev.clientY - start.y) / w * sx;
      draw();
    };
    const up = () => {
      view.classList.remove('dragging');
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', up);
    };
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
  });
  view.addEventListener('wheel', (e) => {
    if (!bitmap) return;
    e.preventDefault();
    state.zoom = Math.min(4, Math.max(1, state.zoom * (1 - e.deltaY * 0.0015)));
    buildRail();
    draw();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'r' || e.key === 'R') shuffle();
    if (e.key === 'Escape') $('popover')._close?.();
  });

  new ResizeObserver(() => draw()).observe($('stage'));

  $('view').classList.add('hidden');   // no sheet on the bed until there is a photo
  buildRail();
  draw();

  idbGet('current').then((blob) => { if (blob && !bitmap) loadBlob(blob, { persist: false }); });
}

init();
