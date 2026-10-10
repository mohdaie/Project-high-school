import * as T from 'three';
import { toon, outline } from './illustration.js';

// A jointed mannequin, about 1.75 m: rigid segments on a real joint chain
// (pelvis, spine, chest, neck, head; shoulder, elbow, wrist; hip, knee,
// ankle). The torso is posed by angles; arms and legs reach wrist and ankle
// targets with two-bone IK, bending toward an elbow or knee direction.
export const LIMB = { upper: .29, fore: .26, thigh: .44, shin: .43 };
const D = Math.PI / 180;

export function createMannequin(scene, { body = 0xd9a36c, joint = 0x6b4630, band = null } = {}) {
  const root = new T.Group(); root.rotation.order = 'YXZ';
  const skin = toon(body), dark = toon(joint), j = {}, meshes = [];
  const node = (name, parent, x, y, z) => { const g = new T.Group(); g.rotation.order = 'YXZ'; g.position.set(x, y, z); parent.add(g); return j[name] = g; };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); outline(m, 2); meshes.push(m); return m; };
  const bone = (parent, len, r, mat = skin) => add(parent, new T.CapsuleGeometry(r, Math.max(.01, len - 2 * r), 3, 8), mat, 0, -len / 2, 0);
  const ball = (parent, r) => add(parent, new T.SphereGeometry(r, 10, 8), dark);

  const hips = node('hips', root, 0, .92, 0);
  add(hips, new T.BoxGeometry(.3, .14, .18), skin, 0, -.02, 0);
  const spine = node('spine', hips, 0, .06, 0); ball(spine, .07);
  add(spine, new T.CapsuleGeometry(.11, .1, 3, 8), skin, 0, .1, 0);
  const chest = node('chest', spine, 0, .2, 0);
  add(chest, new T.BoxGeometry(.36, .26, .2), skin, 0, .1, 0);
  const neck = node('neck', chest, 0, .25, 0); add(neck, new T.CylinderGeometry(.045, .05, .1, 8), dark, 0, .04, 0);
  const head = node('head', neck, 0, .09, 0);
  add(head, new T.SphereGeometry(.11, 14, 10), skin, 0, .1, 0).scale.set(.9, 1.08, 1);
  add(head, new T.BoxGeometry(.05, .03, .04), dark, 0, .09, .1); // nose: shows where he looks
  if (band) add(head, new T.CylinderGeometry(.106, .106, .035, 14, 1, true), toon(band, { side: T.DoubleSide }), 0, .15, 0);
  for (const [s, x] of [['L', 1], ['R', -1]]) {
    const sh = node('shoulder' + s, chest, .2 * x, .21, 0); ball(sh, .055); bone(sh, LIMB.upper, .05);
    const el = node('elbow' + s, sh, 0, -LIMB.upper, 0); ball(el, .045); bone(el, LIMB.fore, .042);
    const hand = node('hand' + s, el, 0, -LIMB.fore, 0); add(hand, new T.BoxGeometry(.08, .09, .09), dark, 0, -.045, 0);
    const hip = node('hip' + s, hips, .095 * x, -.04, 0); ball(hip, .07); bone(hip, LIMB.thigh, .07);
    const knee = node('knee' + s, hip, 0, -LIMB.thigh, 0); ball(knee, .055); bone(knee, LIMB.shin, .055);
    const ankle = node('ankle' + s, knee, 0, -LIMB.shin, 0); add(ankle, new T.BoxGeometry(.1, .07, .25), dark, 0, -.04, .06);
  }
  scene.add(root);
  // Strike points in world space: fist centre, ball of the foot, kneecap, chest.
  const points = { handL: [j.handL, 0, -.05, 0], handR: [j.handR, 0, -.05, 0], footL: [j.ankleL, 0, -.03, .12], footR: [j.ankleR, 0, -.03, .12], kneeL: [j.kneeL, 0, 0, .06], kneeR: [j.kneeR, 0, 0, .06], chest: [j.chest, 0, .12, .1], shoulderL: [j.shoulderL, .03, 0, 0], head: [j.head, 0, .1, 0], hips: [j.hips, 0, 0, 0] };
  const point = (name, out = new T.Vector3()) => { const [o, x, y, z] = points[name]; return o.localToWorld(out.set(x, y, z)); };
  const flash = v => { for (const m of [skin, dark]) m.emissive.setScalar(v); };
  return { root, j, meshes, point, flash, pose: p => applyPose(root, j, p) };
}

const vS = new T.Vector3(), vT = new T.Vector3(), vP = new T.Vector3(), vE = new T.Vector3(), vD = new T.Vector3(), vX = new T.Vector3(), vY = new T.Vector3(), vZ = new T.Vector3(), vF = new T.Vector3();
const qW = new T.Quaternion(), qP = new T.Quaternion(), mB = new T.Matrix4(), eF = new T.Euler(0, 0, 0, 'YXZ');
// Point a segment (rest direction local -y) along `dir` in world space, its
// front (+z) toward `front`, whatever its parent is doing.
function aim(g, dir, front) {
  vY.copy(dir).negate().normalize(); vZ.copy(front).addScaledVector(vY, -front.dot(vY));
  if (vZ.lengthSq() < 1e-6) vZ.set(0, 0, 1).addScaledVector(vY, -vY.z); vZ.normalize(); vX.crossVectors(vY, vZ);
  qW.setFromRotationMatrix(mB.makeBasis(vX, vY, vZ));
  g.parent.getWorldQuaternion(qP); g.quaternion.copy(qP.invert().multiply(qW)); g.updateMatrixWorld(true);
}
// Two-bone IK: base joint `a`, middle joint `b`, end target `t` and bend
// direction `pole` (both in the fighter's space).
function reach(root, a, b, la, lb, t, pole) {
  a.getWorldPosition(vS); root.localToWorld(vT.fromArray(t)); vP.fromArray(pole).transformDirection(root.matrixWorld);
  vD.subVectors(vT, vS); const d = T.MathUtils.clamp(vD.length(), .05, la + lb - 1e-3); vD.normalize();
  const x = (la * la - lb * lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, la * la - x * x));
  vF.copy(vP).addScaledVector(vD, -vP.dot(vD)); if (vF.lengthSq() < 1e-6) vF.set(0, 1, 0); vF.normalize();
  vE.copy(vS).addScaledVector(vD, x).addScaledVector(vF, h);
  aim(a, vE.sub(vS), vF);
  b.getWorldPosition(vS); aim(b, vT.sub(vS), vF);
}
function applyPose(root, j, p) {
  const r = (g, v) => g.rotation.set(v[0] * D, v[1] * D, v[2] * D);
  j.hips.position.y = p.hips[0]; j.hips.rotation.set(p.hips[1] * D, p.hips[2] * D, p.hips[3] * D);
  r(j.spine, p.spine); r(j.chest, p.chest); r(j.neck, p.neck); r(j.head, p.head);
  root.updateMatrixWorld(true);
  reach(root, j.shoulderL, j.elbowL, LIMB.upper, LIMB.fore, p.hL, p.eL);
  reach(root, j.shoulderR, j.elbowR, LIMB.upper, LIMB.fore, p.hR, p.eR);
  reach(root, j.hipL, j.kneeL, LIMB.thigh, LIMB.shin, p.fL, p.kL);
  reach(root, j.hipR, j.kneeR, LIMB.thigh, LIMB.shin, p.fR, p.kR);
  // Feet stay level with the ground (pitched by r*[0]) and turned by r*[1].
  for (const [s, f] of [['L', p.rL], ['R', p.rR]]) {
    const a = j['ankle' + s]; root.getWorldQuaternion(qW); qW.multiply(new T.Quaternion().setFromEuler(eF.set(f[0] * D, f[1] * D, 0)));
    a.parent.getWorldQuaternion(qP); a.quaternion.copy(qP.invert().multiply(qW));
  }
  j.handL.quaternion.identity(); j.handR.quaternion.identity();
  root.updateMatrixWorld(true);
}
