import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const b = readFileSync(new URL('../assets/models/jai-fighter.glb', import.meta.url)), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n)), bin = b.subarray(28 + n);
const read = i => { const a = j.accessors[i], v = j.bufferViews[a.bufferView], Type = { 5121: Uint8Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType], width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], start = (v.byteOffset || 0) + (a.byteOffset || 0); return new Type(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * width * Type.BYTES_PER_ELEMENT)); };
const p = j.meshes[0].primitives[0], bones = j.extras.bones;

test('Jai has every joint: spine, neck, head, limbs to the toes, three per finger, and breathing bones', () => {
  const need = ['hips', 'spine001', 'spine002', 'spine003', 'neck', 'head', 'ribs', 'belly'];
  for (const s of ['L', 'R']) {
    need.push(...['shoulder', 'upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe'].map(k => k + s));
    for (const d of ['f_index', 'f_middle', 'f_ring', 'f_pinky', 'thumb']) for (const k of [1, 2, 3]) need.push(`${d}0${k}${s}`);
  }
  assert.deepEqual([...bones].sort(), need.sort());
  // Each phalanx hangs from the one before it, and the first from the hand.
  for (const s of ['L', 'R']) for (const d of ['f_index', 'f_middle', 'f_ring', 'f_pinky', 'thumb']) {
    assert.equal(j.extras.parents[`${d}01${s}`], 'hand' + s);
    for (const k of [2, 3]) assert.equal(j.extras.parents[`${d}0${k}${s}`], `${d}0${k - 1}${s}`);
  }
  assert.equal(j.extras.parents.ribs, 'spine003'); assert.equal(j.extras.parents.belly, 'spine001');
});

test('Jai GLB is compact with a standard skin, normalised weights and every bone in use', () => {
  assert.equal(b.readUInt32LE(8), b.length); assert.ok(b.length < 1024 * 1024);
  const idx = read(p.indices); assert.ok(idx.length / 3 < 12500);
  assert.equal(j.extras.fighterReady, true); assert.equal(j.skins[0].joints.length, bones.length);
  for (const [i, name] of bones.entries()) assert.equal(j.nodes[j.skins[0].joints[i]].name, 'DEF-' + name);
  const pos = read(p.attributes.POSITION), ji = read(p.attributes.JOINTS_0), w = read(p.attributes.WEIGHTS_0), uv = read(p.attributes.TEXCOORD_0), used = new Float64Array(bones.length);
  for (let i = 0; i < w.length; i += 4) { let sum = 0; for (let k = 0; k < 4; k++) { assert.ok(ji[i + k] < bones.length && w[i + k] >= 0); sum += w[i + k]; used[ji[i + k]] += w[i + k]; } assert.ok(Math.abs(sum - 1) < 1e-5); }
  for (const [k, name] of bones.entries()) assert.ok(used[k] > 1, name + ' moves no skin');
  for (const v of pos) assert.ok(Number.isFinite(v)); for (const v of uv) assert.ok(v >= 0 && v <= 1); for (const v of idx) assert.ok(v < pos.length / 3);
});

test('surfaces face outward: smooth normals agree with the winding', () => {
  const pos = read(p.attributes.POSITION), nor = read(p.attributes.NORMAL), idx = read(p.indices);
  let bad = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, c, d] = [idx[t], idx[t + 1], idx[t + 2]], u = [0, 1, 2].map(k => pos[c * 3 + k] - pos[a * 3 + k]), v = [0, 1, 2].map(k => pos[d * 3 + k] - pos[a * 3 + k]);
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if ([a, c, d].reduce((s, i) => s + f[0] * nor[i * 3] + f[1] * nor[i * 3 + 1] + f[2] * nor[i * 3 + 2], 0) <= 0) bad++;
  }
  assert.ok(bad / (idx.length / 3) < .005, `${bad} triangles face inward`);
});

test('fists: every digit has a closing turn, and the right hand mirrors the left', () => {
  const grip = j.extras.grip;
  for (const s of ['L', 'R']) for (const d of ['f_index', 'f_middle', 'f_ring', 'f_pinky', 'thumb']) for (const k of [1, 2, 3]) assert.ok(grip[`${d}0${k}${s}`], `${d}0${k}${s}`);
  for (const [name, [x, y, z, a]] of Object.entries(grip)) {
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-6 && a >= 0 && a < Math.PI, name);
    if (name.endsWith('L')) { const r = grip[name.slice(0, -1) + 'R']; for (const [k, v] of [x, -y, -z, a].entries()) assert.ok(Math.abs(r[k] - v) < 1e-9, name); }
  }
});
