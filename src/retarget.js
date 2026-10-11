import * as T from 'three';
import { sharpenJoints, addFists } from './hands.js';

// Drive a skinned model (an actor from actor.js) from a posed mannequin.
// Each model bone takes its mannequin joint's world-space turn away from
// rest: Qbone = D · C⁻¹ · Qbind, where D = Qjoint · Qjoint_rest⁻¹ and C turns
// a hanging mannequin limb (straight down) onto the bone's own bind direction,
// so an A-posed arm still follows a mannequin arm exactly. The hips follow the
// mannequin's height scaled to the model's legs; the lower foot stays on the
// floor.
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
    // Ground: the lower ankle at its bind height.
    const low = Math.min(w(bone('footL')).y, w(bone('footR')).y);
    lift.position.y = liftRest + (ankleY - low) / scale; group.updateMatrixWorld(true);
  };
}
