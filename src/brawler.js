// Jai's fight rules: a street fight, bare hands only. Every move is played from
// the Universal Animation Library 2 clips in fighter.glb (Quaternius, CC0); the
// library's sword swings become wild empty-hand swings and its shield moves a
// shove and a shoulder barge. Pure data and rules; fighter.js and
// brawler-view.js play and draw them.

// Clip lengths in seconds (tests check them against the GLB).
export const CLIPS = {
  Sword_Regular_A: .433, Sword_Regular_A_Rec: .967, Sword_Regular_B: .533, Sword_Regular_B_Rec: 1.033, Sword_Regular_C: 2, Sword_Regular_Combo: 3, Sword_Heavy_Combo: 4.333,
  Sword_Dash: 1.567, Sword_Block: 1.233, Melee_Hook: .467, Melee_Hook_Rec: .6, Idle_FoldArms_Loop: 2.5, Shield_OneShot: .833, Shield_Dash: 1.1, Idle_Shield_Loop: 2.5,
  Idle_Shield_Break: 1.067, Zombie_Scratch: 1.8, Slide_Start: .833, Slide_Loop: 2, Slide_Exit: .5, NinjaJump_Start: .967, NinjaJump_Idle_Loop: 2, NinjaJump_Land: 1.267,
  Hit_Knockback: .833, LayToIdle: 1.533, Idle_Loop: 2.5, Walk_Loop: 1.333, Jog_Fwd_Loop: .933, Sprint_Loop: .667
};
// Standing loops, by speed: idle, walk, jog, sprint; and the guard.
export const LOCO = { idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', guard: 'Idle_Shield_Loop' };

// A segment plays `clip` from `from` to `to` at `speed`, then holds the last
// frame for `hold` seconds.
const seg = (clip, o = {}) => ({ clip, from: 0, to: CLIPS[clip], speed: 1, hold: 0, ...o });
export const segLen = s => (s.to - s.from) / s.speed + s.hold;

// play: segments in order. dur: when the move ends (it may cut a long recovery
// short; the view blends back to standing). rm: root motion scale.
// hit: window [from, to] in seconds, the striking part (a fist, the left
// shoulder or the right foot), damage, knockback (m) and heavy (knocks down).
// reach: distance to the opponent where the hits land best; root motion stops
// there and a start a little further out steps in to it. gain: stamina back.
export const MOVES = {
  swingA: { name: 'Hayun', cost: 6, play: [seg('Sword_Regular_A'), seg('Sword_Regular_A_Rec')], dur: .9, rm: .6, chain: 'swingB', chainAt: .433, reach: .8,
    hits: [{ t: [.19, .32], part: 'handR', dmg: 5, knock: .15 }] },
  swingB: { name: 'Hayun balik', cost: 7, play: [seg('Sword_Regular_B'), seg('Sword_Regular_B_Rec')], dur: 1, rm: .6, chain: 'swingC', chainAt: .533, reach: .8,
    hits: [{ t: [.2, .33], part: 'handR', dmg: 6, knock: .2 }] },
  swingC: { name: 'Hayun pusing', cost: 12, play: [seg('Sword_Regular_C')], dur: 1.45, rm: .5, reach: .8,
    hits: [{ t: [.1, .25], part: 'handR', dmg: 5, knock: .1 }, { t: [.58, .72], part: 'handR', dmg: 10, knock: .9, heavy: true }] },
  hook: { name: 'Hook', cost: 8, play: [seg('Melee_Hook'), seg('Melee_Hook_Rec')], dur: .95, rm: .8, reach: 1.25,
    hits: [{ t: [.2, .5], part: 'handR', dmg: 8, knock: .3 }] },
  dash: { name: 'Terkam', cost: 14, play: [seg('Sword_Dash')], dur: 1.3, rm: .5, reach: .8,
    hits: [{ t: [.22, .38], part: 'handR', dmg: 10, knock: .6 }] },
  combo: { name: 'Combo jalanan', cost: 22, play: [seg('Sword_Regular_Combo')], dur: 2.6, rm: .5, reach: .8,
    hits: [{ t: [.19, .32], part: 'handR', dmg: 5, knock: .1 }, { t: [.66, .8], part: 'handR', dmg: 6, knock: .1 }, { t: [1.1, 1.27], part: 'handR', dmg: 7, knock: .2 }, { t: [1.48, 1.64], part: 'handR', dmg: 10, knock: .9, heavy: true }] },
  rage: { name: 'Mengamuk', cost: 30, play: [seg('Sword_Heavy_Combo')], dur: 3.7, rm: .3, reach: .9,
    hits: [{ t: [.38, .54], part: 'handR', dmg: 8, knock: .2 }, { t: [1.72, 1.88], part: 'handR', dmg: 9, knock: .3 }, { t: [2.5, 2.7], part: 'handR', dmg: 15, knock: 1, heavy: true }] },
  taunt: { name: 'Ejek', cost: 0, gain: 25, play: [seg('Idle_FoldArms_Loop', { to: 1.4 })], dur: 1.4, hits: [] },
  shove: { name: 'Tolak', cost: 6, play: [seg('Shield_OneShot')], dur: .75, reach: .55,
    hits: [{ t: [.03, .22], part: 'handL', dmg: 4, knock: .9 }] },
  barge: { name: 'Rempuh bahu', cost: 14, play: [seg('Shield_Dash')], dur: 1.05, rm: .9, reach: .6,
    hits: [{ t: [.06, .55], part: 'shoulderL', dmg: 9, knock: 1.2, heavy: true }] },
  scratch: { name: 'Cakar', cost: 8, play: [seg('Zombie_Scratch')], dur: 1.35, reach: .8,
    hits: [{ t: [.5, .7], part: 'handR', dmg: 7, knock: .25 }] },
  sweep: { name: 'Sapu kaki', cost: 12, play: [seg('Slide_Start'), seg('Slide_Exit')], dur: 1.333, rm: .45, reach: .8,
    hits: [{ t: [.2, .9], part: 'footR', dmg: 8, knock: .7, heavy: true }] },
  jump: { name: 'Lompat', cost: 6, play: [seg('NinjaJump_Start', { speed: 1.3 }), seg('NinjaJump_Idle_Loop', { to: .2 }), seg('NinjaJump_Land', { speed: 1.3 })], dur: 1.6, hits: [] }
};
// How the sparring partner takes a hit. flinch: the first moment of the
// knockback; down: the whole fall, a moment on the floor, then up again.
export const REACT = {
  flinch: { play: [seg('Hit_Knockback', { to: .25 })], rm: .1 },
  down: { play: [seg('Hit_Knockback'), seg('Hit_Knockback', { from: .833, hold: .5 }), seg('LayToIdle')], rm: .4 },
  ko: { play: [seg('Hit_Knockback'), seg('Hit_Knockback', { from: .833, hold: 1.3 }), seg('LayToIdle')], rm: .5 },
  block: { play: [seg('Sword_Block', { from: .05, to: .7 })], rm: 1 },
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

// Four buttons, like a pad's face buttons; the stick direction picks the variant.
//   square   tumbuk: hayun chain · forward: terkam · back: hook
//   triangle berat:  mengamuk · forward: combo jalanan · back: ejek
//   circle   kasar:  tolak · forward: rempuh bahu · back: cakar
//   cross    tahan:  hold to guard · forward: sapu kaki · back: lompat
export const BUTTONS = { tumbuk: 'square', berat: 'triangle', kasar: 'circle', tahan: 'cross' };
const PICK = { tumbuk: ['hook', 'swingA', 'dash'], berat: ['taunt', 'rage', 'combo'], kasar: ['scratch', 'shove', 'barge'], tahan: ['jump', null, 'sweep'] };
export const pick = (button, dir = 0) => PICK[button]?.[Math.sign(dir) + 1] ?? null;
export const STAMINA = { max: 100, regen: 24, rest: .45 };

// A tireless fighter (for free training) never pays stamina.
export const newFighter = ({ tireless = false } = {}) => ({ move: null, t: 0, seq: 0, stamina: STAMINA.max, rest: 0, queued: null, guard: false, tireless });
function start(f, key) { f.move = key; f.t = 0; f.seq++; f.queued = null; if (!f.tireless) f.stamina -= MOVES[key].cost; f.rest = STAMINA.rest; return { move: key }; }
// Press a button. dir: the stick toward the opponent (1), away (-1) or neither (0).
// Tapping tumbuk again during a swing queues the next one in the chain.
export function press(f, button, dir = 0) {
  const key = pick(button, dir); if (!key) return null;
  if (f.move) {
    const m = MOVES[f.move];
    if (key === 'swingA' && m.chain && !f.queued) { f.queued = m.chain; return { queued: m.chain }; }
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
