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
const edge = (p, a, c) => Math.hypot(p[a * 3] - p[c * 3], p[a * 3 + 1] - p[c * 3 + 1], p[a * 3 + 2] - p[c * 3 + 2]);
// Breathing in the bind pose: the front of the ribcage moves out, the back barely.
f.grip([0, 0]); f.breathe(-1); const out = skinned(); f.breathe(1); const inn = skinned(); f.breathe(0); const rest = skinned();
let front = 0, back = 0; for (let i = 0; i < count; i++) { const y = rest[i * 3 + 1], z = rest[i * 3 + 2]; if (Math.abs(rest[i * 3]) < .1 && y > 1.1 && y < 1.3) { const d = inn[i * 3 + 2] - out[i * 3 + 2]; if (z > .06) front = Math.max(front, d); if (z < -.1) back = Math.max(back, -d); } }
assert.ok(front > .012 && front < .05, `chest rises ${front}`); assert.ok(back < front / 2, `back stays ${back}`);
// The rest pose stands 1.75 m tall on the floor.
let lo = Infinity, hi = -Infinity; for (let i = 1; i < rest.length; i += 3) { lo = Math.min(lo, rest[i]); hi = Math.max(hi, rest[i]); }
assert.ok(Math.abs(lo) < .01 && Math.abs(hi - 1.75) < .01, `height ${lo}..${hi}`);
const update = retarget(f, m, 1), digits = ['index', 'middle', 'ring', 'pinky'];
const poses = [['stance', STANCE], ['guard', GUARD]];
for (const [name, move] of Object.entries(MOVES)) for (let i = 0; i <= 12; i++) poses.push([name + i, sample(move.keys, move.dur * i / 12)]);
let worst = 0;
for (const [name, pose] of poses) {
  m.pose(pose); update(); f.grip(pose.g); const p = skinned();
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
console.log(`Validated ${poses.length} fighting poses (stretch ${worst.toFixed(2)}x, breath ${(front * 100).toFixed(1)} cm)`);
