// Pack the fighter: the Universal Animation Library 2 mannequin (Quaternius,
// CC0) with its combat clips, plus idle and locomotion from kids-mocap.glb
// (UAL1, the same rig with Rigify-style names). Root motion is kept on the
// `root` bone; the game reads it and moves the fighter.
//   node scripts/build-fighter.mjs UAL2_Standard_RM.glb assets/models/kids-mocap.glb assets/models/fighter.glb
import { readFileSync, writeFileSync } from 'node:fs';
const [ual2, ual1, out] = process.argv.slice(2);
if (!out) { console.error('usage: build-fighter.mjs UAL2_Standard_RM.glb kids-mocap.glb out.glb'); process.exit(1); }

const CLIPS = {
  ual2: ['Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C', 'Sword_Regular_Combo', 'Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Block',
    'Melee_Hook', 'Melee_Hook_Rec', 'OverhandThrow', 'Shield_OneShot', 'Shield_Dash', 'Idle_Shield_Loop', 'Idle_Shield_Break', 'Zombie_Scratch',
    'Slide_Start', 'Slide_Loop', 'Slide_Exit', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'Hit_Knockback', 'LayToIdle'],
  ual1: ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop']
};
// UAL1 bone names to UAL2's.
const SIDE = { L: 'l', R: 'r' }, FING = { f_index: 'index', f_middle: 'middle', f_pinky: 'pinky', f_ring: 'ring', thumb: 'thumb' };
const BODY = { hips: 'pelvis', 'spine.001': 'spine_01', 'spine.002': 'spine_02', 'spine.003': 'spine_03', neck: 'neck_01', head: 'Head' };
const LIMB = { shoulder: 'clavicle', upper_arm: 'upperarm', forearm: 'lowerarm', hand: 'hand', thigh: 'thigh', shin: 'calf', foot: 'foot', toe: 'ball' };
function rename(n) {
  if (!n.startsWith('DEF-')) return n; n = n.slice(4);
  if (BODY[n]) return BODY[n];
  const [base, s] = [n.slice(0, -2), SIDE[n.at(-1)]], f = base.match(/^(\w+)\.0(\d)$/);
  return f ? `${FING[f[1]]}_0${f[2]}_${s}` : `${LIMB[base]}_${s}`;
}

function parse(file) {
  const b = readFileSync(file), n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n)), bin = b.subarray(28 + n, 28 + n + b.readUInt32LE(20 + n));
  const W = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, C = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const read = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], Type = C[a.componentType], w = W[a.type], s = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride, size = w * Type.BYTES_PER_ELEMENT;
    if (stride && stride !== size) throw new Error('interleaved accessor');
    return { a, data: new Type(bin.buffer.slice(bin.byteOffset + s, bin.byteOffset + s + a.count * size)), w }; };
  return { json, read };
}
const A = parse(ual2), B = parse(ual1);

// Output buffer
const chunks = [], views = [], accessors = []; let length = 0;
function push(data, target) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength); chunks.push(bytes); views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, ...(target ? { target } : {}) });
  length += bytes.length; const pad = (4 - length % 4) % 4; if (pad) { chunks.push(new Uint8Array(pad)); length += pad; } return views.length - 1;
}
function accessor(data, type, extra = {}, target) {
  const C = { Uint8Array: 5121, Uint16Array: 5123, Uint32Array: 5125, Float32Array: 5126 }, w = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
  const o = { bufferView: push(data, target), componentType: C[data.constructor.name], count: data.length / w, type, ...extra };
  // Bounds: required on POSITION, and on animation inputs.
  if ((type === 'SCALAR' && data instanceof Float32Array) || extra.bounds) { delete o.bounds; o.min = Array(w).fill(Infinity); o.max = Array(w).fill(-Infinity); data.forEach((v, i) => { o.min[i % w] = Math.min(o.min[i % w], v); o.max[i % w] = Math.max(o.max[i % w], v); }); }
  accessors.push(o); return accessors.length - 1;
}
const copy = (r, i, target, extra = {}) => { const { a, data } = r.read(i); return accessor(data, a.type, { ...(a.normalized ? { normalized: true } : {}), ...extra }, target); };

// Scene: Armature > root bone tree + the mannequin mesh.
const j = A.json, nodes = j.nodes.map(n => { const o = { ...n }; delete o.extensions; return o; });
const skin = j.skins[0], joints = skin.joints, nameOf = i => nodes[i].name, index = Object.fromEntries(nodes.map((n, i) => [n.name, i]));
const prims = j.meshes[0].primitives.map(p => ({
  attributes: { POSITION: copy(A, p.attributes.POSITION, 34962, { bounds: true }), NORMAL: copy(A, p.attributes.NORMAL, 34962), JOINTS_0: copy(A, p.attributes.JOINTS_0, 34962), WEIGHTS_0: copy(A, p.attributes.WEIGHTS_0, 34962) },
  indices: copy(A, p.indices, 34963), material: p.material
}));
const ibm = copy(A, skin.inverseBindMatrices);

// Animations: rotations of every non-leaf bone, translations of root (root
// motion) and pelvis only. Channels that never leave rest are dropped.
const rest = i => ({ rotation: nodes[i].rotation ?? [0, 0, 0, 1], translation: nodes[i].translation ?? [0, 0, 0] });
const animations = [], inputs = new Map();
function clip(src, name, map) {
  const an = src.json.animations.find(a => a.name === name); if (!an) throw new Error('missing clip ' + name);
  const channels = [], samplers = [];
  for (const c of an.channels) {
    const path = c.target.path, bone = map(src.json.nodes[c.target.node].name), node = index[bone];
    if (node === undefined) throw new Error(`${name}: no bone ${bone}`);
    if (path === 'scale' || bone.includes('leaf') || (path === 'translation' && bone !== 'root' && bone !== 'pelvis')) continue;
    const s = an.samplers[c.sampler], { data: out } = src.read(s.output), r = rest(node)[path], w = r.length;
    let still = true; for (let i = 0; i < out.length && still; i++) still = Math.abs(out[i] - r[i % w]) < 1e-4;
    // Quaternions may flip sign and still mean rest.
    if (!still && path === 'rotation') { still = true; for (let i = 0; i < out.length && still; i += 4) still = Math.abs(Math.abs(out[i] * r[0] + out[i + 1] * r[1] + out[i + 2] * r[2] + out[i + 3] * r[3]) - 1) < 1e-6; }
    if (still && !(bone === 'root' && path === 'translation')) continue;
    const key = src === A ? 'a' + s.input : 'b' + s.input;
    if (!inputs.has(key)) inputs.set(key, copy(src, s.input));
    samplers.push({ input: inputs.get(key), output: accessor(new Float32Array(out), path === 'rotation' ? 'VEC4' : 'VEC3'), interpolation: s.interpolation ?? 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  }
  animations.push({ name, channels, samplers });
}
for (const n of CLIPS.ual2) clip(A, n, x => x);
for (const n of CLIPS.ual1) clip(B, n, rename);

const json = {
  asset: { version: '2.0', generator: 'project-high-school build-fighter.mjs', copyright: 'Mannequin and animations: Universal Animation Library 1 & 2 by Quaternius, CC0' },
  extras: { source: 'Universal Animation Library 2 [Standard] (UAL2_Standard_RM.glb) + kids-mocap.glb (UAL1)', clips: [...CLIPS.ual2, ...CLIPS.ual1] },
  scene: 0, scenes: [{ nodes: j.scenes[0].nodes }], nodes: nodes.map(n => { if (n.mesh !== undefined) { n.mesh = 0; n.skin = 0; } return n; }),
  meshes: [{ name: 'Mannequin', primitives: prims }], materials: j.materials.map(m => ({ name: m.name, pbrMetallicRoughness: { baseColorFactor: m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } })),
  skins: [{ inverseBindMatrices: ibm, joints, skeleton: skin.skeleton ?? joints[0] }], animations, accessors, bufferViews: views, buffers: [{ byteLength: length }]
};
const bin = Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength))), text = Buffer.from(JSON.stringify(json));
const tpad = Buffer.alloc((4 - text.length % 4) % 4, 0x20), jsonChunk = Buffer.concat([text, tpad]);
const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(out, Buffer.concat([head, jh, jsonChunk, bh, bin]));
console.log(`${out}: ${animations.length} clips, ${(12 + 16 + jsonChunk.length + bin.length) / 1024 | 0} KiB, joints ${joints.length} (${joints.map(nameOf).slice(0, 3).join(', ')}…)`);
