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
test('both hands are closed, outward-facing palms, fingers and thumbs on the finger bones', () => {
  const { json: j, read, p } = model, pos = read(p.attributes.POSITION), index = read(p.indices), joints = read(p.attributes.JOINTS_0), normals = read(p.attributes.NORMAL), bones = j.extras.bones;
  const parents = Uint32Array.from({ length: pos.length / 3 }, (_, i) => i), groups = new Map();
  const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  for (let i = 0; i < index.length; i += 3) { const root = find(index[i]); parents[find(index[i + 1])] = root; parents[find(index[i + 2])] = root; }
  for (let i = 0; i < index.length; i += 3) { const root = find(index[i]); if (!groups.has(root)) groups.set(root, []); groups.get(root).push([...index.subarray(i, i + 3)]); }
  for (const side of ['L', 'R']) {
    const hand = new Set(['hand', ...['thumb', 'f_index', 'f_middle', 'f_ring', 'f_pinky'].flatMap(f => [1, 2, 3].map(k => f + '0' + k))].map(n => bones.indexOf(n + side)));
    let pieces = 0; const seen = new Set();
    for (const faces of groups.values()) {
      const ids = [...new Set(faces.flat())];
      if (ids.length > 150 || !ids.every(i => hand.has(joints[i * 4]))) continue;
      ids.forEach(i => seen.add(joints[i * 4]));
      const centre = [0, 1, 2].map(k => ids.reduce((sum, i) => sum + pos[i * 3 + k], 0) / ids.length);
      for (const [a, b, c] of faces) {
        const u = [0, 1, 2].map(k => pos[b * 3 + k] - pos[a * 3 + k]), v = [0, 1, 2].map(k => pos[c * 3 + k] - pos[a * 3 + k]);
        const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        assert.ok(normal.reduce((sum, n, k) => sum + n * (pos[a * 3 + k] - centre[k]), 0) > 0, side + ' hand surface faces inward');
        for (const i of [a, b, c]) assert.ok(normal.reduce((sum, n, k) => sum + n * normals[i * 3 + k], 0) > 0, side + ' hand normal disagrees with face');
      }
      pieces++;
    }
    assert.equal(pieces, 6, side + ' hand should be a palm, four fingers and a thumb');
    assert.deepEqual([...hand].filter(b => !seen.has(b)), [], side + ' hand bone without a phalanx');
  }
});
test('fighter GLB is compact, fully weighted, and has a standard compatible skin', () => {
  const { json: j, read, p } = model;
  assert.ok(model.bytes < 1024 * 1024); assert.ok(read(p.indices).length / 3 < 12500);
  // The game rig's bones come first, then three finger joints per digit. Arm
  // joints move out with the broader shoulders; every other joint stays put.
  assert.deepEqual(j.extras.bones.slice(0, old.json.extras.bones.length), old.json.extras.bones); assert.equal(j.extras.bones.length, old.json.extras.bones.length + 30);
  for (const [name, at] of Object.entries(old.json.extras.joints)) {
    const moved = /^(upper_arm|forearm|hand|handTip)[LR]$/.test(name) ? (name.endsWith('L') ? .026 : -.026) : 0;
    assert.ok(Math.abs(j.extras.joints[name][0] - at[0] - moved) < 1e-4 && Math.abs(j.extras.joints[name][1] - at[1]) < 1e-4 && Math.abs(j.extras.joints[name][2] - at[2]) < 1e-4, name);
  }
  for (const name of j.extras.bones) assert.ok(j.extras.joints[name], name);
  assert.equal(j.extras.refinement.backpack, false);
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
test('game rig survives every fighting keyframe; fists close and open hands open', () => {
  const r = spawnSync(process.execPath, ['--no-warnings', '--loader', new URL('../scripts/node-three-loader.mjs', import.meta.url).pathname, new URL('../scripts/check-fighter-rig.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /Validated \d+ fighting poses/);
});
