// Resolve the game's vendored Three.js for offline asset/rig validation.
export async function resolve(s, context, next) {
  if (s === 'three') return { url: new URL('../vendor/three.module.js', import.meta.url).href, shortCircuit: true };
  if (s.startsWith('three/addons/')) return { url: new URL('../vendor/' + s.slice(6), import.meta.url).href, shortCircuit: true };
  return next(s, context);
}
