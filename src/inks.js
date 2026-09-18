// Ink library modelled on Risograph drum colours, paper stocks, and starting presets.

export const INKS = [
  { name: 'Black',        hex: '#2b2b2b' },
  { name: 'Steel',        hex: '#375e77' },
  { name: 'Indigo',       hex: '#484d7a' },
  { name: 'Federal Blue', hex: '#3d5588' },
  { name: 'Medium Blue',  hex: '#3255a4' },
  { name: 'Blue',         hex: '#0078bf' },
  { name: 'Cornflower',   hex: '#62a8e5' },
  { name: 'Aqua',         hex: '#5ec8e5' },
  { name: 'Teal',         hex: '#00838a' },
  { name: 'Mint',         hex: '#82d8d5' },
  { name: 'Green',        hex: '#00a95c' },
  { name: 'Kelly Green',  hex: '#67b346' },
  { name: 'Yellow',       hex: '#ffe800' },
  { name: 'Sunflower',    hex: '#ffb511' },
  { name: 'Gold',         hex: '#ac936e' },
  { name: 'Orange',       hex: '#ff6c2f' },
  { name: 'Fluo Orange',  hex: '#ff7477' },
  { name: 'Red',          hex: '#ff665e' },
  { name: 'Scarlet',      hex: '#f65058' },
  { name: 'Crimson',      hex: '#e45d50' },
  { name: 'Fluo Pink',    hex: '#ff48b0' },
  { name: 'Burgundy',     hex: '#914e72' },
  { name: 'Purple',       hex: '#765ba7' },
  { name: 'Violet',       hex: '#9d7ad2' },
  { name: 'Brown',        hex: '#925f52' },
  { name: 'Light Gray',   hex: '#88898a' },
];

export const PAPERS = [
  { name: 'Bright white', hex: '#ffffff', grain: 0.030, mottle: 0.014 },
  { name: 'Natural',      hex: '#f2eadb', grain: 0.042, mottle: 0.026 },
  { name: 'Newsprint',    hex: '#e8e2d2', grain: 0.060, mottle: 0.040 },
  { name: 'Gray',         hex: '#d3d0ca', grain: 0.046, mottle: 0.028 },
  { name: 'Kraft',        hex: '#c29c6d', grain: 0.070, mottle: 0.052 },
  { name: 'Ink black',    hex: '#1c1b19', grain: 0.055, mottle: 0.030 },
];

export const SHAPES = [
  { id: 0, name: 'Dot' },
  { id: 1, name: 'Diamond' },
  { id: 2, name: 'Square' },
  { id: 3, name: 'Line' },
  { id: 4, name: 'Grain' },
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
];
