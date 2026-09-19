// Ink library: the Riso drum colours (hex values from stencil.wiki via mattdesl's
// riso-colors), in hue order with the neutrals first. Each ink carries a hiding
// power: how much a solid dot covers the paper rather than filtering it. Riso
// inks are glazes, so most are low; light inks carry white pigment and hide more,
// metallics more still, and White is mostly cover.
export const INKS = [
  { name: 'White',              hex: '#ffffff', hiding: 0.70 },
  { name: 'Granite',            hex: '#a5aaa8', hiding: 0.35 },
  { name: 'Gray',               hex: '#928d88', hiding: 0.08 },
  { name: 'Light Gray',         hex: '#88898a', hiding: 0.08 },
  { name: 'Charcoal',           hex: '#70747c', hiding: 0.08 },
  { name: 'Slate',              hex: '#5e695e', hiding: 0.08 },
  { name: 'Black',              hex: '#2b2b2b', hiding: 0.15 },
  { name: 'Marine Red',         hex: '#d2515e', hiding: 0.08 },
  { name: 'Tomato',             hex: '#d2515e', hiding: 0.08 },
  { name: 'Bright Red',         hex: '#f15060', hiding: 0.08 },
  { name: 'Bisque',             hex: '#f2cdcf', hiding: 0.08 },
  { name: 'Scarlet',            hex: '#f65058', hiding: 0.08 },
  { name: 'Brick',              hex: '#a75154', hiding: 0.08 },
  { name: 'Fluo Orange',        hex: '#ff7477', hiding: 0.12 },
  { name: 'Mahogany',           hex: '#8e595a', hiding: 0.08 },
  { name: 'Red',                hex: '#ff665e', hiding: 0.08 },
  { name: 'Crimson',            hex: '#e45d50', hiding: 0.08 },
  { name: 'Pumpkin',            hex: '#ff6f4c', hiding: 0.08 },
  { name: 'Brown',              hex: '#925f52', hiding: 0.08 },
  { name: 'Orange',             hex: '#ff6c2f', hiding: 0.08 },
  { name: 'Paprika',            hex: '#ee7f4b', hiding: 0.08 },
  { name: 'Copper',             hex: '#bd6439', hiding: 0.45 },
  { name: 'Apricot',            hex: '#f6a04d', hiding: 0.08 },
  { name: 'Bright Gold',        hex: '#ba8032', hiding: 0.45 },
  { name: 'Melon',              hex: '#ffae3b', hiding: 0.08 },
  { name: 'Gold',               hex: '#ac936e', hiding: 0.45 },
  { name: 'Flat Gold',          hex: '#bb8b41', hiding: 0.45 },
  { name: 'Sunflower',          hex: '#ffb511', hiding: 0.08 },
  { name: 'Bright Olive Green', hex: '#b49f29', hiding: 0.08 },
  { name: 'Yellow',             hex: '#ffe800', hiding: 0.08 },
  { name: 'Fluo Yellow',        hex: '#ffe900', hiding: 0.12 },
  { name: 'Light Lime',         hex: '#e3ed55', hiding: 0.08 },
  { name: 'Moss',               hex: '#68724d', hiding: 0.08 },
  { name: 'Mist',               hex: '#d5e4c0', hiding: 0.35 },
  { name: 'Kelly Green',        hex: '#67b346', hiding: 0.08 },
  { name: 'Fluo Green',         hex: '#44d62c', hiding: 0.12 },
  { name: 'Forest',             hex: '#516e5a', hiding: 0.08 },
  { name: 'Grass',              hex: '#397e58', hiding: 0.08 },
  { name: 'Emerald',            hex: '#19975d', hiding: 0.08 },
  { name: 'Green',              hex: '#00a95c', hiding: 0.08 },
  { name: 'Ivy',                hex: '#169b62', hiding: 0.08 },
  { name: 'Hunter Green',       hex: '#407060', hiding: 0.08 },
  { name: 'Spruce',             hex: '#4a635d', hiding: 0.08 },
  { name: 'Sea Foam',           hex: '#62c2b1', hiding: 0.08 },
  { name: 'Turquoise',          hex: '#00aa93', hiding: 0.08 },
  { name: 'Pine',               hex: '#237e74', hiding: 0.08 },
  { name: 'Mint',               hex: '#82d8d5', hiding: 0.08 },
  { name: 'Light Teal',         hex: '#009da5', hiding: 0.08 },
  { name: 'Teal',               hex: '#00838a', hiding: 0.08 },
  { name: 'Lagoon',             hex: '#2f6165', hiding: 0.08 },
  { name: 'Smoky Teal',         hex: '#5f8289', hiding: 0.08 },
  { name: 'Aqua',               hex: '#5ec8e5', hiding: 0.08 },
  { name: 'Sea Blue',           hex: '#0074a2', hiding: 0.08 },
  { name: 'Blue',               hex: '#0078bf', hiding: 0.08 },
  { name: 'Steel',              hex: '#375e77', hiding: 0.08 },
  { name: 'Cornflower',         hex: '#62a8e5', hiding: 0.08 },
  { name: 'Midnight',           hex: '#435060', hiding: 0.08 },
  { name: 'Sky Blue',           hex: '#4982cf', hiding: 0.08 },
  { name: 'Lake',               hex: '#235ba8', hiding: 0.08 },
  { name: 'Federal Blue',       hex: '#3d5588', hiding: 0.08 },
  { name: 'Medium Blue',        hex: '#3255a4', hiding: 0.08 },
  { name: 'Indigo',             hex: '#484d7a', hiding: 0.08 },
  { name: 'Purple',             hex: '#765ba7', hiding: 0.08 },
  { name: 'Violet',             hex: '#9d7ad2', hiding: 0.08 },
  { name: 'Grape',              hex: '#6c5d80', hiding: 0.08 },
  { name: 'Plum',               hex: '#845991', hiding: 0.08 },
  { name: 'Orchid',             hex: '#aa60bf', hiding: 0.08 },
  { name: 'Raisin',             hex: '#775d7a', hiding: 0.08 },
  { name: 'Bubble Gum',         hex: '#f984ca', hiding: 0.08 },
  { name: 'Fluo Pink',          hex: '#ff48b0', hiding: 0.12 },
  { name: 'Burgundy',           hex: '#914e72', hiding: 0.08 },
  { name: 'Wine',               hex: '#914e72', hiding: 0.08 },
  { name: 'Dark Mauve',         hex: '#bd8ca6', hiding: 0.35 },
  { name: 'Maroon',             hex: '#9e4c6e', hiding: 0.08 },
  { name: 'Light Mauve',        hex: '#e6b5c9', hiding: 0.08 },
  { name: 'Cranberry',          hex: '#d1517a', hiding: 0.08 },
  { name: 'Raspberry Red',      hex: '#d1517a', hiding: 0.08 },
  { name: 'Fluo Red',           hex: '#ff4c65', hiding: 0.12 },
];

/**
 * The pool Auto-pick and Shuffle draw from: the common drum colours, the same
 * set the app began with. The full library above stays there for the picker;
 * searching all 78 buys little and tends to reach for the odd greys and tints.
 */
export const AUTO_INKS = [
  'Black', 'Steel', 'Indigo', 'Federal Blue', 'Medium Blue', 'Blue', 'Cornflower', 'Aqua', 'Teal',
  'Mint', 'Green', 'Kelly Green', 'Yellow', 'Sunflower', 'Gold', 'Orange', 'Fluo Orange', 'Red',
  'Scarlet', 'Crimson', 'Fluo Pink', 'Burgundy', 'Purple', 'Violet', 'Brown', 'Light Gray',
].map((n) => INKS.find((k) => k.name === n));

/** Look an ink up by name. A '#rrggbb' name is a custom ink of ordinary transparency. */
export function inkByName(name) {
  if (typeof name === 'string' && name[0] === '#') return { name, hex: name, hiding: 0.1 };
  return INKS.find((k) => k.name === name) || INKS[0];
}

export const PAPERS = [
  { name: 'Bright white', hex: '#ffffff', grain: 0.030, mottle: 0.014 },
  { name: 'Natural',      hex: '#f2eadb', grain: 0.042, mottle: 0.026 },
  { name: 'Newsprint',    hex: '#e8e2d2', grain: 0.060, mottle: 0.040 },
  { name: 'Gray',         hex: '#d3d0ca', grain: 0.046, mottle: 0.028 },
  { name: 'Kraft',        hex: '#c29c6d', grain: 0.070, mottle: 0.052 },
  { name: 'Blush',        hex: '#f0d3d6', grain: 0.042, mottle: 0.026 },
  { name: 'Lemon',        hex: '#f3e6a9', grain: 0.042, mottle: 0.026 },
  { name: 'Sky',          hex: '#cfe0ea', grain: 0.042, mottle: 0.026 },
  { name: 'Sage',         hex: '#d3dac8', grain: 0.042, mottle: 0.026 },
  { name: 'Ink black',    hex: '#1c1b19', grain: 0.055, mottle: 0.030 },
];

// The first four are amplitude screens: a grid of marks that grow with tone.
// The rest are frequency screens: same-sized art pixels, more of them in the
// shadows. Those have a pixel size instead of a frequency and angle.
export const SHAPES = [
  { id: 0, name: 'Dot' },
  { id: 1, name: 'Diamond' },
  { id: 2, name: 'Square' },
  { id: 3, name: 'Line' },
  { id: 4, name: 'Grain' },
  { id: 5, name: 'Bayer' },
  { id: 6, name: 'Atkinson' },
  { id: 7, name: 'Floyd–Steinberg' },
];
export const FM_SHAPE = 4;        // shape ids from here on have no angle or lpi
export const PIXEL_SHAPE = 5;     // ...and render hard-edged art pixels
export const DIFFUSED_SHAPE = 6;  // ...and need the CPU error-diffusion pass

// Three art-pixel sizes, in px at 150 ppi. BitCam calls them FatBits, Standard
// and Super-Res; at these sizes a 7-inch print is 175, 300 and 525 pixels wide.
export const PIXEL_SIZES = [
  { name: 'Fat bits', px: 6 },
  { name: 'Standard', px: 3.5 },
  { name: 'Fine',     px: 2 },
];

// A flood coat is a layer of ink laid over the whole block before the picture.
export const FLOOD_KINDS = [
  { id: 0, name: 'None' },
  { id: 1, name: 'Solid' },
  { id: 2, name: 'Linear' },
  { id: 3, name: 'Radial' },
];

// A split fountain runs two inks into one tray, so the colour changes across the sheet.
export const FOUNTAIN_KINDS = [
  { id: 0, name: 'Solid' },
  { id: 1, name: 'Linear' },
  { id: 2, name: 'Radial' },
];

// Ink pairs that blend well in a fountain. Named for the light they resemble.
export const FOUNTAINS = [
  { name: 'Dawn',     inks: ['Scarlet', 'Cornflower'] },
  { name: 'Dusk',     inks: ['Indigo', 'Fluo Orange'] },
  { name: 'Blossom',  inks: ['Fluo Pink', 'Aqua'] },
  { name: 'Harvest',  inks: ['Burgundy', 'Sunflower'] },
  { name: 'Shallows', inks: ['Federal Blue', 'Mint'] },
  { name: 'Moss',     inks: ['Teal', 'Yellow'] },
  { name: 'Ember',    inks: ['Purple', 'Orange'] },
  { name: 'Slate',    inks: ['Steel', 'Light Gray'] },
];

// Printer's marks in the margin. Registration targets print in every ink, so
// they show the misregistration the way a real proof does.
export const MARKS = [
  { id: 0, name: 'None' },
  { id: 1, name: 'Crop marks' },
  { id: 2, name: 'Crop + registration' },
];

export const ASPECTS = [
  { name: 'Photo', value: 0 },
  { name: 'Square', value: 1 },
  { name: '4:5', value: 4 / 5 },
  { name: '5:4', value: 5 / 4 },
  { name: '2:3', value: 2 / 3 },
  { name: '3:2', value: 3 / 2 },
  { name: 'A-series', value: 1 / Math.SQRT2 },
];

// Screen angles that keep rosettes clean for 1, 2 and 3 ink jobs.
export const ANGLE_SETS = [[45], [45, 75], [45, 75, 15]];

export const PRESETS = [
  {
    name: 'Two-colour poster',
    inkCount: 2, auto: true, paper: 1,
    ink: [{ lpi: 34, shape: 0 }, { lpi: 34, shape: 0 }],
    margin: 0.06, misreg: 1.1, inkMottle: 0.10,
  },
  {
    name: 'Newsprint mono',
    inkCount: 1, inks: ['Black'], paper: 2,
    ink: [{ lpi: 42, shape: 0, gamma: 0.92, density: 1.05 }],
    margin: 0.04, misreg: 0.5, inkMottle: 0.18, contrast: 1.12,
  },
  {
    name: 'Fluoro zine',
    inkCount: 2, inks: ['Fluo Pink', 'Blue'], paper: 0,
    ink: [{ lpi: 26, shape: 4, grain: 2.4 }, { lpi: 26, shape: 4, grain: 2.4 }],
    margin: 0.09, misreg: 2.2, inkMottle: 0.22, saturation: 1.2,
  },
  {
    name: 'Kraft duotone',
    inkCount: 2, inks: ['Black', 'Sunflower'], paper: 4,
    ink: [{ lpi: 30, shape: 1 }, { lpi: 30, shape: 1 }],
    margin: 0.10, misreg: 1.4, inkMottle: 0.14, deckle: 0.55,
  },
  {
    name: 'Coarse dot',
    inkCount: 1, inks: ['Black'], paper: 3,
    ink: [{ lpi: 14, shape: 0, gamma: 0.8 }],
    margin: 0.07, misreg: 0, inkMottle: 0.06, contrast: 1.2,
  },
  {
    name: 'Three-ink press',
    inkCount: 3, auto: true, paper: 1,
    ink: [{ lpi: 38, shape: 0 }, { lpi: 38, shape: 0 }, { lpi: 38, shape: 0 }],
    margin: 0.07, misreg: 1.0, inkMottle: 0.09,
  },
  {
    name: 'Line screen',
    inkCount: 2, auto: true, paper: 1,
    ink: [{ lpi: 40, shape: 3 }, { lpi: 40, shape: 3 }],
    margin: 0.06, misreg: 0.8, inkMottle: 0.08,
  },
  // One ink, one bit: the 1984 Macintosh screen, printed.
  {
    name: 'One-bit',
    inkCount: 1, inks: ['Black'], paper: 0,
    ink: [{ shape: 6, grain: 3.5 }],
    margin: 0.05, misreg: 0, inkMottle: 0, exposure: 1.35, contrast: 1.2,
  },
  // Three 1-bit dithers overprinted give exactly the classic eight-colour
  // palette: paper, three inks, three two-ink overlaps, and all three together.
  {
    name: 'Eight colours',
    inkCount: 3, inks: ['Blue', 'Fluo Pink', 'Yellow'], paper: 0,
    ink: [{ shape: 6, grain: 3.5 }, { shape: 6, grain: 3.5 }, { shape: 6, grain: 3.5 }],
    margin: 0.05, misreg: 0, inkMottle: 0, saturation: 1.15,
  },
  // A gradient flood under a 1-bit black: sky at the top, ground at the bottom.
  {
    name: 'Woodblock',
    inkCount: 1, inks: ['Black'], paper: 1,
    ink: [{ shape: 6, grain: 3 }],
    flood: { kind: 2, inks: ['Scarlet', 'Cornflower'], angle: 90 },
    margin: 0.07, misreg: 0, inkMottle: 0.05, contrast: 1.2,
  },
  // A tired drum: ink running low toward the trailing edge, roller bands, loose fit.
  {
    name: 'Low on ink',
    inkCount: 2, inks: ['Black', 'Fluo Orange'], paper: 1,
    ink: [{ lpi: 30, shape: 0 }, { lpi: 30, shape: 0 }],
    margin: 0.07, misreg: 1.8, inkMottle: 0.18, inkFade: 0.55, streaks: 0.5, knockout: 0.08,
  },
  // One stencil, two inks in the tray.
  {
    name: 'Split fountain',
    inkCount: 1, inks: ['Federal Blue'], paper: 1,
    ink: [{ lpi: 34, shape: 0, fountain: { kind: 1, to: 'Fluo Pink', angle: 90 } }],
    margin: 0.06, misreg: 0, inkMottle: 0.10, contrast: 1.1,
  },
];
