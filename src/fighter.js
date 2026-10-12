import * as T from 'three';
import { toon, outline } from './illustration.js';

// A fighter rigged in Blender (scripts/rig-jai.py) on its own skeleton:
// spine, neck, head, shoulders, elbows, wrists, hips, knees, ankles and toes,
// three joints in every finger and thumb, and two breathing bones. retarget.js
// poses the body from the mannequin; here the hands close into fists and the
// ribcage and belly breathe.
export function createFighter(scene, gltf) {
  const ex = gltf.parser.json.extras, body = gltf.scene, group = new T.Group();
  group.add(body); scene.add(group);
  const figure = body.getObjectByProperty('isSkinnedMesh', true);
  figure.material = toon(0xffffff, { map: figure.material.map }); figure.castShadow = figure.receiveShadow = true; figure.frustumCulled = false;
  outline(figure, 1.6);
  const bone = name => body.getObjectByName('DEF-' + name);
  // Each digit's fist turn, an axis-angle in its bind frame; g opens (0) or closes (1) a hand.
  const digits = Object.entries(ex.grip).map(([n, [x, y, z, a]]) => ({ o: bone(n), axis: new T.Vector3(x, y, z), a, side: n.at(-1) === 'L' ? 0 : 1 }));
  const grip = (g = [1, 1]) => { for (const d of digits) d.o.quaternion.setFromAxisAngle(d.axis, d.a * g[d.side]); };
  // Breath (-1 out .. 1 in): ribs widen and deepen, the belly draws in.
  const lungs = Object.entries(ex.breath).map(([n, k]) => ({ o: bone(n), k }));
  const breathe = v => { for (const { o, k } of lungs) o.scale.set(1 + k[0] * v, 1 + k[1] * v, 1 + k[2] * v); };
  grip(); breathe(0);
  return { group, figure, bone, grip, breathe, height: ex.height, fighterReady: true };
}
