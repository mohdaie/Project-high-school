import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outline } from './illustration.js';
import { createCharacter, motif } from './characters.js';
import { dressModel } from './outfit.js';
import { createFace } from './face.js';

// Amir and Nur on a real human skeleton (v2.0). The skeleton and its
// motion-captured clips come from Quaternius' Universal Animation Library
// (CC0, assets/models/kids-mocap.glb); the body is our own: one continuous,
// smoothly weighted mesh for a twelve-year-old, with the clothes painted on
// as vertex colours, so knees, elbows, hips and shoulders bend instead of
// hinging like blocks. Their own heads (face, hair, hijab and hood) come from
// characters.js at a realistic one-in-six-and-a-half head height.
export const RIG_URL = new URL('../assets/models/kids-mocap.glb', import.meta.url).href;
let loading = null;
// `load` turns a URL into a parsed glTF (the default fetches the .glb).
const gltf = url => new GLTFLoader().loadAsync(url);
export function loadRig(url = RIG_URL, load = gltf) { return loading ??= load(url).then(prepareRig); }
// Characters modelled outside the code (an image-to-3D export prepared by
// scripts/bake-model.mjs): a textured mesh, its weights and fitted joints.
export const MODELS = { amir: new URL('../assets/models/amir.glb', import.meta.url).href, nur: new URL('../assets/models/nur.glb', import.meta.url).href };
const models = new Map();
export function loadModel(url, load = gltf) { if (!models.has(url)) models.set(url, load(url)); return models.get(url); }

const CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', talk: 'Idle_Talking_Loop', interact: 'Interact', pickup: 'PickUp_Table', sit: 'Sitting_Idle_Loop',
  jumpStart: 'Jump_Start', jumpAir: 'Jump_Loop', jumpLand: 'Jump_Land', crouch: 'Crouch_Idle_Loop', crouchWalk: 'Crouch_Fwd_Loop', ride: 'Driving_Loop'
};
const GAITS = ['walk', 'jog', 'sprint'], MEASURED = [...GAITS, 'crouchWalk'];

// Measure each gait once on the source rig: how fast the planted foot slides
// back under the hips (the speed the clip walks at) and when the left heel
// strikes, so walk, jog and sprint can share one stride phase without
// skating feet.
function prepareRig(gltf) {
  const scene = gltf.scene, clips = {}, gait = {};
  for (const [key, name] of Object.entries(CLIPS)) clips[key] = gltf.animations.find(c => c.name === name);
  const mixer = new T.AnimationMixer(scene), feet = ['DEF-footL', 'DEF-footR'].map(n => scene.getObjectByName(n)), hips = scene.getObjectByName('DEF-hips');
  const f = new T.Vector3(), h = new T.Vector3();
  for (const key of MEASURED) {
    const clip = clips[key], action = mixer.clipAction(clip).play(), n = 240, samples = [];
    for (let i = 0; i <= n; i++) {
      mixer.setTime(clip.duration * i / n); scene.updateMatrixWorld(true); hips.getWorldPosition(h);
      samples.push(feet.map(foot => { foot.getWorldPosition(f); return [f.y, f.z - h.z]; }));
    }
    action.stop();
    // A planted foot (within 5 cm of its lowest) slides back under the hips
    // at the clip's ground speed; the left heel strikes where the left foot
    // lands furthest forward.
    const dt = clip.duration / n, slide = [];
    let strike = 0, front = -Infinity;
    for (const k of [0, 1]) {
      const low = Math.min(...samples.map(p => p[k][0]));
      for (let i = 0; i < n; i++) {
        if (samples[i][k][0] > low + .05 || samples[i + 1][k][0] > low + .05) continue;
        const back = -(samples[i + 1][k][1] - samples[i][k][1]) / dt; if (back > 0) slide.push(back);
        if (k === 0 && samples[i][0][1] > front) { front = samples[i][0][1]; strike = i / n; }
      }
    }
    slide.sort((a, b) => a - b);
    gait[key] = { speed: slide[Math.floor(slide.length / 2)] || 1, strike };
  }
  scene.traverse(o => { if (o.isMesh) o.visible = false; });
  return { scene, clips, gait };
}

const DESIGNS = {
  amir: { height: 1.5, skin: 0xe2a57b, top: 0xf8f4ec, trim: 0x223a63, sleeve: 'short', hem: .775, pants: 0x2d4f86, seam: 0x22396a, pockets: true, shoe: 0xf3f0e8, shoeTrim: 0x1f1d22, sole: 0xe6e0d2, bag: 'red', motif: 'alien', watch: true },
  nur: { height: 1.48, girl: true, skin: 0xe8b08a, top: 0xf0b5c0, trim: 0xd98a9d, sleeve: 'long', hem: .745, pants: 0x8db3cf, seam: 0x6b92b3, stripe: 0xe48ea3, pockets: true, shoe: 0xf5f2ec, shoeTrim: 0xd98a9d, sole: 0xe6e0d2, bag: 'black' }
};
export const ACTOR_KINDS = Object.keys(DESIGNS);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const colour = hex => new T.Color(hex);

// A growable skinned mesh: lofts (rings joined into tubes), ellipsoids and
// rounded boxes, each vertex with a colour and up to four bone weights.
function meshBuilder() {
  const position = [], color = [], index = [], skinIndex = [], skinWeight = [];
  function vertex(p, c, weights) {
    position.push(p.x, p.y, p.z); color.push(c.r, c.g, c.b);
    const w = weights.filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), total = w.reduce((s, [, v]) => s + v, 0) || 1;
    for (let k = 0; k < 4; k++) { skinIndex.push(w[k]?.[0] ?? 0); skinWeight.push(w[k] ? w[k][1] / total : 0); }
    return position.length / 3 - 1;
  }
  // rings: { c, u, v, a, b, colour(angle, point), weights(point) }; around
  // the tube, angle 0 is +u and π/2 is +v.
  function loft(rings, segments = 14, { capStart = false, capEnd = false } = {}) {
    const start = position.length / 3, p = new T.Vector3();
    for (const r of rings) for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      p.copy(r.c).addScaledVector(r.u, Math.cos(angle) * r.a).addScaledVector(r.v, Math.sin(angle) * r.b);
      vertex(p, r.colour(angle, p), r.weights(p));
    }
    // Wind every tube outward whichever way it runs along its rings.
    const inward = new T.Vector3().crossVectors(rings[0].u, rings[0].v).dot(rings.at(-1).c.clone().sub(rings[0].c)) > 0;
    const tri = (a, b, c) => inward ? index.push(a, c, b) : index.push(a, b, c);
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segments; i++) {
      const a = start + j * segments + i, b = start + j * segments + (i + 1) % segments, c = a + segments, d = b + segments;
      tri(a, c, b); tri(b, c, d);
    }
    const cap = (r, ring, flip) => {
      const centre = vertex(r.c, r.colour(0, r.c), r.weights(r.c)), base = start + ring * segments;
      for (let i = 0; i < segments; i++) { const a = base + i, b = base + (i + 1) % segments; if (flip) tri(centre, b, a); else tri(centre, a, b); }
    };
    if (capStart) cap(rings[0], 0, false);
    if (capEnd) cap(rings.at(-1), rings.length - 1, true);
  }
  function ellipsoid(c, radii, tint, weights, axes = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)], w = 10, h = 7) {
    const g = new T.SphereGeometry(1, w, h), sp = g.attributes.position, p = new T.Vector3(), base = position.length / 3;
    for (let i = 0; i < sp.count; i++) {
      p.copy(c).addScaledVector(axes[0], sp.getX(i) * radii[0]).addScaledVector(axes[1], sp.getY(i) * radii[1]).addScaledVector(axes[2], sp.getZ(i) * radii[2]);
      vertex(p, tint(p), weights(p));
    }
    for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    g.dispose();
  }
  function roundedBox(c, size, radius, tint, weights) {
    const g = new T.BoxGeometry(size[0], size[1], size[2], 3, 3, 3), bp = g.attributes.position, p = new T.Vector3(), core = new T.Vector3(), base = position.length / 3;
    const r = Math.min(radius, ...size.map(s => s / 2.2));
    for (let i = 0; i < bp.count; i++) {
      p.fromBufferAttribute(bp, i);
      core.set(T.MathUtils.clamp(p.x, -size[0] / 2 + r, size[0] / 2 - r), T.MathUtils.clamp(p.y, -size[1] / 2 + r, size[1] / 2 - r), T.MathUtils.clamp(p.z, -size[2] / 2 + r, size[2] / 2 - r));
      p.sub(core).normalize().multiplyScalar(r).add(core).add(c);
      vertex(p, tint(p), weights(p));
    }
    for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    g.dispose();
  }
  function geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(position, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(color, 3));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeight, 4));
    g.setIndex(index); g.computeVertexNormals();
    return g;
  }
  return { loft, ellipsoid, roundedBox, geometry };
}

const bodyMaterial = toon(0xffffff, { vertexColors: true });
const shadowTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(45,42,56,.3)'); g.addColorStop(1, 'rgba(45,42,56,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
})();

export function createActor(scene, x, z, kind, rig, model = null) {
  if (model) return createModelActor(scene, x, z, kind, rig, model);
  const look = DESIGNS[kind] || DESIGNS.amir;
  const root = new T.Group(); root.position.set(x, 0, z); scene.add(root);
  const skeletonRoot = cloneRig(rig.scene); root.add(skeletonRoot);
  const sourceMeshes = []; skeletonRoot.traverse(o => { if (o.isMesh) sourceMeshes.push(o); }); sourceMeshes.forEach(o => o.removeFromParent());
  // The source rig is a 1.83 m adult. Scale it so a child's head on top
  // (chin to crown about .215 m, plus hair) makes the design height.
  const bone = name => skeletonRoot.getObjectByName('DEF-' + name);
  skeletonRoot.updateMatrixWorld(true);
  const restHead = bone('head').getWorldPosition(new T.Vector3()).y;
  const scale = (look.height - .225) / restHead; skeletonRoot.scale.setScalar(scale); skeletonRoot.position.y = .065;
  root.updateMatrixWorld(true);
  const bones = []; skeletonRoot.traverse(o => { if (o.isBone) bones.push(o); });
  const id = name => bones.indexOf(bone(name));
  // Bind-pose joint positions in the character's own frame (feet on y = .065).
  const toLocal = new T.Matrix4().copy(root.matrixWorld).invert();
  const at = name => bone(name).getWorldPosition(new T.Vector3()).applyMatrix4(toLocal);
  const J = {}; for (const name of ['hips', 'spine001', 'spine002', 'spine003', 'neck', 'head']) J[name] = at(name);
  for (const s of ['L', 'R']) for (const name of ['shoulder', 'upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe']) J[name + s] = at(name + s);
  const base = .065, X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0), Z = new T.Vector3(0, 0, 1);
  const skin = colour(look.skin), top = colour(look.top), trim = colour(look.trim), pants = colour(look.pants), seam = colour(look.seam);
  const build = meshBuilder();

  // Torso: rings from the seat to the base of the neck. Each ring belongs to
  // the spine bone at its height, blended across each joint; the upper outer
  // chest also follows the shoulder blades, so arm lifts pull the shirt.
  const spine = [['hips', J.hips.y], ['spine001', J.spine001.y], ['spine002', J.spine002.y], ['spine003', J.spine003.y], ['neck', J.neck.y]];
  const spineWeights = y => {
    const out = []; let k = 0;
    while (k < spine.length - 1 && y >= spine[k + 1][1]) k++;
    const zone = .035, next = spine[k + 1], prev = spine[k];
    if (next && y > next[1] - zone) { const t = (y - (next[1] - zone)) / (2 * zone); out.push([id(prev[0]), 1 - t * .5], [id(next[0]), t * .5]); }
    else if (k > 0 && y < prev[1] + zone) { const t = ((prev[1] + zone) - y) / (2 * zone); out.push([id(prev[0]), 1 - t * .5], [id(spine[k - 1][0]), t * .5]); }
    else out.push([id(prev[0]), 1]);
    return out;
  };
  const shoulderY = J.upper_armL.y, crotch = J.thighL.y - .06;
  const torsoWeights = p => {
    const w = spineWeights(p.y), lift = smooth(.06, .15, Math.abs(p.x)) * smooth(shoulderY - .13, shoulderY - .03, p.y) * .65;
    if (lift > 0) { for (const pair of w) pair[1] *= 1 - lift; w.push([id(p.x > 0 ? 'shoulderL' : 'shoulderR'), lift]); }
    // The seat and hips follow the thighs a little, so stepping stretches the cloth.
    const seat = (1 - smooth(crotch, crotch + .08, p.y)) * smooth(.02, .09, Math.abs(p.x)) * .35;
    if (seat > 0) { for (const pair of w) pair[1] *= 1 - seat; w.push([id(p.x > 0 ? 'thighL' : 'thighR'), seat]); }
    return w;
  };
  const girl = look.girl ? 1 : 0, hem = look.hem;
  const torsoTint = (angle, p) => {
    if (p.y < hem) return look.stripe && Math.abs(Math.cos(angle)) > .97 ? colour(look.stripe) : pants;
    if (p.y > shoulderY + .02 && p.y < shoulderY + .045) return trim; // collar rib
    return top;
  };
  // [height, half width, half depth] for a slim twelve-year-old.
  const torso = [
    [crotch - .01, .07, .06], [crotch + .02, .108, .08], [crotch + .06, .118 + girl * .006, .084], [hem - .012, .118, .08], [hem - .006, .124, .086], [hem + .004, .126, .088],
    [J.spine001.y + .02, .118 - girl * .006, .082], [J.spine002.y, .126, .086], [J.spine002.y + .07, .134, .088], [J.spine003.y + .03, .14, .084], [shoulderY - .02, .142, .076],
    [shoulderY + .015, .12, .064], [shoulderY + .035, .07, .05], [shoulderY + .045, .044, .042]
  ];
  const spineZ = y => { const pts = [J.hips, J.spine001, J.spine002, J.spine003, J.neck]; for (let i = 0; i < pts.length - 1; i++) if (y <= pts[i + 1].y) return T.MathUtils.lerp(pts[i].z, pts[i + 1].z, smooth(pts[i].y, pts[i + 1].y, y)); return pts.at(-1).z; };
  build.loft(torso.map(([y, a, b]) => ({ c: new T.Vector3(0, y, spineZ(y) + .01), u: X, v: Z, a, b, colour: torsoTint, weights: torsoWeights })), 20, { capStart: true });
  // Neck to the base of the skull.
  const neckWeights = p => { const t = smooth(J.neck.y - .01, J.head.y + .01, p.y); return [[id('neck'), 1 - t], [id('head'), t]]; };
  build.loft([shoulderY + .02, J.neck.y, J.head.y, J.head.y + .03].map((y, i) => ({ c: new T.Vector3(0, y, J.neck.z + .006), u: X, v: Z, a: [.046, .037, .034, .03][i], b: [.044, .036, .034, .03][i], colour: () => skin, weights: neckWeights })), 12);

  // Limbs: one tube down each chain of joints. A ring is weighted to the bone
  // of its segment and blended 50/50 at the joint across `zone` metres.
  function limb(joints, names, samples, frame, segments = 12, zone = .045, options) {
    const lengths = joints.slice(1).map((p, i) => p.distanceTo(joints[i])), offsets = [0]; lengths.forEach(l => offsets.push(offsets.at(-1) + l));
    const rings = samples.map(([seg, t, a, b, tint]) => {
      const from = joints[seg], to = joints[seg + 1], dir = to.clone().sub(from).normalize(), c = from.clone().lerp(to, t), s = offsets[seg] + lengths[seg] * t;
      const [u, v] = frame(dir);
      const weights = () => {
        let k = 0; while (k < names.length - 1 && s > offsets[k + 1]) k++;
        const near = [k > 0 ? offsets[k] : null, k < names.length - 1 ? offsets[k + 1] : null];
        if (near[1] !== null && s > near[1] - zone) { const w = (s - (near[1] - zone)) / (2 * zone) * .5; return [[id(names[k]), 1 - w], [id(names[k + 1]), w]]; }
        if (near[0] !== null && s < near[0] + zone) { const w = ((near[0] + zone) - s) / (2 * zone) * .5; return [[id(names[k]), 1 - w], [id(names[k - 1]), w]]; }
        return [[id(names[k]), 1]];
      };
      return { c, u, v, a, b, colour: typeof tint === 'function' ? tint : () => tint, weights };
    });
    build.loft(rings, segments, options);
  }
  const legFrame = dir => { const v = Z.clone().sub(dir.clone().multiplyScalar(dir.dot(Z))).normalize(); return [new T.Vector3().crossVectors(v, dir).normalize(), v]; };
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    // Legs: baggy cargo trousers to the shoe, with a side seam (Nur's has a pink stripe).
    const legTint = (angle, p) => {
      const outer = Math.cos(angle) * sx > .96;
      if (look.stripe && outer) return colour(look.stripe);
      return Math.abs(Math.sin(angle)) < .12 && Math.cos(angle) * sx > 0 ? seam : pants;
    };
    const legJoints = [J['thigh' + side].clone().add(new T.Vector3(0, .07, 0)), J['thigh' + side], J['shin' + side], J['foot' + side].clone().add(new T.Vector3(0, .03, 0))];
    limb(legJoints, ['thigh' + side, 'thigh' + side, 'shin' + side], [
      [0, 0, .074, .078, legTint], [0, 1, .08, .083, legTint], [1, .3, .074, .077, legTint], [1, .62, .068, .071, legTint], [1, .9, .062, .066, legTint],
      [2, .08, .061, .064, legTint], [2, .45, .058, .061, legTint], [2, .82, .057, .06, legTint], [2, .96, .06, .063, seam], [2, 1, .036, .038, colour(0xf2efe8)]
    ], legFrame, 14);
    if (look.pockets) {
      // Cargo pockets on the outer thigh, with a flap.
      const thigh = J['thigh' + side], knee = J['shin' + side], pc = thigh.clone().lerp(knee, .55).add(new T.Vector3(sx * .07, 0, .004));
      const w = () => [[id('thigh' + side), 1]];
      build.roundedBox(pc, [.03, .085, .07], .012, () => seam, w);
      build.roundedBox(pc.clone().add(new T.Vector3(sx * .008, .038, 0)), [.026, .018, .074], .006, () => pants, w);
    }
    // Shoes: one loft from heel to toe; the toe bends at the ball of the foot.
    const ankle = J['foot' + side], ball = J['toe' + side], cx = ankle.x + sx * .004;
    const shoeWeights = p => { const t = smooth(ball.z - .03, ball.z + .02, p.z); return [[id('foot' + side), 1 - t], [id('toe' + side), t]]; };
    const shoeTint = (angle, p) => {
      if (p.y < base + .02) return colour(look.sole);
      if (p.z > ball.z + .045 && p.y < base + .05) return colour(look.sole); // shell toe
      const sideOn = Math.abs(p.x - cx) > .032, zz = p.z - ankle.z;
      if (sideOn && p.y > base + .028 && [[.03, .045], [.06, .075], [.09, .105]].some(([a, b]) => zz > a && zz < b)) return colour(look.shoeTrim);
      if (p.z < ankle.z - .045) return colour(look.shoeTrim); // heel tab
      return colour(look.shoe);
    };
    const heel = ankle.z - .075;
    build.loft([[0, .028, .03, .045], [.012, .04, .045, .05], [.05, .045, .052, .054], [.1, .048, .046, .049], [.145, .05, .036, .04], [.18, .046, .028, .032], [.2, .034, .02, .026]].map(([dz, a, b, cy]) => ({
      c: new T.Vector3(cx, base + cy, heel + dz), u: X, v: Y, a, b, colour: shoeTint, weights: shoeWeights
    })), 14, { capStart: true, capEnd: true });

    // Arms, in the T-pose along ±x: a sleeve over the upper arm (to the wrist
    // for Nur's hoodie), bare forearm and a mitten hand with a thumb.
    const armFrame = () => [Z, Y];
    const shoulderJoint = J['upper_arm' + side], inner = new T.Vector3(sx * .055, shoulderJoint.y - .005, shoulderJoint.z + .03);
    const armJoints = [inner, shoulderJoint, J['forearm' + side], J['hand' + side], J['hand' + side].clone().add(new T.Vector3(sx * .085, -.005, .006))];
    const names = ['shoulder' + side, 'upper_arm' + side, 'forearm' + side, 'hand' + side];
    const sleeve = look.sleeve === 'long';
    const arm = sleeve
      ? [[0, 0, .056, .06, top], [0, .7, .058, .061, top], [1, .1, .052, .052, top], [1, .5, .046, .046, top], [1, .95, .042, .042, top], [2, .3, .041, .039, top], [2, .82, .038, .035, top], [2, .9, .037, .034, trim], [2, .97, .035, .032, trim], [2, .975, .026, .022, skin]]
      : [[0, 0, .056, .06, top], [0, .7, .058, .061, top], [1, .1, .053, .053, top], [1, .42, .049, .049, top], [1, .47, .049, .049, trim], [1, .52, .047, .047, trim], [1, .525, .037, .036, skin], [1, .8, .034, .033, skin], [2, .1, .032, .031, skin], [2, .4, .034, .03, skin], [2, .8, .028, .025, skin], [2, .97, .025, .022, look.watch && side === 'L' ? colour(0x26303a) : skin]];
    limb(armJoints, names, [...arm, [3, .15, .03, .016, skin], [3, .5, .036, .017, skin], [3, .8, .033, .015, skin], [3, 1, .02, .01, skin]], armFrame, 12, .04, { capEnd: true });
    const handW = () => [[id('hand' + side), 1]];
    build.ellipsoid(J['hand' + side].clone().add(new T.Vector3(sx * .03, -.004, .03)), [.026, .011, .012], () => skin, handW, [new T.Vector3(sx * .8, 0, .6).normalize(), Y, new T.Vector3(-.6, 0, sx * .8).normalize()], 8, 6);
    if (look.watch && side === 'L') build.roundedBox(J.handL.clone().add(new T.Vector3(-.025, .022, 0)), [.03, .008, .03], .004, () => colour(0x9aa3ad), handW);
  }

  // Backpack and straps, riding with the upper back.
  if (look.bag) {
    const black = look.bag === 'black', bagColour = colour(black ? 0x2c2c33 : 0xc22f3c), bagTrim = colour(black ? 0x3d3b46 : 0x2c2229);
    const backZ = spineZ(J.spine002.y + .05) + .01 - .088, by = J.spine002.y + .04, packW = p => [[id('spine003'), .55], [id('spine002'), .45]];
    build.roundedBox(new T.Vector3(0, by, backZ - .06), [.19, .26, .1], .035, p => p.y < by - .12 ? bagTrim : bagColour, packW);
    build.roundedBox(new T.Vector3(0, by - .06, backZ - .12), [.14, .11, .04], .018, () => bagColour, packW);
    build.roundedBox(new T.Vector3(0, by - .03, backZ - .141), [.1, .008, .006], .002, () => bagTrim, packW);
    for (const sx of [-1, 1]) {
      const path = [[.06, by + .12, backZ - .02], [.085, shoulderY + .05, backZ + .045], [.095, shoulderY + .06, .0], [.1, shoulderY + .03, .065], [.105, J.spine002.y + .06, .098], [.112, by - .06, .097], [.118, by - .12, .05], [.085, by - .13, backZ - .04]];
      const pts = path.map(([px, py, pz]) => new T.Vector3(sx * px, py, pz));
      const strapW = p => { const t = smooth(J.spine002.y + .02, shoulderY + .02, p.y); return [[id('spine003'), .5 + .2 * t], [id('spine002'), .5 - .3 * t], [id(sx > 0 ? 'shoulderL' : 'shoulderR'), .1 * t]]; };
      const curve = new T.CatmullRomCurve3(pts), rings = [];
      for (let i = 0; i <= 20; i++) {
        const c = curve.getPoint(i / 20), tan = curve.getTangent(i / 20), out = new T.Vector3(sx, 0, 0).sub(tan.clone().multiplyScalar(tan.x * sx)).normalize(), v = new T.Vector3().crossVectors(tan, out).normalize();
        rings.push({ c, u: out, v, a: .006, b: .016, colour: () => bagTrim, weights: strapW });
      }
      build.loft(rings, 8);
    }
  }

  const geometry = build.geometry();
  const figure = new T.SkinnedMesh(geometry, bodyMaterial); figure.castShadow = figure.receiveShadow = true; figure.frustumCulled = false;
  root.add(figure); root.updateMatrixWorld(true); figure.bind(new T.Skeleton(bones), figure.matrixWorld);
  outline(figure, 1.8);

  // Their own heads on the neck bone: the authored face, hair, hijab and
  // hood, merged per material and scaled to a real child's head.
  const parts = createCharacter(new T.Group(), 0, 0, kind, { parts: true });
  let outer = parts.head; while (outer.parent) outer = outer.parent; outer.updateMatrixWorld(true);
  const [, ry] = parts.radii, f = .107 / ry, headBone = bone('head');
  const place = new T.Matrix4().makeTranslation(0, J.head.y - .02, J.head.z + .012)
    .multiply(new T.Matrix4().makeScale(f, f, f)).multiply(new T.Matrix4().makeTranslation(0, -(parts.headY - ry), 0));
  const toBone = new T.Matrix4().copy(headBone.matrixWorld).invert().multiply(root.matrixWorld);
  const byMaterial = new Map();
  parts.head.traverse(o => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!o.material.map) g.deleteAttribute('uv'); else if (!g.attributes.uv) return;
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new T.Matrix4().multiplyMatrices(toBone, place).multiply(o.matrixWorld));
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    byMaterial.get(o.material).push(g);
  });
  const headParts = [];
  for (const [mat, list] of byMaterial) {
    const merged = mergeGeometries(list); list.forEach(g => g.dispose());
    const m = new T.Mesh(merged, mat); m.castShadow = !mat.transparent; m.receiveShadow = true; headBone.add(m); headParts.push(m);
    if (!mat.transparent && !mat.map) outline(m, 1.8);
  }
  // Chest print (Amir's alien), riding with the chest.
  if (look.motif) {
    const chest = bone('spine002'), y = J.spine002.y + .07, decal = new T.Mesh(new T.PlaneGeometry(.075, .075), motif(look.motif));
    const world = new T.Matrix4().multiplyMatrices(root.matrixWorld, new T.Matrix4().makeTranslation(0, y, spineZ(y) + .01 + .09));
    decal.matrixAutoUpdate = true; decal.applyMatrix4(new T.Matrix4().copy(chest.matrixWorld).invert().multiply(world)); chest.add(decal);
  }
  const shadow = new T.Mesh(new T.PlaneGeometry(.62, .62), new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .075; root.add(shadow);

  const { animate, wave, mixer, native } = attachMotion({ root, skeletonRoot, bone, rig, clips: rig.clips, scale });
  animate(0);
  root.userData.design = kind; root.userData.height = look.height;
  return { group: root, figure, head: headBone, bone, height: look.height, animate, wave, mixer, scale, native, bikeScale: 1, actor: true };
}

// The shared motion for every motion-captured body: gait blending on one
// stride phase, crouch, jump, talking idle, the rider's IK and the wave.
// `clips` may be retargeted to another body (see createModelActor).
function attachMotion({ root, skeletonRoot, bone, rig, clips, scale, groundLock = null }) {
  // Motion: idle, walk, jog and sprint share one stride phase, blended by
  // the speed the player actually moved, each played at the rate that keeps
  // its planted foot still on the ground. Crouching swaps in the crouch idle
  // and crouch walk; a jump plays take-off, air and landing; talking swaps in
  // the talking idle; riding plays the seated clip under the bike IK below.
  const mixer = new T.AnimationMixer(skeletonRoot), actions = {};
  const LAYERS = ['idle', 'talk', ...GAITS, 'crouch', 'crouchWalk', 'jumpStart', 'jumpAir', 'jumpLand', 'ride'];
  for (const key of LAYERS) { const a = mixer.clipAction(clips[key]); a.play(); a.setEffectiveWeight(0); actions[key] = a; }
  for (const key of ['jumpStart', 'jumpLand']) { actions[key].setLoop(T.LoopOnce); actions[key].clampWhenFinished = true; }
  const native = Object.fromEntries(MEASURED.map(k => [k, rig.gait[k].speed * scale]));
  const weights = Object.fromEntries(LAYERS.map(k => [k, k === 'idle' ? 1 : 0]));
  const R = name => bone(name);
  let speed = 0, phase = 0, crouchPhase = 0, jumpClock = -1, landClock = -1, waveClock = -1;
  function animate(dt, moving = 0, running = false, travel = 0, action = null, state = {}) {
    const measured = dt > 0 ? travel / dt : 0;
    speed = T.MathUtils.lerp(speed, measured, 1 - Math.exp(-dt * 10));
    if (state.jumped) { jumpClock = 0; landClock = -1; actions.jumpStart.reset().play(); }
    if (state.landed) { landClock = 0; jumpClock = -1; actions.jumpLand.reset().play(); actions.jumpLand.time = .04; }
    if (jumpClock >= 0) jumpClock += dt;
    if (landClock >= 0 && (landClock += dt) > 1.2) landClock = -1;
    const riding = !!state.ride, skating = !!state.skate && !riding, crouching = !!state.crouch && !riding && !skating, go = smooth(.08, .5, speed);
    const target = Object.fromEntries(LAYERS.map(k => [k, 0]));
    if (riding) target.ride = 1;
    else if (skating) target.idle = 1;
    else if (state.air || (jumpClock >= 0 && jumpClock < .2)) {
      const start = jumpClock >= 0 ? 1 - smooth(.1, .32, jumpClock) : 0;
      target.jumpStart = start; target.jumpAir = 1 - start;
    } else {
      if (crouching) { target.crouch = 1 - go; target.crouchWalk = go; }
      else {
        const jog = smooth(Math.max(native.walk * 1.2, 1.5), native.jog * .8, speed), sprint = smooth(native.jog * 1.05, native.sprint * .95, speed);
        Object.assign(target, { walk: go * (1 - jog), jog: go * jog * (1 - sprint), sprint: go * jog * sprint, talk: (1 - go) * (action === 'talk' ? 1 : 0), idle: (1 - go) * (action === 'talk' ? 0 : 1) });
      }
      // Landing: knees take the weight, then hand back to standing or running.
      if (landClock >= 0) {
        const hold = 1 - (moving > .1 ? smooth(.12, .32, landClock) : smooth(.3, .7, landClock));
        for (const key of LAYERS) target[key] *= 1 - hold;
        target.jumpLand = hold;
      }
    }
    const k = 1 - Math.exp(-dt * (state.jumped || state.landed || state.air ? 16 : 9));
    for (const key of LAYERS) { weights[key] += (target[key] - weights[key]) * k; actions[key].setEffectiveWeight(weights[key]); }
    // One stride phase, advanced at the blend of each gait's own cadence.
    const moveWeight = weights.walk + weights.jog + weights.sprint;
    if (moveWeight > .001) {
      let rate = 0; for (const g of GAITS) rate += weights[g] / moveWeight * Math.max(speed, .3) / native[g] / clips[g].duration;
      phase = (phase + dt * Math.min(rate, 2.4)) % 1;
    }
    for (const g of GAITS) { const a = actions[g]; a.time = ((phase + rig.gait[g].strike) % 1) * clips[g].duration; a.timeScale = 0; }
    if (weights.crouchWalk > .001) crouchPhase = (crouchPhase + dt * Math.min(Math.max(speed, .2) / native.crouchWalk / clips.crouchWalk.duration, 2)) % 1;
    actions.crouchWalk.time = crouchPhase * clips.crouchWalk.duration; actions.crouchWalk.timeScale = 0;
    skeletonRoot.position.set(0, .065, 0);
    mixer.update(dt);
    root.updateMatrixWorld(true);
    // Bodies with other proportions keep their feet on the ground.
    if (groundLock && !riding && !skating) groundLock(dt, !!state.air || (jumpClock >= 0 && jumpClock < .2));
    // Overlays on top of the clips: the rider's seat, feet and hands, then the wave.
    if (riding) ride(state.ride);
    if (skating) skate(state.skate);
    if (waveClock >= 0) { waveClock += dt; waveArm(waveClock); if (waveClock > 2.1) waveClock = -1; }
  }

  // Turn a bone (in world space) so its child lands on a target; `weight`
  // blends from the animated pose.
  const va = new T.Vector3(), vb = new T.Vector3(), vc = new T.Vector3(), qa = new T.Quaternion(), qb = new T.Quaternion(), qp = new T.Quaternion();
  function aim(b, child, target, weight = 1) {
    b.getWorldPosition(va); child.getWorldPosition(vb);
    qa.setFromUnitVectors(vb.sub(va).normalize(), vc.copy(target).sub(va).normalize());
    b.getWorldQuaternion(qb); b.parent.getWorldQuaternion(qp).invert();
    qb.premultiply(qa).premultiply(qp);
    b.quaternion.slerp(qb, weight); b.updateMatrixWorld(true);
  }
  function turn(b, axis, angle) {
    b.getWorldQuaternion(qb); b.parent.getWorldQuaternion(qp).invert();
    qb.premultiply(qa.setFromAxisAngle(axis, angle)).premultiply(qp);
    b.quaternion.copy(qb); b.updateMatrixWorld(true);
  }
  // Two-bone reach: the middle joint bends toward `pole`.
  function reach(upper, lower, end, target, pole, weight = 1) {
    const a = upper.getWorldPosition(new T.Vector3()), b = lower.getWorldPosition(new T.Vector3()), c = end.getWorldPosition(new T.Vector3());
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c), to = target.clone().sub(a);
    const d = T.MathUtils.clamp(to.length(), Math.abs(l1 - l2) + .002, (l1 + l2) * .998), dir = to.normalize();
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const side = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    aim(upper, lower, a.clone().addScaledVector(dir, x).addScaledVector(side, h), weight);
    aim(lower, end, a.clone().addScaledVector(dir, d), weight);
  }
  // On the bike: hips onto the saddle, a slight lean over the bars, feet on
  // the pedals (knees forward), hands on the grips (elbows out and down).
  function ride({ hips, pedals, grips, forward, up, right }) {
    const now = R('hips').getWorldPosition(new T.Vector3());
    skeletonRoot.position.add(root.worldToLocal(hips.clone()).sub(root.worldToLocal(now)));
    skeletonRoot.updateMatrixWorld(true);
    // The seated clip reclines; lean the back over the bar instead, keeping
    // the head upright and looking ahead.
    const pelvis = R('hips').getWorldPosition(new T.Vector3()), neck = R('neck').getWorldPosition(new T.Vector3()), back = neck.distanceTo(pelvis);
    aim(R('hips'), R('neck'), pelvis.clone().addScaledVector(up, back * .88).addScaledVector(forward, back * .47));
    const headAt = R('neck').getWorldPosition(new T.Vector3()), neckLength = R('head').getWorldPosition(new T.Vector3()).distanceTo(headAt);
    aim(R('neck'), R('head'), headAt.addScaledVector(up, neckLength * .95).addScaledVector(forward, neckLength * .3));
    const knee = forward.clone().addScaledVector(up, .35);
    [['L', 0], ['R', 1]].forEach(([s, i]) => {
      reach(R('thigh' + s), R('shin' + s), R('foot' + s), pedals[i], knee);
      aim(R('foot' + s), R('toe' + s), pedals[i].clone().addScaledVector(forward, .12).addScaledVector(up, -.035));
      const out = right.clone().multiplyScalar(s === 'L' ? -1 : 1);
      reach(R('upper_arm' + s), R('forearm' + s), R('hand' + s), grips[i], out.multiplyScalar(.7).addScaledVector(up, -.5).addScaledVector(forward, -.2));
    });
  }
  // On the skateboard (v2.14), old-school arcade style: side-on, left foot to
  // the nose. The hips drop by `crouch` metres so the knees bend over the toes,
  // the feet go to the board's targets (the back one may be pushing on the
  // ground), the chest opens and the head turns toward the nose, and the arms
  // hang out for balance, lifted by `arms` in the air.
  function skate({ feet, crouch, arms, along, up, toes }) {
    const now = R('hips').getWorldPosition(new T.Vector3());
    skeletonRoot.position.add(root.worldToLocal(now.clone().addScaledVector(up, -crouch)).sub(root.worldToLocal(now.clone())));
    skeletonRoot.updateMatrixWorld(true);
    const pelvis = R('hips').getWorldPosition(new T.Vector3()), back = R('neck').getWorldPosition(new T.Vector3()).distanceTo(pelvis);
    aim(R('hips'), R('neck'), pelvis.clone().addScaledVector(up, back * .96).addScaledVector(toes, back * (.08 + crouch * .9)));
    turn(R('spine003'), up, .3); turn(R('neck'), up, .6);
    [['L', 0, 1], ['R', 1, -1]].forEach(([s, i, end]) => {
      reach(R('thigh' + s), R('shin' + s), R('foot' + s), feet[i], toes.clone().addScaledVector(along, .4 * end).addScaledVector(up, .15));
      aim(R('foot' + s), R('toe' + s), feet[i].clone().addScaledVector(toes, .12).addScaledVector(along, .035 * end).addScaledVector(up, -.06));
      const hand = R('upper_arm' + s).getWorldPosition(new T.Vector3()).addScaledVector(along, (.22 + .12 * arms) * end).addScaledVector(up, -.34 + .24 * arms).addScaledVector(toes, .05);
      reach(R('upper_arm' + s), R('forearm' + s), R('hand' + s), hand, up.clone().negate().addScaledVector(toes, -.4));
    });
  }
  // Say hi: the right arm lifts out and up and the forearm waves, layered on
  // whatever the body is doing.
  const rootQ = new T.Quaternion();
  function waveArm(t) {
    const w = smooth(0, .25, t) * (1 - smooth(1.75, 2.1, t));
    root.getWorldQuaternion(rootQ);
    const shoulder = R('upper_armR').getWorldPosition(new T.Vector3()), elbow = R('forearmR').getWorldPosition(new T.Vector3()), hand = R('handR').getWorldPosition(new T.Vector3());
    const l1 = shoulder.distanceTo(elbow), l2 = elbow.distanceTo(hand);
    const upper = new T.Vector3(-.62, .62, .32).normalize().applyQuaternion(rootQ);
    aim(R('upper_armR'), R('forearmR'), shoulder.clone().addScaledVector(upper, l1), w);
    const fore = new T.Vector3(-.08, 1, .14).normalize().applyAxisAngle(new T.Vector3(0, 0, 1), Math.sin(t * Math.PI * 4.4) * .45).applyQuaternion(rootQ);
    const at = R('forearmR').getWorldPosition(new T.Vector3());
    aim(R('forearmR'), R('handR'), at.addScaledVector(fore, l2), w);
  }
  const wave = () => { if (waveClock < 0 || waveClock > 1.6) waveClock = 0; };
  animate(0);
  return { animate, wave, mixer, native };
}

// A modelled character on the same skeleton (v2.2). The skeleton is fitted to
// the model's joints in its rest frames, the arms are lowered into the
// model's A-pose and the mesh is bound there. The clips are retargeted: joint
// rotations as recorded, hip travel scaled to the shorter legs, no baked bone
// lengths. A ground lock keeps the feet on the floor.
const STAND = .065, LEG = .673;
export const FINGERS = ['thumb', 'f_index', 'f_middle', 'f_ring', 'f_pinky'];
// Where each drawn face sits, as fractions of the head's bind-pose bounds.
const FACE_RECTS = { amir: { kind: 'amir', halfWidth: .42, bottom: .0, top: .6 }, nur: { kind: 'nur', halfWidth: .42, bottom: .0, top: .6 } };
function createModelActor(scene, x, z, kind, rig, model) {
  const { joints: J, bones: order, height = 1.5 } = model.parser.json.extras;
  const root = new T.Group(); root.position.set(x, 0, z); scene.add(root);
  const skeletonRoot = cloneRig(rig.scene); root.add(skeletonRoot);
  const sourceMeshes = []; skeletonRoot.traverse(o => { if (o.isMesh) sourceMeshes.push(o); }); sourceMeshes.forEach(o => o.removeFromParent());
  skeletonRoot.position.y = STAND; root.updateMatrixWorld(true);
  const bone = name => skeletonRoot.getObjectByName('DEF-' + name);
  const target = name => root.localToWorld(new T.Vector3(J[name][0], J[name][1] + STAND, J[name][2]));
  const placeAt = (name, world) => { const b = bone(name); b.position.copy(b.parent.worldToLocal(world)); b.updateMatrixWorld(true); };
  for (const name of ['hips', 'spine001', 'spine002', 'spine003', 'neck', 'head']) placeAt(name, target(name));
  for (const s of ['L', 'R']) {
    for (const name of ['shoulder', 'upper_arm', 'thigh', 'shin', 'foot', 'toe']) placeAt(name + s, target(name + s));
    // Forearm and hand keep the rest direction with the model's lengths, then
    // the arm swings down into the model's pose.
    for (const [name, from] of [['forearm', 'upper_arm'], ['hand', 'forearm']]) bone(name + s).position.setLength(new T.Vector3(...J[name + s]).distanceTo(new T.Vector3(...J[from + s])) / bone(from + s).getWorldScale(new T.Vector3()).x);
    root.updateMatrixWorld(true);
    aimBone(bone('upper_arm' + s), bone('forearm' + s), target('forearm' + s));
    aimBone(bone('forearm' + s), bone('hand' + s), target('hand' + s));
    // Fighter models carry finger joints; the rig's finger bones move onto them.
    for (const f of FINGERS) for (const k of [1, 2, 3]) if (J[f + '0' + k + s]) placeAt(f + '0' + k + s, target(f + '0' + k + s));
  }
  root.updateMatrixWorld(true);
  const bones = []; skeletonRoot.traverse(o => { if (o.isBone) bones.push(o); });
  const mesh = model.scene.getObjectByProperty('isMesh', true), geometry = mesh.geometry.clone();
  geometry.translate(0, STAND, 0);
  const remap = order.map(name => bones.indexOf(bone(name))), source = geometry.attributes.skinIndex, indices = new Uint16Array(source.count * 4);
  for (let i = 0; i < source.count; i++) for (let k = 0; k < 4; k++) indices[i * 4 + k] = remap[source.getComponent(i, k)];
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
  const material = toon(0xffffff, { map: mesh.material.map });
  const figure = new T.SkinnedMesh(geometry, material); figure.castShadow = figure.receiveShadow = true; figure.frustumCulled = false;
  root.add(figure); root.updateMatrixWorld(true); figure.bind(new T.Skeleton(bones), figure.matrixWorld);
  outline(figure, 1.6);
  const outfit = dressModel({ kind, root, material, geometry, skinIndex: source, order, joints: J, headBone: bone('head'), stand: STAND });
  // The kids' faces are drawn over the model's soft painted ones (face.js).
  const face = FACE_RECTS[kind] ? createFace({ root, geometry, skinIndex: source, order, headBone: bone('head'), map: mesh.material.map, rect: FACE_RECTS[kind] }) : null;
  const shadow = new T.Mesh(new T.PlaneGeometry(.62, .62), new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .075; root.add(shadow);

  // Leg length against the source rig sets the hip travel and the gait speeds.
  const rigBone = name => rig.scene.getObjectByName('DEF-' + name), w = o => o.getWorldPosition(new T.Vector3());
  rig.scene.updateMatrixWorld(true);
  const rigLeg = w(rigBone('thighL')).distanceTo(w(rigBone('shinL'))) + w(rigBone('shinL')).distanceTo(w(rigBone('footL')));
  const leg = new T.Vector3(...J.thighL).distanceTo(new T.Vector3(...J.shinL)) + new T.Vector3(...J.shinL).distanceTo(new T.Vector3(...J.footL));
  const k = leg / rigLeg, hipsRest = rigBone('hips').position, hipsOurs = bone('hips').position.clone();
  const clips = Object.fromEntries(Object.entries(rig.clips).map(([key, clip]) => {
    const tracks = clip.tracks.filter(t => t.name.endsWith('.quaternion')).map(t => t.clone());
    const hips = clip.tracks.find(t => t.name === 'DEF-hips.position');
    if (hips) { const t = hips.clone(); for (let i = 0; i < t.values.length; i += 3) for (let c = 0; c < 3; c++) t.values[i + c] = hipsOurs.getComponent(c) + (t.values[i + c] - hipsRest.getComponent(c)) * k; tracks.push(t); }
    return [key, new T.AnimationClip(clip.name, clip.duration, tracks)];
  }));
  // Feet on the floor: the lower ankle rests at its bind height while on the
  // ground, eased so a jog keeps a little of its bounce.
  const ankle = J.footL[1] + STAND, footL = bone('footL'), footR = bone('footR'), probe = new T.Vector3();
  let lift = 0;
  function groundLock(dt, air) {
    if (air) { lift = T.MathUtils.lerp(lift, 0, 1 - Math.exp(-dt * 6)); }
    else {
      const low = Math.min(root.worldToLocal(footL.getWorldPosition(probe)).y, root.worldToLocal(footR.getWorldPosition(probe)).y);
      lift = T.MathUtils.lerp(lift, ankle - low, dt > 0 ? 1 - Math.exp(-dt * 14) : 1);
    }
    skeletonRoot.position.y = STAND + lift; root.updateMatrixWorld(true);
  }
  const { animate: move, wave, mixer, native } = attachMotion({ root, skeletonRoot, bone, rig, clips, scale: k, groundLock });
  const animate = (dt, moving, running, travel, action, state) => { move(dt, moving, running, travel, action, state); face?.update(dt, action === 'talk'); };
  root.userData.design = kind; root.userData.height = height;
  return { group: root, figure, head: bone('head'), bone, height, animate, wave, mixer, scale: k, native, bikeScale: Math.min(1, leg / LEG + .08), actor: true, outfit, face, fighterReady: !!model.parser.json.extras.fighterReady };
}
// Turn a bone so its child points at a world target (bind-time fitting).
function aimBone(b, child, target) {
  const from = child.getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(new T.Vector3())).normalize(), to = target.clone().sub(b.getWorldPosition(new T.Vector3())).normalize();
  const q = new T.Quaternion().setFromUnitVectors(from, to), world = b.getWorldQuaternion(new T.Quaternion()), parent = b.parent.getWorldQuaternion(new T.Quaternion()).invert();
  b.quaternion.copy(parent.multiply(q.multiply(world))); b.updateMatrixWorld(true);
}
