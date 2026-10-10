import * as T from 'three';
import { toon, outline } from './illustration.js';
import { gaitPose, gaitShape, solveLeg } from './locomotion.js';
import { ACTIONS } from './actions.js';

const TAU = Math.PI * 2;
const palette = new Map(), decals = new Map(), fabrics = new Map();
// Characters use a lighter cel ramp than the town, so faces and clothes keep
// the sheet's clean, sunlit colour blocks with one soft shadow band.
const ramp = new T.DataTexture(new Uint8Array([150, 150, 150, 255, 212, 212, 212, 255, 255, 255, 255, 255]), 3, 1, T.RGBAFormat);
ramp.minFilter = ramp.magFilter = T.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
function cel(color, options = {}) { return toon(color, { gradientMap: ramp, ...options }); }
function material(color) { if (!palette.has(color)) palette.set(color, cel(color)); return palette.get(color); }
const shade = (hex, f) => new T.Color(hex).multiplyScalar(f).getHex();
const skinMaterial = cel(0xffffff, { vertexColors: true });
// Every drawing is painted on a 512 px grid; smaller canvases just scale it.
function canvas(size, paint) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); ctx.lineCap = ctx.lineJoin = 'round'; if (size !== 512) ctx.scale(size / 512, size / 512); paint(ctx); return c;
}
function drawing(key, paint, size = 512) {
  if (!decals.has(key)) {
    const texture = new T.CanvasTexture(canvas(size, paint)); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
    decals.set(key, new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  }
  return decals.get(key);
}
// Printed cloth (checks, batik, florals, stripes) is drawn once and tiled; the
// repeat in metres is baked into each piece's UVs when the figure is merged.
const tiled = draw => { for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) draw(dx, dy); };
function batik(c, ground, petal, centre, leaf, wax) {
  c.fillStyle = ground; c.fillRect(0, 0, 512, 512);
  tiled((dx, dy) => {
    for (const [x, y, r, a] of [[128, 128, 88, 0], [384, 384, 88, .6], [390, 126, 44, .3], [124, 388, 44, 1]]) {
      c.fillStyle = leaf;
      for (const s of [-1, 1]) { c.save(); c.translate(x + dx, y + dy); c.rotate(a + s * 1.9); c.beginPath(); c.ellipse(0, -r * 1.05, r * .2, r * .5, 0, 0, TAU); c.fill(); c.restore(); }
      for (let i = 0; i < 5; i++) {
        c.save(); c.translate(x + dx, y + dy); c.rotate(a + i * TAU / 5);
        c.fillStyle = petal; c.strokeStyle = wax; c.lineWidth = 7; c.beginPath(); c.ellipse(0, -r * .5, r * .32, r * .52, 0, 0, TAU); c.fill(); c.stroke(); c.restore();
      }
      c.fillStyle = centre; c.beginPath(); c.arc(x + dx, y + dy, r * .2, 0, TAU); c.fill();
    }
    c.fillStyle = wax; for (const [x, y] of [[256, 40], [40, 256], [256, 256], [470, 470], [300, 200], [200, 300]]) { c.beginPath(); c.arc(x + dx, y + dy, 9, 0, TAU); c.fill(); }
  });
}
const PRINTS = {
  // Gingham shopkeeper's shirt: blue bands crossing on white.
  gingham: c => { c.fillStyle = '#f3f0e8'; c.fillRect(0, 0, 512, 512); c.fillStyle = 'rgba(58,96,152,.42)'; for (const p of [0, 256]) { c.fillRect(p, 0, 128, 512); c.fillRect(0, p, 512, 128); } },
  stripes: c => { c.fillStyle = '#f6f2ea'; c.fillRect(0, 0, 512, 512); c.fillStyle = '#2f3d68'; for (const y of [0, 256]) c.fillRect(0, y + 72, 512, 112); },
  // Kain pelikat: deep green ground with blue and cream checks.
  pelikat: c => {
    c.fillStyle = '#2f5a4f'; c.fillRect(0, 0, 512, 512);
    for (const [colour, width, offset] of [['rgba(38,62,104,.85)', 70, 0], ['rgba(230,220,190,.55)', 12, 96], ['rgba(20,40,36,.6)', 24, 150]]) {
      c.fillStyle = colour;
      for (let p = offset; p < 512; p += 256) { c.fillRect(p, 0, width, 512); c.fillRect(0, p, 512, width); }
    }
  },
  batik: c => batik(c, '#6b3a22', '#e8b04b', '#c2552f', '#3f7f78', '#f2dfb4'),
  kain: c => batik(c, '#4a2f62', '#ee8f5c', '#f4d36b', '#5f9a7a', '#e3d2f2'),
  // Nenek's baju kurung: small cream and pink flowers on lilac.
  floral: c => {
    c.fillStyle = '#c3aedb'; c.fillRect(0, 0, 512, 512);
    tiled((dx, dy) => {
      for (const [x, y, r, petal] of [[96, 110, 40, '#fff6ee'], [300, 70, 30, '#f2a7bd'], [410, 250, 40, '#fff6ee'], [200, 300, 34, '#f2a7bd'], [90, 420, 30, '#fff6ee'], [350, 440, 36, '#f2a7bd']]) {
        c.fillStyle = '#7fa37a'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + dx + s * r * 1.1, y + dy + r * .5, r * .45, r * .2, s * .5, 0, TAU); c.fill(); }
        c.fillStyle = petal; for (let i = 0; i < 5; i++) { const a = i * TAU / 5; c.beginPath(); c.arc(x + dx + Math.sin(a) * r * .5, y + dy - Math.cos(a) * r * .5, r * .42, 0, TAU); c.fill(); }
        c.fillStyle = '#f0c75a'; c.beginPath(); c.arc(x + dx, y + dy, r * .25, 0, TAU); c.fill();
      }
    });
  }
};
const TILE = { gingham: .1, stripes: .075, pelikat: .18, batik: .2, kain: .22, floral: .17 };
function fabric(print) {
  if (!fabrics.has(print)) {
    const texture = new T.CanvasTexture(canvas(256, PRINTS[print])); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 4;
    const m = cel(0xffffff, { map: texture }); m.userData.tile = TILE[print]; fabrics.set(print, m);
  }
  return fabrics.get(print);
}

// Body plans in metres, measured from the sole with legs straight. Children
// follow the Jaguh Kampung sheet: the head is roughly a quarter of the height,
// long baggy cargo trousers reach chunky shell-toe sneakers, and arms reach
// mid-thigh. Teens stretch the same build; grown-ups keep adult proportions.
const PLANS = {
  amir: { height: 1.50, skin: 0xe2a57b, ankle: .085, lower: .33, upper: .33, hipX: .09, shoulderY: 1.06, shoulderX: .163, upperArm: .21, foreArm: .185, chest: .15, headY: 1.285, head: [.148, .16, .142] },
  nur: { height: 1.48, skin: 0xe8b08a, ankle: .085, lower: .325, upper: .325, hipX: .088, shoulderY: 1.045, shoulderX: .156, upperArm: .205, foreArm: .18, chest: .146, headY: 1.268, head: [.145, .157, .14] },
  teen: { height: 1.64, skin: 0xc98a5e, ankle: .085, lower: .37, upper: .36, hipX: .092, shoulderY: 1.15, shoulderX: .168, upperArm: .235, foreArm: .205, chest: .155, headY: 1.375, head: [.14, .152, .136] },
  teenGirl: { height: 1.57, skin: 0xf0c9a5, ankle: .085, lower: .36, upper: .355, hipX: .088, shoulderY: 1.125, shoulderX: .154, upperArm: .225, foreArm: .195, chest: .146, headY: 1.348, head: [.138, .15, .134] },
  man: { height: 1.70, skin: 0xb77b54, ankle: .07, lower: .42, upper: .43, hipX: .092, shoulderY: 1.39, shoulderX: .182, upperArm: .28, foreArm: .25, chest: .19, headY: 1.596, head: [.125, .141, .127] },
  woman: { height: 1.57, skin: 0xc68d65, ankle: .07, lower: .39, upper: .39, hipX: .088, shoulderY: 1.27, shoulderX: .14, upperArm: .25, foreArm: .225, chest: .168, headY: 1.471, head: [.12, .136, .122] }
};
const man = o => ({ ...PLANS.man, ...o }), woman = o => ({ ...PLANS.woman, ...o });
// Grown-up faces: smaller eyes, and the details the guide gives each person.
const MAN = { adult: true }, LADY = { adult: true, lashes: true, eyeW: 38, eyeH: 40, eyeY: 266, gap: 86, lips: '#a34a52' };

// One look per character kind, following the cast guide's visual notes.
// Kids: `shirt` ringer|hoodie|tee, `legs` cargo|shorts|slacks, `feet`
// sneaker|slipper, `hair` spiky|hijab|curtains|bob, `bag` red|black|sling.
// Adults: `top` shirt|polo|baju|kurung|blouse|tee with `sleeve`
// short|long|rolled and `tuck`, `legs` trousers|overalls|sarong|kain, `feet`
// sandal|shoes|boots, `hair` short|tudung, `hat` songkok|cap|straw, `props`.
const LOOKS = {
  amir: { plan: PLANS.amir, pants: 0x2d4f86, seam: 0x22396a, legs: 'cargo', feet: 'sneaker', top: 0xf8f4ec, trim: 0x223a63, shirt: 'ringer', hem: .035, motif: 'alien', hair: 'soft', bag: 'red', watch: true, face: {} },
  nur: { plan: PLANS.nur, girl: true, pants: 0x8db3cf, seam: 0x6b92b3, stripe: 0xe48ea3, legs: 'cargo', feet: 'sneaker', top: 0xf0b5c0, trim: 0xd98a9d, shirt: 'hoodie', sleeve: 'long', hem: -.045, hair: 'hijab', bag: 'black', face: { lashes: true } },
  faiz: { plan: PLANS.teen, pants: 0xa48d62, seam: 0x857048, legs: 'shorts', feet: 'slipper', sole: 0xf0ece2, strap: 0x2f6fb0, top: 0x2b2d35, trim: 0x474b57, shirt: 'tee', hem: -.03, motif: 'car', hair: 'curtains', hairColour: 0x2a1e19, sheen: 0x46342b, watch: true, props: ['car'], face: { eyeH: 52, eyeY: 280 } },
  meiling: { plan: PLANS.teenGirl, girl: true, pants: 0xcdbb98, seam: 0xab9875, stripe: 0x2f3d68, legs: 'slacks', feet: 'sneaker', top: 0xc9cbd6, print: 'stripes', trim: 0x2f3d68, shirt: 'tee', hem: -.005, hair: 'bob', bag: 'sling', face: { lashes: true, eyeH: 54, iris: '#6e4428' } },
  rahman: { adult: true, plan: man({ height: 1.68, skin: 0xb98058 }), belly: 1.08, top: { cut: 'shirt', colour: 0xc4d0de, print: 'gingham', sleeve: 'short' }, legs: 'trousers', pants: 0x3b3b43, feet: 'sandal', sole: 0x4b3a2e, strap: 0x6b4a33, hair: 'short', hairColour: 0x2a2523, props: ['pencil'], face: { ...MAN, moustache: '#2a2220' } },
  din: { adult: true, plan: man({ height: 1.7, skin: 0xa86f48 }), top: { cut: 'shirt', colour: 0x86a4bd, sleeve: 'short', pocket: true }, legs: 'trousers', pants: 0x4a4e45, feet: 'sandal', sole: 0x2c2a2a, strap: 0x2c2a2a, hair: 'short', hairColour: 0x231f1e, hat: 'cap', hatColour: 0xb5393a, props: ['towel', 'tag'], face: { ...MAN } },
  lim: { adult: true, plan: man({ height: 1.66, skin: 0xe9c39c }), top: { cut: 'polo', colour: 0x3d8b85, trim: 0x2f6e69, sleeve: 'short', tuck: true }, legs: 'trousers', pants: 0xb39e74, feet: 'sandal', sole: 0x4b3a2e, strap: 0x5a4130, hair: 'short', hairColour: 0x3a3837, props: ['pouch'], face: { ...MAN, glasses: '#2b2420', iris: '#3a2a22' } },
  ros: { adult: true, plan: woman({ height: 1.56, skin: 0xc68d65 }), top: { cut: 'blouse', colour: 0xb39ac6, sleeve: 'long' }, legs: 'kain', pants: 0x34405e, feet: 'sandal', sole: 0x6b4a33, strap: 0x8a3b4a, hair: 'tudung', hairColour: 0x8a3b4a, apron: { colour: 0xf1eadb, pocket: 0xd9cdb6, trim: 0x8a3b4a }, face: { ...LADY } },
  farid: { adult: true, plan: man({ height: 1.74, skin: 0xc48a60, chest: .185 }), top: { cut: 'shirt', colour: 0xdbe7f2, sleeve: 'short', tuck: true, pocket: true }, legs: 'trousers', pants: 0x2b2e38, feet: 'shoes', sole: 0x1f1d20, shoe: 0x2a2526, hair: 'short', hairColour: 0x1f1b1c, quiff: true, props: ['tie', 'folder'], face: { ...MAN } },
  man: { adult: true, plan: man({ height: 1.69, skin: 0xa96c45 }), top: { cut: 'tee', colour: 0x9b9a96, sleeve: 'rolled', tuck: true }, legs: 'overalls', pants: 0x3f5f8a, feet: 'shoes', sole: 0x2c2420, shoe: 0x5a3c28, hair: 'short', hairColour: 0x241f1d, props: ['rag'], face: { ...MAN, moustache: '#2a2220' } },
  ita: { adult: true, plan: woman({ height: 1.58, skin: 0xd29a72, chest: .162 }), top: { cut: 'kurung', colour: 0x3e9c94, sleeve: 'long' }, legs: 'kain', pants: 0x4a2f62, print: 'kain', feet: 'sandal', sole: 0x6b4a33, strap: 0xe35f7a, hair: 'tudung', hairColour: 0xf07a6a, apron: { colour: 0xf3c64e, pocket: 0xe35f7a, trim: 0xe0663a }, face: { ...LADY } },
  salleh: { adult: true, plan: man({ height: 1.67, skin: 0xb27650 }), belly: 1.06, top: { cut: 'shirt', colour: 0x8b5a32, print: 'batik', sleeve: 'short' }, legs: 'trousers', pants: 0x2f2d33, feet: 'sandal', sole: 0x3d2f26, strap: 0x5a4130, hair: 'short', hairColour: 0x6b6661, hairline: .62, props: ['clipboard'], face: { ...MAN, moustache: '#55504c', brow: '#4a4542' } },
  hassan: { adult: true, plan: man({ height: 1.72, skin: 0xbe845b }), top: { cut: 'baju', colour: 0xf2eee2, trim: 0xd8d0bf, sleeve: 'long', long: .2 }, legs: 'trousers', pants: 0xf2eee2, feet: 'sandal', sole: 0x4b3a2e, strap: 0x3d2f26, hair: 'short', hairColour: 0x1f1b1c, hat: 'songkok', face: { ...MAN, moustache: '#2a2220', beard: '#2a2220' } },
  pakmat: { adult: true, plan: man({ height: 1.64, skin: 0x9f6743 }), top: { cut: 'shirt', colour: 0x7f9a6c, sleeve: 'rolled' }, legs: 'trousers', pants: 0x4a4740, feet: 'boots', sole: 0x1f1e20, shoe: 0x2a2a2e, hair: 'short', hairColour: 0x9a958d, hat: 'straw', props: ['basket'], face: { ...MAN, moustache: '#8f8a84', brow: '#6f6a66', lines: true } },
  nenek: { adult: true, plan: woman({ height: 1.5, skin: 0xc7926c }), stoop: .1, top: { cut: 'kurung', colour: 0xc3aedb, print: 'floral', sleeve: 'long' }, legs: 'kain', pants: 0xc3aedb, print: 'floral', feet: 'sandal', sole: 0x6b4a33, strap: 0x8a6a4a, hair: 'tudung', hairColour: 0xf4efe6, lace: 0xe2d6c2, face: { ...LADY, glasses: '#8a5a3a', lines: true, lips: '#8f4a4f', brow: '#6a5a55' } },
  atuk: { adult: true, plan: man({ height: 1.63, skin: 0xa87250 }), stoop: .08, top: { cut: 'shirt', colour: 0xe9dfc6, sleeve: 'short', long: .16, loose: 1.06 }, legs: 'sarong', pants: 0x2f5a4f, print: 'pelikat', feet: 'sandal', sole: 0x3d2f26, strap: 0x6b4a33, hair: 'short', hairColour: 0xc9c4bc, hat: 'cap', hatColour: 0xcdbb94, props: ['toybox'], face: { ...MAN, moustache: '#d9d4cc', brow: '#bdb6ad', lines: true } },
  // The residents (cast.js RESIDENTS), dressed for their trade or housework.
  zaitun: { adult: true, plan: woman({ height: 1.55, skin: 0xc8916a }), top: { cut: 'kurung', colour: 0xe7a46a, sleeve: 'long' }, legs: 'kain', pants: 0x7a5a48, feet: 'sandal', sole: 0x6b4a33, strap: 0xb5493a, hair: 'tudung', hairColour: 0xd9c27a, props: ['broom'], face: { ...LADY } },
  mail: { adult: true, plan: man({ height: 1.66, skin: 0x9a6440 }), top: { cut: 'shirt', colour: 0xa3876a, sleeve: 'rolled' }, legs: 'trousers', pants: 0x4d4a3c, feet: 'boots', sole: 0x1f1e20, shoe: 0x2f3a2e, hair: 'short', hairColour: 0x2c2624, hat: 'straw', props: ['hoe'], face: { ...MAN, lines: true } },
  salmah: { adult: true, plan: woman({ height: 1.54, skin: 0xbf8660, chest: .175 }), top: { cut: 'kurung', colour: 0xd9737f, sleeve: 'long' }, legs: 'kain', pants: 0x6b3a22, print: 'batik', feet: 'sandal', sole: 0x6b4a33, strap: 0x8c3a4a, hair: 'tudung', hairColour: 0x8c3a4a, apron: { colour: 0xf6efe0, pocket: 0xe9c9a8, trim: 0x8c3a4a }, props: ['tiffin'], face: { ...LADY } },
  rohani: { adult: true, plan: woman({ height: 1.58, skin: 0xd6a07a }), top: { cut: 'kurung', colour: 0x8fc0a5, sleeve: 'long' }, legs: 'kain', pants: 0x3d5a6a, feet: 'sandal', sole: 0x6b4a33, strap: 0x3d5a6a, hair: 'tudung', hairColour: 0xf4e1b0, sling: 0xe0b04a, props: ['baby'], face: { ...LADY } },
  kamal: { adult: true, plan: man({ height: 1.72, skin: 0xa86d46 }), top: { cut: 'tee', colour: 0x2f6d8a, sleeve: 'short' }, legs: 'trousers', pants: 0x3d4a62, feet: 'sandal', sole: 0x2c2a2a, strap: 0x2c2a2a, hair: 'short', hairColour: 0x1f1b1c, hat: 'cap', hatColour: 0xe0a030, props: ['towel'], face: { ...MAN, moustache: '#2a2220' } },
  timah: { adult: true, plan: woman({ height: 1.52, skin: 0xbf8862 }), stoop: .05, top: { cut: 'kurung', colour: 0x6c5aa8, sleeve: 'long' }, legs: 'kain', pants: 0x4a2f62, print: 'kain', feet: 'sandal', sole: 0x6b4a33, strap: 0x6c5aa8, hair: 'tudung', hairColour: 0x2f2a4a, props: ['broom'], face: { ...LADY, lines: true, brow: '#5a4a45' } },
  ismail: { adult: true, plan: man({ height: 1.65, skin: 0x8f5a38 }), top: { cut: 'shirt', colour: 0xd8cfa8, sleeve: 'rolled' }, legs: 'sarong', pants: 0x2f5a4f, print: 'pelikat', feet: 'sandal', sole: 0x3d2f26, strap: 0x3d2f26, hair: 'short', hairColour: 0x5a5550, hat: 'straw', props: ['rod'], face: { ...MAN, moustache: '#4a4542', lines: true } },
  aminah: { adult: true, plan: woman({ height: 1.57, skin: 0xe8b58e }), top: { cut: 'blouse', colour: 0x9bc3d9, sleeve: 'long' }, legs: 'kain', pants: 0x2f4a6a, feet: 'sandal', sole: 0x6b4a33, strap: 0x9bc3d9, hair: 'tudung', hairColour: 0xf2d6dc, face: { ...LADY } },
  lina: { adult: true, plan: woman({ height: 1.6, skin: 0xd29a72 }), top: { cut: 'blouse', colour: 0xf0d36a, sleeve: 'rolled' }, legs: 'kain', pants: 0x5a7a5a, feet: 'sandal', sole: 0x6b4a33, strap: 0x3f7f78, hair: 'tudung', hairColour: 0x3f7f78, props: ['broom'], face: { ...LADY } },
  abu: { adult: true, plan: man({ height: 1.64, skin: 0xb27a52 }), stoop: .05, top: { cut: 'shirt', colour: 0x7d97b8, sleeve: 'short', pocket: true }, legs: 'trousers', pants: 0x4a4a52, feet: 'sandal', sole: 0x3d2f26, strap: 0x5a4130, hair: 'short', hairColour: 0xbab4ac, props: ['newspaper'], face: { ...MAN, glasses: '#3a3230', moustache: '#bab4ac', brow: '#9a948c', lines: true } },
  yati: { adult: true, plan: woman({ height: 1.55, skin: 0xc68d65 }), top: { cut: 'kurung', colour: 0xf2b8c6, sleeve: 'long' }, legs: 'kain', pants: 0x5e3f5e, feet: 'sandal', sole: 0x6b4a33, strap: 0xf2b8c6, hair: 'tudung', hairColour: 0xb6d0e8, sling: 0x8a5a8a, props: ['baby'], face: { ...LADY } },
  faizal: { adult: true, plan: man({ height: 1.73, skin: 0xc28a62 }), top: { cut: 'polo', colour: 0xc65a4a, trim: 0xa8463a, sleeve: 'short', tuck: true }, legs: 'trousers', pants: 0x3a3f4f, feet: 'sandal', sole: 0x2c2a2a, strap: 0x2c2a2a, hair: 'short', hairColour: 0x1f1b1c, quiff: true, props: ['newspaper'], face: { ...MAN, glasses: '#2b2420' } },
  kiah: { adult: true, plan: woman({ height: 1.53, skin: 0xb98058, chest: .175 }), top: { cut: 'kurung', colour: 0xe2c26a, sleeve: 'long' }, legs: 'kain', pants: 0x6b3a22, print: 'kain', feet: 'sandal', sole: 0x6b4a33, strap: 0x7a3a2a, hair: 'tudung', hairColour: 0x7a3a2a, face: { ...LADY } },
  ani: { adult: true, plan: woman({ height: 1.58, skin: 0xd09a74 }), top: { cut: 'blouse', colour: 0xd65a4a, sleeve: 'long' }, legs: 'kain', pants: 0x3a3a4a, feet: 'sandal', sole: 0x6b4a33, strap: 0xd65a4a, hair: 'tudung', hairColour: 0xf6e7c7, apron: { colour: 0x3a7fb0, pocket: 0x2f6890, trim: 0xf6e7c7 }, face: { ...LADY } },
  hani: { adult: true, plan: woman({ height: 1.6, skin: 0xe2ad86 }), top: { cut: 'kurung', colour: 0xf3a6b8, sleeve: 'long' }, legs: 'kain', pants: 0xf3a6b8, feet: 'shoes', sole: 0x3a2a2a, shoe: 0x5a3a3a, hair: 'tudung', hairColour: 0xfbe7a0, props: ['folder'], face: { ...LADY } },
  muthu: { adult: true, plan: man({ height: 1.7, skin: 0x6e4128 }), top: { cut: 'shirt', colour: 0xf4f2ec, sleeve: 'short', tuck: true, pocket: true }, legs: 'trousers', pants: 0x2c2c34, feet: 'sandal', sole: 0x2c2a2a, strap: 0x5a4130, hair: 'short', hairColour: 0x151214, props: ['scissors'], face: { ...MAN, moustache: '#151214', brow: '#151214' } },
  hussin: { adult: true, plan: man({ height: 1.66, skin: 0x9c6844 }), top: { cut: 'tee', colour: 0x8a3a32, sleeve: 'rolled', tuck: true }, legs: 'overalls', pants: 0x46566e, feet: 'shoes', sole: 0x2c2420, shoe: 0x4a3a2a, hair: 'short', hairColour: 0x2a2523, hat: 'cap', hatColour: 0x2f5a8a, props: ['spanner', 'rag'], face: { ...MAN, moustache: '#2a2220', lines: true } },
  normah: { adult: true, plan: woman({ height: 1.53, skin: 0xc7926c }), top: { cut: 'kurung', colour: 0x4f8aa8, sleeve: 'long' }, legs: 'kain', pants: 0x6b3a22, print: 'batik', feet: 'sandal', sole: 0x6b4a33, strap: 0x4f8aa8, hair: 'tudung', hairColour: 0xe8e2d0, props: ['tape'], face: { ...LADY, glasses: '#7a4a3a', lines: true } },
  kumar: { adult: true, plan: man({ height: 1.71, skin: 0x7b4a2e }), top: { cut: 'shirt', colour: 0xf8f8f6, sleeve: 'long', tuck: true, pocket: true }, legs: 'trousers', pants: 0x3a3a42, feet: 'shoes', sole: 0x1f1d20, shoe: 0x2a2526, hair: 'short', hairColour: 0x1a1617, hairline: .55, props: ['stethoscope'], face: { ...MAN, glasses: '#2b2420', moustache: '#1a1617' } },
  jah: { adult: true, plan: woman({ height: 1.56, skin: 0xc68d65, chest: .178 }), top: { cut: 'blouse', colour: 0xf1e6d0, sleeve: 'rolled' }, legs: 'kain', pants: 0x8a5a3a, feet: 'sandal', sole: 0x6b4a33, strap: 0x8a5a3a, hair: 'tudung', hairColour: 0xe9d7b0, apron: { colour: 0xfbf7ef, pocket: 0xe6dcc8, trim: 0xc98a45 }, props: ['bread'], face: { ...LADY } },
  azura: { adult: true, plan: woman({ height: 1.6, skin: 0xe2ad86 }), top: { cut: 'kurung', colour: 0x3d6a5a, sleeve: 'long' }, legs: 'kain', pants: 0x3d6a5a, feet: 'shoes', sole: 0x3a2a2a, shoe: 0x4a3a32, hair: 'tudung', hairColour: 0xd8a0a8, props: ['books'], face: { ...LADY, glasses: '#3a2a2a' } },
  hafiz: { adult: true, plan: man({ height: 1.74, skin: 0xa87048 }), top: { cut: 'tee', colour: 0xd94b3a, trim: 0xf6f2ea, sleeve: 'short' }, legs: 'trousers', pants: 0x2a3a6a, feet: 'shoes', sole: 0xf0ece2, shoe: 0xf6f2ea, hair: 'short', hairColour: 0x1f1b1c, quiff: true, props: ['whistle'], face: { ...MAN } },
  karim: { adult: true, plan: man({ height: 1.69, skin: 0xb07a50 }), belly: 1.07, top: { cut: 'shirt', colour: 0x6f8fb0, sleeve: 'short', tuck: true, pocket: true }, legs: 'trousers', pants: 0x2f3440, feet: 'shoes', sole: 0x1f1d20, shoe: 0x2a2526, hair: 'short', hairColour: 0x2a2523, hat: 'cap', hatColour: 0x2a3a5a, props: ['tag'], face: { ...MAN, moustache: '#2a2220' } },
  usop: { adult: true, plan: man({ height: 1.67, skin: 0xa06a44 }), top: { cut: 'polo', colour: 0x8a3a5a, trim: 0x6e2c47, sleeve: 'short' }, legs: 'sarong', pants: 0x2f5a4f, print: 'pelikat', feet: 'sandal', sole: 0x3d2f26, strap: 0x6b4a33, hair: 'short', hairColour: 0x3a3532, hat: 'songkok', props: ['pouch'], face: { ...MAN, moustache: '#3a3532', beard: '#3a3532' } },
  // The families who keep house while a resident is out (cast.js KEEPERS).
  senah: { adult: true, plan: woman({ height: 1.53, skin: 0xa86f48 }), stoop: .04, top: { cut: 'kurung', colour: 0x7fae6a, sleeve: 'long' }, legs: 'kain', pants: 0x3f5a3a, feet: 'sandal', sole: 0x6b4a33, strap: 0x7fae6a, hair: 'tudung', hairColour: 0xe9dcb8, props: ['basket'], face: { ...LADY, lines: true } },
  jalil: { adult: true, plan: man({ height: 1.64, skin: 0xb07a50 }), stoop: .07, top: { cut: 'tee', colour: 0xf2efe6, trim: 0xe0dccf, sleeve: 'short' }, legs: 'sarong', pants: 0x2f5a4f, print: 'pelikat', feet: 'sandal', sole: 0x3d2f26, strap: 0x6b4a33, hair: 'short', hairColour: 0xd9d4cc, hat: 'songkok', props: ['newspaper'], face: { ...MAN, moustache: '#d9d4cc', brow: '#bdb6ad', lines: true } },
  midah: { adult: true, plan: woman({ height: 1.57, skin: 0xc68d65 }), top: { cut: 'kurung', colour: 0xe58a4e, sleeve: 'long' }, legs: 'kain', pants: 0x4a2f62, print: 'kain', feet: 'sandal', sole: 0x6b4a33, strap: 0xe58a4e, hair: 'tudung', hairColour: 0x2f6e69, props: ['broom'], face: { ...LADY } },
  esah: { adult: true, plan: woman({ height: 1.5, skin: 0xbf8862 }), stoop: .08, top: { cut: 'kurung', colour: 0xc3aedb, print: 'floral', sleeve: 'long' }, legs: 'kain', pants: 0x5e3f5e, feet: 'sandal', sole: 0x6b4a33, strap: 0x8a6a4a, hair: 'tudung', hairColour: 0xf4efe6, face: { ...LADY, glasses: '#8a5a3a', lines: true, brow: '#6a5a55' } },
  rozita: { adult: true, plan: woman({ height: 1.6, skin: 0xe2ad86 }), top: { cut: 'blouse', colour: 0x5aa0c8, sleeve: 'long' }, legs: 'kain', pants: 0x2a3a5a, feet: 'sandal', sole: 0x6b4a33, strap: 0x5aa0c8, hair: 'tudung', hairColour: 0xf3c7c3, face: { ...LADY } },
  som: { adult: true, plan: woman({ height: 1.47, skin: 0xb98058 }), stoop: .12, top: { cut: 'kurung', colour: 0x8a7a6a, sleeve: 'long' }, legs: 'kain', pants: 0x6b3a22, print: 'batik', feet: 'sandal', sole: 0x6b4a33, strap: 0x8a7a6a, hair: 'tudung', hairColour: 0xf6f2ea, face: { ...LADY, glasses: '#5a4a3a', lines: true, lips: '#8f4a4f', brow: '#8a7a75' } },
  // The town's extras (crowds.js): holiday kids and orang kampung.
  adam: { plan: { ...PLANS.amir, height: 1.38, skin: 0xb98058 }, pants: 0x6b6f4a, seam: 0x52563a, legs: 'shorts', feet: 'slipper', sole: 0xf0ece2, strap: 0xc23a35, top: 0xd94b3a, trim: 0xa8382c, shirt: 'tee', hem: -.03, hair: 'curtains', hairColour: 0x231d1b, sheen: 0x3a302b, face: {} },
  hakim: { plan: { ...PLANS.amir, height: 1.45, skin: 0xc28a62 }, pants: 0x3b4f72, seam: 0x2c3c58, legs: 'cargo', feet: 'sneaker', top: 0xf3e9c6, trim: 0x2f6e69, shirt: 'ringer', hem: .035, hair: 'spiky', face: {} },
  aisyah: { plan: { ...PLANS.nur, height: 1.42, skin: 0xd6a07a }, girl: true, pants: 0x5e3f5e, seam: 0x4a304a, stripe: 0xf2b8c6, legs: 'slacks', feet: 'sneaker', top: 0x9bc3d9, trim: 0x6f9ab8, shirt: 'tee', sleeve: 'long', hem: -.02, hair: 'tudung', hairColour: 0xf6f2ea, face: { lashes: true } },
  keong: { plan: { ...PLANS.amir, height: 1.36, skin: 0xf0c9a5 }, pants: 0x2f3d68, seam: 0x222d50, legs: 'shorts', feet: 'slipper', sole: 0xf0ece2, strap: 0x2f6fb0, top: 0xf2c84b, trim: 0xd9a92c, shirt: 'tee', hem: -.03, motif: 'car', hair: 'soft', hairColour: 0x1d1a1f, face: {} },
  siti: { plan: { ...PLANS.nur, height: 1.34, skin: 0xc68d65 }, girl: true, pants: 0x8a5a8a, seam: 0x6e466e, stripe: 0xf3c7c3, legs: 'cargo', feet: 'sneaker', top: 0xf3a6b8, trim: 0xd98a9d, shirt: 'tee', sleeve: 'long', hem: -.02, hair: 'tudung', hairColour: 0xf3c7c3, face: { lashes: true } },
  ravi: { plan: { ...PLANS.amir, height: 1.44, skin: 0x7b4a2e }, pants: 0xa48d62, seam: 0x857048, legs: 'shorts', feet: 'slipper', sole: 0xf0ece2, strap: 0x2f6e44, top: 0x4f9a5a, trim: 0x3a7a46, shirt: 'tee', hem: -.03, hair: 'soft', hairColour: 0x151214, face: {} },
  seman: { adult: true, plan: man({ height: 1.65, skin: 0xa87250 }), stoop: .05, top: { cut: 'baju', colour: 0x7fa6c4, trim: 0x5f86a4, sleeve: 'long', long: .2 }, legs: 'sarong', pants: 0x2f5a4f, print: 'pelikat', feet: 'sandal', sole: 0x3d2f26, strap: 0x6b4a33, hair: 'short', hairColour: 0xbab4ac, hat: 'songkok', face: { ...MAN, moustache: '#bab4ac', lines: true } },
  daud: { adult: true, plan: man({ height: 1.7, skin: 0xb27650 }), belly: 1.06, top: { cut: 'shirt', colour: 0xc9b27a, sleeve: 'short', pocket: true }, legs: 'trousers', pants: 0x4a4740, feet: 'sandal', sole: 0x2c2a2a, strap: 0x2c2a2a, hair: 'short', hairColour: 0x2a2523, hat: 'cap', hatColour: 0x3f7f78, face: { ...MAN, moustache: '#2a2220' } },
  rashid: { adult: true, plan: man({ height: 1.68, skin: 0x9a6440 }), top: { cut: 'tee', colour: 0xe9e3d6, sleeve: 'short' }, legs: 'sarong', pants: 0x3a3f6a, print: 'pelikat', feet: 'sandal', sole: 0x3d2f26, strap: 0x3d2f26, hair: 'short', hairColour: 0x1f1b1c, hat: 'songkok', props: ['towel'], face: { ...MAN, beard: '#2a2220', moustache: '#2a2220' } },
  gayah: { adult: true, plan: woman({ height: 1.55, skin: 0xbf8660 }), top: { cut: 'kurung', colour: 0xd9a24a, sleeve: 'long' }, legs: 'kain', pants: 0x6b3a22, print: 'batik', feet: 'sandal', sole: 0x6b4a33, strap: 0xd9a24a, hair: 'tudung', hairColour: 0x8a3b4a, props: ['basket'], face: { ...LADY } }
};
export const CHARACTER_KINDS = Object.keys(LOOKS);

// Anime faces drawn to the reference: tall dark-brown irises with two
// highlights, heavy upper lids, bold brows, a small nose tick and a smile.
// Grown-ups get smaller eyes plus moustaches, beards, glasses or age lines.
function face(kind, f, size) {
  return drawing('face-' + (kind === 'amir' || kind === 'nur' ? kind : JSON.stringify(f)) + '-' + size, c => {
    const girl = !!f.lashes, adult = !!f.adult;
    const eyeY = f.eyeY ?? (adult ? 262 : 278), gap = f.gap ?? (adult ? 84 : 95), w = f.eyeW ?? (adult ? 34 : 45), h = f.eyeH ?? (adult ? 30 : 58);
    for (const outer of [-1, 1]) {
      const x = 256 + outer * gap;
      c.save(); c.translate(x, eyeY); c.scale(outer, 1);
      const shape = () => { c.beginPath(); c.moveTo(-w * .95, -h * .2); c.bezierCurveTo(-w * .7, -h * 1.05, w * .75, -h * 1.05, w, -h * .3); c.bezierCurveTo(w * 1.02, h * .7, -w * .95, h * .95, -w * .95, -h * .2); c.closePath(); };
      shape(); c.fillStyle = '#fffaf2'; c.fill();
      c.save(); shape(); c.clip();
      const iris = c.createLinearGradient(0, -h, 0, h);
      iris.addColorStop(0, '#24140f'); iris.addColorStop(.5, '#4f2c1c'); iris.addColorStop(1, f.iris ?? (adult ? '#6b4430' : '#a5683c'));
      c.fillStyle = iris; c.beginPath(); c.ellipse(-3, h * .08, w * .74, h * .95, 0, 0, TAU); c.fill();
      c.fillStyle = '#150c0b'; c.beginPath(); c.ellipse(-3, -h * .05, w * .36, h * .5, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(25,12,12,.38)'; c.fillRect(-w * 1.1, -h * 1.1, w * 2.2, h * .42);
      c.restore();
      c.strokeStyle = '#1b1315'; c.lineWidth = adult ? 9 : 12;
      c.beginPath(); c.moveTo(-w * 1.02, -h * .12); c.bezierCurveTo(-w * .72, -h * 1.12, w * .78, -h * 1.12, w * 1.12, -h * .32); c.stroke();
      if (girl) { c.lineWidth = 7; c.beginPath(); c.moveTo(w * .9, -h * .55); c.lineTo(w * 1.32, -h * .86); c.moveTo(w * 1.08, -h * .3); c.lineTo(w * 1.42, -h * .45); c.stroke(); }
      else { c.lineWidth = 8; c.beginPath(); c.moveTo(w * 1.0, -h * .35); c.lineTo(w * 1.24, -h * .52); c.stroke(); }
      c.strokeStyle = 'rgba(70,40,40,.75)'; c.lineWidth = 4; c.beginPath(); c.moveTo(-w * .45, h * .93); c.quadraticCurveTo(w * .1, h * 1.08, w * .62, h * .82); c.stroke();
      // Brows: bold for boys, soft for girls and women, heavier and lower for men.
      c.strokeStyle = f.brow ?? (adult ? '#2c2522' : '#1d1719'); c.lineWidth = girl ? 8 : adult ? 13 : 14;
      const by = adult ? -h - 20 : -h - 24;
      c.beginPath(); c.moveTo(-w * 1.05, by + 8); c.quadraticCurveTo(w * .1, by - (girl ? 12 : 8), w * 1.15, by + (girl ? 4 : 2)); c.stroke();
      if (f.lines) { c.strokeStyle = 'rgba(110,62,46,.6)'; c.lineWidth = 4; for (const t of [-.1, .25]) { c.beginPath(); c.moveTo(w * 1.3, t * h); c.lineTo(w * 1.62, t * h * 1.8 + h * .05); c.stroke(); } c.beginPath(); c.moveTo(-w * .6, h * 1.25); c.quadraticCurveTo(0, h * 1.45, w * .7, h * 1.2); c.stroke(); }
      c.restore();
      c.save(); c.translate(x - 3, eyeY); c.fillStyle = '#fffdf8';
      c.beginPath(); c.ellipse(-outer * 2 - 11, -h * .32, w * .24, h * .26, -.4, 0, TAU); c.fill();
      c.beginPath(); c.arc(11, h * .42, w * .12, 0, TAU); c.fill(); c.restore();
      if (f.glasses) {
        c.strokeStyle = f.glasses; c.lineWidth = 7; c.beginPath(); c.roundRect(x - w * 1.45, eyeY - h * 1.2, w * 2.9, h * 2.45, 20); c.stroke();
        c.beginPath(); c.moveTo(x + outer * w * 1.45, eyeY - h * .6); c.lineTo(256 + outer * 236, eyeY - h * .9); c.stroke();
      }
    }
    if (f.glasses) { c.beginPath(); c.moveTo(256 - gap + w * 1.45, eyeY - h * .55); c.quadraticCurveTo(256, eyeY - h * 1.1, 256 + gap - w * 1.45, eyeY - h * .55); c.stroke(); }
    c.fillStyle = 'rgba(233,128,112,.26)';
    for (const x of [256 - 122, 256 + 122]) { c.beginPath(); c.ellipse(x, adult ? 318 : 338, 30, 15, 0, 0, TAU); c.fill(); }
    c.strokeStyle = '#a96648'; c.lineWidth = 6; c.beginPath(); c.moveTo(254, 318); c.quadraticCurveTo(268, 334, 250, 338); c.stroke();
    if (adult) {
      if (f.beard) { c.fillStyle = f.beard; c.beginPath(); c.moveTo(168, 392); c.quadraticCurveTo(176, 476, 256, 494); c.quadraticCurveTo(336, 476, 344, 392); c.quadraticCurveTo(318, 446, 256, 450); c.quadraticCurveTo(194, 446, 168, 392); c.fill(); }
      if (f.moustache) { c.fillStyle = f.moustache; c.beginPath(); c.moveTo(200, 368); c.quadraticCurveTo(256, 336, 312, 368); c.quadraticCurveTo(286, 362, 256, 366); c.quadraticCurveTo(226, 362, 200, 368); c.fill(); }
      if (f.lines) { c.strokeStyle = 'rgba(110,62,46,.55)'; c.lineWidth = 4; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(256 + s * 46, 330); c.quadraticCurveTo(256 + s * 62, 362, 256 + s * 50, 392); c.stroke(); } }
      c.strokeStyle = f.lips ?? '#5b2a2c'; c.lineWidth = f.lips ? 8 : 6; c.beginPath(); c.moveTo(232, 388); c.quadraticCurveTo(256, f.lips ? 404 : 400, 280, 388); c.stroke();
    } else {
      c.strokeStyle = '#5b2629'; c.lineWidth = 7;
      c.beginPath(); c.moveTo(girl ? 234 : 226, 370); c.quadraticCurveTo(256, girl ? 388 : 394, girl ? 280 : 290, 368); c.stroke();
      c.lineWidth = 5; c.beginPath(); c.moveTo(girl ? 228 : 219, 365); c.lineTo(girl ? 236 : 228, 372); c.stroke();
    }
  }, size);
}
export function motif(kind) {
  return drawing('motif-' + kind, c => {
    if (kind === 'alien') {
      c.fillStyle = '#26365a'; const rows = ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'];
      rows.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') c.fillRect(14 + x * 44, 80 + y * 44, 44, 44); }));
    } else if (kind === 'car') {
      // A mini 4WD racer over a lightning flash, the craze of the time.
      c.fillStyle = '#f2c84b'; c.beginPath(); c.moveTo(300, 20); c.lineTo(150, 250); c.lineTo(250, 250); c.lineTo(190, 470); c.lineTo(380, 200); c.lineTo(275, 200); c.closePath(); c.fill();
      c.fillStyle = '#d8423a'; c.beginPath(); c.moveTo(40, 330); c.lineTo(70, 260); c.lineTo(200, 240); c.lineTo(260, 180); c.lineTo(360, 180); c.lineTo(420, 250); c.lineTo(480, 270); c.lineTo(472, 330); c.closePath(); c.fill();
      c.fillStyle = '#2b5fa8'; c.beginPath(); c.moveTo(250, 240); c.lineTo(285, 200); c.lineTo(345, 200); c.lineTo(380, 240); c.closePath(); c.fill();
      c.fillStyle = '#f6f2ea'; c.fillRect(90, 280, 330, 16);
      for (const x of [130, 390]) { c.fillStyle = '#1d1c22'; c.beginPath(); c.arc(x, 340, 54, 0, TAU); c.fill(); c.fillStyle = '#f6f2ea'; c.beginPath(); c.arc(x, 340, 20, 0, TAU); c.fill(); }
    } else {
      // Bunga raya (hibiscus): five petals, a long stamen and a warm centre.
      const petal = kind === 'flower' ? '#f08fa6' : '#fff4ec', vein = kind === 'flower' ? '#d4637f' : '#f2c9cf';
      for (let i = 0; i < 5; i++) {
        c.save(); c.translate(256, 256); c.rotate(i * TAU / 5);
        c.fillStyle = petal; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-120, -60, -95, -225, 0, -205); c.bezierCurveTo(95, -225, 120, -60, 0, 0); c.fill();
        c.strokeStyle = vein; c.lineWidth = 8; c.beginPath(); c.moveTo(0, -20); c.lineTo(0, -150); c.stroke(); c.restore();
      }
      c.fillStyle = kind === 'flower' ? '#c24467' : '#eeb2bd'; c.beginPath(); c.arc(256, 256, 34, 0, TAU); c.fill();
      c.strokeStyle = '#f4d27c'; c.lineWidth = 10; c.beginPath(); c.moveTo(256, 256); c.quadraticCurveTo(330, 210, 360, 140); c.stroke();
      c.fillStyle = '#f4d27c'; c.beginPath(); c.arc(360, 140, 16, 0, TAU); c.fill();
    }
  });
}

// `options.parts` stops before the body is merged and returns the authored
// head (face, hair, scarf, hood) for the motion-captured kids in actor.js.
export function createCharacter(scene, x, z, kind = 'amir', options = {}) {
  if (!LOOKS[kind]) kind = 'amir';
  const look = LOOKS[kind], plan = look.plan, adult = !!look.adult, girl = !!look.girl;
  const leg = plan.upper + plan.lower, hipY = plan.ankle + leg, waistY = hipY + .06;
  const root = new T.Group(); root.position.set(x, 0, z); scene.add(root);
  const body = new T.Bone(); body.userData.origin = new T.Vector3(); root.add(body);
  const skin = material(plan.skin), ink = material(0x24222b), cream = material(0xf6eee2), white = material(0xfbf7ef);

  // Parts are authored at their standing positions in metres; each group
  // records its own origin so joints can rotate about real pivots.
  function group(parent, px, py, pz) {
    const g = new T.Bone(), o = parent.userData.origin;
    g.position.set(px - o.x, py - o.y, pz - o.z); g.userData.origin = new T.Vector3(px, py, pz); parent.add(g); return g;
  }
  function part(geometry, mat, px, py, pz, parent) {
    const m = new T.Mesh(geometry, mat), o = parent.userData.origin;
    m.position.set(px - o.x, py - o.y, pz - o.z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function ball(rx, ry, rz, mat, px, py, pz, parent, w = 12, h = 8) { const m = part(new T.SphereGeometry(1, w, h), mat, px, py, pz, parent); m.scale.set(rx, ry, rz); return m; }
  function block(w, h, d, mat, px, py, pz, parent) {
    // Bevel a small 2-segment box, retaining a low-poly silhouette.
    const g = new T.BoxGeometry(w, h, d, 2, 2, 2), p = g.attributes.position, r = Math.min(w, h, d) * .22, v = new T.Vector3(), core = new T.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); core.set(T.MathUtils.clamp(v.x, -w / 2 + r, w / 2 - r), T.MathUtils.clamp(v.y, -h / 2 + r, h / 2 - r), T.MathUtils.clamp(v.z, -d / 2 + r, d / 2 - r)); v.sub(core).normalize().multiplyScalar(r).add(core); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return part(g, mat, px, py, pz, parent);
  }
  function lathe(points, depth, mat, px, py, pz, parent, segments = 16) {
    const g = new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
    if (mat.map) {
      // Printed cloth runs by arc length down the profile, so prints don't stretch.
      const run = [0]; for (let j = 1; j < points.length; j++) run.push(run[j - 1] + Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]));
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, run[i % points.length] / Math.max(run.at(-1), 1e-6));
    }
    const m = part(g, mat, px, py, pz, parent); m.scale.z = depth; return m;
  }
  // Tubes take standing-pose points; the mesh offset cancels the joint origin.
  function line(points, mat, r, parent) {
    return part(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(([a, b, c]) => new T.Vector3(a, b, c))), Math.max(3, points.length * 2), r, r < .006 ? 3 : 5, false), mat, 0, 0, 0, parent);
  }
  function decal(w, h, mat, px, py, pz, parent) { return part(new T.PlaneGeometry(w, h), mat, px, py, pz, parent); }
  // A sphere with triangles removed (face openings, ear gaps, hood mouth).
  function shell(rx, ry, rz, keep, mat, px, py, pz, parent, warp = null, w = 36, h = 26) {
    const g = new T.SphereGeometry(1, w, h).toNonIndexed(), pos = g.attributes.position, kept = [], normals = [], n = new T.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      if (keep(cx, cy, cz)) for (let j = 0; j < 3; j++) {
        const v = [pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)], [ux, uy, uz] = warp ? warp(...v) : v;
        kept.push(ux * rx, uy * ry, uz * rz);
        n.set(v[0] / rx, v[1] / ry, v[2] / rz).normalize(); normals.push(n.x, n.y, n.z);
      }
    }
    // Analytic ellipsoid normals keep cut shells smoothly shaded.
    g.dispose(); const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(kept, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    return part(out, mat, px, py, pz, parent);
  }
  // Blade-like locks: a flattened cone rooted on an ellipsoid surface.
  function lock(parent, center, radii, theta, phi, length, width, up, back, mat, flat = .5, twist = 0) {
    const d = new T.Vector3(Math.sin(theta) * Math.cos(phi), Math.sin(phi), Math.cos(theta) * Math.cos(phi));
    const base = new T.Vector3(d.x * radii[0], d.y * radii[1], d.z * radii[2]).multiplyScalar(.9).add(center);
    const normal = new T.Vector3(d.x / radii[0], d.y / radii[1], d.z / radii[2]).normalize();
    const axis = normal.add(new T.Vector3(0, up, -back)).normalize();
    const g = new T.ConeGeometry(width, length, 5, 1); g.translate(0, length / 2, 0); g.scale(1, 1, flat);
    const m = part(g, mat, base.x, base.y, base.z, parent);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), theta + twist));
    return m;
  }

  // Legs. Kids: baggy cargo trousers with side pockets and a flared hem, or
  // shorts, or slim slacks. Grown-ups: trousers, or bare ankles under a kain.
  const pants = material(look.pants), seam = material(look.seam ?? shade(look.pants, .78));
  const legs = [], knees = [], feet = [], arms = [], elbows = [];
  for (const side of [-1, 1]) {
    const lx = side * plan.hipX;
    const hip = group(body, lx, hipY, 0); legs.push(hip);
    const knee = group(hip, lx, hipY - plan.upper, 0); knees.push(knee);
    const ankle = group(knee, lx, plan.ankle, 0); feet.push(ankle);
    const ky = hipY - plan.upper;
    if (adult) {
      if (look.legs === 'trousers' || look.legs === 'overalls') {
        lathe([[.066, -plan.upper], [.073, -plan.upper * .5], [.08, -.05], [.075, .01], [0, .02]], .96, pants, lx, hipY, 0, hip);
        ball(.066, .058, .068, pants, lx, ky, 0, knee);
        lathe([[.062, -plan.lower + .03], [.062, -plan.lower * .5], [.066, -.02], [.067, .03]], .96, pants, lx, ky, 0, knee);
        line([[lx + side * .066, hipY, 0], [lx + side * .06, ky - plan.lower + .04, 0]], seam, .0035, hip);
      } else lathe([[.034, -plan.lower + .02], [.04, -plan.lower + .22]], 1, skin, lx, ky, 0, knee, 8);
      if (look.feet === 'sandal') {
        // Selipar: flat rubber sandal with a cross strap over the bare foot.
        block(.1, .022, .26, material(look.sole), lx, .011, .05, ankle);
        ball(.042, .035, .1, skin, lx, .045, .06, ankle);
        block(.092, .02, .05, material(look.strap), lx, .07, .1, ankle);
      } else if (look.feet === 'shoes') {
        block(.108, .026, .27, material(look.sole), lx, .013, .05, ankle);
        ball(.052, .05, .125, material(look.shoe), lx, .05, .055, ankle);
        ball(.048, .03, .04, material(look.shoe), lx, .085, -.02, ankle);
      } else {
        // Rubber boots up the calf, the kebun's standard issue.
        const boot = material(look.shoe);
        block(.112, .026, .28, material(look.sole), lx, .013, .05, ankle);
        ball(.055, .05, .125, boot, lx, .05, .06, ankle);
        lathe([[.052, .03], [.056, .12], [.061, .26], [.064, .31]], 1, boot, lx, 0, 0, ankle, 12);
        const rim = part(new T.TorusGeometry(.063, .008, 4, 14), boot, lx, .31, 0, ankle); rim.rotation.x = Math.PI / 2;
      }
    } else {
      if (look.legs === 'cargo') {
        lathe([[.073, -plan.upper], [.075, -plan.upper * .55], [.078, -.05], [.07, .01], [0, .02]], .96, pants, lx, hipY, 0, hip);
        // Side cargo pocket with a buttoned flap, as on the sheet's detail view.
        block(.032, .13, .1, pants, lx + side * .072, hipY - .2, .005, hip);
        block(.038, .035, .106, seam, lx + side * .075, hipY - .135, .005, hip);
        ball(.008, .008, .006, cream, lx + side * .095, hipY - .14, .04, hip);
        line([[lx + side * .076, hipY + .02, 0], [lx + side * .077, hipY - plan.upper, 0]], seam, .004, hip);
        ball(.074, .062, .076, pants, lx, ky, 0, knee);
        lathe([[.084, -plan.lower + .03], [.08, -plan.lower + .06], [.076, -plan.lower * .45], [.074, -.02], [.074, .04]], .96, pants, lx, ky, 0, knee);
        // Bunched hem: two soft folds where the denim stacks on the shoe.
        for (const [y, r] of [[.122, .082], [.158, .078]]) { const fold = part(new T.TorusGeometry(r, .011, 5, 16), pants, lx, y, 0, knee); fold.rotation.x = Math.PI / 2; fold.scale.y = .96; }
        line([[lx - side * .02, ky - .04, .073], [lx - side * .025, ky - .18, .074]], seam, .004, knee);
      } else if (look.legs === 'shorts') {
        // Knee-length shorts over bare legs.
        lathe([[.083, -plan.upper * .82], [.08, -plan.upper * .5], [.079, -.05], [.07, .01], [0, .02]], .96, pants, lx, hipY, 0, hip);
        const fold = part(new T.TorusGeometry(.082, .009, 5, 16), seam, lx, hipY - plan.upper * .82 + .008, 0, hip); fold.rotation.x = Math.PI / 2; fold.scale.y = .96;
        line([[lx + side * .08, hipY + .02, 0], [lx + side * .081, hipY - plan.upper * .8, 0]], seam, .004, hip);
        lathe([[.05, -plan.upper - .01], [.056, -plan.upper * .6]], 1, skin, lx, hipY, 0, hip, 10);
        ball(.05, .052, .052, skin, lx, ky, 0, knee, 10, 8);
        lathe([[.034, -plan.lower + .02], [.042, -plan.lower + .08], [.05, -plan.lower * .5], [.05, -.02], [.048, .02]], 1, skin, lx, ky, 0, knee, 10);
      } else {
        // Slim slacks with a turned-up cuff.
        lathe([[.068, -plan.upper], [.07, -plan.upper * .55], [.075, -.05], [.068, .01], [0, .02]], .96, pants, lx, hipY, 0, hip);
        ball(.068, .058, .07, pants, lx, ky, 0, knee);
        lathe([[.063, -plan.lower + .04], [.063, -plan.lower * .45], [.066, -.02], [.068, .04]], .96, pants, lx, ky, 0, knee);
        const cuff = part(new T.TorusGeometry(.064, .01, 5, 16), seam, lx, ky - plan.lower + .045, 0, knee); cuff.rotation.x = Math.PI / 2; cuff.scale.y = .96;
        line([[lx + side * .07, hipY + .02, 0], [lx + side * .066, ky - plan.lower + .06, 0]], seam, .0035, hip);
      }
      if (look.feet === 'sneaker') {
        // Shell-toe sneaker: thick sole, ribbed toe cap, three stripes, heel tab.
        const stripe = material(look.stripe ?? 0x24222b);
        block(.13, .04, .29, material(0xf2e9da), lx, .02, .05, ankle);
        line([[lx - .065, .022, -.088], [lx - .065, .022, .19]], material(0xc9bba6), .0035, ankle);
        line([[lx + .065, .022, -.088], [lx + .065, .022, .19]], material(0xc9bba6), .0035, ankle);
        block(.12, .068, .2, white, lx, .07, .012, ankle);
        ball(.06, .042, .08, white, lx, .058, .118, ankle);
        ball(.062, .038, .058, cream, lx, .055, .155, ankle);
        for (let i = 0; i < 4; i++) line([[lx - .054, .05 + i * .007, .136 + i * .013], [lx, .07 + i * .007, .145 + i * .013], [lx + .054, .05 + i * .007, .136 + i * .013]], material(0xd9cdb9), .003, ankle);
        ball(.056, .036, .068, white, lx, .104, -.022, ankle);
        block(.048, .056, .018, stripe, lx, .09, -.09, ankle);
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const bar = block(.009, .068, .016, stripe, lx + s * .061, .068, -.018 + i * .03, ankle); bar.rotation.x = .62; }
        for (let i = 0; i < 3; i++) block(.066, .008, .013, white, lx, .106 - i * .005, .044 + i * .026, ankle);
        block(.056, .024, .075, white, lx, .1, .038, ankle);
      } else {
        // Selipar Jepun: white rubber sole and a coloured V strap.
        block(.11, .024, .27, material(look.sole), lx, .012, .05, ankle);
        ball(.046, .038, .11, skin, lx, .05, .06, ankle);
        ball(.04, .04, .045, skin, lx, .085, -.01, ankle, 10, 6);
        line([[lx - .046, .04, .02], [lx, .066, .125], [lx + .046, .04, .02]], material(look.strap), .009, ankle);
      }
    }
  }
  // Pelvis bridges the hip joints so no gap opens when the legs swing.
  const tuck = adult && look.top.tuck;
  lathe(adult ? (tuck ? [[0, -.05], [.11, -.03], [.15, .05], [.156, .12], [.152, .15]] : [[0, -.05], [.11, -.03], [.15, .05], [.15, .12]]) : [[0, -.075], [.1, -.06], [.142, -.01], [.14, .04], [.125, .1]], .64, pants, 0, hipY, 0, body);
  if (tuck && look.legs === 'trousers') { const belt = part(new T.TorusGeometry(.155, .012, 4, 22), material(0x2a2224), 0, hipY + .125, 0, body); belt.rotation.x = Math.PI / 2; belt.scale.y = .64; block(.04, .03, .012, material(0xc9b27a), 0, hipY + .125, .155 * .64 + .006, body); }
  if (adult && (look.legs === 'sarong' || look.legs === 'kain')) {
    // Kain pelikat for Atuk; a long A-line kain under the baju kurung.
    const cloth = look.print ? fabric(look.print) : pants;
    lathe(look.legs === 'sarong'
      ? [[.178, .09 - hipY], [.17, .3 - hipY], [.168, .7 - hipY], [.17, .02], [.16, .1], [0, .11]]
      : [[.19, .08 - hipY], [.18, .35 - hipY], [.16, -.1], [.14, .05], [.12, .1], [0, .11]], look.legs === 'sarong' ? .72 : .72, cloth, 0, hipY, 0, body, 18);
  }

  // Torso pivot: the chest counter-rotates against the pelvis.
  const torso = group(body, 0, waistY, 0);
  const shoulder = plan.shoulderY, chestZ = .66, frontZ = (r) => r * chestZ + .003;
  const plain = material(adult ? look.top.colour : look.top), trim = material(adult ? (look.top.trim ?? look.top.colour) : look.trim);
  const top = (adult ? look.top.print : look.print) ? fabric(adult ? look.top.print : look.print) : plain;
  let hem, frontAt = frontZ;
  if (adult) {
    const cut = look.top.cut, woman = cut === 'kurung' || cut === 'blouse', k = plan.chest / (woman ? .168 : .19) * (look.top.loose ?? 1), b = look.belly ?? 1;
    hem = cut === 'kurung' ? hipY - .34 : tuck ? hipY + .1 : hipY - (look.top.long ?? .1);
    const shape = woman
      ? [...(cut === 'kurung' ? [[.225 * k, hem], [.21 * k, hem + .12], [.19 * k, hipY - .05]] : [[.176 * k, hem], [.174 * k, hem + .08]]), [.17 * k, hipY + .1], [.165 * k, shoulder - .26], [.178 * k, shoulder - .15], [.175 * k, shoulder - .06], [.145 * k, shoulder - .015], [.09, shoulder + .012], [0, shoulder + .025]]
      : [...(tuck ? [[.13, hem], [.168 * k * b, hem + .05]] : [[.19 * k * b, hem], [.192 * k * b, hem + .08]]), [.198 * k * b, hipY + .16], [.185 * k, shoulder - .2], [.19 * k, shoulder - .06], [.16 * k, shoulder - .015], [.1, shoulder + .015], [0, shoulder + .03]];
    lathe(shape.map(([r, y]) => [r, y - waistY]), chestZ, top, 0, waistY, 0, torso, 18);
    // The front of the chest at a height, so plackets and ties lie on the cloth.
    frontAt = y => { const j = Math.max(1, shape.findIndex(([, py]) => py >= y)), [r0, y0] = shape[j - 1], [r1, y1] = shape[j]; return frontZ(r0 + (r1 - r0) * T.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1)); };
    if (!tuck) lathe([[0, hem - .012], [shape[0][0] - .004, hem - .006], [shape[0][0], hem]].map(([r, y]) => [r, y - waistY]), chestZ, plain, 0, waistY, 0, torso);
    const chest = shape.find(([, y]) => y >= shoulder - .2)[0];
    // Neck and collar.
    lathe([[.038, -.05], [.04, .06], [.037, .1]], 1, skin, 0, shoulder, 0, torso, 10);
    if (cut === 'baju') {
      // Baju Melayu: standing collar and a placket with gold studs.
      const collar = part(new T.TorusGeometry(.058, .012, 6, 18), trim, 0, shoulder + .02, .006, torso); collar.rotation.x = Math.PI / 2 - .25;
      block(.03, .16, .012, plain, 0, shoulder - .1, frontZ(chest), torso);
      for (let i = 0; i < 3; i++) ball(.008, .008, .005, material(0xc9a24b), 0, shoulder - .05 - i * .05, frontZ(chest) + .007, torso);
    } else if (woman) {
      const neck = part(new T.TorusGeometry(.06, .009, 5, 18), trim, 0, shoulder + .012, .008, torso); neck.rotation.x = Math.PI / 2 - .3;
    } else if (cut === 'tee') {
      const neck = part(new T.TorusGeometry(.058, .01, 5, 18), trim, 0, shoulder + .015, .008, torso); neck.rotation.x = Math.PI / 2 - .25;
    } else {
      // Shirt and polo collars, a button placket and a breast pocket.
      const collar = part(new T.TorusGeometry(.064, .014, 5, 18), trim, 0, shoulder + .018, .004, torso); collar.rotation.x = Math.PI / 2 - .3;
      for (const s of [-1, 1]) { const point = block(.05, .01, .055, trim, s * .032, shoulder - .005, frontZ(.12), torso); point.rotation.set(-.9, s * .5, s * .35); }
      const studs = cut === 'polo' ? 2 : 4, button = material(cut === 'polo' ? 0xe9e3d6 : 0xf3efe6), low = cut === 'polo' ? shoulder - .15 : Math.max(hem + .02, hipY + .1);
      const placket = []; for (let y = shoulder - .02; y >= low - .001; y -= (shoulder - .02 - low) / 5) placket.push([0, y, frontAt(y) + .002]);
      line(placket, plain, .009, torso);
      for (let i = 0; i < studs; i++) { const y = shoulder - .04 - i * .085; ball(.007, .007, .004, button, 0, y, frontAt(y) + .01, torso); }
      if (look.top.pocket) { block(.065, .075, .01, plain, -.075, shoulder - .13, frontZ(chest) - .006, torso); block(.067, .012, .012, trim, -.075, shoulder - .09, frontZ(chest) - .004, torso); }
    }
    if (look.legs === 'overalls') {
      // Denim bib, braces and brass buttons over the tee.
      block(.2, .22, .02, pants, 0, hipY + .2, frontZ(.19 * k) + .004, torso);
      block(.09, .06, .008, material(0x35537c), 0, hipY + .24, frontZ(.19 * k) + .016, torso);
      for (const s of [-1, 1]) {
        line([[s * .085, hipY + .3, frontZ(.18) + .01], [s * .1, shoulder - .04, frontZ(.15) + .01], [s * .105, shoulder + .02, 0], [s * .09, shoulder - .1, -frontZ(.17) - .01], [s * .05, hipY + .14, -frontZ(.19) - .01]], pants, .014, torso);
        ball(.012, .012, .006, material(0xd2a64a), s * .085, hipY + .3, frontZ(.19 * k) + .016, torso);
      }
    }
    if (look.apron) {
      // Apron bib on the chest, its skirt on the pelvis, ties at the waist.
      const a = look.apron, cloth = material(a.colour), ar = cut === 'kurung' ? .225 * k : .185 * k;
      block(.2, .2, .012, cloth, 0, shoulder - .2, frontZ(.178 * k) + .012, torso);
      line([[-.09, shoulder - .1, frontZ(.17 * k)], [-.06, shoulder + .03, .04], [0, shoulder + .06, -.04], [.06, shoulder + .03, .04], [.09, shoulder - .1, frontZ(.17 * k)]], material(a.trim), .006, torso);
      const tie = part(new T.TorusGeometry(.172 * k, .008, 4, 22), material(a.trim), 0, hipY + .12, 0, torso); tie.rotation.x = Math.PI / 2; tie.scale.y = chestZ;
      const zt = .17 * k * chestZ + .014, zb = Math.max(ar * chestZ, .15) + .016, lean = -Math.atan2(zb - zt, .44), along = y => zt + (zb - zt) * (hipY + .12 - y) / .44;
      block(.3, .44, .014, cloth, 0, hipY - .1, along(hipY - .1), body).rotation.x = lean;
      block(.3, .016, .016, material(a.trim), 0, hipY - .31, along(hipY - .31) + .002, body).rotation.x = lean;
      block(.13, .1, .01, material(a.pocket), .05, hipY - .1, along(hipY - .1) + .01, body).rotation.x = lean;
    }
  } else {
    hem = hipY + look.hem;
    const torsoShape = look.shirt === 'hoodie'
      ? [[.163, hem], [.166, hem + .04], [.152, hipY + .12], [.15, shoulder - .12], [.146, shoulder - .05], [.12, shoulder - .005], [.075, shoulder + .02], [0, shoulder + .025]]
      : girl
        ? [[.15, hem], [.151, hem + .03], [.14, hipY + .12], [.146, shoulder - .12], [.143, shoulder - .05], [.118, shoulder - .005], [.07, shoulder + .02], [0, shoulder + .025]]
        : [[.156, hem], [.157, hem + .03], [.148, hipY + .13], [.149, shoulder - .1], [.15, shoulder - .05], [.122, shoulder - .005], [.07, shoulder + .025], [0, shoulder + .03]].map(([r, y]) => [r === 0 || look.shirt === 'ringer' ? r : r * plan.chest / .15, y]);
    lathe(torsoShape.map(([r, y]) => [r, y - waistY]), chestZ, top, 0, waistY, 0, torso, 18);
    // Neck and collar.
    lathe([[.038, -.05], [.04, .06], [.037, .1]], 1, skin, 0, shoulder, 0, torso, 10);
    const hoodie = look.shirt === 'hoodie';
    const collar = part(new T.TorusGeometry(hoodie ? .07 : girl ? .056 : .058, hoodie ? .022 : look.shirt === 'tee' ? .01 : .012, 6, 18), hoodie ? material(0xf2c4c4) : trim, 0, shoulder + .02, .006, torso);
    collar.rotation.x = Math.PI / 2 - .25;
    if (hoodie) {
      // Hoodie: ribbed hem, kangaroo pocket, drawstrings and the bunga raya.
      const hemBand = part(new T.TorusGeometry(.162, .013, 5, 20), trim, 0, hem + .008, 0, torso); hemBand.rotation.x = Math.PI / 2; hemBand.scale.y = chestZ;
      block(.2, .095, .026, material(0xe7a7b4), 0, hipY + .035, frontZ(.157), torso);
      for (const s of [-1, 1]) line([[s * .1, hipY + .08, frontZ(.157) + .01], [s * .09, hipY - .005, frontZ(.157) + .01]], trim, .004, torso);
      for (const s of [-1, 1]) { line([[s * .035, shoulder, .1], [s * .038, shoulder - .07, .105], [s * .042, shoulder - .13, frontZ(.15)]], cream, .004, torso); block(.009, .022, .009, material(0xa9a6a3), s * .042, shoulder - .14, frontZ(.15), torso); }
      decal(.075, .075, motif('hibiscus'), .058, shoulder - .1, frontZ(.15) + .002, torso);
    } else if (look.shirt === 'ringer') {
      // Ringer T-shirt with navy trim and the pixel alien from the sheet.
      const hemBand = part(new T.TorusGeometry(.156, .006, 4, 20), material(0xe9e3d8), 0, hem + .004, 0, torso); hemBand.rotation.x = Math.PI / 2; hemBand.scale.y = chestZ;
      decal(.105, .085, motif('alien'), 0, shoulder - .12, frontZ(.149) + .002, torso);
    } else {
      const hemBand = part(new T.TorusGeometry(torsoShape[0][0], .006, 4, 20), trim, 0, hem + .004, 0, torso); hemBand.rotation.x = Math.PI / 2; hemBand.scale.y = chestZ;
      if (look.motif) decal(.17, .17, motif(look.motif), 0, shoulder - .14, frontZ(torsoShape[3][0]) + .002, torso);
    }
  }

  // Head: shaped jaw, ears, a face drawing that follows the curved surface.
  const neckTop = shoulder + .08, [rx, ry, rz] = plan.head, headY = plan.headY;
  const head = group(torso, 0, neckTop, 0);
  const headGeometry = new T.SphereGeometry(1, 28, 20), hp = headGeometry.attributes.position;
  const jaw = y => y < 0 ? 1 - .30 * Math.pow(-y, 1.6) : 1, chin = y => y < 0 ? 1 - .08 * Math.pow(-y, 2) : 1;
  for (let i = 0; i < hp.count; i++) { const y = hp.getY(i); hp.setX(i, hp.getX(i) * jaw(y)); hp.setZ(i, hp.getZ(i) * chin(y)); }
  headGeometry.computeVertexNormals();
  const headMesh = part(headGeometry, skin, 0, headY, .005, head); headMesh.scale.set(rx, ry, rz);
  for (const s of [-1, 1]) { ball(.022, .036, .024, skin, s * rx * .97, headY - .012, -.004, head, 8, 6); ball(.011, .02, .006, material(0xc98463), s * rx * 1.01, headY - .012, .008, head, 8, 6); }
  {
    const verts = [], uv = [], idx = [], nx = 24, ny = 24, fw = rx * 1.08, fh = ry;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny, px = (u * 2 - 1) * fw, py = (v * 2 - 1) * fh, yy = py / ry, xx = px / (rx * jaw(yy));
      const pz = rz * chin(yy) * Math.sqrt(Math.max(.02, 1 - xx * xx - yy * yy)) + .0035;
      verts.push(px, py + headY, pz + .005); uv.push(u, v);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const n = j * (nx + 1) + i; idx.push(n, n + 1, n + nx + 1, n + 1, n + nx + 2, n + nx + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // The playable pair keep full-size face drawings; townsfolk use half size.
    part(g, face(kind, look.face, kind === 'amir' || kind === 'nur' ? 512 : 256), 0, 0, 0, head);
  }
  const center = new T.Vector3(0, headY + .012, -.006);
  const deg = Math.PI / 180;
  // Fringe clumps curve down over the forehead to just above the brows.
  // Each blade lies on the skull's tangent and bends with its curvature, in
  // two layers so the hair reads thick and tousled rather than a helmet.
  function fringe(list, radii, hair, sheen, sheenFrom) {
    const basis = new T.Matrix4(), tangent = new T.Vector3(), normal = new T.Vector3(), across = new T.Vector3();
    list.forEach(([t, ph, l, w, sway], i) => {
      const theta = t * deg, phi = ph * deg, sc = 1.015;
      const base = new T.Vector3(Math.sin(theta) * Math.cos(phi) * radii[0] * sc, Math.sin(phi) * radii[1] * sc, Math.cos(theta) * Math.cos(phi) * radii[2] * sc).add(center);
      normal.set(Math.sin(theta) * Math.cos(phi) / radii[0], Math.sin(phi) / radii[1], Math.cos(theta) * Math.cos(phi) / radii[2]).normalize();
      tangent.set(Math.sin(theta) * Math.sin(phi) * radii[0], -Math.cos(phi) * radii[1], Math.cos(theta) * Math.sin(phi) * radii[2]).normalize().applyAxisAngle(normal, sway);
      tangent.sub(normal.clone().multiplyScalar(tangent.dot(normal))).normalize(); across.crossVectors(tangent, normal);
      const g = new T.ConeGeometry(w, l, 6, 4), gp = g.attributes.position; g.translate(0, l / 2, 0); g.scale(1, 1, .42);
      for (let k = 0; k < gp.count; k++) { const y = gp.getY(k); gp.setZ(k, gp.getZ(k) - y * y / (2 * radii[1]) + .004); }
      g.computeVertexNormals();
      const m = part(g, i >= sheenFrom ? sheen : hair, base.x, base.y, base.z, head);
      m.quaternion.setFromRotationMatrix(basis.makeBasis(across, tangent, normal));
    });
  }
  // A face-framing scarf: Nur's hijab, and the grown-ups' tudung.
  function scarf(colour, edge, drape, scale = [1.07, 1.06, 1.08], opening = [.72, .8, -.1]) {
    const hx = rx * scale[0], hy = ry * scale[1], hz = rz * scale[2], [ox, oy, oc] = opening, inside = (x, y) => (x / ox) ** 2 + ((y - oc) / oy) ** 2 < 1;
    shell(hx, hy, hz, (x, y, z) => !(z > .05 && inside(x, y)) && !(y < -.72 && z > -.4), colour, 0, headY + .006, -.003, head);
    const ring = [];
    for (let a = 0; a <= TAU + .01; a += TAU / 36) { const ux = ox * Math.sin(a), uy = oc + oy * Math.cos(a), uz = Math.sqrt(Math.max(.02, 1 - ux * ux - uy * uy)); ring.push([ux * hx, headY + .006 + uy * hy, -.003 + uz * hz]); }
    line(ring, edge, .012, head);
    lathe(drape, .8, colour, 0, neckTop, .006, head, 20);
  }
  const hairStyle = look.hair;
  if (hairStyle === 'hijab') {
    // Hijab framing the face, with the hoodie's hood worn up around it.
    const hijab = material(0xf3c7c3), hood = cel(0xeeb0bc, { side: T.DoubleSide }), rim = material(0xd98a9d);
    // Scarf drape over the neck and a soft fold on the chest.
    scarf(hijab, hijab, [[.132, -.118], [.128, -.09], [.114, -.05], [.1, 0], [.095, .05]]);
    // The hood sits close over the hijab and ends in a soft point at the back.
    const ox = rx * 1.11, oy = ry * 1.09, oz = rz * 1.13, oc = new T.Vector3(0, headY + .01, -.02);
    const point = (x, y, z) => { const t = Math.max(0, -z) ** 2 * Math.max(0, .5 - y); return [x * (1 - .25 * t), y - .12 * t, z * (1 + .3 * t)]; };
    shell(ox, oy, oz, (x, y, z) => !(z > -.1 && (x / .8) ** 2 + ((y + .08) / .88) ** 2 < 1) && y > -.62, hood, oc.x, oc.y, oc.z, head, point);
    const ring = [];
    for (let a = -2.3; a <= 2.3; a += .12) {
      const ux = .8 * Math.sin(a), uy = -.08 + .88 * Math.cos(a), uz = Math.sqrt(Math.max(.02, 1 - ux * ux - uy * uy));
      ring.push([ux * ox, oc.y + uy * oy, oc.z + uz * oz]);
    }
    line(ring, rim, .012, head);
  } else if (hairStyle === 'tudung') {
    // Tudung: framed face, and a wide drape over the shoulders and chest.
    const cloth = material(look.hairColour);
    scarf(cloth, material(look.lace ?? look.hairColour), [[.205, -.23], [.215, -.17], [.21, -.11], [.19, -.08], [.14, -.045], [.105, -.01], [.096, .05]], [1.08, 1.07, 1.09], [.7, .8, -.12]);
  } else if (hairStyle === 'short') {
    // A short, neat crop with the face and ears clear; a higher hairline for Pak Salleh.
    const hairline = look.hairline ?? .42;
    shell(rx * 1.05, ry * 1.06, rz * 1.07, (x, y, z) => !(z > .15 && y < hairline + .2 * Math.abs(x)) && !(Math.abs(x) > .55 && y < .12 && z > -.5) && y > -.45, material(look.hairColour), 0, headY + .01, -.006, head, null, 28, 20);
    if (look.quiff) ball(rx * .62, ry * .2, rz * .5, material(look.hairColour), 0, headY + ry * .9, rz * .28, head, 12, 6);
  } else if (hairStyle === 'soft') {
    // Amir (v2.0): a full, soft crop of rounded clumps combed down and
    // forward, a side-swept fringe and a tapered nape. No cones, no spikes.
    const hair = material(look.hairColour ?? 0x221f26), sheen = material(look.sheen ?? 0x3a3a48), radii = [rx * 1.07, ry * 1.08, rz * 1.09];
    shell(...radii, (x, y, z) => {
      const faceCut = z > .12 && y < .4 - .12 * Math.abs(x) && Math.abs(x) < .82, earCut = Math.abs(x) > .7 && y < .08 && z > -.4 && y > -.6;
      return !faceCut && !earCut && y > -.42;
    }, hair, center.x, center.y, center.z, head);
    const petal = new T.SphereGeometry(1, 9, 6), up = new T.Vector3(0, 1, 0), basis = new T.Matrix4();
    function tuft(theta, phi, length, width, comb, lift, mat) {
      theta *= deg; phi *= deg;
      const d = new T.Vector3(Math.sin(theta) * Math.cos(phi), Math.sin(phi), Math.cos(theta) * Math.cos(phi));
      const base = new T.Vector3(d.x * radii[0], d.y * radii[1], d.z * radii[2]).multiplyScalar(.97).add(center);
      const normal = new T.Vector3(d.x / radii[0], d.y / radii[1], d.z / radii[2]).normalize();
      // Down the scalp, turned by `comb`; lifted off the head by `lift`.
      let along = up.clone().negate().addScaledVector(normal, normal.y);
      if (along.lengthSq() < 1e-4) along.set(-Math.sin(theta), 0, -Math.cos(theta));
      along.normalize().applyAxisAngle(normal, comb * deg);
      const axis = along.multiplyScalar(Math.cos(lift)).addScaledVector(normal, Math.sin(lift)).normalize();
      const side = new T.Vector3().crossVectors(axis, normal).normalize(), flat = new T.Vector3().crossVectors(side, axis);
      const g = petal.clone(); g.scale(width, length / 2, width * .42); g.translate(0, length * .42, 0);
      const m = part(g, mat, base.x, base.y, base.z, head); m.quaternion.setFromRotationMatrix(basis.makeBasis(side, axis, flat));
    }
    // Crown and back: rows of clumps lying down the head, alternating tone.
    let n = 0;
    for (const [phi, count, length, width, lift] of [[82, 3, .085, .05, .5], [64, 9, .09, .048, .32], [42, 11, .085, .046, .2], [20, 11, .075, .042, .12], [-2, 9, .06, .038, .06]]) {
      for (let i = 0; i < count; i++) {
        const theta = 180 + (i - (count - 1) / 2) * (300 / Math.max(count, 2)) * (phi > 70 ? .5 : 1);
        if (Math.cos(theta * deg) > .3 && phi < 40) continue; // keep the forehead for the fringe
        tuft(theta, phi, length, width, (i % 3 - 1) * 14, lift, n++ % 4 === 1 ? sheen : hair);
      }
    }
    // Fringe: soft clumps falling over the forehead, swept to Amir's left.
    for (const [theta, phi, length, width, comb] of [[-46, 46, .085, .04, 28], [-30, 50, .1, .044, 22], [-14, 53, .108, .046, 18], [2, 54, .11, .046, 14], [18, 53, .104, .045, 10], [34, 50, .094, .042, 6], [50, 46, .08, .04, 2], [-20, 64, .09, .044, 20], [12, 66, .09, .044, 14]])
      tuft(theta, phi, length, width, comb, .18, n++ % 4 === 1 ? sheen : hair);
    petal.dispose();
  } else if (hairStyle === 'bob') {
    // A blunt bob: fringe to the brows, sides to the jaw, a slight flare.
    const flare = (x, y, z) => { const t = Math.max(0, -.05 - y); return [x * (1 + .22 * t), y, z * (1 + .22 * t)]; };
    shell(rx * 1.1, ry * 1.08, rz * 1.1, (x, y, z) => y > -.66 && !(z > .2 && y < .2 && Math.abs(x) < .74), material(0x1d1a1f), center.x, center.y, center.z, head, flare);
    ball(.018, .012, .01, material(0xe86a8a), rx * .78, headY + ry * .42, rz * .55, head, 8, 6);
  } else {
    // Messy spiked hair (Amir) or a parted curtain fringe (Faiz): a cap with
    // the face and ears cut away, crown locks and fringe clumps.
    const hair = material(look.hairColour ?? 0x202129), sheen = material(look.sheen ?? 0x343846), radii = [rx * 1.06, ry * 1.07, rz * 1.08];
    shell(...radii, (x, y, z) => {
      const faceCut = z > .1 && y < .36 && Math.abs(x) < .8, earCut = Math.abs(x) > .7 && y < .05 && z > -.35 && y > -.6;
      return !faceCut && !earCut && y > -.5;
    }, hair, center.x, center.y, center.z, head);
    if (hairStyle === 'spiky') {
      const spikes = [
        [0, 78, .085, .058, .45, .45], [50, 66, .095, .06, .4, .4], [-50, 66, .095, .06, .4, .4], [120, 60, .09, .058, .3, .55], [-120, 60, .09, .058, .3, .55],
        [180, 62, .09, .058, .2, .65], [18, 56, .085, .054, .8, .05], [-24, 58, .08, .054, .7, .1], [85, 50, .08, .056, .45, .3], [-85, 50, .08, .056, .45, .3],
        [70, 30, .08, .056, .1, .45], [-70, 30, .08, .056, .1, .45], [108, 28, .08, .056, 0, .55], [-108, 28, .08, .056, 0, .55], [145, 26, .08, .056, -.05, .6], [-145, 26, .08, .056, -.05, .6], [180, 28, .08, .056, -.05, .6],
        [140, 0, .07, .05, -.55, .45], [-140, 0, .07, .05, -.55, .45], [165, -6, .07, .05, -.6, .45], [-165, -6, .07, .05, -.6, .45],
        [92, 10, .06, .045, -.45, .2], [-92, 10, .06, .045, -.45, .2]
      ];
      spikes.forEach(([t, p, l, w, u, b], i) => lock(head, center, radii, t * deg, p * deg, l, w, u, b, i % 4 === 1 ? sheen : hair, .5, (i % 3 - 1) * .3));
      fringe([[-56, 44, .07, .036, .35], [-41, 46, .084, .04, .2], [-26, 47, .094, .042, .1], [-10, 48, .1, .044, -.1], [6, 48, .1, .044, .12], [22, 47, .094, .042, -.15], [38, 46, .086, .04, -.25], [54, 44, .072, .036, -.35], [-18, 58, .085, .04, .25], [14, 58, .085, .04, -.2]], radii, hair, sheen, 8);
    } else {
      // Softer, flatter locks at the crown and nape than Amir's spikes.
      const locks = [[0, 72, .07, .06, .5, .55], [55, 60, .07, .06, .4, .5], [-55, 60, .07, .06, .4, .5], [125, 50, .075, .058, .2, .6], [-125, 50, .075, .058, .2, .6], [180, 45, .075, .058, .1, .65], [150, 8, .065, .05, -.6, .4], [-150, 8, .065, .05, -.6, .4], [180, 5, .065, .05, -.65, .4]];
      locks.forEach(([t, p, l, w, u, b], i) => lock(head, center, radii, t * deg, p * deg, l, w, u, b, i % 3 === 1 ? sheen : hair, .45, 0));
      fringe([[-50, 44, .088, .042, -.55], [-36, 47, .1, .044, -.45], [-22, 49, .105, .046, -.3], [-8, 51, .1, .044, -.15], [8, 51, .1, .044, .15], [22, 49, .105, .046, .3], [36, 47, .1, .044, .45], [50, 44, .088, .042, .55], [-28, 60, .09, .042, -.4], [28, 60, .09, .042, .4]], radii, hair, sheen, 8);
    }
  }

  if (options.parts && !options.portrait) return { head, look, plan, headY, neckTop, radii: [rx, ry, rz] };
  // Arms: loose sleeves, bare or covered forearms, mitten hands with thumbs.
  const hand = adult ? 1.15 : 1, sleeve = adult ? look.top.sleeve : look.sleeve ?? 'short';
  for (const side of [-1, 1]) {
    const sx = side * plan.shoulderX, ey = shoulder - plan.upperArm, wrist = ey - plan.foreArm;
    const arm = group(torso, sx, shoulder - .02, 0); arms.push(arm);
    const elbow = group(arm, sx, ey, 0); elbows.push(elbow);
    if (sleeve === 'long') {
      const sr = adult ? .046 : .05;
      lathe(adult ? [[sr, ey - shoulder + .02], [sr + .003, -.08], [sr + .005, -.035], [sr * .7, -.005], [0, .004]] : [[sr, ey - shoulder + .02], [sr + .003, -.08], [sr + .006, -.01], [sr * .75, .02], [0, .03]], .95, top, sx, shoulder - .02, 0, arm);
      ball(sr - .004, sr, sr - .004, top, sx, ey, 0, elbow);
      lathe([[sr - .006, wrist - ey + .03], [sr - .003, -.06], [sr - .002, .02]], .95, top, sx, ey, 0, elbow);
      const cuff = part(new T.TorusGeometry(sr - .01, .011, 5, 14), trim, sx, wrist + .032, 0, elbow); cuff.rotation.x = Math.PI / 2;
    } else if (adult) {
      // Short sleeves to mid upper arm; rolled sleeves stop above the elbow.
      const sr = .049, end = sleeve === 'rolled' ? -plan.upperArm * .72 : -.13;
      lathe([[sr, end], [sr + .002, end * .6], [sr + .003, -.035], [sr * .7, -.005], [0, .004]], .95, top, sx, shoulder - .02, 0, arm);
      const band = part(new T.TorusGeometry(sr - .002, sleeve === 'rolled' ? .014 : .006, 4, 14), sleeve === 'rolled' ? plain : trim, sx, shoulder - .02 + end + .006, 0, arm); band.rotation.x = Math.PI / 2;
      lathe([[.036, ey - shoulder + .02], [.04, end + .02], [.042, end + .05]], 1, skin, sx, shoulder - .02, 0, arm, 10);
      ball(.035, .037, .035, skin, sx, ey, 0, elbow, 10, 8);
      lathe([[.029, wrist - ey + .01], [.035, -.07], [.036, .0]], 1, skin, sx, ey, 0, elbow, 10);
    } else {
      lathe([[.062, -.1], [.06, -.06], [.06, .0], [.05, .035], [0, .045]], .95, top, sx, shoulder - .02, 0, arm);
      const band = part(new T.TorusGeometry(.059, .008, 4, 16), trim, sx, shoulder - .118, 0, arm); band.rotation.x = Math.PI / 2;
      lathe([[.032, ey - shoulder + .02], [.035, -.1], [.036, -.06]], 1, skin, sx, shoulder - .02, 0, arm, 10);
      ball(.032, .034, .032, skin, sx, ey, 0, elbow, 10, 8);
      lathe([[.026, wrist - ey + .01], [.031, -.06], [.032, .0]], 1, skin, sx, ey, 0, elbow, 10);
      if (side === -1 && look.watch) { const watch = part(new T.TorusGeometry(.03, .008, 4, 14), ink, sx, wrist + .022, 0, elbow); watch.rotation.x = Math.PI / 2; block(.03, .026, .012, material(0x8fb0b6), sx + side * .03, wrist + .022, .0, elbow).rotation.y = Math.PI / 2; }
    }
    ball(.025 * hand, .042 * hand, .034 * hand, skin, sx, wrist - .028 * hand, .004, elbow, 10, 8);
    const thumb = ball(.011 * hand, .024 * hand, .012 * hand, skin, sx - side * .016 * hand, wrist - .02 * hand, .024 * hand, elbow, 8, 6); thumb.rotation.z = side * .4;
  }

  // Backpacks with straps, front pocket, top handle, badge and charm.
  const backpack = group(torso, 0, shoulder - .17, -.16);
  if (look.bag === 'red' || look.bag === 'black') {
    const nurs = look.bag === 'black';
    const bag = material(nurs ? 0x2c2c33 : 0xc22f3c), bagTrim = material(nurs ? 0x3d3b46 : 0x2c2229), py = shoulder - .17;
    block(.25, .31, .1, bag, 0, py, -.165, backpack);
    block(.27, .05, .11, bagTrim, 0, py - .14, -.165, backpack);
    block(.19, .14, .045, bag, 0, py - .07, -.235, backpack);
    line([[-.085, py, -.258], [.085, py, -.258]], material(0xb9b2a8), .0035, backpack);
    line([[-.05, py + .15, -.15], [-.04, py + .19, -.16], [.04, py + .19, -.16], [.05, py + .15, -.15]], bagTrim, .009, backpack);
    for (const s of [-1, 1]) {
      line([[s * .075, py + .14, -.12], [s * .095, shoulder + .025, -.03], [s * .1, shoulder - .01, .07], [s * .11, shoulder - .13, .1], [s * .135, py - .12, .04], [s * .1, py - .14, -.11]], bagTrim, .011, backpack);
      block(.022, .03, .012, material(0x8d8780), s * .108, shoulder - .1, .103, backpack);
    }
    if (nurs) { const flower = decal(.07, .07, motif('flower'), -.045, py - .07, -.259, backpack); flower.rotation.y = Math.PI; }
    else { const badge = part(new T.TorusGeometry(.022, .006, 5, 14), material(0xe9b84f), -.05, py - .06, -.26, backpack); ball(.012, .012, .004, cream, -.05, py - .06, -.262, backpack); }
    line([[.07, py - .02, -.26], [.08, py - .1, -.27]], material(0xd4c6b2), .0025, backpack);
    if (nurs) { const charm = decal(.05, .05, motif('flower'), .082, py - .12, -.272, backpack); charm.rotation.y = Math.PI; }
    else { ball(.022, .026, .016, material(0x6fa060), .082, py - .12, -.272, backpack); for (const s of [-1, 1]) ball(.008, .008, .006, white, .082 + s * .01, py - .108, -.285, backpack); }
  } else if (look.bag === 'sling') {
    // Sling bag across the body: strap over the right shoulder, bag at the left hip.
    const bag = material(0xe0a93b), strap = material(0x8a5a2b), fz = frontZ(.146) + .012;
    line([[-.11, shoulder + .02, 0], [-.09, shoulder - .06, fz - .02], [-.02, shoulder - .16, fz], [.08, hipY + .16, fz], [.15, hipY + .07, .05]], strap, .009, torso);
    line([[-.11, shoulder + .02, 0], [-.08, shoulder - .08, -fz + .01], [.06, hipY + .14, -fz + .005], [.155, hipY + .07, -.03]], strap, .009, torso);
    block(.05, .15, .13, bag, .175, hipY + .02, .01, torso);
    block(.054, .06, .135, material(0xc98f2a), .177, hipY + .065, .01, torso);
    ball(.012, .012, .006, material(0xe86a8a), .203, hipY + .03, .02, torso, 8, 6).rotation.y = Math.PI / 2;
  }

  // Height is measured to the top of the head or hair; hats and carried
  // things sit on top of that.
  const bounds = new T.Box3().setFromObject(body);
  const grip = side => ({ x: side * plan.shoulderX + side * .02, y: shoulder - plan.upperArm - plan.foreArm - .05 * hand, elbow: elbows[side < 0 ? 0 : 1] });
  if (look.hat === 'songkok') {
    const songkok = lathe([[rx * .97, 0], [rx * 1.0, .05], [rx * .99, .092], [rx * .9, .098], [0, .1]], rz / rx * 1.05, material(0x1d1b20), 0, headY + ry * .4, -.008, head, 20);
    songkok.rotation.x = -.08;
  } else if (look.hat === 'cap') {
    const cap = material(look.hatColour), y0 = headY + .01;
    shell(rx * 1.1, ry * 1.08, rz * 1.12, (x, y) => y > .3, cap, 0, y0, -.006, head, null, 24, 16);
    const brim = ball(.085, .009, .075, cap, 0, y0 + ry * 1.08 * .3, rz * 1.07 + .04, head, 14, 4); brim.rotation.x = .16;
    ball(.012, .008, .012, cap, 0, y0 + ry * 1.08, -.006, head, 8, 4);
    block(.05, .03, .01, material(0xf3efe6), 0, y0 + ry * .62, rz * 1.04, head).rotation.x = -.5;
  } else if (look.hat === 'straw') {
    // Straw hat with a wide brim and a dark band.
    const straw = cel(0xd8b56a, { side: T.DoubleSide }), y0 = headY + ry * .35;
    lathe([[.27, -.035], [.2, -.012], [.13, 0], [.125, .07], [.11, .1], [0, .105]], rz / rx * 1.05, straw, 0, y0, -.006, head, 22);
    const band = part(new T.TorusGeometry(.127, .012, 4, 22), material(0x6b4a2f), 0, y0 + .018, -.006, head); band.rotation.x = Math.PI / 2; band.scale.y = rz / rx * 1.05;
  }
  // Portrait baking needs the character's complete head, including their hat.
  if (options.portrait) return { head, look, plan, headY, neckTop, radii: [rx, ry, rz] };
  for (const prop of look.props ?? []) {
    if (prop === 'pencil') {
      // A pencil tucked behind the right ear.
      const pencil = part(new T.CylinderGeometry(.0048, .0048, .09, 6), material(0xf2c447), -rx * .98, headY + .028, -.012, head); pencil.rotation.x = Math.PI / 2 - .25;
      ball(.005, .006, .005, material(0xe88a8a), -rx * .98, headY + .016, -.056, head, 6, 4);
    } else if (prop === 'towel') {
      // A "Good Morning" towel over the left shoulder.
      const towel = material(0xf6f2ea), stripe = material(0xc9393a), x0 = .09;
      block(.1, .014, .24, towel, x0, shoulder + .028, 0, torso).rotation.z = -.25;
      block(.1, .2, .014, towel, x0, shoulder - .08, frontZ(.17) + .012, torso);
      block(.1, .24, .014, towel, x0, shoulder - .1, -frontZ(.17) - .012, torso);
      for (const y of [-.15, -.165]) block(.102, .008, .016, stripe, x0, shoulder + y, frontZ(.17) + .013, torso);
    } else if (prop === 'tag') block(.05, .02, .008, material(0xf3efe6), -.075, shoulder - .07, frontZ(.18) + .004, torso);
    else if (prop === 'pouch') {
      block(.075, .085, .045, material(0x5a3f2c), .175, hipY + .06, .05, body);
      block(.079, .03, .049, material(0x4a3324), .175, hipY + .09, .05, body);
    } else if (prop === 'tie') {
      const tie = material(0x2b3d66), y0 = shoulder - .02, y1 = shoulder - .28, z0 = frontAt(y0) + .008, z1 = frontAt(y1) + .01;
      ball(.016, .014, .01, tie, 0, shoulder + .004, frontAt(shoulder) + .012, torso, 8, 6);
      block(.036, y0 - y1, .008, tie, 0, (y0 + y1) / 2, (z0 + z1) / 2, torso).rotation.x = -Math.atan2(z1 - z0, y0 - y1);
      block(.038, .008, .009, material(0xb8a25a), 0, shoulder - .12, frontAt(shoulder - .12) + .014, torso);
    } else if (prop === 'folder' || prop === 'clipboard') {
      // Cikgu Farid's blue folder, Pak Salleh's clipboard, held at the side.
      const at = grip(prop === 'folder' ? -1 : 1), board = prop === 'folder';
      block(.018, .3, .23, material(board ? 0x355f9a : 0x9a6a3e), at.x, at.y - .09, .03, at.elbow);
      if (board) block(.012, .3, .21, material(0xf6f2ea), at.x, at.y - .078, .03, at.elbow);
      else { block(.004, .25, .19, material(0xf6f2ea), at.x + Math.sign(at.x) * .011, at.y - .1, .03, at.elbow); block(.03, .03, .07, material(0xb9bdc4), at.x + Math.sign(at.x) * .006, at.y + .045, .03, at.elbow); }
    } else if (prop === 'rag') {
      const rag = block(.06, .13, .01, material(0xc23a35), .095, hipY - .1, -.085, legs[1]); rag.rotation.z = .12;
    } else if (prop === 'basket') {
      // A woven bakul of ulam from the kebun, hanging from the hand.
      const at = grip(1), cx = at.x + .07, rattan = cel(0xb98a4e, { side: T.DoubleSide }), weave = material(0x8a6234);
      lathe([[.055, -.23], [.08, -.2], [.088, -.14], [.092, -.11]], 1, rattan, cx, at.y, .02, at.elbow, 14);
      lathe([[0, -.231], [.055, -.23]], 1, weave, cx, at.y, .02, at.elbow, 14);
      for (const y of [-.2, -.16]) { const r = part(new T.TorusGeometry(y < -.18 ? .08 : .089, .005, 4, 16), weave, cx, at.y + y, .02, at.elbow); r.rotation.x = Math.PI / 2; }
      const handle = part(new T.TorusGeometry(.085, .007, 4, 12, Math.PI), weave, cx, at.y - .11, .02, at.elbow); handle.rotation.y = Math.PI / 2;
      for (const [dx, dz, r, c] of [[-.03, .02, .04, 0x5e9a4a], [.03, -.02, .042, 0x4f8a3e], [0, .04, .035, 0x6fae55], [.035, .035, .02, 0xd23a2f]]) ball(r, r * .7, r, material(c), cx + dx, at.y - .1, .02 + dz, at.elbow, 8, 6);
    } else if (prop === 'toybox') {
      // Atuk's wooden toy box on a rope handle, a gasing on the lid.
      const at = grip(-1), cx = at.x - .06, wood = material(0x9a6a3e);
      block(.1, .14, .24, wood, cx, at.y - .16, .02, at.elbow);
      block(.106, .02, .246, material(0x7a4f2c), cx, at.y - .085, .02, at.elbow);
      block(.104, .02, .244, material(0xe7b84c), cx, at.y - .16, .02, at.elbow);
      line([[cx, at.y - .075, -.06], [cx, at.y + .02, .02], [cx, at.y - .075, .1]], material(0xc9b48a), .006, at.elbow);
      const gasing = part(new T.ConeGeometry(.028, .035, 8), material(0xc23a35), cx, at.y - .06, .07, at.elbow); gasing.rotation.x = Math.PI;
    } else if (prop === 'car') {
      // Faiz's mini 4WD, never far from his hand.
      const at = grip(-1), cx = at.x, cy = at.y - .015;
      block(.045, .028, .11, material(0x2b5fa8), cx, cy, .06, at.elbow);
      block(.035, .016, .05, material(0xf2c84b), cx, cy + .02, .055, at.elbow);
      for (const dz of [.025, .095]) for (const s of [-1, 1]) { const wheel = part(new T.CylinderGeometry(.014, .014, .012, 8), ink, cx + s * .028, cy - .012, dz, at.elbow); wheel.rotation.z = Math.PI / 2; }
      } else if (prop === 'scissors') {
      // Abang Muthu's scissors in the right hand, blades open a little.
      const at = grip(-1), steel = material(0xc9ced6);
      for (const s of [-1, 1]) block(.008, .1, .014, steel, at.x, at.y - .075, .035, at.elbow).rotation.x = s * .16;
      for (const s of [-1, 1]) part(new T.TorusGeometry(.012, .004, 4, 10), material(0x2b2b33), at.x, at.y + .002, .035 + s * .013, at.elbow).rotation.y = Math.PI / 2;
    } else if (prop === 'spanner') {
      // Pak Hussin's spanner, ready for a loose nut.
      const at = grip(-1), steel = material(0x9aa3ad);
      block(.012, .17, .026, steel, at.x, at.y - .085, .035, at.elbow);
      for (const y of [.01, -.175]) block(.014, .03, .045, steel, at.x, at.y + y, .035, at.elbow);
    } else if (prop === 'tape') {
      // A tailor's measuring tape hung round the neck.
      const tape = material(0xf2d24b);
      for (const s of [-1, 1]) line([[s * .055, shoulder + .06, -.04], [s * .075, shoulder + .01, frontAt(shoulder) + .01], [s * .07, shoulder - .16, frontAt(shoulder - .16) + .012], [s * .065, shoulder - .36, frontAt(shoulder - .36) + .014]], tape, .008, torso);
    } else if (prop === 'stethoscope') {
      // Dr. Kumar's stethoscope: tubing round the neck to a silver chest piece.
      const tube = material(0x2a2a30), y = shoulder - .2;
      for (const s of [-1, 1]) line([[s * .05, shoulder + .06, -.04], [s * .07, shoulder + .01, frontAt(shoulder) + .008], [s * .03, y, frontAt(y) + .012], [0, y - .03, frontAt(y - .03) + .012]], tube, .006, torso);
      line([[0, y - .03, frontAt(y - .03) + .012], [.01, y - .1, frontAt(y - .1) + .012]], tube, .006, torso);
      ball(.02, .02, .008, material(0xc9ced6), .01, y - .11, frontAt(y - .11) + .016, torso, 10, 6);
    } else if (prop === 'tiffin') {
      // A three-tier mangkuk tingkat of kuih, carried by its handle.
      const at = grip(-1), steel = material(0xd9dde2), band = material(0xd0573f), z = .03;
      for (let i = 0; i < 3; i++) lathe([[.052, 0], [.056, .006], [.056, .054], [.052, .06]], 1, i === 1 ? band : steel, at.x, at.y - .3 + i * .06, z, at.elbow, 14);
      lathe([[0, -.002], [.052, 0]], 1, steel, at.x, at.y - .3, z, at.elbow, 14);
      lathe([[.054, 0], [.03, .014], [0, .018]], 1, steel, at.x, at.y - .12, z, at.elbow, 14);
      part(new T.TorusGeometry(.055, .005, 4, 12, Math.PI), material(0x8a8f96), at.x, at.y - .1, z, at.elbow).rotation.y = Math.PI / 2;
    } else if (prop === 'bread') {
      // Mak Jah's paper bag with a long loaf poking out.
      const at = grip(1), cx = at.x + .02;
      block(.07, .16, .11, material(0xd9b98a), cx, at.y - .1, .035, at.elbow);
      ball(.032, .085, .032, material(0xc98a45), cx, at.y - .02, .05, at.elbow, 10, 8);
    } else if (prop === 'books') {
      // Cik Azura's armful of library books, held at the side.
      const at = grip(1);
      [[0x3d6a9a, .03, .22], [0xb5493a, .028, .2], [0xe0b04a, .024, .19]].forEach(([c, w, h], i) => block(w, h, .16, material(c), at.x + i * .03, at.y - .09, .035, at.elbow));
    } else if (prop === 'newspaper') {
      // A folded newspaper: Saturday's Berita Harian, held at the side.
      const at = grip(-1);
      block(.012, .26, .17, material(0xeeeadf), at.x, at.y - .1, .035, at.elbow);
      for (const y of [-.05, -.09, -.13]) block(.014, .012, .12, material(0x8d8a84), at.x, at.y + y, .035, at.elbow);
    } else if (prop === 'whistle') {
      // The padang keeper's whistle on a blue lanyard.
      const cord = material(0x2f5aa8), y = shoulder - .17;
      for (const s of [-1, 1]) line([[s * .05, shoulder + .06, -.04], [s * .065, shoulder + .01, frontAt(shoulder) + .008], [0, y, frontAt(y) + .012]], cord, .004, torso);
      block(.02, .022, .045, material(0xd9dde2), 0, y - .016, frontAt(y - .016) + .026, torso);
    } else if (prop === 'rod') {
      // A long bamboo fishing rod angled out over the water.
      const at = grip(-1), g = new T.CylinderGeometry(.005, .011, 1.7, 6); g.translate(0, .85, 0);
      part(g, material(0xb08a52), at.x, at.y - .04, .04, at.elbow).rotation.x = .75;
    } else if (prop === 'hoe') {
      // A cangkul: long wooden handle in the right hand, blade at the ground.
      const at = grip(-1);
      part(new T.CylinderGeometry(.013, .013, 1, 6), material(0x8a6a44), at.x, at.y - .02, .05, at.elbow);
      block(.14, .015, .14, material(0x7d858e), at.x, at.y - .5, .11, at.elbow).rotation.x = .35;
    } else if (prop === 'broom') {
      // A penyapu lidi: a sheaf of palm-leaf ribs tied at the hand.
      const at = grip(-1);
      const lidi = material(0xb89558);
      for (let i = 0; i < 7; i++) { const a = (i - 3) * .07, g = new T.CylinderGeometry(.004, .007, .72, 4); g.translate(0, -.36, 0); part(g, lidi, at.x, at.y - .02, .06, at.elbow).rotation.set(a * .4, 0, a); }
      part(new T.TorusGeometry(.012, .006, 4, 10), material(0x8a5a2b), at.x, at.y - .03, .06, at.elbow).rotation.x = Math.PI / 2;
    } else if (prop === 'baby') {
      // A baby asleep in a kain sling across the body.
      const sling = material(look.sling ?? 0xe0b04a), y = hipY + .2, z = frontAt(y);
      line([[-.11, shoulder + .02, 0], [-.08, shoulder - .08, frontAt(shoulder - .08) + .02], [.02, y + .1, z + .06], [.13, y - .02, z + .02]], sling, .02, torso);
      line([[-.11, shoulder + .02, 0], [-.07, shoulder - .1, -frontAt(shoulder - .1) - .01], [.13, y - .02, -z + .02]], sling, .02, torso);
      ball(.09, .07, .065, material(0xf6efe0), .04, y + .03, z + .06, torso, 12, 8);
      ball(.045, .05, .045, skin, .1, y + .09, z + .07, torso, 12, 8);
      ball(.05, .03, .05, material(0xf6dfe6), .1, y + .125, z + .065, torso, 10, 6);
    }
  }

  // One skinned draw carries all opaque cloth, skin and hair: every part is
  // rigidly weighted to its joint and keeps its colour as a vertex colour.
  // Printed cloth joins the same geometry with its own material group, and
  // only the drawings stay as small meshes on their joints.
  root.updateMatrixWorld(true);
  const bones = []; body.traverse(o => { if (o.isBone) bones.push(o); });
  const toRoot = root.matrixWorld.clone().invert(), local = new T.Matrix4(), parts = [];
  root.traverse(o => { if (o.isMesh && !o.material.transparent) parts.push(o); });
  const single = [], printed = [], double = [], size = new T.Vector3();
  for (const o of parts) {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(local.multiplyMatrices(toRoot, o.matrixWorld));
    const piece = { g, colour: o.material.color, bone: bones.indexOf(o.parent), print: o.material.map ? o.material : null };
    if (piece.print) {
      // Bake the print's repeat into the UVs: whole repeats around, so no seam.
      g.computeBoundingBox(); g.boundingBox.getSize(size);
      piece.repeat = [Math.max(1, Math.round(Math.PI * (size.x + size.z) / 2 / piece.print.userData.tile)), size.y / piece.print.userData.tile];
    }
    (piece.print ? printed : o.material.side === T.DoubleSide ? double : single).push(piece);
    o.removeFromParent(); o.geometry.dispose();
  }
  printed.sort((a, b) => a.print.id - b.print.id);
  // Two-sided cloth (the hood) is appended last with flipped copies, so the
  // ink hull can draw only the outward-facing range.
  const ordered = [...single, ...printed, ...double];
  const count = ordered.reduce((n, { g }) => n + g.attributes.position.count, 0) + double.reduce((n, { g }) => n + g.attributes.position.count, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), colour = new Float32Array(count * 3), skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  const uvs = printed.length ? new Float32Array(count * 2) : null;
  let n = 0;
  const append = ({ g, colour: c, bone, repeat }, flip = false) => {
    const p = g.attributes.position.array, q = g.attributes.normal.array, t = repeat && g.attributes.uv.array, verts = p.length / 3;
    for (let i = 0; i < verts; i++) {
      const src = flip ? i - (i % 3) + [0, 2, 1][i % 3] : i;
      for (let k = 0; k < 3; k++) { position[(n + i) * 3 + k] = p[src * 3 + k]; normal[(n + i) * 3 + k] = flip ? -q[src * 3 + k] : q[src * 3 + k]; }
      colour.set([c.r, c.g, c.b], (n + i) * 3); skinIndex[(n + i) * 4] = bone; skinWeight[(n + i) * 4] = 1;
      if (t) { uvs[(n + i) * 2] = t[src * 2] * repeat[0]; uvs[(n + i) * 2 + 1] = t[src * 2 + 1] * repeat[1]; }
    }
    n += verts;
  };
  const geometry = new T.BufferGeometry(), materials = [skinMaterial];
  for (const piece of single) append(piece);
  if (printed.length) geometry.addGroup(0, n, 0);
  for (const piece of printed) {
    const start = n; append(piece);
    const last = geometry.groups.at(-1), index = materials.indexOf(piece.print);
    if (index > 0 && last.materialIndex === index) last.count += n - start; else geometry.addGroup(start, n - start, index > 0 ? index : materials.push(piece.print) - 1);
  }
  const plainFrom = n;
  for (const piece of double) append(piece);
  const outer = n;
  for (const piece of double) append(piece, true);
  if (printed.length && n > plainFrom) geometry.addGroup(plainFrom, n - plainFrom, 0);
  for (const { g } of ordered) g.dispose();
  for (const [name, array, size] of [['position', position, 3], ['normal', normal, 3], ['color', colour, 3], ['skinIndex', skinIndex, 4], ['skinWeight', skinWeight, 4]]) geometry.setAttribute(name, new T.BufferAttribute(array, size));
  if (uvs) geometry.setAttribute('uv', new T.BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  const figure = new T.SkinnedMesh(geometry, printed.length ? materials : skinMaterial); figure.castShadow = figure.receiveShadow = true; root.add(figure);
  // Townsfolk drawings are flat on the body, so their shadow is the body's.
  if (kind !== 'amir' && kind !== 'nur') root.traverse(o => { if (o.isMesh && o.material.transparent) o.castShadow = false; });
  root.updateMatrixWorld(true); figure.bind(new T.Skeleton(bones));
  const hullGeometry = new T.BufferGeometry();
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) hullGeometry.setAttribute(name, geometry.attributes[name]);
  hullGeometry.setDrawRange(0, outer); hullGeometry.boundingSphere = geometry.boundingSphere;
  outline({ geometry: hullGeometry, isSkinnedMesh: true, skeleton: figure.skeleton, bindMatrix: figure.bindMatrix, position: new T.Vector3(), quaternion: new T.Quaternion(), scale: new T.Vector3(1, 1, 1), parent: root }, 1.8);
  const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31); gradient.addColorStop(0, 'rgba(45,42,56,.3)'); gradient.addColorStop(1, 'rgba(45,42,56,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const shadow = new T.Mesh(new T.PlaneGeometry(.62, .62), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; root.add(shadow);
  // World coordinates are metres. Normalise the authored plan to the exact
  // character height; the soles rest .065 m above the group origin.
  const height = plan.height, scale = height / (bounds.max.y - bounds.min.y); root.scale.setScalar(scale);
  const baseY = -bounds.min.y + .065 / scale; body.position.y = baseY; shadow.position.y = .075 / scale;
  // Older townsfolk stand with a slight stoop.
  const stoop = look.stoop ?? 0;
  let blend = 0, run = 0, speed = 0, phase = 0, time = 0, acting = null, actingTime = 0, actWeight = 0;
  const target = new T.Vector3(), inverseBody = new T.Quaternion(), chain = new T.Quaternion(), footRotation = new T.Quaternion(), xAxis = new T.Vector3(1, 0, 0);
  function animate(dt, moving = 0, running = false, travel = 0, action = null, actionTime = 0) {
    time += dt;
    // Speed comes from successful collision movement, so pushing against a
    // wall stops the stride, and the gait blends from a walk into a run.
    speed = T.MathUtils.lerp(speed, dt > 0 ? travel / dt : 0, 1 - Math.exp(-dt * 8));
    run = T.MathUtils.smoothstep(speed, 2.2, 9.5);
    phase += travel / (gaitShape(run).cycle * leg * scale) * TAU;
    blend = T.MathUtils.lerp(blend, Math.min(1, Math.max(moving, speed / 1.2)), 1 - Math.exp(-dt * 10));
    const pose = gaitPose(phase, time, blend, run);
    body.position.set(pose.x * leg, baseY + pose.y * leg, 0);
    body.rotation.set(0, pose.hipYaw, pose.hipRoll);
    torso.rotation.set(pose.lean + stoop, pose.chestYaw, pose.chestRoll);
    head.rotation.set(-pose.lean * .55 - stoop * .8, -pose.chestYaw * .7, -pose.chestRoll);
    inverseBody.copy(body.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const foot = pose.feet[i];
      target.set(legs[i].position.x, baseY + plan.ankle + foot.lift * leg, foot.z * leg).sub(body.position).applyQuaternion(inverseBody).sub(legs[i].position);
      const angles = solveLeg(target.y, target.z, plan.upper, plan.lower);
      legs[i].rotation.set(angles.hip, 0, 0); knees[i].rotation.x = angles.knee;
      chain.copy(body.quaternion).multiply(legs[i].quaternion).multiply(knees[i].quaternion).invert();
      footRotation.setFromAxisAngle(xAxis, foot.roll); feet[i].quaternion.copy(chain.multiply(footRotation));
      const out = i === 0 ? -1 : 1;
      arms[i].rotation.set(pose.arms[i].swing - pose.lean * .5 - stoop * .5, 0, out * (.1 + .04 * blend * run));
      elbows[i].rotation.x = pose.arms[i].bend;
    }
    // Idle actions (see actions.js) blend in over the standing pose and out again.
    actWeight = T.MathUtils.lerp(actWeight, action ? 1 : 0, 1 - Math.exp(-dt * 5));
    if (action) { acting = action; actingTime = actionTime; }
    const act = acting && actWeight > .002 && ACTIONS[acting]?.(actingTime);
    if (act) {
      const w = actWeight;
      for (let i = 0; i < 2; i++) {
        const a = act.arms?.[i], e = act.elbows?.[i], r = arms[i].rotation;
        if (a) r.set(r.x + (a[0] - r.x) * w, r.y + (a[1] - r.y) * w, r.z + (a[2] - r.z) * w);
        if (e != null) elbows[i].rotation.x += (e - elbows[i].rotation.x) * w;
      }
      if (act.torso) { torso.rotation.x += act.torso[0] * w; torso.rotation.y += act.torso[1] * w; torso.rotation.z += act.torso[2] * w; }
      if (act.head) { head.rotation.x += act.head[0] * w; head.rotation.y += act.head[1] * w; head.rotation.z += act.head[2] * w; }
    }
    backpack.rotation.x = Math.sin(phase * 2) * .03 * blend;
    backpack.rotation.z = -pose.hipRoll * .6;
  }
  root.userData.design = kind; root.userData.height = height;
  // Drawings (face, motifs) and the ground shadow: small at a distance.
  const details = []; root.traverse(o => { if (o.isMesh && o.material.transparent) details.push(o); });
  return { group: root, figure, legs, knees, feet, arms, head, torso, backpack, height, animate, details };
}
