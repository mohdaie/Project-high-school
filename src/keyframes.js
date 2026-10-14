// Poses are plain objects of number arrays (angles in degrees, targets in
// metres in the fighter's own space: +z forward, +x the fighter's left).
// A move is a list of [time, pose] keys; sampling eases between neighbours.
// A key may name how the motion arrives at it: 'in' accelerates all the way
// (a strike snapping out to impact), 'out' starts fast and settles.
export const ease = t => t * t * (3 - 2 * t);
export const EASE = { in: t => t * t * t, out: t => 1 - (1 - t) ** 3 };
export const mix = (a, b, w) => { const o = {}; for (const k in a) o[k] = b[k] ? a[k].map((v, i) => v + (b[k][i] - v) * w) : a[k].slice(); return o; };
export function sample(keys, t) {
  if (t <= keys[0][0]) return mix(keys[0][1], keys[0][1], 0);
  for (let i = 1; i < keys.length; i++) {
    const [t1, b] = keys[i], [t0, a] = keys[i - 1];
    if (t <= t1) return mix(a, b, (EASE[keys[i][2]] || ease)((t - t0) / (t1 - t0 || 1)));
  }
  return mix(keys.at(-1)[1], keys.at(-1)[1], 0);
}
// Fill a partial pose from a base so every key carries every channel.
export const over = (base, part) => { const o = {}; for (const k in base) o[k] = (part[k] ?? base[k]).slice(); return o; };
