import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function glb(file) {
  const b = readFileSync(new URL('../assets/models/' + file, import.meta.url)), n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n));
  assert.equal(b.readUInt32LE(8), b.length);
  const bin = b.subarray(28 + n);
  const read = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], Type = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType], width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], start = (v.byteOffset || 0) + (a.byteOffset || 0); return new Type(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * width * Type.BYTES_PER_ELEMENT)); };
  return { json, read, bytes: b.length, p: json.meshes[0].primitives[0] };
}
const old = glb('amir.glb'), model = glb('amir-fighter.glb');
test('fighter GLB is compact, fully weighted, and has a standard compatible skin', () => {
  const { json: j, read, p } = model;
  assert.ok(model.bytes < 1024 * 1024); assert.ok(read(p.indices).length / 3 < 12500);
  assert.deepEqual(j.extras.bones, old.json.extras.bones); assert.deepEqual(j.extras.joints, old.json.extras.joints);
  assert.equal(j.skins[0].joints.length, j.extras.bones.length); assert.equal(j.extras.fighterReady, true);
  for (const [i, name] of j.extras.bones.entries()) assert.equal(j.nodes[j.skins[0].joints[i]].name, 'DEF-' + name);
  const pos = read(p.attributes.POSITION), idx = read(p.attributes.JOINTS_0), weight = read(p.attributes.WEIGHTS_0), uv = read(p.attributes.TEXCOORD_0);
  assert.equal(idx.length, pos.length / 3 * 4);
  for (let i = 0; i < weight.length; i += 4) { let sum = 0; for (let k = 0; k < 4; k++) { assert.ok(idx[i + k] < j.extras.bones.length); assert.ok(Number.isFinite(weight[i + k]) && weight[i + k] >= 0); sum += weight[i + k]; } assert.ok(Math.abs(sum - 1) < .00001); }
  for (const v of pos) assert.ok(Number.isFinite(v)); for (const v of uv) assert.ok(v >= 0 && v <= 1);
  for (const v of read(p.indices)) assert.ok(v < pos.length / 3);
});
test('refinement preserves every head vertex rather than changing Amir’s identity', () => {
  const before = old.read(old.p.attributes.POSITION), after = model.read(model.p.attributes.POSITION), existing = new Set();
  for (let i = 0; i < after.length; i += 3) existing.add(Array.from(after.subarray(i, i + 3)).join(','));
  let count = 0; for (let i = 0; i < before.length; i += 3) if (before[i + 1] > 1.06) { assert.ok(existing.has(Array.from(before.subarray(i, i + 3)).join(','))); count++; }
  assert.ok(count > 1000);
});
test('game rig survives every fighting keyframe without duplicate fists or collapsed wrists', () => {
  const r = spawnSync(process.execPath, ['--no-warnings', '--loader', new URL('../scripts/node-three-loader.mjs', import.meta.url).pathname, new URL('../scripts/check-fighter-rig.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /Validated \d+ fighting poses/);
});
