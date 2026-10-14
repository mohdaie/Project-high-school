import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { sample } from './keyframes.js';
import { STREET } from './street.js';

// Solve street.js poses on the UAL2 mannequin and bake them into clips.
// A pose turns the torso by angles (hips, spine, chest, neck, head) and
// reaches each wrist and ankle target with two-bone IK, bending toward an
// elbow or knee direction, as the old jointed mannequin did. Each UAL2 bone
// takes that joint's turn from a hanging rest: its T-pose bind turned so the
// limb points straight down (an arm's elbow then bends back, a knee forward).
// The heights of hips and ankles shift to the UAL2 legs; shoulders already
// sit where the old mannequin's did.
const D = Math.PI / 180, DOWN = new T.Vector3(0, -1, 0), HIPS = -.068, ANKLE = .029, FPS = 60;
const FINGER = /^(index|middle|ring|pinky|thumb)_0[123]_([lr])$/;
const vS = new T.Vector3(), vT = new T.Vector3(), vP = new T.Vector3(), vE = new T.Vector3(), vD = new T.Vector3(), vF = new T.Vector3(), vX = new T.Vector3(), vY = new T.Vector3(), vZ = new T.Vector3();
const qA = new T.Quaternion(), qB = new T.Quaternion(), mB = new T.Matrix4(), eA = new T.Euler(0, 0, 0, 'YXZ');
const euler = (v, out = new T.Quaternion()) => out.setFromEuler(eA.set(v[0] * D, v[1] * D, v[2] * D));
// A segment's world turn: pointing along `dir`, its front toward `front` (the
// old mannequin's frame: rest = hanging, front +z).
function seg(dir, front, out = new T.Quaternion()) {
  vY.copy(dir).negate().normalize(); vZ.copy(front).addScaledVector(vY, -front.dot(vY));
  if (vZ.lengthSq() < 1e-6) vZ.set(0, 0, 1).addScaledVector(vY, -vY.z); vZ.normalize(); vX.crossVectors(vY, vZ);
  return out.setFromRotationMatrix(mB.makeBasis(vX, vY, vZ));
}

// A poser for one skeleton (a clone of the fighter at rest, at the origin).
// `fist` gives each finger bone's local turn in a closed fist.
export function poser(scene, fist) {
  scene.updateMatrixWorld(true);
  const b = n => scene.getObjectByName(n), wq = o => o.getWorldQuaternion(new T.Quaternion()), wp = o => o.getWorldPosition(new T.Vector3());
  const bind = {}, hang = {}, len = {};
  scene.traverse(o => { if (o.isBone) bind[o.name] = wq(o); });
  for (const s of ['l', 'r']) for (const [n, c, h] of [['upperarm', 'lowerarm'], ['lowerarm', 'hand'], ['hand', 'hand', 'lowerarm'], ['thigh', 'calf'], ['calf', 'foot']]) {
    const k = `${n}_${s}`, from = b(`${h ?? n}_${s}`), to = b(`${c}_${s}`);
    hang[k] = new T.Quaternion().setFromUnitVectors(DOWN, wp(to).sub(wp(from)).normalize()).invert().multiply(bind[k]);
    if (c !== n) len[k] = wp(to).distanceTo(wp(b(k)));
  }
  const fingers = []; scene.traverse(o => { const m = o.isBone && o.name.match(FINGER); if (m) fingers.push({ o, side: m[2] === 'l' ? 0 : 1, open: o.quaternion.clone(), fist: fist[o.name] ?? o.quaternion }); });
  const pelvisAt = wp(b('pelvis'));
  const put = (o, q) => { o.parent.getWorldQuaternion(qA); o.quaternion.copy(qA.invert().multiply(q)); o.updateMatrixWorld(true); };
  const W = {}, at = n => qB.copy(W[n]);
  // Two-bone IK from bone `a` (lengths of a and its child) to target t,
  // bending toward pole; returns the elbow or knee and the bend side vF.
  function reach(a, t, pole) {
    vS.copy(wp(b(a))); vT.fromArray(t); vP.fromArray(pole);
    const la = len[a], lb = len[a.replace('upperarm', 'lowerarm').replace('thigh', 'calf')];
    vD.subVectors(vT, vS); const d = T.MathUtils.clamp(vD.length(), .05, la + lb - 1e-3); vD.normalize();
    const x = (la * la - lb * lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, la * la - x * x));
    vF.copy(vP).addScaledVector(vD, -vP.dot(vD)); if (vF.lengthSq() < 1e-6) vF.set(0, 1, 0); vF.normalize();
    vE.copy(vS).addScaledVector(vD, x).addScaledVector(vF, h);
    vT.copy(vS).addScaledVector(vD, d);
  }
  return function pose(p) {
    // Torso
    W.hips = euler(p.hips.slice(1)); W.spine = W.hips.clone().multiply(euler(p.spine));
    W.chest = W.spine.clone().multiply(euler(p.chest)); W.neck = W.chest.clone().multiply(euler(p.neck)); W.head = W.neck.clone().multiply(euler(p.head));
    const pelvis = b('pelvis'); pelvis.position.copy(pelvis.parent.worldToLocal(vS.set(pelvisAt.x, p.hips[0] + HIPS, pelvisAt.z)));
    put(pelvis, at('hips').multiply(bind.pelvis));
    put(b('spine_01'), qB.copy(W.hips).slerp(W.spine, .5).multiply(bind.spine_01));
    put(b('spine_02'), at('spine').multiply(bind.spine_02)); put(b('spine_03'), at('chest').multiply(bind.spine_03));
    put(b('neck_01'), at('neck').multiply(bind.neck_01)); put(b('Head'), at('head').multiply(bind.Head));
    for (const s of ['l', 'r']) put(b('clavicle_' + s), at('chest').multiply(bind['clavicle_' + s]));
    // Arms: an elbow bends away from the segment's front.
    for (const [s, h, e] of [['l', p.hL, p.eL], ['r', p.hR, p.eR]]) {
      reach('upperarm_' + s, h, e); vF.negate();
      put(b('upperarm_' + s), seg(vD.copy(vE).sub(vS), vF, qB).multiply(hang['upperarm_' + s]));
      const fore = seg(vD.copy(vT).sub(vE), vF);
      put(b('lowerarm_' + s), qB.copy(fore).multiply(hang['lowerarm_' + s]));
      put(b('hand_' + s), fore.multiply(hang['hand_' + s]));
    }
    // Legs: a knee bends toward the front; feet level, pitched and turned.
    for (const [s, f, k, r] of [['l', p.fL, p.kL, p.rL], ['r', p.fR, p.kR, p.rR]]) {
      reach('thigh_' + s, [f[0], f[1] + ANKLE, f[2]], k);
      put(b('thigh_' + s), seg(vD.copy(vE).sub(vS), vF, qB).multiply(hang['thigh_' + s]));
      put(b('calf_' + s), seg(vD.copy(vT).sub(vE), vF, qB).multiply(hang['calf_' + s]));
      put(b('foot_' + s), euler([r[0], r[1], 0], qB).multiply(bind['foot_' + s]));
    }
    for (const f of fingers) f.o.quaternion.copy(f.open).slerp(f.fist, p.g[f.side]);
    scene.updateMatrixWorld(true);
  };
}

// Bake every Street_* clip into gltf.animations (once per loaded model).
// Tracks: the turn of every bone a pose drives, the pelvis height, and the
// root bone's travel (root motion) from `fwd`.
export function bakeStreet(gltf, fistClip = 'Melee_Hook') {
  if (gltf.animations.some(a => a.name.startsWith('Street_'))) return gltf;
  const scene = clone(gltf.scene); scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0);
  const bones = []; scene.traverse(o => { if (o.isBone) bones.push(o); });
  const rest = bones.map(o => [o.position.clone(), o.quaternion.clone()]);
  // The fist: the fingers as they close in a punch clip.
  const ref = gltf.animations.find(a => a.name === fistClip), mixer = new T.AnimationMixer(scene), act = mixer.clipAction(ref);
  act.play(); act.time = ref.duration * .3; mixer.update(0);
  const fist = {}; for (const o of bones) if (FINGER.test(o.name)) fist[o.name] = o.quaternion.clone();
  act.stop(); mixer.uncacheRoot(scene); bones.forEach((o, i) => { o.position.copy(rest[i][0]); o.quaternion.copy(rest[i][1]); });
  const solve = poser(scene, fist), root = scene.getObjectByName('root'), pelvis = scene.getObjectByName('pelvis');
  const driven = bones.filter(o => /^(pelvis|spine_0[123]|neck_01|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr]|thigh_[lr]|calf_[lr]|foot_[lr])$/.test(o.name) || FINGER.test(o.name));
  for (const [name, c] of Object.entries(STREET)) {
    const n = Math.max(2, Math.round(c.dur * FPS)), times = new Float32Array(n + 1), q = driven.map(() => new Float32Array((n + 1) * 4)), hp = new Float32Array((n + 1) * 3), rp = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) {
      const t = times[i] = c.dur * i / n, p = sample(c.keys, t); solve(p);
      driven.forEach((o, k) => o.quaternion.toArray(q[k], i * 4)); pelvis.position.toArray(hp, i * 3); rp.set([0, 0, p.fwd[0]], i * 3);
    }
    const tracks = driven.map((o, k) => new T.QuaternionKeyframeTrack(o.name + '.quaternion', times, q[k]));
    tracks.push(new T.VectorKeyframeTrack('pelvis.position', times, hp), new T.VectorKeyframeTrack(root.name + '.position', times, rp));
    gltf.animations.push(new T.AnimationClip(name, c.dur, tracks));
  }
  return gltf;
}
