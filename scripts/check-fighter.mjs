// Check fighter.glb with the game's real Three.js code, without WebGL: every
// clip the rules use is there at its length, and in every hit window the
// striking part is out in front of the fighter at a height it could hit.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const canvas = () => { const c = { width: 64, height: 64 }, noop = () => {}; c.getContext = () => new Proxy({ canvas: c, createRadialGradient: () => ({ addColorStop: noop }), getImageData: () => ({ data: new Uint8ClampedArray([210, 159, 113, 255]) }), measureText: () => ({ width: 1 }) }, { get: (o, k) => k in o ? o[k] : noop }); return c; };
globalThis.ProgressEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
globalThis.self = {}; globalThis.document = { createElement: canvas };
const T = await import('three'), { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { createFighter, PARTS } = await import('../src/fighter.js'), { CLIPS, MOVES, REACT } = await import('../src/brawler.js');
const { wear, modelName } = await import('../src/wear.js'), { loadRig, createActor } = await import('../src/actor.js');
async function parse(file, untextured) {
  const b = readFileSync(new URL('../assets/models/' + file, import.meta.url)), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n));
  j.buffers[0].uri = 'data:application/octet-stream;base64,' + b.subarray(28 + n).toString('base64');
  if (untextured) { delete j.images; delete j.textures; for (const m of j.materials ?? []) if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture; }
  return new GLTFLoader().parseAsync(JSON.stringify(j), '');
}
const gltf = await parse('fighter.glb');
for (const [name, len] of Object.entries(CLIPS)) { const c = gltf.animations.find(a => a.name === name); assert.ok(c, 'missing clip ' + name); assert.ok(Math.abs(c.duration - len) < .002, `${name} lasts ${c.duration}`); }
const fig = createFighter(new T.Scene(), gltf), p = new T.Vector3();
let checked = 0;
for (const [key, m] of Object.entries({ ...MOVES, ...REACT })) {
  const ts = m.hits?.length ? m.hits.map(h => (h.t[0] + h.t[1]) / 2) : [0, m.dur / 2, m.dur];
  for (const t of ts) {
    fig.drive(1, { m, t }); fig.path(m, t, p);
    for (const b of Object.values(fig.model.children[0].children)) b.traverse(o => { if (o.isBone) assert.ok(o.matrixWorld.elements.every(Number.isFinite), key); });
    checked++;
  }
  // The strike part sweeps out in front (+z), at or below head height, at some
  // point in each window.
  for (const h of m.hits ?? []) {
    let best = -9;
    for (let t = h.t[0]; t <= h.t[1]; t += 1 / 60) { fig.drive(1, { m, t }); for (const q of fig.strike(h.part)) if (q.y < 2.1) best = Math.max(best, q.z); }
    assert.ok(best + PARTS[h.part].r > .6, `${key} at ${h.t}: ${h.part} only reaches ${best.toFixed(2)} m forward`);
  }
}
// Jai wears Amir's model: every one of its skin bones follows a mannequin bone,
// and every move keeps the mesh whole and around the fighter.
const amir = await parse('amir-fighter.glb', true), scene = new T.Scene(), jai = createFighter(scene, gltf), actor = createActor(scene, 0, 0, 'amir', await loadRig(undefined, () => parse('kids-mocap.glb')), amir);
const followed = new Set(); jai.model.traverse(o => { if (o.isBone && modelName(o.name)) followed.add(modelName(o.name)); });
for (const n of amir.parser.json.extras.bones) assert.ok(followed.has(n), 'nothing drives ' + n);
wear(jai, actor, 1.17);
const v = new T.Vector3(); let posed = 0;
for (const [key, m] of Object.entries({ ...MOVES, ...REACT })) for (let i = 0; i <= 6; i++) {
  const t = m.dur * i / 6; jai.drive(1, { m, t, prop: m.prop }); actor.figure.skeleton.update();
  for (let k = 0; k < actor.figure.geometry.attributes.position.count; k += 7) { actor.figure.getVertexPosition(k, v).applyMatrix4(actor.figure.matrixWorld); assert.ok(v.toArray().every(Number.isFinite) && Math.abs(v.x) < 3 && Math.abs(v.z) < 3 && v.y > -.3 && v.y < 2.6, `${key} at ${t.toFixed(2)}: Jai's mesh at ${v.toArray().map(x => x.toFixed(2))}`); }
  posed++;
}
const hand = jai.strike('handR', 1, true)[0], wrist = actor.bone('handR').getWorldPosition(new T.Vector3()); assert.ok(hand.distanceTo(wrist) < .2, 'strikes come from Jai\'s own hand');
console.log(`Checked Jai in ${posed} poses`);
console.log(`Checked ${Object.keys(CLIPS).length} clips and ${checked} poses`);
