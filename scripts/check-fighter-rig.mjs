// Validate the actual Three.js rig without WebGL. Canvas drawing is stubbed;
// geometry, GLTFLoader, bone fitting, IK and skinning use the game's real code.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const canvas = () => { const c = { width: 64, height: 64 }, noop = () => {}; c.getContext = () => new Proxy({ canvas: c, createRadialGradient: () => ({ addColorStop: noop }), getImageData: () => ({ data: new Uint8ClampedArray([210, 159, 113, 255]) }), measureText: () => ({ width: 1 }) }, { get: (o, k) => k in o ? o[k] : noop }); return c; };
globalThis.ProgressEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
globalThis.document = { createElement: canvas }; globalThis.self = {};
const T = await import('three'), { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { loadRig, createActor } = await import('../src/actor.js'), { createMannequin } = await import('../src/mannequin.js'), { retarget } = await import('../src/retarget.js'), { STANCE, MOVES, GUARD } = await import('../src/brawler.js'), { sample } = await import('../src/keyframes.js');
async function parse(file) {
  const b = readFileSync(new URL('../assets/models/' + file, import.meta.url)), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n));
  j.buffers[0].uri = 'data:application/octet-stream;base64,' + b.subarray(28 + n).toString('base64'); delete j.images; delete j.textures;
  for (const m of j.materials ?? []) if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture;
  return new GLTFLoader().parseAsync(JSON.stringify(j), '');
}
const rig = await loadRig(undefined, () => parse('kids-mocap.glb')), model = await parse('amir-fighter.glb'), scene = new T.Scene(), m = createMannequin(scene), a = createActor(scene, 0, 0, 'amir', rig, model), update = retarget(a, m, 1.17);
assert.equal(a.fighterReady, true); assert.equal(a.fists, undefined);
for (const s of ['L', 'R']) assert.ok(Math.abs(a.bone('hand' + s).scale.x - 1) < 1e-10);
const poses = [['stance', STANCE], ['guard', GUARD], ['jab', sample(MOVES.jab.keys, .1)], ['kick', sample(MOVES.roundhouse.keys, .3)]];
for (const [name, move] of Object.entries(MOVES)) for (let i = 0; i <= 12; i++) poses.push([name + i, sample(move.keys, move.dur * i / 12)]);
const output = {}, v = new T.Vector3();
for (const [name, pose] of poses) {
  m.pose(pose); update(); scene.updateMatrixWorld(true); a.figure.skeleton.update(); const points = [], capture = ['stance', 'guard', 'jab', 'kick'].includes(name);
  for (let i = 0; i < a.figure.geometry.attributes.position.count; i++) { a.figure.getVertexPosition(i, v).applyMatrix4(a.figure.matrixWorld); assert.ok(v.toArray().every(Number.isFinite)); assert.ok(Math.abs(v.x) < 3 && Math.abs(v.z) < 3 && v.y > -.25 && v.y < 3, name); if (capture) points.push(v.toArray()); }
  if (['stance', 'guard', 'jab', 'kick'].includes(name)) output[name] = { vertices: points, extras: [] };
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(output));
console.log(`Validated ${poses.length} fighting poses`);
