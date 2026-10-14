import * as T from 'three';
import { toon, outline } from './illustration.js';

// Dress a fighter (fighter.js) in Jai's own model (jai-fighter.glb, rigged in
// Blender by scripts/rig-jai.py). The mannequin keeps playing every clip
// unseen; each of Jai's bones takes its mannequin bone's world turn, with a
// fixed correction from his T-posed bind: Qjai = Qmann · Qmann_rest⁻¹ · B ·
// Qjai_bind, where B turns the bone's bind direction onto the mannequin's rest
// direction. Fingers follow the clips' grips; the hips travel scaled to his
// legs. Hits are judged on the mannequin; kayu, tong and chalk sit in his hands.
const BODY = { pelvis: 'hips', spine_01: 'spine001', spine_02: 'spine002', spine_03: 'spine003', neck_01: 'neck', Head: 'head' };
const LIMB = { clavicle: 'shoulder', upperarm: 'upper_arm', lowerarm: 'forearm', hand: 'hand', thigh: 'thigh', calf: 'shin', foot: 'foot', ball: 'toe' };
const FING = { index: 'f_index', middle: 'f_middle', pinky: 'f_pinky', ring: 'f_ring', thumb: 'thumb' };
// Jai's name for a mannequin bone (UAL2 to the Rigify-style DEF- names).
export function modelName(n) {
  if (BODY[n]) return BODY[n];
  const f = n.match(/^(\w+)_0(\d)_(l|r)$/), l = n.match(/^(\w+)_(l|r)$/);
  if (f && FING[f[1]]) return FING[f[1]] + '0' + f[2] + f[3].toUpperCase();
  return l && LIMB[l[1]] ? LIMB[l[1]] + l[2].toUpperCase() : null;
}
// Which child gives a bone its direction (the hand points down the middle finger).
const AIM = { pelvis: 'spine_01', spine_03: 'neck_01', hand_l: 'middle_01_l', hand_r: 'middle_01_r' };

export function wear(fighter, gltf, scene, scale = 1) {
  const ex = gltf.parser.json.extras, body = gltf.scene, group = new T.Group(); group.add(body); scene.add(group); group.scale.setScalar(scale);
  const figure = body.getObjectByProperty('isSkinnedMesh', true);
  figure.material = toon(0xffffff, { map: figure.material.map }); figure.castShadow = figure.receiveShadow = true; figure.frustumCulled = false; outline(figure, 1.6);
  const jai = n => body.getObjectByName('DEF-' + n), w = o => o.getWorldPosition(new T.Vector3()), wq = o => o.getWorldQuaternion(new T.Quaternion());
  // Both at rest, at the origin, facing +z.
  fighter.group.position.set(0, 0, 0); fighter.group.rotation.set(0, 0, 0); fighter.group.updateMatrixWorld(true);
  figure.skeleton.pose(); group.updateMatrixWorld(true);
  const pairs = [];
  fighter.model.traverse(m => {
    const n = m.isBone && modelName(m.name), j = n && jai(n); if (!j) return;
    const c = AIM[m.name] ? fighter.bone(AIM[m.name]) : m.children.find(k => k.isBone && jai(modelName(k.name) ?? '')), cj = c && jai(modelName(c.name));
    const B = c ? new T.Quaternion().setFromUnitVectors(w(cj).sub(w(j)).normalize(), w(c).sub(w(m)).normalize()) : new T.Quaternion();
    pairs.push({ m, j, rest: wq(m).invert().multiply(B).multiply(wq(j)) });
  });
  // Parents before children, as the traverse found them.
  const hips = jai('hips'), pelvis = fighter.bone('pelvis'), hipsAt = w(hips), pelvisAt = w(pelvis);
  const leg = (a, b, c) => w(a).distanceTo(w(b)) + w(b).distanceTo(w(c)), k = leg(jai('thighL'), jai('shinL'), jai('footL')) / leg(fighter.bone('thigh_l'), fighter.bone('calf_l'), fighter.bone('foot_l'));
  // Sockets: the mannequin hand's frame inside Jai's hand, for the props and the chalk.
  const sockets = {};
  for (const [m, j] of [['hand_r', 'handR'], ['hand_l', 'handL']]) { const s = new T.Group(), p = pairs.find(p => p.m.name === m); s.quaternion.copy(wq(jai(j)).invert().multiply(wq(p.m))); s.scale.setScalar(1 / scale); jai(j).add(s); sockets[m] = s; }
  const lungs = Object.entries(ex.breath ?? {}).map(([n, v]) => ({ o: jai(n), v }));
  const bodies = []; fighter.model.traverse(o => { if (o.isSkinnedMesh) bodies.push(o); });
  const home = { kayu: 'hand_r', tong: 'hand_l' }, qP = new T.Quaternion(), v = new T.Vector3();
  let on = false;
  function show(x) {
    on = x; group.visible = x; for (const b of bodies) b.visible = !x;
    for (const [n, p] of Object.entries(fighter.props)) (x ? sockets[home[n]] : fighter.bone(home[n])).add(p);
    fighter.hold = n => x && sockets[n] ? { bone: sockets[n], s: 1 } : { bone: fighter.bone(n), s: 1 };
  }
  fighter.worn = (dt, breath = 0) => {
    if (!on) return;
    group.position.copy(fighter.group.position); group.quaternion.copy(fighter.group.quaternion); group.updateMatrixWorld(true);
    v.copy(fighter.group.worldToLocal(w(pelvis))).sub(fighter.group.worldToLocal(pelvisAt.clone())).multiplyScalar(k).add(hipsAt);
    hips.position.copy(hips.parent.worldToLocal(fighter.group.localToWorld(v))); hips.updateMatrixWorld(true);
    for (const { m, j, rest } of pairs) { j.parent.getWorldQuaternion(qP); j.quaternion.copy(qP.invert().multiply(wq(m).multiply(rest))); j.updateMatrixWorld(true); }
    for (const { o, v: s } of lungs) o.scale.set(1 + s[0] * breath, 1 + s[1] * breath, 1 + s[2] * breath);
    group.updateMatrixWorld(true);
  };
  show(true);
  return { group, figure, show, get on() { return on; } };
}
