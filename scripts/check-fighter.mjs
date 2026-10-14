// Check fighter.glb with the game's real Three.js code, without WebGL: every
// clip the rules use is there at its length, and in every hit window the
// striking part is out in front of the fighter at a height it could hit.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
globalThis.self = {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const T = await import('three'), { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { createFighter, PARTS } = await import('../src/fighter.js'), { CLIPS, MOVES, REACT } = await import('../src/brawler.js');
const b = readFileSync(new URL('../assets/models/fighter.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '');
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
console.log(`Checked ${Object.keys(CLIPS).length} clips and ${checked} poses`);
