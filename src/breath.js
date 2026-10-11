// Breathing for a fighter at rest and between attacks. `effort` builds while
// moving and attacking and settles at rest; it speeds and deepens the breath.
// An attack draws a breath in and holds it; when the attack ends the breath
// goes out in one quick push before the rhythm picks up again.
export const BREATH = { rest: .3, hard: .75, settle: .08, holdIn: 14, holdOut: 8, push: 2.5 };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const newBreath = () => ({ phase: 0, effort: 0, hold: 0, out: 0, was: false });
// Returns -1 (out) .. 1 (full and held).
export function breathe(b, dt, { moving = 0, attacking = false } = {}) {
  b.effort = clamp(b.effort + dt * ((attacking ? .35 : 0) + moving * .12 - BREATH.settle));
  if (b.was && !attacking) { b.out = 1; b.phase = .4; }
  b.was = attacking;
  b.hold = clamp(b.hold + dt * (attacking ? BREATH.holdIn : -BREATH.holdOut));
  b.out = clamp(b.out - dt * BREATH.push);
  if (!attacking) b.phase = (b.phase + dt * (BREATH.rest + (BREATH.hard - BREATH.rest) * b.effort) * (1 + 4 * b.out)) % 1;
  // In a little quicker than out, as people breathe.
  const p = b.phase, wave = p < .4 ? -Math.cos(p / .4 * Math.PI) : Math.cos((p - .4) / .6 * Math.PI);
  const depth = .55 + .45 * b.effort;
  return clamp(wave * depth * (1 - b.hold) + b.hold, -1, 1);
}
