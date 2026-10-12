import * as T from 'three';
import { sharpenJoints, addFists } from './hands.js';
import { FINGERS } from './actor.js';

// Drive a skinned model (an actor from actor.js) from a posed mannequin.
// Each model bone takes its mannequin joint's world-space turn away from
// rest: Qbone = D · C⁻¹ · Qbind, where D = Qjoint · Qjoint_rest⁻¹ and C turns
// a hanging mannequin limb (straight down) onto the bone's own bind direction,
// so an A-posed arm still follows a mannequin arm exactly. The hips follow the
// mannequin's height scaled to the model's legs; the lower foot stays on the
// floor.
const D2R = Math.PI / 180;
const LIMBS = { upper_arm: 'forearm', forearm: 'hand', thigh: 'shin', shin: 'foot' };
const MAP = [['hips', 'hips'], ['spine001', 'spine'], ['spine002', 'chest'], ['spine003', 'chest'], ['neck', 'neck'], ['head', 'head'],
  ...['L', 'R'].flatMap(s => [['shoulder' + s, 'chest'], ['upper_arm' + s, 'shoulder' + s], ['forearm' + s, 'elbow' + s], ['hand' + s, 'hand' + s],
    ['thigh' + s, 'hip' + s], ['shin' + s, 'knee' + s], ['foot' + s, 'ankle' + s], ['toe' + s, 'ankle' + s]])];

export function retarget(actor, mannequin, scale = 1, { fists = true } = {}) {
  const { bone, group, figure } = actor, j = mannequin.j, m = mannequin.root;
  const w = o => o.getWorldPosition(new T.Vector3()), wq = o => o.getWorldQuaternion(new T.Quaternion());
  // Rest of the mannequin: every joint unturned, at the origin, facing +z.
  const hipsY = j.hips.position.y; m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
  for (const g of Object.values(j)) g.quaternion.identity();
  m.updateMatrixWorld(true);
  const rest = Object.fromEntries(MAP.map(([, n]) => [n, wq(j[n]).invert()]));
  const mLeg = w(j.hipL).distanceTo(w(j.kneeL)) + w(j.kneeL).distanceTo(w(j.ankleL));
  // Bind pose of the model, at the origin, scaled to size.
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.setScalar(scale);
  figure.skeleton.pose(); group.updateMatrixWorld(true);
  if (fists && !actor.fighterReady) { sharpenJoints(actor); addFists(actor); }
  const down = new T.Vector3(0, -1, 0), bones = MAP.map(([b, n]) => {
    const o = bone(b), bind = wq(o), child = LIMBS[b.slice(0, -1)];
    const fix = child ? new T.Quaternion().setFromUnitVectors(down, w(bone(child + b.at(-1))).sub(w(o)).normalize()).invert() : new T.Quaternion();
    return { o, n, base: fix.multiply(bind) };
  });
  const hips = bone('hips'), hipsRest = w(hips), ankleY = w(bone('footL')).y;
  const leg = w(bone('thighL')).distanceTo(w(bone('shinL'))) + w(bone('shinL')).distanceTo(w(bone('footL')));
  // Fingers (fighter models): each joint curls about the line across the
  // knuckles, toward the palm; the thumb folds across the curled fingers.
  // Angles per joint, open hand then fist; the mannequin's grip mixes them.
  const fingers = actor.fighterReady && bone('f_index01L') ? ['L', 'R'].flatMap((s, i) => {
    const F = w(bone('f_middle02' + s)).sub(w(bone('f_middle01' + s))).normalize(), palm = new T.Vector3(s === 'L' ? -1 : 1, 0, 0), across = w(bone('f_index01' + s)).sub(w(bone('f_pinky01' + s))).normalize();
    palm.addScaledVector(F, -palm.dot(F)).normalize(); const curl = new T.Vector3().crossVectors(F, palm);
    const D = w(bone('thumb02' + s)).sub(w(bone('thumb01' + s))).normalize(), fold = new T.Vector3().crossVectors(D, F.clone().multiplyScalar(.3).addScaledVector(across, -.6).addScaledVector(palm, .75).normalize()).normalize();
    return FINGERS.flatMap(f => [1, 2, 3].map(k => {
      const o = bone(f + '0' + k + s), axis = (f === 'thumb' ? fold : curl).clone().applyQuaternion(wq(o.parent).invert());
      return { o, i, rest: o.quaternion.clone(), axis, open: (f === 'thumb' ? [8, 6, 6] : [8, 12, 8])[k - 1] * D2R, fist: (f === 'thumb' ? [60, 45, 40] : [88, 100, 70])[k - 1] * D2R };
    }));
  }) : [];
  let lift = hips; while (lift.parent !== group) lift = lift.parent;
  const k = leg / mLeg, liftRest = lift.position.y;
  const qD = new T.Quaternion(), qP = new T.Quaternion(), v = new T.Vector3();
  return function update() {
    group.position.copy(m.position); group.rotation.y = m.rotation.y; lift.position.y = liftRest; group.updateMatrixWorld(true);
    // Hips: the bind position, raised or lowered with the mannequin's.
    v.copy(hipsRest); v.y += (j.hips.position.y - hipsY) * k; hips.position.copy(hips.parent.worldToLocal(group.localToWorld(v.divideScalar(scale))));
    hips.updateMatrixWorld(true);
    for (const { o, n, base } of bones) {
      qD.multiplyQuaternions(j[n].getWorldQuaternion(qD), rest[n]).multiply(base);
      o.parent.getWorldQuaternion(qP); o.quaternion.copy(qP.invert().multiply(qD)); o.updateMatrixWorld(true);
    }
    for (const { o, i, rest, axis, open, fist } of fingers) o.quaternion.setFromAxisAngle(axis, open + (fist - open) * mannequin.grip[i]).multiply(rest);
    // Ground: the lower ankle at its bind height.
    const low = Math.min(w(bone('footL')).y, w(bone('footR')).y);
    lift.position.y = liftRest + (ankleY - low) / scale; group.updateMatrixWorld(true);
  };
}
