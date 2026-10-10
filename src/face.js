import * as T from 'three';
import { toon } from './illustration.js';

// A drawn face for the modelled kids (v2.11). The image-to-3D texture gives
// the face only ~150 px, so the painted eyes and mouth are soft and still.
// This lays a thin patch over the front of the head, shaped by casting rays
// onto the bind-pose mesh, and draws the character sheet's face on it:
// heavy brows, big brown eyes with a black lash line and highlight, a small
// nose, blush and a smile. It blinks, talks and changes expression.
const SIZE = 512;

export function createFace({ root, geometry, skinIndex, order, headBone, map, rect, draw = rect.grid ? drawGrid : drawKid(LAYOUTS[rect.kind]) }) {
  // Head bounds from the vertices led by the head bone.
  const index = skinIndex, weight = geometry.attributes.skinWeight, position = geometry.attributes.position;
  const headIndex = order.indexOf('head'), head = new T.Box3(), p = new T.Vector3();
  for (let i = 0; i < index.count; i++) {
    let top = 0, best = 0;
    for (let k = 0; k < 4; k++) { const w = weight.getComponent(i, k); if (w > best) { best = w; top = index.getComponent(i, k); } }
    if (top === headIndex) head.expandByPoint(p.fromBufferAttribute(position, i));
  }
  const size = head.getSize(new T.Vector3()), centreX = (head.min.x + head.max.x) / 2;
  const x0 = centreX - size.x * rect.halfWidth, x1 = centreX + size.x * rect.halfWidth;
  const y0 = head.min.y + size.y * rect.bottom, y1 = head.min.y + size.y * rect.top;

  // Cast a grid of rays at the face, front to back, in the bind pose.
  const probe = new T.Mesh(geometry, new T.MeshBasicMaterial({ side: T.DoubleSide }));
  const ray = new T.Raycaster(), N = 24, M = 24, verts = [], uvs = [], skinSamples = [];
  const hit = new Array((N + 1) * (M + 1)).fill(-1);
  const image = map?.image, sampler = image && document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (sampler) { sampler.canvas.width = image.width; sampler.canvas.height = image.height; sampler.drawImage(image, 0, 0); }
  for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
    const u = i / N, v = j / M, x = x0 + (x1 - x0) * u, y = y1 - (y1 - y0) * v;
    ray.set(new T.Vector3(x, y, head.max.z + 1), new T.Vector3(0, 0, -1));
    const [first] = ray.intersectObject(probe);
    if (!first) continue;
    hit[j * (N + 1) + i] = verts.length / 3;
    // Lift the patch a little off the skin, along the ray towards the viewer.
    verts.push(first.point.x, first.point.y, first.point.z + .0025);
    uvs.push(u, 1 - v);
    // The skin colour under the cheeks, from the model's own texture
    // (glTF textures are not flipped, so v runs down the image).
    if (sampler && first.uv && Math.abs(u - .5) > .12 && Math.abs(u - .5) < .3 && v > .55 && v < .8) {
      const d = sampler.getImageData(Math.floor(first.uv.x * image.width), Math.floor(first.uv.y * image.height), 1, 1).data;
      // Skin only: warm, green above blue (Nur's pink hood is not).
      if (d[0] > d[1] && d[1] > d[2] && (d[1] - d[2]) / d[0] > .08) skinSamples.push([d[0], d[1], d[2]]);
    }
  }
  const faces = [];
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
    const a = hit[j * (N + 1) + i], b = hit[j * (N + 1) + i + 1], c = hit[(j + 1) * (N + 1) + i], d = hit[(j + 1) * (N + 1) + i + 1];
    if (a >= 0 && b >= 0 && c >= 0 && d >= 0) faces.push(a, c, b, b, c, d);
  }
  const patchGeometry = new T.BufferGeometry();
  patchGeometry.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  patchGeometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  patchGeometry.setIndex(faces); patchGeometry.computeVertexNormals();

  const median = k => { const s = skinSamples.map(c => c[k]).sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? [214, 160, 116][k]; };
  const skin = `rgb(${median(0)},${median(1)},${median(2)})`;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d'), texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  const material = toon(0xffffff, { map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const patch = new T.Mesh(patchGeometry, material); patch.renderOrder = 1;
  root.add(patch); root.updateMatrixWorld(true); headBone.attach(patch);

  // Expression state: blinking runs by itself; talking flaps the mouth.
  const state = { expression: 'smile', blink: false, talk: 0 };
  let blinkIn = 2 + Math.random() * 3, blinkFor = 0, talkClock = 0, drawn = '';
  function redraw() {
    const key = `${state.expression}|${state.blink}|${state.talk}`;
    if (key === drawn) return;
    drawn = key; draw(ctx, SIZE, { ...state, skin }); texture.needsUpdate = true;
  }
  redraw();
  return {
    patch, skin,
    setExpression(name) { state.expression = name; redraw(); },
    update(dt, talking = false) {
      if (blinkFor > 0) { if ((blinkFor -= dt) <= 0) state.blink = false; }
      else if ((blinkIn -= dt) <= 0) { state.blink = true; blinkFor = .12; blinkIn = 2.5 + Math.random() * 3.5; }
      if (talking) { talkClock += dt; state.talk = Math.floor(talkClock * 9) % 3; } else { talkClock = 0; state.talk = 0; }
      redraw();
    },
    // Fixed frames for screenshots and cut scenes.
    pose(next) { Object.assign(state, next); redraw(); }
  };
}

// Debug grid: shows where the patch lands on the head.
export function drawGrid(ctx, S) {
  ctx.clearRect(0, 0, S, S); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#d0302a'; ctx.lineWidth = 2; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#123';
  for (let k = 0; k <= 10; k++) {
    ctx.beginPath(); ctx.moveTo(k * S / 10, 0); ctx.lineTo(k * S / 10, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k * S / 10); ctx.lineTo(S, k * S / 10); ctx.stroke();
    ctx.fillText(k, k * S / 10 + 3, S * .55 + 22); ctx.fillText(k, S * .52 + 3, k * S / 10 + 22);
  }
}

// The kids after their character sheets. Each layout is in pixels of a
// front close-up (camera 1 m away), mapped onto the patch by `map`
// [x scale, y scale, x offset, y offset] so the new eyes and mouth cover the
// model's painted ones exactly.
export const LAYOUTS = {
  amir: {
    map: [.4376, .826, -83.1, -132.2], k: 1,
    eyes: [[555, 482], [975, 482]], rx: 102, top: 94, bottom: 90, iris: 64,
    brow: { y: 352, half: 94, arch: 0, thick: 30 }, lashes: 0,
    nose: [780, 588], mouth: [783, 646, 73], blush: [[520, 600], [1035, 600]], blushR: [62, 34],
    cover: { eyes: [474, 150, 140], mouth: [700, 662, 160, 70] }, lip: '#8a4a36'
  },
  // Nur's face sits inside her hood: smaller, eyes nearer the brows, arched
  // rounded brows, darker irises and a few lashes at the outer corners.
  nur: {
    map: [.569, .898, -158.2, -185.9], k: .74,
    eyes: [[548, 416], [950, 422]], rx: 86, top: 82, bottom: 76, iris: 59,
    brow: { y: 282, half: 80, arch: 16, thick: 26 }, lashes: 3,
    nose: [752, 528], mouth: [748, 590, 52], blush: [[505, 505], [992, 510]], blushR: [50, 28],
    cover: { eyes: [420, 122, 118], mouth: [748, 596, 96, 44] }, lip: '#94505a', dark: true
  }
};
const INK = '#17120f', WHITE = '#fbf8f1', MOUTH = '#5a2219', BLUSH = 'rgba(232,120,104,.32)';
export function drawKid(L) {
  return (ctx, S, s) => drawFace(ctx, S, s, L);
}
function drawFace(ctx, S, s, L) {
  const k = L.k, [sx, sy, ox, oy] = L.map;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
  ctx.setTransform(sx * S / 512, 0, 0, sy * S / 512, ox * S / 512, oy * S / 512);
  const ellipse = (x, y, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
  // A filled ellipse whose edge fades out, for skin cover, nose and blush.
  const soft = (x, y, rx, ry, colour, solid = .65) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, colour); g.addColorStop(solid, colour); g.addColorStop(1, colour.replace(/[\d.]+\)$/, '0)'));
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  };
  const skin = s.skin.replace('rgb(', 'rgba(').replace(')', ',1)');
  // Cover the old painted eyes and mouth with the face's own skin colour.
  const [ey, erx, ery] = L.cover.eyes;
  for (const [x] of L.eyes) soft(x, ey, erx, ery, skin, .82);
  soft(...L.cover.mouth, skin, .82);
  const surprised = s.expression === 'surprised', happy = s.expression === 'happy';
  // Brows: thick bars, heavier towards the nose; Nur's arch with round ends.
  for (const [x, side] of L.eyes.map(([x], i) => [x, i ? 1 : -1])) {
    const b = L.brow, y = b.y - (surprised ? 22 * k : 0), h = b.half;
    if (b.arch) {
      ctx.lineCap = 'round'; ctx.strokeStyle = INK;
      ctx.lineWidth = b.thick; ctx.beginPath(); ctx.moveTo(x - side * h * .9, y + 8 * k); ctx.quadraticCurveTo(x + side * h * .1, y - b.arch * 1.4, x + side * h, y + b.arch * .6); ctx.stroke();
      ctx.lineWidth = b.thick * 1.25; ctx.beginPath(); ctx.moveTo(x - side * h * .85, y + 9 * k); ctx.lineTo(x - side * h * .45, y - b.arch * .2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(x - side * h * 1.02, y + 4); ctx.lineTo(x + side * h * .98, y - 8);
      ctx.quadraticCurveTo(x + side * h * 1.06, y + 8, x + side * h * .96, y + 22); ctx.lineTo(x - side * h, y + 34); ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
    }
  }
  // Eyes: a heavy, flattish upper lid that cuts across the top of the iris,
  // a rounder lower lid, a big brown iris, black pupil and two highlights.
  for (const [[x, y], side] of L.eyes.map((e, i) => [e, i ? 1 : -1])) {
    const rx = L.rx, top = L.top * (surprised ? 1.18 : 1), bottom = L.bottom * (surprised ? 1.08 : 1);
    const inner = [x - side * rx, y + 2 * k], outer = [x + side * rx, y - 14 * k];
    const upper = () => { ctx.moveTo(...inner); ctx.bezierCurveTo(x - side * rx * .55, y - top, x + side * rx * .55, y - top - 4 * k, ...outer); };
    if (s.blink || happy) {
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 30 * k; ctx.beginPath();
      if (happy) { ctx.moveTo(x - rx * .8, y + 14 * k); ctx.quadraticCurveTo(x, y - 62 * k, x + rx * .8, y + 14 * k); }
      else { ctx.moveTo(...inner); ctx.quadraticCurveTo(x, y + 36 * k, ...outer); }
      ctx.stroke(); continue;
    }
    ctx.save(); ctx.beginPath(); upper(); ctx.bezierCurveTo(x + side * rx * .6, y + bottom * 1.1, x - side * rx * .6, y + bottom * 1.1, ...inner); ctx.closePath(); ctx.clip();
    ellipse(x, y, rx * 1.2, top + bottom, WHITE);
    const ix = x + 4 * k, iy = y + 8 * k, ir = L.iris * (surprised ? .78 : 1);
    const g = ctx.createRadialGradient(ix, iy + ir * .45, ir * .1, ix, iy, ir);
    if (L.dark) { g.addColorStop(0, '#5e3a22'); g.addColorStop(.55, '#33200f'); g.addColorStop(1, '#1c1108'); }
    else { g.addColorStop(0, '#80502e'); g.addColorStop(.55, '#4a2c1a'); g.addColorStop(1, '#2a170c'); }
    ellipse(ix, iy, ir * .9, ir, g);
    ellipse(ix, iy + 3 * k, ir * .5, ir * .56, INK);
    ellipse(ix + ir * .36, iy - ir * .34, ir * .2, ir * .2, '#ffffff');
    ellipse(ix - ir * .32, iy + ir * .44, ir * .08, ir * .08, 'rgba(255,255,255,.85)');
    // Lid shadow under the upper lash.
    ctx.lineWidth = 22 * k; ctx.strokeStyle = 'rgba(120,80,60,.25)'; ctx.beginPath(); upper(); ctx.stroke();
    ctx.restore();
    // Upper lash: thick black, widest towards the outer corner.
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 34 * k; ctx.beginPath(); upper(); ctx.stroke();
    ctx.lineWidth = 14 * k; ctx.beginPath(); ctx.moveTo(x + side * rx * .2, y - top * .72); ctx.quadraticCurveTo(x + side * rx * .7, y - top * .7, outer[0] - side * 6 * k, outer[1] + 4 * k); ctx.stroke();
    // A few short lashes fanning out from the outer corner.
    ctx.lineWidth = 9 * k;
    for (let i = 0; i < L.lashes; i++) {
      const t = .62 + i * .17, px = x + side * rx * t, py = y - top * (1 - (t - .3) * .62);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + side * (14 + i * 6) * k, py - (20 - i * 4) * k); ctx.stroke();
    }
    // Lower lid: a thin soft line near the outer half only.
    ctx.lineWidth = 5 * k; ctx.strokeStyle = 'rgba(60,34,24,.6)'; ctx.beginPath();
    ctx.moveTo(x + side * rx * .15, y + bottom * .82); ctx.quadraticCurveTo(x + side * rx * .7, y + bottom * .7, outer[0], outer[1] + 10 * k); ctx.stroke();
  }
  // Nose: a small rounded shadow, and blush on both cheeks.
  const [nx, ny] = L.nose;
  soft(nx, ny, 24 * k, 16 * k, 'rgba(170,100,66,.3)');
  soft(nx - 8 * k, ny - 6 * k, 10 * k, 7 * k, 'rgba(255,220,190,.45)');
  for (const [x, y] of L.blush) soft(x, y, ...L.blushR, BLUSH);
  // Mouth.
  const [mx, my, mw] = L.mouth;
  ctx.lineCap = 'round'; ctx.strokeStyle = L.lip;
  const open = surprised ? 3 : happy ? 4 : s.talk;
  if (open === 0) {
    ctx.lineWidth = 12 * k; ctx.beginPath(); ctx.moveTo(mx - mw, my + 2 * k); ctx.quadraticCurveTo(mx - 3 * k, my + 44 * k, mx + mw, my - 6 * k); ctx.stroke();
  } else if (open === 3) {
    ellipse(mx, my + 22 * k, 26 * k, 30 * k, MOUTH); ctx.lineWidth = 6 * k; ctx.beginPath(); ctx.ellipse(mx, my + 22 * k, 26 * k, 30 * k, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    // Open: a wide D-shaped mouth with a hint of tongue.
    const h = (open === 1 ? 22 : open === 2 ? 36 : 50) * k;
    const shape = () => { ctx.beginPath(); ctx.moveTo(mx - mw, my); ctx.quadraticCurveTo(mx, my + 18 * k, mx + mw, my - 4 * k); ctx.bezierCurveTo(mx + mw * .84, my + 6 * k + h * 1.6, mx - mw * .82, my + 8 * k + h * 1.6, mx - mw, my); ctx.closePath(); };
    shape(); ctx.fillStyle = MOUTH; ctx.fill();
    ctx.save(); shape(); ctx.clip(); ellipse(mx + 3 * k, my + 14 * k + h * 1.3, mw * .66, h * .55, '#c76a5c'); ctx.restore();
    shape(); ctx.lineWidth = 9 * k; ctx.lineJoin = 'round'; ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
