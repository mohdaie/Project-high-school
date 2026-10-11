// Prepares an image-to-3D character (e.g. a TRELLIS.2 export) for the game:
// stands it 1.5 m tall on the ground, adds smooth normals, and weights every
// vertex to the motion-capture skeleton's bones by distance *along the
// surface*, so a hand hanging beside a cargo pocket does not drag the pocket.
// Writes a GLB whose JOINTS_0 index into `extras.bones`, with the fitted
// joint positions in `extras.joints` (metres). actor.js fits the skeleton to
// those joints and binds the mesh at runtime.
//
//   node scripts/bake-model.mjs in.glb out.glb joints.json [texture.jpg]
//
// joints.json gives each joint in the source model's own units (read off an
// orthographic front/side render): hips, spine001..003, neck, head, headTop,
// and for L (+x, the character's left) shoulder, upper_arm, forearm, hand,
// handTip, thigh, shin, foot, toe, toeTip. R is mirrored.
import { readFile, writeFile } from 'node:fs/promises';

const [input, output, jointsFile, textureFile] = process.argv.slice(2);
let HEIGHT = 1.5;

// ---- GLB in ----
const glb = await readFile(input);
const jsonLength = glb.readUInt32LE(12), gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
const binStart = 20 + jsonLength + 8, bin = glb.subarray(binStart);
const accessor = i => {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView], size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const offset = (v.byteOffset || 0) + (a.byteOffset || 0);
  return { data: new Type(bin.buffer.slice(bin.byteOffset + offset, bin.byteOffset + offset + a.count * size * Type.BYTES_PER_ELEMENT)), size, count: a.count };
};
const prim = gltf.meshes[0].primitives[0];
const src = accessor(prim.attributes.POSITION).data, uv = accessor(prim.attributes.TEXCOORD_0).data, index = Uint32Array.from(accessor(prim.indices).data);
const image = gltf.images[gltf.textures[gltf.materials[prim.material].pbrMetallicRoughness.baseColorTexture.index].source];
const imageView = gltf.bufferViews[image.bufferView];
let texture = { bytes: bin.subarray(imageView.byteOffset || 0, (imageView.byteOffset || 0) + imageView.byteLength), mime: image.mimeType };
if (textureFile) texture = { bytes: await readFile(textureFile), mime: textureFile.endsWith('.png') ? 'image/png' : 'image/jpeg' };

// ---- Stand it on the ground at its height (1.5 m unless the joints file sets one) ----
const J = JSON.parse(await readFile(jointsFile, 'utf8'));
if (J.height) { HEIGHT = J.height; delete J.height; }
const n = src.length / 3;
let minY = Infinity, maxY = -Infinity; for (let i = 0; i < n; i++) { minY = Math.min(minY, src[i * 3 + 1]); maxY = Math.max(maxY, src[i * 3 + 1]); }
const scale = HEIGHT / (maxY - minY), place = ([x, y, z]) => [x * scale, (y - minY) * scale, z * scale];
const pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const p = place([src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]); pos.set(p, i * 3); }

// ---- Joints (metres) and the bone segments they define ----
const joints = {};
for (const [name, p] of Object.entries(J)) {
  if (name.endsWith('L')) { joints[name] = place(p); joints[name.slice(0, -1) + 'R'] = place([-p[0], p[1], p[2]]); }
  else joints[name] = place(p);
}
const BONES = ['hips', 'spine001', 'spine002', 'spine003', 'neck', 'head', ...['L', 'R'].flatMap(s => ['shoulder', 'upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe'].map(b => b + s))];
const tail = { hips: 'spine001', spine001: 'spine002', spine002: 'spine003', spine003: 'neck', neck: 'head', head: 'headTop' };
for (const s of ['L', 'R']) Object.assign(tail, { ['shoulder' + s]: 'upper_arm' + s, ['upper_arm' + s]: 'forearm' + s, ['forearm' + s]: 'hand' + s, ['hand' + s]: 'handTip' + s, ['thigh' + s]: 'shin' + s, ['shin' + s]: 'foot' + s, ['foot' + s]: 'toe' + s, ['toe' + s]: 'toeTip' + s });
const parent = { spine001: 'hips', spine002: 'spine001', spine003: 'spine002', neck: 'spine003', head: 'neck' };
for (const s of ['L', 'R']) Object.assign(parent, { ['shoulder' + s]: 'spine003', ['upper_arm' + s]: 'shoulder' + s, ['forearm' + s]: 'upper_arm' + s, ['hand' + s]: 'forearm' + s, ['thigh' + s]: 'hips', ['shin' + s]: 'thigh' + s, ['foot' + s]: 'shin' + s, ['toe' + s]: 'foot' + s });
const segment = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
};

// ---- Weld coincident vertices (UV seams) into one surface graph ----
const key = new Map(), weld = new Int32Array(n), wpos = [];
for (let i = 0; i < n; i++) { const k = [0, 1, 2].map(j => Math.round(pos[i * 3 + j] * 4000)).join(','); if (!key.has(k)) { key.set(k, key.size); wpos.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]); } weld[i] = key.get(k); }
const m = wpos.length, adjacency = Array.from({ length: m }, () => new Map());
for (let t = 0; t < index.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
  const u = weld[index[t + a]], v = weld[index[t + b]]; if (u === v) continue;
  const d = Math.hypot(wpos[u][0] - wpos[v][0], wpos[u][1] - wpos[v][1], wpos[u][2] - wpos[v][2]);
  adjacency[u].set(v, d); adjacency[v].set(u, d);
}

// ---- Seeds: each vertex's nearest bone, keeping only each bone's largest
// connected patch (strays across a gap, like pocket cloth beside a hand, drop out) ----
// Each vertex first picks a part: the head above the neck; otherwise the
// nearest of the torso and the four limbs, measured against each part's
// thickness (metres) so a wide chest belongs to the torso rather than to the
// arm hanging beside it, and nothing below the crotch belongs to the torso.
// Within the torso the spine bones take height bands; within a limb, the
// nearest of its bones.
const LIMBS = { armL: ['shoulderL', 'upper_armL', 'forearmL', 'handL'], armR: ['shoulderR', 'upper_armR', 'forearmR', 'handR'], legL: ['thighL', 'shinL', 'footL', 'toeL'], legR: ['thighR', 'shinR', 'footR', 'toeR'] };
const THICK = { arm: .05, leg: .095, torso: .17 };
const spineBand = y => y < joints.spine001[1] ? 'hips' : y < joints.spine002[1] ? 'spine001' : y < joints.spine003[1] ? 'spine002' : y < joints.neck[1] ? 'spine003' : 'neck';
const crotch = (joints.thighL[1] + joints.thighR[1]) / 2 - .03;
const nearest = new Int32Array(m);
for (let i = 0; i < m; i++) {
  const p = wpos[i];
  if (p[1] > joints.neck[1] + .015) { nearest[i] = BONES.indexOf(p[1] < joints.head[1] ? 'neck' : 'head'); continue; }
  // Below the crotch only what hangs well behind the hips (a bag's bottle,
  // the bottom of a backpack) may stay with the torso.
  const behind = p[2] < joints.hips[2] - .15;
  let part = 'torso', best = p[1] < crotch && !behind ? Infinity : segment(p, [joints.hips[0], joints.hips[1] - .05, joints.hips[2]], joints.neck) / THICK.torso;
  for (const [limb, bones] of Object.entries(LIMBS)) for (const b of bones) { const d = segment(p, joints[b], joints[tail[b]]) / THICK[limb.slice(0, 3)]; if (d < best) { best = d; part = limb; } }
  if (part === 'torso') { nearest[i] = BONES.indexOf(spineBand(p[1])); continue; }
  let close = Infinity; for (const b of LIMBS[part]) { const d = segment(p, joints[b], joints[tail[b]]); if (d < close) { close = d; nearest[i] = BONES.indexOf(b); } }
}
const seed = new Int32Array(m).fill(-1);
BONES.forEach((b, k) => {
  const seen = new Uint8Array(m); let largest = [];
  for (let i = 0; i < m; i++) if (nearest[i] === k && !seen[i]) {
    const patch = [i]; seen[i] = 1;
    for (let q = 0; q < patch.length; q++) for (const v of adjacency[patch[q]].keys()) if (nearest[v] === k && !seen[v]) { seen[v] = 1; patch.push(v); }
    if (patch.length > largest.length) largest = patch;
  }
  for (const i of largest) seed[i] = k;
});

// ---- Geodesic distance from every bone's seed patch (Dijkstra) ----
function dijkstra(sources) {
  const dist = new Float32Array(m).fill(Infinity), heap = [];
  const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  for (const v of sources) { dist[v] = 0; push(0, v); }
  while (heap.length) { const [d, u] = pop(); if (d > dist[u]) continue; for (const [v, w] of adjacency[u]) if (d + w < dist[v]) { dist[v] = d + w; push(d + w, v); } }
  return dist;
}
const geo = BONES.map((b, k) => dijkstra([...Array(m).keys()].filter(i => seed[i] === k)));

// ---- Weights: the surface-nearest bone and its neighbours in the chain,
// falling off with surface distance, then smoothed across the surface ----
const neighbours = BONES.map(b => new Set([b, parent[b], ...BONES.filter(c => parent[c] === b)].filter(Boolean).map(x => BONES.indexOf(x))));
let weights = Array.from({ length: m }, (_, i) => {
  let best = 0; for (let k = 1; k < BONES.length; k++) if (geo[k][i] < geo[best][i]) best = k;
  const w = new Float32Array(BONES.length);
  for (const k of neighbours[best]) { const d = geo[k][i] - geo[best][i]; if (d < .06) w[k] = Math.pow(1 - d / .06, 2) / (geo[k][i] + .01); }
  const sum = w.reduce((a, b) => a + b, 0); return w.map(x => x / sum);
});
for (let pass = 0; pass < 3; pass++) weights = weights.map((w, i) => { const out = w.map(x => x * .5); const nb = [...adjacency[i].keys()]; for (const v of nb) weights[v].forEach((x, k) => { out[k] += x * .5 / nb.length; }); return out; });
const joint4 = new Uint8Array(n * 4), weight4 = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const w = weights[weld[i]], top = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4), sum = top.reduce((s, k) => s + w[k], 0);
  top.forEach((k, j) => { joint4[i * 4 + j] = k; weight4[i * 4 + j] = w[k] / sum; });
}

// ---- Smooth normals over the welded surface ----
const wn = Array.from({ length: m }, () => [0, 0, 0]);
for (let t = 0; t < index.length; t += 3) {
  const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map(v => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const k of [t, t + 1, t + 2]) { const w = wn[weld[index[k]]]; w[0] += f[0]; w[1] += f[1]; w[2] += f[2]; }
}
const normal = new Float32Array(n * 3);
for (let i = 0; i < n; i++) { const w = wn[weld[i]], l = Math.hypot(...w) || 1; normal.set([w[0] / l, w[1] / l, w[2] / l], i * 3); }

// ---- GLB out ----
const chunks = [], views = [], accessors = [];
const pad = b => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]);
let offset = 0;
function add(bytes, target) { const b = pad(Buffer.from(bytes.buffer ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes)); views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, ...(target ? { target } : {}) }); chunks.push(b); offset += b.length; return views.length - 1; }
function attribute(array, type, componentType, extra = {}) { accessors.push({ bufferView: add(array, 34962), componentType, count: n, type, ...extra }); return accessors.length - 1; }
const min = [0, 1, 2].map(j => Math.min(...Array.from({ length: n }, (_, i) => pos[i * 3 + j]))), max = [0, 1, 2].map(j => Math.max(...Array.from({ length: n }, (_, i) => pos[i * 3 + j])));
const attributes = {
  POSITION: attribute(pos, 'VEC3', 5126, { min, max }), NORMAL: attribute(normal, 'VEC3', 5126), TEXCOORD_0: attribute(uv, 'VEC2', 5126),
  JOINTS_0: attribute(joint4, 'VEC4', 5121), WEIGHTS_0: attribute(weight4, 'VEC4', 5126)
};
accessors.push({ bufferView: add(index, 34963), componentType: 5125, count: index.length, type: 'SCALAR' });
const indices = accessors.length - 1, imageViewOut = add(texture.bytes);
const out = {
  asset: { version: '2.0', generator: 'retro-malaysia bake-model.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'character', mesh: 0 }],
  meshes: [{ name: 'character', primitives: [{ attributes, indices, material: 0 }] }],
  materials: [{ name: 'character', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
  textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987 }], images: [{ bufferView: imageViewOut, mimeType: texture.mime }],
  accessors, bufferViews: views, buffers: [{ byteLength: offset }],
  extras: { bones: BONES, joints: Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, v.map(x => +x.toFixed(4))])), height: HEIGHT }
};
// The JSON chunk pads with spaces, the binary chunk with zeros.
let text = JSON.stringify(out); while (Buffer.byteLength(text) % 4) text += ' ';
const jsonChunk = Buffer.from(text), binChunk = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binChunk.length, 0); bh.writeUInt32LE(0x004e4942, 4);
await writeFile(output, Buffer.concat([header, jh, jsonChunk, bh, binChunk]));
const share = BONES.map((b, k) => [b, [...Array(n).keys()].filter(i => joint4[i * 4] === k).length]);
console.log(`${output}: ${n} vertices, ${index.length / 3} triangles, ${(texture.bytes.length / 1024) | 0} KB texture, scale ${scale.toFixed(3)}`);
console.log('vertices led by each bone:', share.map(([b, c]) => `${b} ${c}`).join(', '));
