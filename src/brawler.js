import { over } from './keyframes.js';

// Jai: a street brawler with no formal style. Wild hands, a teep and low kick,
// a knee, a shoulder barge and one bit of MMA, the headlock. Pure rules and
// pose data; brawler-view.js draws it.

// Reference stance (Jai's photo): chest turned open over a left-foot lead,
// head turned back to the opponent with the chin down. The lead fist is up
// in front of the face, its elbow tucked; the rear fist, wrapped, rests just
// off the right jaw, forearm upright and elbow down and out.
// Hand targets are wrists for the mannequin; they are set so Jai's model's
// fists rest against his face and body without sinking in, at every key and
// while the body turns between keys (scripts/check-jai-rig.mjs).
// Hand and foot targets are wrists and ankles in the fighter's space; e*/k*
// are elbow and knee directions; r* = [toe-down pitch, yaw] of each foot;
// g = [left, right] hand grip, 0 open to 1 a closed fist.
export const STANCE = {
  hips: [.88, 0, -40, 0], spine: [8, 0, 0], chest: [0, -12, 0], neck: [8, 5, 0], head: [10, 48, 0],
  hL: [.07, 1.42, .36], eL: [.35, -1, .05], hR: [-.25, 1.39, .08], eR: [-.46, -1, -.28],
  fL: [.16, .075, .36], kL: [.15, 0, 1], fR: [-.22, .075, -.3], kR: [-.3, 0, 1], rL: [0, -15], rR: [10, -35],
  g: [1, 1], fwd: [0]
};
const P = part => over(STANCE, part), S = P({});
const at = (fwd, part = {}) => P({ ...part, fwd: [fwd] });
const GUARD_L = { hL: [.2, 1.44, .28] };

// hit: window [from, to] in seconds, the striking part, damage, where it
// lands (head, body, low) and knockback in metres.
// near: the distance to the opponent a move is built to land from, when it
// is not the usual one (a kick slides in close).
export const MOVES = {
  jab: { name: 'Jab', cost: 6, dur: .3, chain: 'cross', chainAt: .16, keys: [[0, S],
    [.07, P({ hips: [.92, 0, -35, 0], chest: [0, -12, 0], head: [5, 47, 0], hL: [.06, 1.55, .9], eL: [1, -.3, 0] })],
    [.14, P({ hips: [.92, 0, -35, 0], chest: [0, -12, 0], head: [5, 47, 0], hL: [.06, 1.55, .9], eL: [1, -.3, 0] })], [.3, S]],
    hits: [{ t: [.05, .13], part: 'handL', dmg: 4, zone: 'head', knock: .12 }] },
  cross: { name: 'Straight', cost: 8, dur: .38, chain: 'haymaker', chainAt: .22, keys: [[0, S],
    [.09, at(.08, { hips: [.92, 0, 10, 0], chest: [0, 30, 0], head: [5, -40, 0], hR: [-.02, 1.55, .95], eR: [-1, -.3, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] })],
    [.16, at(.08, { hips: [.92, 0, 10, 0], chest: [0, 30, 0], head: [5, -40, 0], hR: [-.02, 1.55, .95], eR: [-1, -.3, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] })], [.38, at(.08)]],
    hits: [{ t: [.07, .17], part: 'handR', dmg: 6, zone: 'head', knock: .25 }] },
  uppercut: { name: 'Uppercut', cost: 10, dur: .52, keys: [[0, S],
    [.11, P({ hips: [.82, 0, -35, 0], spine: [22, 0, 0], head: [0, 35, 0], hL: [.2, 1.1, .3], eL: [.6, -1, 0], hR: [-.27, 1.42, .07] })],
    [.22, at(.16, { hips: [.95, 0, -5, 0], spine: [-6, 0, 0], chest: [0, -25, 0], head: [-5, 30, 0], hL: [.04, 1.75, .55], eL: [.3, -1, .2] })],
    [.3, at(.16, { hips: [.95, 0, -5, 0], spine: [-6, 0, 0], chest: [0, -25, 0], head: [-5, 30, 0], hL: [.04, 1.75, .55], eL: [.3, -1, .2] })], [.52, at(.16)]],
    hits: [{ t: [.16, .28], part: 'handL', dmg: 9, zone: 'head', knock: .45 }] },
  haymaker: { name: 'Haymaker', cost: 18, dur: .78, keys: [[0, S],
    [.2, P({ hips: [.9, 0, -50, 0], chest: [0, -20, 0], head: [5, 70, 0], hR: [-.5, 1.5, -.25], eR: [-.3, -1, -.5], hL: [.2, 1.45, .4] })],
    [.33, at(.15, { hips: [.9, 0, 25, 0], chest: [0, 35, 0], head: [5, -60, 0], hR: [.15, 1.55, .75], eR: [-1, .2, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] })],
    [.43, at(.18, { hips: [.9, 0, 40, 0], chest: [0, 45, 0], head: [5, -75, 0], hR: [.35, 1.45, .5], eR: [-1, .2, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] })],
    [.6, at(.18, { hips: [.89, 0, 2, 0], chest: [0, 18, 0], head: [7, -16, 0], hR: [-.07, 1.34, .42], eR: [-.74, -.37, -.13], ...GUARD_L, fR: [-.18, .09, -.25], rR: [20, -22] })], [.78, at(.18)]],
    hits: [{ t: [.27, .38], part: 'handR', dmg: 14, zone: 'head', knock: .8, heavy: true }] },
  pushKick: { name: 'Push kick', cost: 12, dur: .66, keys: [[0, S],
    [.15, P({ hips: [.9, 0, -20, 0], spine: [-5, 0, 0], fL: [.1, .55, .45], kL: [0, 1, 1] })],
    [.27, P({ hips: [.92, 0, -15, 0], spine: [-18, 0, 0], fL: [.08, .85, .95], kL: [0, 1, .3], rL: [-50, 0], fR: [-.14, .075, -.3] })],
    [.36, P({ hips: [.92, 0, -15, 0], spine: [-18, 0, 0], fL: [.08, .85, .95], kL: [0, 1, .3], rL: [-50, 0], fR: [-.14, .075, -.3] })],
    [.5, P({ hips: [.9, 0, -20, 0], fL: [.1, .45, .35], kL: [0, 1, 1] })], [.66, S]],
    hits: [{ t: [.22, .36], part: 'footL', dmg: 8, zone: 'body', knock: 1 }] },
  // Muay Thai low kick to the lead thigh: step out at 45 degrees and sit,
  // then pivot up on the ball of the lead foot and swing the rear shin through
  // the thigh, hips and shoulders turning over, the rear arm thrown down and
  // back against the turn, the lead hand on the chin.
  lowKick: { name: 'Low kick', cost: 10, dur: .6, near: .9, keys: [[0, S],
    [.09, at(.06, { hips: [.84, 0, -55, 0], spine: [14, 0, 0], fL: [.24, .075, .44], rL: [0, 35], kL: [.3, 0, 1], fR: [-.2, .1, -.28], rR: [35, -30], hR: [-.3, 1.3, -.05] })],
    [.19, at(.12, { hips: [.88, 0, 50, -8], spine: [-6, 0, -6], chest: [0, 10, 0], head: [8, -45, 0], fL: [.24, .085, .44], rL: [20, 100], kL: [.3, 0, 1], fR: [-.2, .6, .72], kR: [-.5, .5, 1], rR: [20, 60], hL: [.15, 1.42, .32], hR: [-.4, 1, -.35], eR: [-1, -.4, -.3] }), 'in'],
    [.27, at(.13, { hips: [.88, 0, 85, -10], spine: [-10, 0, -8], chest: [0, 5, 0], head: [8, -70, 0], fL: [.24, .085, .44], rL: [25, 125], kL: [.3, 0, 1], fR: [.28, .6, .68], kR: [.3, .6, 1], rR: [20, 95], hL: [.15, 1.42, .32], hR: [-.45, .95, -.4], eR: [-1, -.3, -.3] })],
    [.42, at(.12, { hips: [.86, 0, 15, 0], spine: [6, 0, 0], head: [8, -15, 0], fL: [.2, .075, .4], rL: [10, 30], fR: [-.2, .2, -.1], kR: [-.4, .3, 1], rR: [20, 0], hR: [-.33, 1.26, -.03] })], [.6, at(.12), 'out']],
    hits: [{ t: [.15, .29], part: 'footR', dmg: 8, zone: 'low', knock: .35 }] },
  // Taekwondo roundhouse to the head (dollyo chagi), after the references:
  // load on the lead foot, chamber the rear knee high, then pivot up on the
  // ball of the lead foot (heel to the target, about 130 degrees of hip turn)
  // and snap the straight leg through at head height, body leaning away, the
  // kicking-side arm thrown back, the lead hand guarding the face. Recoil the
  // knee and land. It slides in: thrown from close range.
  roundhouse: { name: 'Tendang hayun', cost: 16, dur: .78, near: .66, keys: [[0, S],
    [.1, at(.04, { hips: [.86, 0, -20, 0], spine: [12, 0, 0], fR: [-.2, .1, -.22], rR: [30, -20], rL: [5, 10], kL: [.2, 0, 1], hR: [-.29, 1.41, .07], ...GUARD_L })],
    [.2, at(.14, { hips: [.92, 0, 45, -10], spine: [0, 0, 0], chest: [0, 5, 0], head: [10, -40, 0], fL: [.12, .09, .3], rL: [20, 70], kL: [.3, 0, 1], fR: [-.15, .85, .3], kR: [-.3, 1, .8], rR: [40, 30], hR: [-.35, 1.2, -.1], eR: [-1, -.8, 0], ...GUARD_L })],
    [.3, at(.25, { hips: [.98, 0, 100, -38], spine: [-10, 0, -5], chest: [0, -10, 0], neck: [0, -10, 0], head: [15, -70, 15], fL: [.12, .09, .3], rL: [25, 130], kL: [.3, 0, 1], fR: [0, 1.95, .72], kR: [1, .4, 0], rR: [0, 90], hL: [.1, 1.45, .35], hR: [-.5, 1.2, -.4], eR: [-1, -.5, 0] }), 'in'],
    [.38, at(.27, { hips: [.97, 0, 120, -35], spine: [-10, 0, -5], chest: [0, -10, 0], neck: [0, -10, 0], head: [10, -90, 10], fL: [.12, .09, .3], rL: [25, 140], kL: [.3, 0, 1], fR: [.3, 1.8, .6], kR: [1, .4, 0], rR: [0, 110], hL: [.1, 1.45, .35], hR: [-.5, 1.15, -.45], eR: [-1, -.5, 0] })],
    [.5, at(.27, { hips: [.92, 0, 70, -10], chest: [0, 0, 0], head: [5, -55, 0], fL: [.12, .08, .3], rL: [15, 90], kL: [.3, 0, 1], fR: [-.05, .8, .2], kR: [.3, 1, .5], rR: [40, 60], hR: [-.3, 1.25, -.1], eR: [-1, -.8, 0], ...GUARD_L })], [.78, at(.27), 'out']],
    hits: [{ t: [.26, .4], part: 'footR', dmg: 13, zone: 'head', knock: .9, heavy: true }] },
  knee: { name: 'Lutut', cost: 10, dur: .56, keys: [[0, S],
    [.12, P({ hL: [.12, 1.5, .7], hR: [-.1, 1.5, .7], eL: [.5, -1, 0], eR: [-.5, -1, 0] })],
    [.24, at(.27, { hips: [.95, 0, 0, 0], spine: [-10, 0, 0], chest: [0, 0, 0], head: [5, 0, 0], hL: [.1, 1.3, .55], hR: [-.1, 1.3, .55], eL: [.5, -1, 0], eR: [-.5, -1, 0], fR: [-.08, .75, .25], kR: [0, .6, 1], rR: [40, 0] })],
    [.32, at(.27, { hips: [.95, 0, 0, 0], spine: [-10, 0, 0], chest: [0, 0, 0], head: [5, 0, 0], hL: [.1, 1.3, .55], hR: [-.1, 1.3, .55], eL: [.5, -1, 0], eR: [-.5, -1, 0], fR: [-.08, .75, .25], kR: [0, .6, 1], rR: [40, 0] })], [.56, at(.27)]],
    hits: [{ t: [.18, .32], part: 'kneeR', dmg: 10, zone: 'body', knock: .5 }] },
  barge: { name: 'Rempuh', cost: 14, dur: .72, keys: [[0, S],
    [.18, P({ hips: [.82, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .3], fR: [-.2, .075, -.28] })],
    [.27, at(.35, { hips: [.84, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .1], fR: [-.1, .2, .05] })],
    [.36, at(.8, { hips: [.86, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .3], fR: [-.18, .075, -.2] })],
    [.44, at(.8, { hips: [.86, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .3], fR: [-.18, .075, -.2] })], [.72, at(.8)]],
    hits: [{ t: [.24, .42], part: 'shoulderL', dmg: 8, zone: 'body', knock: 1.5 }] },
  taunt: { name: 'Ejek', cost: 0, dur: 1.3, gain: 25, keys: [[0, S],
    [.3, P({ hips: [.95, 0, 0, 0], spine: [-12, 0, 0], chest: [0, 0, 0], head: [-15, 0, 0], hL: [.55, 1.25, .2], hR: [-.55, 1.25, .2], eL: [0, -1, -1], eR: [0, -1, -1], fL: [.15, .075, .1], fR: [-.15, .075, -.1], rL: [0, 10], rR: [0, -10], g: [0, 0] })],
    [.65, P({ hips: [.95, 0, 0, 0], spine: [-12, 0, 0], chest: [0, 0, 0], head: [-15, 20, 0], hL: [.25, 1.6, .35], hR: [-.55, 1.25, .2], eL: [1, -1, 0], eR: [0, -1, -1], fL: [.15, .075, .1], fR: [-.15, .075, -.1], rL: [0, 10], rR: [0, -10], g: [.6, 0] })],
    [.95, P({ hips: [.95, 0, 0, 0], spine: [-12, 0, 0], chest: [0, 0, 0], head: [-15, -10, 0], hL: [.55, 1.25, .2], hR: [-.55, 1.25, .2], eL: [0, -1, -1], eR: [0, -1, -1], fL: [.15, .075, .1], fR: [-.15, .075, -.1], rL: [0, 10], rR: [0, -10], g: [0, 0] })], [1.3, S]],
    hits: [] }
};

// The headlock: wrap the left arm round the opponent's neck, three short
// uppercuts, then shove them off. `grab` is when the opponent is held.
const WRAP = { hips: [.88, 0, -40, 0], spine: [20, 0, 0], chest: [0, -15, 0], head: [10, 55, 0], hL: [0, 1.15, .35], eL: [1, .2, .4], hR: [-.36, 1.34, .1] };
const DIP = { ...WRAP, hR: [-.15, 1, .25], eR: [-.4, -1, 0] }, UP = { ...WRAP, hR: [-.1, 1.25, .55], eR: [-.3, -1, .3] };
MOVES.headlock = { name: 'Kepit kepala', cost: 20, dur: 2.4, reach: 1.15, grab: [.3, 2.02], keys: [[0, S],
  [.22, at(.1, { spine: [15, 0, 0], hL: [.3, 1.4, .75], eL: [1, .3, 0], hR: [-.05, 1.4, .6] })],
  [.4, at(.1, WRAP)], [.55, at(.1, DIP)], [.7, at(.1, UP)], [.9, at(.1, DIP)], [1.15, at(.1, UP)], [1.35, at(.1, DIP)], [1.6, at(.1, UP)], [1.85, at(.1, DIP)],
  [2.05, at(.2, { spine: [0, 0, 0], hL: [.15, 1.35, .8], hR: [-.1, 1.35, .8], eL: [.5, -1, 0], eR: [-.5, -1, 0] })], [2.4, at(.2)]],
  hits: [.7, 1.15, 1.6].map(t => ({ t: [t - .05, t + .05], part: 'handR', dmg: 5, zone: 'head', knock: 0, auto: true }))
    .concat({ t: [2, 2.12], part: 'handL', dmg: 2, zone: 'body', knock: 1.2, auto: true }) };

// Four buttons, like a pad's face buttons; the stick direction picks the
// variant. Square taps chain jab, straight, haymaker.
//   square  tumbuk: jab chain · back: uppercut
//   triangle tendang: tendang hayun · forward: push kick · back: low kick
//   circle  kasar: close: headlock, else barge · forward: knee · back: taunt
//   cross   tahan: hold to guard
export const BUTTONS = { tumbuk: 'square', tendang: 'triangle', kasar: 'circle', tahan: 'cross' };
export const CLOSE = .95;
export function pick(button, dir = 0, near = Infinity) {
  if (button === 'tumbuk') return dir < 0 ? 'uppercut' : 'jab';
  if (button === 'tendang') return dir > 0 ? 'pushKick' : dir < 0 ? 'lowKick' : 'roundhouse';
  if (button === 'kasar') return dir > 0 ? 'knee' : dir < 0 ? 'taunt' : near <= CLOSE ? 'headlock' : 'barge';
  return null;
}
export const STAMINA = { max: 100, regen: 24, rest: .45 };

// A tireless fighter (for free training) never pays stamina.
export const newFighter = ({ tireless = false } = {}) => ({ move: null, t: 0, seq: 0, stamina: STAMINA.max, rest: 0, queued: null, guard: false, tireless });
function start(f, key) { const m = MOVES[key]; f.move = key; f.t = 0; f.seq++; f.queued = null; if (!f.tireless) f.stamina -= m.cost; f.rest = STAMINA.rest; return { move: key }; }
// Press a button. `near` is the distance to the opponent (for the headlock).
// dir: the stick toward the opponent (1), away (-1) or neither (0).
export function press(f, button, dir = 0, near = Infinity) {
  const key = pick(button, dir, near); if (!key) return null;
  if (f.move) {
    const m = MOVES[f.move];
    if (key === 'jab' && m.chain && !f.queued) { f.queued = m.chain; return { queued: m.chain }; }
    return null;
  }
  if (key === 'headlock' && near > MOVES.headlock.reach) return { fail: 'jauh' };
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
export const grabbing = f => f.move === 'headlock' && f.t >= MOVES.headlock.grab[0] && f.t <= MOVES.headlock.grab[1];

// Covering up: both fists side by side in front of the face, chin down, knees bent.
export const GUARD = P({ hips: [.88, 0, -25, 0], spine: [14, 0, 0], chest: [0, 5, 0], neck: [4, 0, 0], head: [12, 15, 0], hL: [.02, 1.36, .39], eL: [.5, -1, .1], hR: [-.2, 1.35, .36], eR: [-.5, -1, .1] });
// The sparring partner: a loose stance, a reaction for each zone, and the
// bent-over shape inside the headlock.
const IDLE = P({ hips: [.93, 0, -15, 0], spine: [4, 0, 0], chest: [0, 5, 0], neck: [4, 0, 0], head: [3, 10, 0], hL: [.16, 1.3, .3], eL: [.65, -1, .1], hR: [-.12, 1.32, .24], eR: [-.65, -1, .1] });
const Q = part => over(IDLE, part);
export const PARTNER = {
  idle: IDLE,
  head: Q({ spine: [-12, 0, 0], chest: [-10, 5, 0], neck: [-15, 0, 0], head: [-30, 25, 0], hL: [.25, 1.45, .15], hR: [-.2, 1.5, .1] }),
  body: Q({ hips: [.86, 0, -15, 0], spine: [35, 0, 0], chest: [15, 5, 0], head: [-20, 10, 0], hL: [.1, 1, .28], hR: [-.1, 1, .28], eL: [.5, -1, 0], eR: [-.5, -1, 0] }),
  low: Q({ hips: [.86, 0, -15, 0], spine: [10, 0, 0], head: [10, 10, 0], fL: [.14, .2, .18], kL: [.3, 0, 1] }),
  held: Q({ hips: [.85, 0, 0, 0], spine: [55, 0, 0], chest: [20, 0, 0], neck: [-15, 0, 0], head: [-30, 0, 0], hL: [.22, .85, .55], hR: [-.22, .85, .55], eL: [.5, -1, 0], eR: [-.5, -1, 0], fL: [.15, .075, -.12], fR: [-.15, .075, -.18], rL: [0, 0], rR: [0, 0] })
};
