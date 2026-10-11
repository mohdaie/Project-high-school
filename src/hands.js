import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outline } from './illustration.js';

// Two fixes that make an image-to-3D body read as a fighter's.
// 1. Sharper joints. Weights baked by distance blend an elbow or knee over
//    a long stretch, so a bent arm curves like a hose. Here the blend between
//    the two bones narrows to a few centimetres across the joint's crease
//    plane, so the point of the elbow shows and the forearm stays straight.
// 2. Fists. The model's hands are mitts with no fingers. They are folded
//    away into the wrist and a modelled fist (curled fingers, knuckles, a
//    thumb across them and a hand wrap) is worn on the forearm instead.

const bindPos = (figure, i) => new T.Vector3().setFromMatrixPosition(figure.skeleton.boneInverses[i].clone().invert());
// Call with the skeleton in its bind pose.
export function sharpenJoints({ figure, bone }, widths = { elbow: .018, wrist: .012, knee: .03 }) {
  const g = figure.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const id = n => figure.skeleton.bones.indexOf(bone(n)), v = new T.Vector3();
  const joints = ['L', 'R'].flatMap(s => [['upper_arm' + s, 'forearm' + s, 'hand' + s, widths.elbow], ['forearm' + s, 'hand' + s, null, widths.wrist], ['thigh' + s, 'shin' + s, 'foot' + s, widths.knee]]);
  for (const [a, b, c, r] of joints) {
    const ia = id(a), ib = id(b), A = bindPos(figure, ia), B = bindPos(figure, ib);
    const up = B.clone().sub(A).normalize(), down = c ? bindPos(figure, id(c)).sub(B).normalize() : up.clone(), n = up.add(down).normalize();
    for (let i = 0; i < pos.count; i++) {
      let ka = -1, kb = -1, rest = 0;
      for (let k = 0; k < 4; k++) { const j = si.getComponent(i, k); if (j === ia) ka = k; else if (j === ib) kb = k; }
      if (ka < 0 && kb < 0) continue;
      const wa = ka < 0 ? 0 : sw.getComponent(i, ka), wb = kb < 0 ? 0 : sw.getComponent(i, kb), sum = wa + wb;
      if (sum < .5 || ka < 0 || kb < 0) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(figure.bindMatrix);
      const t = T.MathUtils.smoothstep(v.sub(B).dot(n), -r, r);
      sw.setComponent(i, ka, sum * (1 - t)); sw.setComponent(i, kb, sum * t);
    }
  }
  sw.needsUpdate = true;
}

// Skin tone under the model's hands, read from its texture.
function handColour({ figure, bone }) {
  const map = figure.material.map, img = map?.image; if (!img) return new T.Color(0xb57a52);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const g = figure.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const ids = ['handL', 'handR'].map(n => figure.skeleton.bones.indexOf(bone(n))), sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < uv.count && n < 400; i += 3) {
    let w = 0; for (let k = 0; k < 4; k++) if (ids.includes(si.getComponent(i, k))) w += sw.getComponent(i, k);
    if (w < .9) continue;
    const x = Math.floor(uv.getX(i) * c.width), y = Math.floor((map.flipY ? 1 - uv.getY(i) : uv.getY(i)) * c.height), p = ctx.getImageData(x, y, 1, 1).data;
    sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++;
  }
  return n ? new T.Color().setRGB(sum[0] / n / 255, sum[1] / n / 255, sum[2] / n / 255, T.SRGBColorSpace) : new T.Color(0xb57a52);
}

// One fist, wrist at the origin, knuckles along +y, palm toward +x, thumb
// toward +z. `L` is the hand's length (wrist to fingertips when open).
function fistGeometry(L) {
  const s = L / .09, parts = [], put = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x * s, y * s, z * s); parts.push(geo); };
  // Back of the hand and palm.
  put(new T.CapsuleGeometry(.024 * s, .028 * s, 4, 10).scale(1, 1, 1.45), 0, .03, 0);
  // Curled fingers: a roll across the front, sitting toward the palm side.
  put(new T.CapsuleGeometry(.02 * s, .04 * s, 4, 10), .006, .066, 0, Math.PI / 2);
  // Knuckle ridge: four bumps along the top of the roll.
  for (let k = 0; k < 4; k++) put(new T.SphereGeometry(.0105 * s, 8, 6), -.012, .078, (-.027 + k * .018));
  // Thumb across the front of the middle fingers.
  put(new T.CapsuleGeometry(.0105 * s, .026 * s, 3, 8), .026, .058, .012, Math.PI / 2, 0, -.35);
  const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); g.computeVertexNormals(); return g;
}

// Call with the skeleton in its bind pose (after sharpenJoints).
export function addFists(actor, { wrap = 0xeeeae0 } = {}) {
  const { figure, bone } = actor, skin = toon(handColour(actor)), tape = toon(wrap); actor.fists = {};
  for (const s of ['L', 'R']) {
    const forearm = bone('forearm' + s), hand = bone('hand' + s);
    const W = hand.getWorldPosition(new T.Vector3()), F = W.clone().sub(forearm.getWorldPosition(new T.Vector3())).normalize();
    // Palm faces the body at bind: toward the centre line, square to the forearm.
    const toward = new T.Vector3(s === 'L' ? -1 : 1, 0, 0), palm = toward.addScaledVector(F, -toward.dot(F)).normalize(), thumb = new T.Vector3().crossVectors(palm, F);
    if (thumb.z < 0) thumb.negate();
    const len = forearm.getWorldPosition(new T.Vector3()).distanceTo(W) * .88;
    const fist = new T.Group(), body = new T.Mesh(fistGeometry(len), skin);
    // Hand wrap: tape round the palm and wrist, snug to the palm's oval.
    const band = new T.Mesh(new T.CylinderGeometry(len * .255, len * .25, len * .26, 14), tape); band.position.y = len * .12; band.scale.z = 1.5;
    for (const m of [body, band]) { m.castShadow = true; fist.add(m); }
    // The right fist is the left one mirrored (palm × knuckles flips sign).
    fist.matrix.makeBasis(palm, F, thumb).setPosition(W); fist.matrix.decompose(fist.position, fist.quaternion, fist.scale);
    fist.updateMatrixWorld(true); forearm.attach(fist); actor.fists[s] = fist;
    outline(body, 1.6); outline(band, 1.6);
    // Fold the mitt away into the wrist.
    hand.scale.setScalar(.02);
  }
}
