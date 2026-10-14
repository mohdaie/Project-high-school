import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { toon, outline } from './illustration.js';
import { LOCO, frame } from './brawler.js?v=0.6.0';

// The fighter: the Universal Animation Library 2 mannequin (Quaternius, CC0),
// 1.8 m, on a UE-style 65-bone rig, played straight from its clips. Every
// clip's time and weight is set by the game each frame (nothing runs on its
// own clock), so poses match the rules in brawler.js exactly.
export const FIGHTER_URL = new URL('../assets/models/fighter.glb', import.meta.url).href;
export const loadFighter = (url = FIGHTER_URL, parse) => parse ? parse(url) : new GLTFLoader().loadAsync(url);

// Strike parts: a point (or a segment a..b) in a bone's space, and a radius.
// Bare hands only: fists, the left shoulder for a barge, the right foot.
export const PARTS = {
  handR: { bone: 'hand_r', a: [0, .08, 0], r: .06 }, handL: { bone: 'hand_l', a: [0, .08, 0], r: .06 },
  shoulderL: { bone: 'upperarm_l', a: [0, .05, 0], r: .14 },
  footR: { bone: 'ball_r', a: [0, 0, 0], r: .08 }, footL: { bone: 'ball_l', a: [0, 0, 0], r: .08 }
};
// Where a fighter can be hit: centre, radius, zone.
export const TARGETS = [['head', .15, 'head'], ['chest', .2, 'body'], ['hips', .19, 'body'], ['shinL', .12, 'low'], ['shinR', .12, 'low'], ['footL', .1, 'low'], ['footR', .1, 'low']];

const GAIT = [['idle', 0], ['walk', 1.2], ['jog', 2.4], ['sprint', 3.6]], NATURAL = { walk: 1.25, jog: 2.6, sprint: 4.4 };
const v1 = new T.Vector3(), v2 = new T.Vector3(), qA = new T.Quaternion();

export function createFighter(scene, gltf, { body = 0xd9a36c, joint = 0x5b3a28 } = {}) {
  const group = new T.Group(), model = clone(gltf.scene); group.add(model); scene.add(group);
  const mats = { M_Main: toon(body), M_Joints: toon(joint) }, skins = [];
  model.traverse(o => { if (o.isSkinnedMesh) { o.material = mats[o.material.name] ?? mats.M_Main; o.castShadow = true; o.frustumCulled = false; skins.push(o); } });
  for (const s of skins) { outline(s, 2); }
  model.traverse(o => { if (o.userData.ink) o.frustumCulled = false; });
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const bone = n => bones[n];

  // Every clip is an action that always plays; weights pick what shows.
  const mixer = new T.AnimationMixer(model), actions = {}, roots = {};
  for (const clip of gltf.animations) {
    const a = actions[clip.name] = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0);
    const track = clip.tracks.find(t => t.name === 'root.position'); roots[clip.name] = track ? track.createInterpolant() : null;
  }
  const len = n => actions[n].getClip().duration;
  // Root motion of a clip at a time, in the model's own space (+z forward).
  const rootAt = (clip, time, out = new T.Vector3()) => { const r = roots[clip]; if (!r) return out.set(0, 0, 0); const v = r.evaluate(Math.min(time, len(clip))); return out.set(v[0], 0, v[2]); };
  // Total root travel of a move from its start to time t.
  function path(m, t, out = new T.Vector3()) {
    out.set(0, 0, 0); const f = frame(m, t);
    for (let i = 0; i < f.i; i++) { const s = m.play[i]; out.add(rootAt(s.clip, s.to, v1)).sub(rootAt(s.clip, s.from, v2)); }
    const s = m.play[f.i]; return out.add(rootAt(s.clip, f.time, v1)).sub(rootAt(s.clip, s.from, v2));
  }

  // Blending: the current move, frozen poses fading out, and the standing loops.
  const fades = []; let last = null, moveW = 0;
  const loco = { phase: 0, idle: 0, guard: 0, guardW: 0 };
  const breathBones = [['spine_02', -.025], ['spine_03', -.04]].map(([n, k]) => [bone(n), k, bone(n).quaternion.clone()]);
  const lateral = new T.Vector3();

  // m: the move (or reaction) playing, t its time; speed: ground speed (m/s,
  // negative when backing off); guard: covering up; breath: -1..1.
  function drive(dt, { m = null, t = 0, speed = 0, guard = false, breath = 0 } = {}) {
    const w = {};
    if (m) {
      const f = frame(m, t), cur = { m, i: f.i, clip: f.clip, time: f.time };
      if (last && (last.m !== m || last.i !== f.i) && moveW > 0) fades.push({ clip: last.clip, time: last.time, w: moveW * (last.m !== m ? 1 : .6) });
      if (!last || last.m !== m) moveW = fades.length ? 1 : moveW;
      moveW = Math.min(1, moveW + dt / .1); last = cur;
    } else moveW = Math.max(0, moveW - dt / .18);
    for (const f of fades) f.w -= dt / .1;
    for (let i = fades.length - 1; i >= 0; i--) if (fades[i].w <= 0) fades.splice(i, 1);
    let used = 0;
    if (last && moveW > 0) { w[last.clip] = { time: last.time, w: moveW }; used = moveW; }
    if (!m && moveW <= 0) last = null;
    for (const f of fades) { const k = Math.min(f.w, Math.max(0, 1 - used)); if (k > 0) { (w[f.clip] ??= { time: f.time, w: 0 }).w += k; used += k; } }
    // Standing loops share what is left, by speed; walking and running stay in step.
    const rest = Math.max(0, 1 - used), s = Math.abs(speed);
    loco.guardW = T.MathUtils.clamp(loco.guardW + (guard ? dt : -dt) / .15, 0, 1);
    const gw = {}; for (let i = 0; i < GAIT.length; i++) {
      const [n, at] = GAIT[i], lo = GAIT[i - 1]?.[1] ?? -1, hi = GAIT[i + 1]?.[1];
      gw[n] = hi === undefined ? T.MathUtils.clamp((s - lo) / (at - lo), 0, 1) : s <= at ? T.MathUtils.clamp((s - lo) / (at - lo), 0, 1) : T.MathUtils.clamp((hi - s) / (hi - at), 0, 1);
    }
    let cycle = 0, sum = 0; for (const n of ['walk', 'jog', 'sprint']) { cycle += gw[n] * len(LOCO[n]) / Math.max(.5, Math.min(1.5, s / NATURAL[n])); sum += gw[n]; }
    if (sum > 0) loco.phase = (loco.phase + Math.sign(speed || 1) * dt / (cycle / sum) + 1) % 1;
    loco.idle = (loco.idle + dt) % len(LOCO.idle); loco.guard = (loco.guard + dt) % len(LOCO.guard);
    const stand = gw.idle * (1 - loco.guardW);
    const put = (n, time, k) => { if (k > 0) (w[n] ??= { time, w: 0 }).w += k * rest; };
    put(LOCO.idle, loco.idle, stand); put(LOCO.guard, loco.guard, gw.idle * loco.guardW + (1 - gw.idle) * loco.guardW * .5);
    for (const n of ['walk', 'jog', 'sprint']) put(LOCO[n], loco.phase * len(LOCO[n]), gw[n] * (1 - loco.guardW * .5));
    for (const [n, a] of Object.entries(actions)) { const x = w[n]; a.setEffectiveWeight(x ? x.w : 0); if (x) a.time = Math.min(x.time, len(n) - 1e-4); }
    for (const [b, , q] of breathBones) b.quaternion.copy(q);
    mixer.update(0);
    // Root motion is the game's to apply; the root bone stays home.
    bone('root').position.set(0, 0, 0);
    // Breath on top: the chest lifts and opens.
    group.updateMatrixWorld(true); lateral.set(1, 0, 0).applyQuaternion(group.quaternion);
    for (const [b, k] of breathBones) { b.getWorldQuaternion(qA).invert(); b.rotateOnAxis(v1.copy(lateral).applyQuaternion(qA), k * breath); }
    group.updateMatrixWorld(true);
    fighter.worn?.(dt, breath);
  }

  const points = { head: () => bone('Head').getWorldPosition(v1).add(v2.set(0, .1, 0)), chest: () => bone('spine_03').getWorldPosition(v1).add(v2.set(0, .08, 0)), hips: () => bone('pelvis').getWorldPosition(v1),
    shinL: () => bone('calf_l').getWorldPosition(v1).lerp(bone('foot_l').getWorldPosition(v2), .5), shinR: () => bone('calf_r').getWorldPosition(v1).lerp(bone('foot_r').getWorldPosition(v2), .5),
    footL: () => bone('foot_l').getWorldPosition(v1), footR: () => bone('foot_r').getWorldPosition(v1) };
  // A target point, or a strike part's points (a segment gives several).
  const point = (name, out = new T.Vector3()) => out.copy(points[name]());
  // Strikes are judged on the mannequin; `seen` gives the points on the body
  // drawn instead (a worn model's own hands).
  function strike(name, n = 4, seen = false) {
    const p = PARTS[name], { bone: b, s } = seen ? fighter.hold(p.bone) : { bone: bone(p.bone), s: 1 }, at = i => new T.Vector3().fromArray(p.a).lerp(v1.fromArray(p.b ?? p.a), i / (n - 1 || 1)).multiplyScalar(s);
    return p.b ? Array.from({ length: n }, (_, i) => b.localToWorld(at(i))) : [b.localToWorld(at(0))];
  }
  const flash = v => { for (const m of Object.values(mats)) m.emissive.setScalar(v); };
  // Another body can wear the fighter (wear.js): `hold` then gives the bone a
  // strike part follows on that body, with the scale of that bone's units.
  const fighter = { group, model, bone, mixer, actions, drive, path, rootAt, point, strike, flash, len, hold: n => ({ bone: bone(n), s: 1 }), worn: null };
  return fighter;
}
