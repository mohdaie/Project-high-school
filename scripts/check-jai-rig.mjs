// Validate Jai's Blender rig with the game's real code and no WebGL: GLTFLoader,
// mannequin IK, retargeting, finger grip, breathing and skinning.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const canvas = () => { const c = { width: 64, height: 64 }, noop = () => {}; c.getContext = () => new Proxy({ canvas: c }, { get: (o, k) => k in o ? o[k] : noop }); return c; };
globalThis.ProgressEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
globalThis.document = { createElement: canvas }; globalThis.self = {};
const T = await import('three'), { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { createFighter } = await import('../src/fighter.js'), { createMannequin } = await import('../src/mannequin.js'), { retarget } = await import('../src/retarget.js'), { STANCE, MOVES, GUARD } = await import('../src/brawler.js'), { sample } = await import('../src/keyframes.js');
const b = readFileSync(new URL('../assets/models/jai-fighter.glb', import.meta.url)), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n));
j.buffers[0].uri = 'data:application/octet-stream;base64,' + b.subarray(28 + n).toString('base64'); delete j.images; delete j.textures; delete j.materials[0].pbrMetallicRoughness.baseColorTexture;
const gltf = await new GLTFLoader().parseAsync(JSON.stringify(j), ''), scene = new T.Scene(), f = createFighter(scene, gltf), m = createMannequin(scene);
const g = f.figure.geometry, count = g.attributes.position.count, index = g.index.array, v = new T.Vector3(), w = o => o.getWorldPosition(new T.Vector3());
const skinned = () => { scene.updateMatrixWorld(true); f.figure.skeleton.update(); const out = new Float32Array(count * 3); for (let i = 0; i < count; i++) f.figure.getVertexPosition(i, v).applyMatrix4(f.figure.matrixWorld).toArray(out, i * 3); return out; };
// Fists against the body: the deepest a fist vertex sits under the nearest surface of the
// body (anything but its own arm), from the posed mesh's own normals.
const bones = f.figure.skeleton.bones.map(o => o.name.slice(4)), sk = g.attributes.skinIndex, sw = g.attributes.skinWeight;
const own = Array.from({ length: count }, (_, i) => { let best = 0, k0 = 0; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > best) { best = sw.getComponent(i, k); k0 = sk.getComponent(i, k); } return bones[k0]; });
const digit = (n, s) => n === 'hand' + s || ((n.startsWith('f_') || n.startsWith('thumb')) && n.endsWith(s));
const fistIds = s => own.flatMap((n, i) => digit(n, s) ? [i] : []), bodyIds = s => own.flatMap((n, i) => digit(n, s) || n === 'forearm' + s || n === 'upper_arm' + s ? [] : [i]);
const FIST = { L: fistIds('L'), R: fistIds('R') }, BODY = { L: bodyIds('L'), R: bodyIds('R') };
function sunk(p, s) {
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(p, 3)); geo.setIndex(g.index); geo.computeVertexNormals(); const nor = geo.attributes.normal.array;
  const c = [0, 1, 2].map(k => FIST[s].reduce((sum, i) => sum + p[i * 3 + k], 0) / FIST[s].length), near = BODY[s].filter(i => [0, 1, 2].every(k => Math.abs(p[i * 3 + k] - c[k]) < .2));
  let depth = 0;
  for (const i of FIST[s]) {
    let bd = .0025, bi = -1; for (const k of near) { const d = (p[i * 3] - p[k * 3]) ** 2 + (p[i * 3 + 1] - p[k * 3 + 1]) ** 2 + (p[i * 3 + 2] - p[k * 3 + 2]) ** 2; if (d < bd) { bd = d; bi = k; } }
    if (bi >= 0) depth = Math.max(depth, -[0, 1, 2].reduce((sum, k) => sum + (p[i * 3 + k] - p[bi * 3 + k]) * nor[bi * 3 + k], 0));
  }
  return depth;
}
const edge = (p, a, c) => Math.hypot(p[a * 3] - p[c * 3], p[a * 3 + 1] - p[c * 3 + 1], p[a * 3 + 2] - p[c * 3 + 2]);
// Breathing in the bind pose: the front of the ribcage moves out, the back barely.
f.grip([0, 0]); f.breathe(-1); const out = skinned(); f.breathe(1); const inn = skinned(); f.breathe(0); const rest = skinned();
let front = 0, back = 0; for (let i = 0; i < count; i++) { const y = rest[i * 3 + 1], z = rest[i * 3 + 2]; if (Math.abs(rest[i * 3]) < .1 && y > 1.1 && y < 1.3) { const d = inn[i * 3 + 2] - out[i * 3 + 2]; if (z > .06) front = Math.max(front, d); if (z < -.1) back = Math.max(back, -d); } }
assert.ok(front > .012 && front < .05, `chest rises ${front}`); assert.ok(back < front / 2, `back stays ${back}`);
// The rest pose stands 1.75 m tall on the floor.
let lo = Infinity, hi = -Infinity; for (let i = 1; i < rest.length; i += 3) { lo = Math.min(lo, rest[i]); hi = Math.max(hi, rest[i]); }
assert.ok(Math.abs(lo) < .01 && Math.abs(hi - 1.75) < .01, `height ${lo}..${hi}`);
const update = retarget(f, m, 1), digits = ['index', 'middle', 'ring', 'pinky'];
// Held poses and every key, then frames between them.
const poses = [['stance', STANCE, true], ['guard', GUARD, true]];
for (const [name, move] of Object.entries(MOVES)) { for (const [t, p] of move.keys) poses.push([name + '@' + t, p, true]); for (let i = 0; i <= 12; i++) poses.push([name + i, sample(move.keys, move.dur * i / 12), false]); }
let worst = 0, deepKey = 0, deep = 0;
for (const [name, pose, key] of poses) {
  m.pose(pose); update(); f.grip(pose.g); const p = skinned();
  // Fists rest against the face or body but never sink into it: none at a key, at most
  // a brief brush (skin and cloth) while the body turns between keys.
  for (const s of ['L', 'R']) { const d = sunk(p, s); if (key) { deepKey = Math.max(deepKey, d); assert.ok(d < .006, `${name} ${s} fist ${d} m inside the body`); } else { deep = Math.max(deep, d); assert.ok(d < .02, `${name} ${s} fist ${d} m inside the body`); } }
  for (let i = 0; i < p.length; i += 3) { assert.ok(Number.isFinite(p[i]) && Number.isFinite(p[i + 1]) && Number.isFinite(p[i + 2]), name); assert.ok(Math.abs(p[i]) < 3 && Math.abs(p[i + 2]) < 3 && p[i + 1] > -.1 && p[i + 1] < 2.3, name); }
  // No skin tears: every edge stays within a sane stretch of its rest length
  // (the most is the groin in the head kick and the point of a tightly bent elbow).
  for (let k = 0; k < index.length; k += 3) for (const [a, c] of [[index[k], index[k + 1]], [index[k + 1], index[k + 2]], [index[k + 2], index[k]]]) { const r = edge(rest, a, c); if (r > .004) worst = Math.max(worst, edge(p, a, c) / r); }
  for (const s of ['L', 'R']) {
    const hand = w(f.bone('hand' + s)), fore = w(f.bone('forearm' + s)), mcp = w(f.bone('f_middle01' + s));
    // The wrist stays straight: knuckles carry on the line of the forearm.
    assert.ok(mcp.clone().sub(hand).angleTo(hand.clone().sub(fore)) < .35, `${name} ${s} wrist bent`);
    // Closed hands are fists: every fingertip joint folds back to the palm.
    const shut = pose.g[s === 'L' ? 0 : 1] > .99, open = pose.g[s === 'L' ? 0 : 1] < .01;
    for (const d of digits) { const dip = w(f.bone(`f_${d}03${s}`)).distanceTo(hand); if (shut) assert.ok(dip < .1, `${name} ${s} ${d} open ${dip}`); if (open) assert.ok(dip > .13, `${name} ${s} ${d} shut ${dip}`); }
  }
}
assert.ok(worst < 3.2, `skin stretched ${worst}x`);
// The rear fist rests beside the jaw, as in the reference photo, in plain sight.
m.pose(STANCE); update(); f.grip(STANCE.g); { const p = skinned(), jaw = w(f.bone('head')), c = [0, 1, 2].map(k => FIST.R.reduce((sum, i) => sum + p[i * 3 + k], 0) / FIST.R.length);
  const d = Math.hypot(c[0] - jaw.x, c[2] - jaw.z); assert.ok(d > .1 && d < .2 && c[1] > jaw.y - .12 && c[1] < jaw.y + .05, `rear fist ${c} vs jaw ${jaw.toArray()}`); }
console.log(`Validated ${poses.length} fighting poses (stretch ${worst.toFixed(2)}x, fists in ${(deepKey * 100).toFixed(1)}/${(deep * 100).toFixed(1)} cm, breath ${(front * 100).toFixed(1)} cm)`);
