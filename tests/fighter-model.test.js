import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { UAL } from '../src/brawler.js';
const b = readFileSync(new URL('../assets/models/fighter.glb', import.meta.url)), n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n));
test('fighter GLB is one compact skinned mannequin with every library clip the game and sword.js use', () => {
  assert.equal(b.readUInt32LE(8), b.length); assert.ok(b.length < 2 * 1024 * 1024, 'under 2 MiB for phones');
  assert.equal(json.meshes.length, 1); assert.equal(json.skins.length, 1);
  const tris = json.meshes[0].primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0); assert.ok(tris < 14000, `${tris} triangles`);
  const joints = json.skins[0].joints.map(i => json.nodes[i].name);
  for (const bone of ['root', 'pelvis', 'spine_03', 'Head', 'hand_r', 'hand_l', 'ball_r', 'ball_l', 'calf_l', 'foot_r']) assert.ok(joints.includes(bone), bone);
  assert.deepEqual(json.animations.map(a => a.name).sort(), Object.keys(UAL).sort());
  for (const a of json.animations) assert.ok(a.channels.some(c => json.nodes[c.target.node].name === 'root' && c.target.path === 'translation'), a.name + ' keeps root motion');
});
test('street clips bake, and game code poses every move on the mannequin and on Jai\'s model', () => {
  const r = spawnSync(process.execPath, ['--no-warnings', '--loader', new URL('../scripts/node-three-loader.mjs', import.meta.url).pathname, new URL('../scripts/check-fighter.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /Checked \d+ clips and \d+ poses/);
});
