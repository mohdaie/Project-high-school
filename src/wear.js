import * as T from 'three';

// Dress a fighter (fighter.js) in a modelled character from actor.js, such as
// Amir. Both skeletons share the Universal Animation Library's bone frames, so
// each model bone copies its mannequin joint's turn exactly; the hips travel
// scaled to the model's legs. The mannequin keeps playing every clip unseen,
// and the strike points, kayu and tong move to the model's hands.
const BODY = { pelvis: 'hips', spine_01: 'spine001', spine_02: 'spine002', spine_03: 'spine003', neck_01: 'neck', Head: 'head' };
const LIMB = { clavicle: 'shoulder', upperarm: 'upper_arm', lowerarm: 'forearm', hand: 'hand', thigh: 'thigh', calf: 'shin', foot: 'foot', ball: 'toe' };
const FING = { index: 'f_index', middle: 'f_middle', pinky: 'f_pinky', ring: 'f_ring', thumb: 'thumb' };
// The model's name for a mannequin bone (UAL2 to the Rigify-style DEF- names).
export function modelName(n) {
  if (BODY[n]) return BODY[n];
  const f = n.match(/^(\w+)_0(\d)_(l|r)$/), l = n.match(/^(\w+)_(l|r)$/);
  if (f && FING[f[1]]) return FING[f[1]] + '0' + f[2] + f[3].toUpperCase();
  return l && LIMB[l[1]] ? LIMB[l[1]] + l[2].toUpperCase() : null;
}

export function wear(fighter, actor, scale = 1) {
  const g = actor.group, w = o => o.getWorldPosition(new T.Vector3()), ws = o => o.getWorldScale(new T.Vector3()).x;
  g.scale.setScalar(scale); g.updateMatrixWorld(true); fighter.group.updateMatrixWorld(true);
  const pairs = []; fighter.model.traverse(o => { const n = o.isBone && modelName(o.name), b = n && actor.bone(n); if (b) pairs.push([o, b]); });
  const src = fighter.bone('pelvis'), dst = actor.bone('hips'), srcRest = src.position.clone(), dstRest = dst.position.clone();
  const leg = (a, b, c) => w(a).distanceTo(w(b)) + w(b).distanceTo(w(c));
  const k = leg(actor.bone('thighL'), actor.bone('shinL'), actor.bone('footL')) / ws(dst.parent) / leg(fighter.bone('thigh_l'), fighter.bone('calf_l'), fighter.bone('foot_l'));
  const bodies = []; fighter.model.traverse(o => { if (o.isSkinnedMesh) bodies.push(o); });
  const hands = { hand_r: 'handR', hand_l: 'handL', ball_r: 'toeR', ball_l: 'toeL' }, ratio = ws(fighter.bone('hand_r')) / ws(actor.bone('handR'));
  const home = { kayu: ['hand_r', 'handR'], tong: ['hand_l', 'handL'] }, at = Object.fromEntries(Object.entries(fighter.props).map(([n, p]) => [n, p.position.clone()]));
  let on = false;
  function show(v) {
    on = v; g.visible = v; for (const b of bodies) b.visible = !v;
    for (const [n, p] of Object.entries(fighter.props)) { const [m, a] = home[n]; (v ? actor.bone(a) : fighter.bone(m)).add(p); p.position.copy(at[n]).multiplyScalar(v ? ratio : 1); }
    fighter.propScale = v ? ratio : 1; fighter.hold = n => v && hands[n] ? { bone: actor.bone(hands[n]), s: ratio } : { bone: fighter.bone(n), s: 1 };
  }
  fighter.worn = dt => {
    if (!on) return;
    g.position.copy(fighter.group.position); g.quaternion.copy(fighter.group.quaternion);
    for (const [a, b] of pairs) b.quaternion.copy(a.quaternion);
    dst.position.copy(src.position).sub(srcRest).multiplyScalar(k).add(dstRest);
    actor.face?.update(dt, false); g.updateMatrixWorld(true);
  };
  show(true);
  return { show, get on() { return on; } };
}
