import * as T from 'three';
import { toon, outline } from './illustration.js';

// Clothes for the modelled kids (v2.11). Their shirts are painted into one
// image-to-3D texture, so a new shirt colour is a shader tint: points weighted
// to the torso and arms whose painted colour is the shirt's (Amir's white
// ringer tee, Nur's pink hoodie) take the new colour and keep their shading.
// Caps are separate meshes on the head bone, sized from the head and hair.
const SHIRT_BONES = ['spine001', 'spine002', 'spine003', 'shoulderL', 'shoulderR', 'upper_armL', 'upper_armR', 'forearmL', 'forearmR'];
// Nur's hoodie also has its hood; her face and hijab edge do not match its pink.
const EXTRA_BONES = { nur: ['neck', 'head'] };
// Which painted colours count as the shirt, per character (linear RGB).
const MATCH = {
  amir: { ref: '.78', test: 'float shirtMatch = (1.0 - smoothstep(.07, .16, chroma)) * smoothstep(.36, .52, lum);' },
  // The hoodie texture has pale, nearly white patches, so Nur's test keeps
  // only skin, the flower print and dark straps out instead of matching pink.
  nur: { ref: '.55', test: 'float skin = smoothstep(.0, .08, (c.g - c.b) / max(c.r, .01)) * smoothstep(.3, .5, (c.r - c.b) / max(c.r, .01)), flower = smoothstep(.45, .6, (c.r - c.g) / max(c.r, .01)); float shirtMatch = (1.0 - skin) * (1.0 - flower) * smoothstep(.08, .16, lum);' }
};

export const SHIRTS = {
  asal: null,
  merah: 0xb8322c, biru: 0x2f5fa8, kuning: 0xe8b52e, hijau: 0x3f8a4a, oren: 0xe2742c, hitam: 0x2b2b30, ungu: 0x6d4a9a
};
export const CAPS = {
  merah: { crown: 0xb8322c, brim: 0xb8322c, button: 0xf1e7d0 },
  biru: { crown: 0x2f5fa8, brim: 0xf1e7d0, button: 0xf1e7d0 },
  kuning: { crown: 0xe8b52e, brim: 0x2b2b30, button: 0x2b2b30 },
  hitam: { crown: 0x2b2b30, brim: 0x2b2b30, button: 0xb8322c }
};

export function dressModel({ kind, root, material, geometry, skinIndex, order, joints, headBone, stand }) {
  const match = MATCH[kind] || MATCH.amir;
  // Per-vertex share of the shirt bones. The hips count only above the waist.
  const index = skinIndex, weight = geometry.attributes.skinWeight, position = geometry.attributes.position;
  const shirtBones = new Set([...SHIRT_BONES, ...(EXTRA_BONES[kind] || [])].map(n => order.indexOf(n))), hips = order.indexOf('hips'), headIndex = order.indexOf('head');
  const waist = joints.hips[1] + stand - .1, shirt = new Float32Array(index.count), headZone = new Float32Array(index.count);
  const head = new T.Box3(), point = new T.Vector3();
  for (let i = 0; i < index.count; i++) {
    let top = 0, topWeight = 0;
    for (let k = 0; k < 4; k++) { const w = weight.getComponent(i, k); if (w > topWeight) { topWeight = w; top = index.getComponent(i, k); } }
    if (top === headIndex) head.expandByPoint(point.fromBufferAttribute(position, i));
  }
  // A hood is the head's back, sides and crown, never the face.
  const faceZ = (head.min.z + head.max.z) / 2 + (head.max.z - head.min.z) * .12, crownY = head.max.y - (head.max.y - head.min.y) * .22;
  for (let i = 0; i < index.count; i++) {
    point.fromBufferAttribute(position, i);
    const hood = point.z < faceZ || point.y > crownY;
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const b = index.getComponent(i, k), w = weight.getComponent(i, k);
      if (b === headIndex) headZone[i] += w;
      if (b === headIndex ? hood && shirtBones.has(b) : shirtBones.has(b) || (b === hips && point.y > waist)) s += w;
    }
    shirt[i] = s;
  }
  geometry.setAttribute('shirtZone', new T.BufferAttribute(shirt, 1));
  geometry.setAttribute('headZone', new T.BufferAttribute(headZone, 1));

  // Hair inside a worn cap is hidden above its rim (bind-pose height).
  const uniforms = { shirtColor: { value: new T.Color(0xffffff) }, shirtOn: { value: 0 }, capRim: { value: 99 } };
  const halftone = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute float shirtZone;\nattribute float headZone;\nvarying float vShirtZone;\nvarying float vHeadZone;\nvarying float vBindY;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShirtZone = shirtZone; vHeadZone = headZone; vBindY = position.y;');
    shader.fragmentShader = 'uniform vec3 shirtColor;\nuniform float shirtOn;\nuniform float capRim;\nvarying float vShirtZone;\nvarying float vHeadZone;\nvarying float vBindY;\n' + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vHeadZone > .2 && vBindY > capRim) discard;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float lum = dot(c, vec3(.2126, .7152, .0722)), chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        ${match.test}
        float paint = shirtOn * smoothstep(.45, .8, vShirtZone) * shirtMatch;
        diffuseColor.rgb = mix(c, shirtColor * clamp(lum / ${match.ref}, .3, 1.15), paint);
      }`);
    halftone?.(shader, renderer);
  };
  material.customProgramCacheKey = () => 'illustrated-halftone-v1-shirt-' + kind;

  // The ink hull shares the figure's geometry; hide the same hair from it.
  root.traverse(o => {
    if (!o.userData.ink || o.geometry !== geometry || !o.material.isShaderMaterial) return;
    const ink = o.material.clone();
    ink.uniforms = { ...ink.uniforms, capRim: uniforms.capRim };
    ink.vertexShader = 'attribute float headZone;\nvarying float vHeadZone;\nvarying float vBindY;\n' + ink.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeadZone = headZone; vBindY = position.y;');
    ink.fragmentShader = 'uniform float capRim;\nvarying float vHeadZone;\nvarying float vBindY;\n' + ink.fragmentShader.replace('void main(){', 'void main(){if (vHeadZone > .2 && vBindY > capRim) discard;');
    o.material = ink;
  });

  // The cap: a domed crown and a curved brim, fitted over the hair.
  const width = head.max.x - head.min.x, depth = head.max.z - head.min.z;
  const centre = new T.Vector3((head.min.x + head.max.x) / 2, head.max.y, (head.min.z + head.max.z) / 2);
  let cap = null;
  function setCap(style, backwards = false) {
    if (cap) { cap.removeFromParent(); cap.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); cap = null; }
    uniforms.capRim.value = 99;
    const look = CAPS[style];
    if (!look) return;
    // Crown: a deep dome over the hair; its rim is the head's widest ring.
    const rx = width * .56, rz = depth * .6, high = Math.max(rx, rz) * .7, group = new T.Group();
    const crown = new T.Mesh(new T.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(look.crown));
    crown.scale.set(rx, high, rz);
    const panel = new T.Mesh(new T.SphereGeometry(1.004, 22, 10, -Math.PI * .2, Math.PI * .4, Math.PI * .12, Math.PI * .34), toon(look.crown));
    panel.scale.copy(crown.scale);
    // Brim: a flat crescent from the front of the rim, tipped slightly down.
    const brimShape = new T.Shape(); brimShape.absarc(0, 0, 1, Math.PI * .12, Math.PI * .88, false); brimShape.absarc(0, -.42, .9, Math.PI * .78, Math.PI * .22, true);
    const brim = new T.Mesh(new T.ExtrudeGeometry(brimShape, { depth: .014, bevelEnabled: false, curveSegments: 18 }), toon(look.brim));
    brim.rotation.x = Math.PI / 2 + .16; brim.scale.set(rx * .95, rz * .95, 1); brim.position.set(0, .012, rz * .28);
    const button = new T.Mesh(new T.SphereGeometry(.016, 8, 6), toon(look.button)); button.position.y = high - .004;
    for (const part of [crown, panel, brim, button]) { part.castShadow = true; group.add(part); }
    group.position.copy(centre); group.position.y -= high * 1.25;
    if (backwards) group.rotation.y = Math.PI;
    // Fit in the bind pose, then ride on the head bone.
    uniforms.capRim.value = group.position.y + high * .3;
    root.add(group); root.updateMatrixWorld(true); headBone.attach(group);
    for (const part of [crown, brim]) outline(part, 1.6);
    group.userData.cap = style; cap = group;
  }
  function setShirt(name) {
    const colour = SHIRTS[name];
    uniforms.shirtOn.value = colour == null ? 0 : 1;
    if (colour != null) uniforms.shirtColor.value.setHex(colour);
  }
  return { setShirt, setCap, get cap() { return cap?.userData.cap ?? null; } };
}
