import { STREET } from './street.js';

// Jai's fight rules: a street fight, bare hands only, in the stance from his
// photo. His moves are Street_* clips baked from street.js poses on the
// Universal Animation Library 2 mannequin (pose.js); falls, getting up, the
// guard break and running are the library's own clips (Quaternius, CC0). The
// library's sword techniques are kept in sword.js. Pure data and rules;
// fighter.js and brawler-view.js play and draw them.

// Clip lengths in seconds: the library's (tests check them against the GLB)
// and the baked street clips.
export const UAL = {
  Sword_Regular_A: .433, Sword_Regular_A_Rec: .967, Sword_Regular_B: .533, Sword_Regular_B_Rec: 1.033, Sword_Regular_C: 2, Sword_Regular_Combo: 3, Sword_Heavy_Combo: 4.333,
  Sword_Dash: 1.567, Sword_Block: 1.233, Melee_Hook: .467, Melee_Hook_Rec: .6, Idle_FoldArms_Loop: 2.5, Shield_OneShot: .833, Shield_Dash: 1.1, Idle_Shield_Loop: 2.5,
  Idle_Shield_Break: 1.067, Zombie_Scratch: 1.8, Slide_Start: .833, Slide_Loop: 2, Slide_Exit: .5, NinjaJump_Start: .967, NinjaJump_Idle_Loop: 2, NinjaJump_Land: 1.267,
  Hit_Knockback: .833, LayToIdle: 1.533, Idle_Loop: 2.5, Walk_Loop: 1.333, Jog_Fwd_Loop: .933, Sprint_Loop: .667
};
export const CLIPS = { ...UAL, ...Object.fromEntries(Object.entries(STREET).map(([k, c]) => [k, c.dur])) };
// Standing loops, by speed: the stance, shuffling in it, jog, sprint; and the guard.
export const LOCO = { idle: 'Street_Stance', walk: 'Street_Shuffle', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', guard: 'Street_Guard' };

// A segment plays `clip` from `from` to `to` at `speed`, then holds the last
// frame for `hold` seconds.
const seg = (clip, o = {}) => ({ clip, from: 0, to: CLIPS[clip], speed: 1, hold: 0, ...o });
export const segLen = s => (s.to - s.from) / s.speed + s.hold;

// play: segments in order. dur: when the move ends (it may cut a long recovery
// short; the view blends back to standing). rm: root motion scale.
// hit: window [from, to] in seconds, the striking part (a fist, a foot, the
// right knee or the left shoulder), damage, knockback (m) and heavy (knocks
// down). reach: distance to the opponent where the hits land best; root
// motion stops there and a start a little further out steps in to it.
// gain: stamina back. evade: when a dodge is off the line of attack.
const street = (name, clip, o) => ({ name, play: [seg(clip)], hits: [], ...o });
export const MOVES = {
  jab: street('Jab', 'Street_Jab', { cost: 6, chain: 'cross', chainAt: .16, reach: .85, hits: [{ t: [.05, .13], part: 'handL', dmg: 4, knock: .12 }] }),
  cross: street('Straight', 'Street_Cross', { cost: 8, chain: 'hook', chainAt: .22, reach: .85, hits: [{ t: [.07, .17], part: 'handR', dmg: 6, knock: .25 }] }),
  hook: street('Hook', 'Street_Hook', { cost: 14, reach: .85, hits: [{ t: [.27, .38], part: 'handR', dmg: 12, knock: .8, heavy: true }] }),
  uppercut: street('Uppercut', 'Street_Uppercut', { cost: 10, reach: .6, hits: [{ t: [.16, .28], part: 'handL', dmg: 9, knock: .45 }] }),
  pushKick: street('Tendang tolak', 'Street_PushKick', { cost: 12, reach: .95, hits: [{ t: [.22, .36], part: 'footL', dmg: 8, knock: 1 }] }),
  lowKick: street('Tendang bawah', 'Street_LowKick', { cost: 10, reach: .9, hits: [{ t: [.15, .29], part: 'footR', dmg: 8, knock: .35 }] }),
  highKick: street('Tendang tinggi', 'Street_HighKick', { cost: 16, reach: .7, hits: [{ t: [.24, .4], part: 'footR', dmg: 14, knock: 1, heavy: true }] }),
  knee: street('Lutut', 'Street_Knee', { cost: 10, reach: .55, hits: [{ t: [.18, .32], part: 'kneeR', dmg: 10, knock: .5 }] }),
  barge: street('Rempuh bahu', 'Street_Barge', { cost: 14, reach: .5, hits: [{ t: [.24, .42], part: 'shoulderL', dmg: 8, knock: 1.5 }] }),
  taunt: street('Ejek', 'Street_Taunt', { cost: 0, gain: 25 }),
  slipL: street('Elak kiri', 'Street_SlipL', { cost: 4, evade: [.05, .36] }),
  slipR: street('Elak kanan', 'Street_SlipR', { cost: 4, evade: [.05, .36] }),
  duck: street('Tunduk', 'Street_Duck', { cost: 4, evade: [.08, .4] }),
  stepBack: street('Undur', 'Street_StepBack', { cost: 4, evade: [.06, .3] })
};
// How the sparring partner takes a hit. flinch: the first moment of the
// knockback; down: the whole fall, a moment on the floor, then up again.
export const REACT = {
  flinch: { play: [seg('Hit_Knockback', { to: .25 })], rm: .1 },
  down: { play: [seg('Hit_Knockback'), seg('Hit_Knockback', { from: .833, hold: .5 }), seg('LayToIdle')], rm: .4 },
  ko: { play: [seg('Hit_Knockback'), seg('Hit_Knockback', { from: .833, hold: 1.3 }), seg('LayToIdle')], rm: .5 },
  block: { play: [seg('Street_Block')], rm: 1 },
  break: { play: [seg('Idle_Shield_Break')], rm: 1 }
};
for (const m of [...Object.values(MOVES), ...Object.values(REACT)]) { m.rm ??= 1; m.dur ??= m.play.reduce((s, p) => s + segLen(p), 0); }

// Which clip, and where in it, a move shows at time t.
export function frame(m, t) {
  let at = 0;
  for (const [i, s] of m.play.entries()) {
    const len = segLen(s);
    if (t < at + len || i === m.play.length - 1) return { i, clip: s.clip, time: Math.min(s.to, s.from + Math.max(0, t - at) * s.speed) };
    at += len;
  }
}

// Four buttons, like a pad's face buttons; the stick picks the variant.
//   square   tumbuk:  jab chain (jab, straight, hook) · forward: hook · back: uppercut
//   triangle tendang: tendang tinggi · forward: tendang tolak · back: tendang bawah
//   circle   kasar:   lutut · forward: rempuh bahu · back: ejek
//   cross    tahan:   hold to cover up · back: undur · forward: tunduk · up/down: elak kiri/kanan
export const BUTTONS = { tumbuk: 'square', tendang: 'triangle', kasar: 'circle', tahan: 'cross' };
const PICK = { tumbuk: ['uppercut', 'jab', 'hook'], tendang: ['lowKick', 'highKick', 'pushKick'], kasar: ['taunt', 'knee', 'barge'], tahan: ['stepBack', null, 'duck'] };
// dir: the stick toward the opponent (1), away (-1) or neither (0); side:
// the stick up (1) or down (-1), which picks a slip on the cover-up button.
export const pick = (button, dir = 0, side = 0) => button === 'tahan' && side && !dir ? (side > 0 ? 'slipL' : 'slipR') : PICK[button]?.[Math.sign(dir) + 1] ?? null;
export const STAMINA = { max: 100, regen: 24, rest: .45 };

// A tireless fighter (for free training) never pays stamina.
export const newFighter = ({ tireless = false } = {}) => ({ move: null, t: 0, seq: 0, stamina: STAMINA.max, rest: 0, queued: null, guard: false, tireless });
function start(f, key) { f.move = key; f.t = 0; f.seq++; f.queued = null; if (!f.tireless) f.stamina -= MOVES[key].cost; f.rest = STAMINA.rest; return { move: key }; }
// Press a button (dir and side as for pick). Tapping tumbuk again during a
// jab or straight queues the next punch in the chain.
export function press(f, button, dir = 0, side = 0) {
  const key = pick(button, dir, side); if (!key) return null;
  if (f.move) {
    const m = MOVES[f.move];
    if (key === 'jab' && m.chain && !f.queued) { f.queued = m.chain; return { queued: m.chain }; }
    return null;
  }
  if (!f.tireless && f.stamina < MOVES[key].cost) return { fail: 'penat' };
  return start(f, key);
}
// Advance time. Returns the move that just started from the chain, if any.
export function tick(f, dt) {
  let started = null;
  if (f.move) {
    const m = MOVES[f.move]; f.t += dt;
    if (f.queued && f.t >= m.chainAt) { const q = f.queued; f.queued = null; if (f.tireless || f.stamina >= MOVES[q].cost) { start(f, q); started = q; } }
    else if (f.t >= m.dur) { if (m.gain) f.stamina = Math.min(STAMINA.max, f.stamina + m.gain); f.move = null; f.t = 0; f.queued = null; }
  } else if ((f.rest -= dt) < 0) { f.stamina = Math.min(STAMINA.max, f.stamina + STAMINA.regen * Math.min(dt, -f.rest) * (f.guard ? .5 : 1)); f.rest = 0; }
  return started;
}
// Hits whose window is open now: [{ i, ...hit }].
export const activeHits = f => f.move ? MOVES[f.move].hits.map((h, i) => ({ i, ...h })).filter(h => f.t >= h.t[0] && f.t <= h.t[1]) : [];
// Off the line of attack (a dodge's evade window).
export const evading = f => { const e = f.move && MOVES[f.move].evade; return !!e && f.t >= e[0] && f.t <= e[1]; };

// The sparring partner. A guard soaks most of a light hit; a heavy hit breaks
// the guard. Unguarded, heavy hits knock them down; at 0 HP, K.O.
export const newTarget = () => ({ hp: 100, guard: false, react: null, t: 0 });
export function receive(target, hit) {
  const dmg = target.guard ? Math.ceil(hit.dmg * (hit.heavy ? .6 : .2)) : hit.dmg;
  target.hp = Math.max(0, target.hp - dmg);
  const react = target.hp <= 0 ? 'ko' : target.guard ? (hit.heavy ? 'break' : 'block') : hit.heavy ? 'down' : 'flinch';
  // A reaction in progress is only replaced by a bigger one.
  const rank = { block: 0, flinch: 0, break: 1, down: 2, ko: 3 };
  if (!target.react || rank[react] >= rank[target.react]) { target.react = react; target.t = 0; }
  return { dmg, react };
}
export function settle(target, dt) {
  if (!target.react) return null;
  target.t += dt;
  if (target.t < REACT[target.react].dur) return null;
  const done = target.react; target.react = null; target.t = 0; if (done === 'ko') target.hp = 100;
  return done;
}
// Down or getting up: hits pass over them.
export const floored = target => target.react === 'down' || target.react === 'ko';
