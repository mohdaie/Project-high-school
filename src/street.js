import { over } from './keyframes.js';

// Jai's street style as poses: the stance from his reference photo, guard,
// punches, kicks, a knee, a barge, dodges and a taunt. Pure data. pose.js
// solves each pose on the UAL2 mannequin (IK for hands and feet) and bakes
// the keys into clips named Street_*, which brawler.js plays like any other.
// Poses and kicks first built for the jointed mannequin (branch
// ccr-fb66653b-upm8t3), after Jai's photo and kick references.

// Reference stance (Jai's photo): chest turned open over a left-foot lead,
// head turned back to the opponent with the chin down. The lead fist is up
// in front of the face, its elbow tucked; the rear fist rests just off the
// right jaw, elbow out.
// Hand and foot targets are wrists and ankles in the fighter's space (+z
// forward, +x his left); e*/k* are elbow and knee directions; r* = [toe-down
// pitch, yaw] of each foot; g = [left, right] grip, 0 open to 1 a fist;
// fwd = how far he has travelled forward (root motion).
export const STANCE = {
  hips: [.88, 0, -40, 0], spine: [8, 0, 0], chest: [0, -12, 0], neck: [8, 5, 0], head: [10, 48, 0],
  hL: [.07, 1.42, .36], eL: [.35, -1, .05], hR: [-.25, 1.39, .08], eR: [-1, -.3, -.15],
  fL: [.16, .075, .36], kL: [.15, 0, 1], fR: [-.22, .075, -.3], kR: [-.3, 0, 1], rL: [0, -15], rR: [10, -35],
  g: [1, 1], fwd: [0]
};
const P = part => over(STANCE, part), S = P({});
const at = (fwd, part = {}) => P({ ...part, fwd: [fwd] });
const GUARD_L = { hL: [.2, 1.44, .28] };
// Covering up: both fists side by side in front of the face, chin down, knees bent.
export const GUARD = P({ hips: [.88, 0, -25, 0], spine: [14, 0, 0], chest: [0, 5, 0], neck: [4, 0, 0], head: [12, 15, 0], hL: [.02, 1.36, .39], eL: [.5, -1, .1], hR: [-.2, 1.35, .36], eR: [-.5, -1, .1] });

// A looping pose: `f(p, a)` adds motion at phase a (0..2π) to a copy of `base`.
const loop = (base, dur, n, f) => Array.from({ length: n + 1 }, (_, i) => { const p = over(base, {}); f(p, i / n * Math.PI * 2); return [dur * i / n, p]; });
// Standing by: weight rocks between the feet, head and hands drift.
const sway = (p, a) => {
  p.hips[0] -= .012 * (1 + Math.sin(2 * a + 1)) / 2; p.hips[2] += 4 * Math.sin(a); p.hips[3] += 1.5 * Math.sin(a);
  p.chest[1] -= 2 * Math.sin(a); p.head[0] += 2 * Math.sin(a + 1); p.head[1] += 2.5 * Math.sin(a + 2);
  p.hL[0] += .015 * Math.sin(a + .5); p.hL[1] += .02 * Math.sin(2 * a + 2); p.hR[1] += .015 * Math.sin(2 * a + 4);
};
// Moving in the stance: short steps, each foot lifting in turn, a little bob.
const shuffle = (p, a) => {
  for (const [f, o] of [['fL', 0], ['fR', Math.PI]]) { p[f][2] += .12 * Math.sin(a + o); p[f][1] += Math.max(0, Math.cos(a + o)) * .07; }
  p.hips[0] -= .02 * Math.abs(Math.sin(a)); p.hL[1] += .01 * Math.sin(2 * a); p.hR[1] += .01 * Math.sin(2 * a + 1);
};

// Each clip: its keys ([time, pose, ease?]) and length; loops repeat.
export const STREET = {
  Street_Stance: { loop: true, keys: loop(S, 3.7, 12, sway) },
  Street_Shuffle: { loop: true, keys: loop(S, .5, 8, shuffle) },
  Street_Guard: { loop: true, keys: loop(GUARD, 2.4, 8, (p, a) => { p.hips[0] -= .008 * (1 + Math.sin(a)); p.head[1] += 2 * Math.sin(a); }) },
  Street_Jab: { keys: [[0, S],
    [.07, P({ hips: [.92, 0, -35, 0], chest: [0, -12, 0], head: [5, 47, 0], hL: [.06, 1.55, .9], eL: [1, -.3, 0] }), 'in'],
    [.14, P({ hips: [.92, 0, -35, 0], chest: [0, -12, 0], head: [5, 47, 0], hL: [.06, 1.55, .9], eL: [1, -.3, 0] })], [.3, S, 'out']] },
  Street_Cross: { keys: [[0, S],
    [.09, at(.08, { hips: [.92, 0, 10, 0], chest: [0, 30, 0], head: [5, -40, 0], hR: [-.02, 1.55, .95], eR: [-1, -.3, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] }), 'in'],
    [.16, at(.08, { hips: [.92, 0, 10, 0], chest: [0, 30, 0], head: [5, -40, 0], hR: [-.02, 1.55, .95], eR: [-1, -.3, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] })], [.38, at(.08), 'out']] },
  // A wide rear hook (the street haymaker): wind back, then whip round.
  Street_Hook: { keys: [[0, S],
    [.2, P({ hips: [.9, 0, -50, 0], chest: [0, -20, 0], head: [5, 70, 0], hR: [-.5, 1.5, -.25], eR: [-.3, -1, -.5], hL: [.2, 1.45, .4] })],
    [.33, at(.15, { hips: [.9, 0, 25, 0], chest: [0, 35, 0], head: [5, -60, 0], hR: [.15, 1.55, .75], eR: [-1, .2, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] }), 'in'],
    [.43, at(.18, { hips: [.9, 0, 40, 0], chest: [0, 45, 0], head: [5, -75, 0], hR: [.35, 1.45, .5], eR: [-1, .2, 0], ...GUARD_L, fR: [-.14, .1, -.2], rR: [30, -10] })],
    [.6, at(.18, { hips: [.89, 0, 2, 0], chest: [0, 18, 0], head: [7, -16, 0], hR: [-.07, 1.34, .42], eR: [-.74, -.37, -.13], ...GUARD_L, fR: [-.18, .09, -.25], rR: [20, -22] })], [.78, at(.18), 'out']] },
  Street_Uppercut: { keys: [[0, S],
    [.11, P({ hips: [.82, 0, -35, 0], spine: [22, 0, 0], head: [0, 35, 0], hL: [.2, 1.1, .3], eL: [.6, -1, 0], hR: [-.27, 1.42, .07] })],
    [.22, at(.16, { hips: [.95, 0, -5, 0], spine: [-6, 0, 0], chest: [0, -25, 0], head: [-5, 30, 0], hL: [.04, 1.75, .55], eL: [.3, -1, .2] }), 'in'],
    [.3, at(.16, { hips: [.95, 0, -5, 0], spine: [-6, 0, 0], chest: [0, -25, 0], head: [-5, 30, 0], hL: [.04, 1.75, .55], eL: [.3, -1, .2] })], [.52, at(.16), 'out']] },
  // Teep: lift the lead knee, drive the sole through the body, recoil.
  Street_PushKick: { keys: [[0, S],
    [.15, P({ hips: [.9, 0, -20, 0], spine: [-5, 0, 0], fL: [.1, .55, .45], kL: [0, 1, 1] })],
    [.27, P({ hips: [.92, 0, -15, 0], spine: [-18, 0, 0], fL: [.08, .85, .95], kL: [0, 1, .3], rL: [-50, 0], fR: [-.14, .075, -.3] }), 'in'],
    [.36, P({ hips: [.92, 0, -15, 0], spine: [-18, 0, 0], fL: [.08, .85, .95], kL: [0, 1, .3], rL: [-50, 0], fR: [-.14, .075, -.3] })],
    [.5, P({ hips: [.9, 0, -20, 0], fL: [.1, .45, .35], kL: [0, 1, 1] })], [.66, S]] },
  // Muay Thai low kick to the lead thigh: step out at 45 degrees and sit,
  // then pivot up on the ball of the lead foot and swing the rear shin through
  // the thigh, hips and shoulders turning over, the rear arm thrown down and
  // back against the turn, the lead hand on the chin.
  Street_LowKick: { keys: [[0, S],
    [.09, at(.06, { hips: [.84, 0, -55, 0], spine: [14, 0, 0], fL: [.24, .075, .44], rL: [0, 35], kL: [.3, 0, 1], fR: [-.2, .1, -.28], rR: [35, -30], hR: [-.3, 1.3, -.05] })],
    [.19, at(.12, { hips: [.88, 0, 50, -8], spine: [-6, 0, -6], chest: [0, 10, 0], head: [8, -45, 0], fL: [.24, .085, .44], rL: [20, 100], kL: [.3, 0, 1], fR: [-.2, .6, .72], kR: [-.5, .5, 1], rR: [20, 60], hL: [.15, 1.42, .32], hR: [-.4, 1, -.35], eR: [-1, -.4, -.3] }), 'in'],
    [.27, at(.13, { hips: [.88, 0, 85, -10], spine: [-10, 0, -8], chest: [0, 5, 0], head: [8, -70, 0], fL: [.24, .085, .44], rL: [25, 125], kL: [.3, 0, 1], fR: [.28, .6, .68], kR: [.3, .6, 1], rR: [20, 95], hL: [.15, 1.42, .32], hR: [-.45, .95, -.4], eR: [-1, -.3, -.3] })],
    [.42, at(.12, { hips: [.86, 0, 15, 0], spine: [6, 0, 0], head: [8, -15, 0], fL: [.2, .075, .4], rL: [10, 30], fR: [-.2, .2, -.1], kR: [-.4, .3, 1], rR: [20, 0], hR: [-.33, 1.26, -.03] })], [.6, at(.12), 'out']] },
  // Rear-leg high roundhouse, after the owner's reference clip (a Thai-style
  // kick, about 1.1 s): step out to load the lead foot; chamber the rear knee
  // high in front, body upright, both hands up; turn the hips over so the
  // knee points at the target; snap the leg straight through at head height,
  // leaning right back so body and leg make one line, the lead foot pivoted
  // heel-first, hands kept at the face; recoil to the high knee and set the
  // foot down into the stance.
  Street_HighKick: { keys: [[0, S],
    [.08, at(.03, { hips: [.85, 0, -30, 0], spine: [10, 0, 0], fL: [.2, .075, .4], rL: [0, 20], fR: [-.2, .12, -.26], rR: [35, -25], hL: [.12, 1.45, .3], hR: [-.18, 1.42, .12] })],
    [.17, at(.1, { hips: [.93, 0, -5, -4], spine: [0, 0, 0], chest: [0, -5, 0], head: [8, 15, 0], fL: [.16, .09, .36], rL: [15, 45], kL: [.25, 0, 1], fR: [-.08, .92, .2], kR: [0, 1, .7], rR: [60, 10], hL: [.16, 1.5, .3], eL: [.4, -1, 0], hR: [-.14, 1.46, .2], eR: [-.6, -1, 0] })],
    [.23, at(.16, { hips: [.97, 0, 60, -26], spine: [-8, 0, -10], chest: [0, -6, 0], head: [12, -40, 8], fL: [.14, .1, .34], rL: [25, 100], kL: [.3, 0, 1], fR: [.06, 1.5, .5], kR: [.7, 1, .2], rR: [15, 80], hL: [.2, 1.5, .2], eL: [.5, -1, .2], hR: [-.1, 1.38, .26], eR: [-.6, -1, 0] }), 'in'],
    [.3, at(.22, { hips: [1, 0, 112, -40], spine: [-12, 0, -8], chest: [0, -10, 0], neck: [0, -12, 0], head: [16, -82, 16], fL: [.12, .12, .3], rL: [35, 140], kL: [.3, 0, 1], fR: [.26, 2.2, .62], kR: [1, .5, 0], rR: [-10, 95], hL: [.02, 1.52, -.08], eL: [.6, -1, .3], hR: [-.24, 1.32, .22], eR: [-.5, -1, -.3] }), 'in'],
    [.38, at(.23, { hips: [1, 0, 118, -40], spine: [-12, 0, -8], chest: [0, -10, 0], neck: [0, -12, 0], head: [14, -88, 14], fL: [.12, .12, .3], rL: [35, 145], kL: [.3, 0, 1], fR: [.4, 2.12, .5], kR: [1, .5, 0], rR: [-10, 105], hL: [-.02, 1.52, -.1], eL: [.6, -1, .3], hR: [-.24, 1.32, .26], eR: [-.5, -1, -.3] })],
    [.48, at(.23, { hips: [.95, 0, 85, -24], spine: [-6, 0, -5], chest: [0, -6, 0], head: [10, -62, 6], fL: [.12, .09, .3], rL: [25, 115], kL: [.3, 0, 1], fR: [.04, 1.25, .3], kR: [.75, 1, .4], rR: [25, 75], hL: [.12, 1.5, .05], eL: [.5, -1, .2], hR: [-.16, 1.38, .22], eR: [-.6, -1, 0] }), 'out'],
    [.6, at(.22, { hips: [.93, 0, 20, -6], spine: [4, 0, 0], chest: [0, -6, 0], head: [8, 10, 0], fL: [.14, .09, .33], rL: [12, 50], kL: [.2, 0, 1], fR: [-.08, .88, .18], kR: [0, 1, .7], rR: [55, 10], hL: [.16, 1.48, .3], eL: [.4, -1, 0], hR: [-.16, 1.44, .18], eR: [-.6, -1, 0] })],
    [.76, at(.2, { hips: [.87, 0, -30, 0], spine: [8, 0, 0], fL: [.16, .08, .36], rL: [2, -5], fR: [-.21, .1, -.27], kR: [-.3, 0, 1], rR: [15, -30] })],
    [.9, at(.2), 'out']] },
  Street_Knee: { keys: [[0, S],
    [.12, P({ hL: [.12, 1.5, .7], hR: [-.1, 1.5, .7], eL: [.5, -1, 0], eR: [-.5, -1, 0] })],
    [.24, at(.27, { hips: [.95, 0, 0, 0], spine: [-10, 0, 0], chest: [0, 0, 0], head: [5, 0, 0], hL: [.1, 1.3, .55], hR: [-.1, 1.3, .55], eL: [.5, -1, 0], eR: [-.5, -1, 0], fR: [-.08, .75, .25], kR: [0, .6, 1], rR: [40, 0] }), 'in'],
    [.32, at(.27, { hips: [.95, 0, 0, 0], spine: [-10, 0, 0], chest: [0, 0, 0], head: [5, 0, 0], hL: [.1, 1.3, .55], hR: [-.1, 1.3, .55], eL: [.5, -1, 0], eR: [-.5, -1, 0], fR: [-.08, .75, .25], kR: [0, .6, 1], rR: [40, 0] })], [.56, at(.27), 'out']] },
  Street_Barge: { keys: [[0, S],
    [.18, P({ hips: [.82, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .3], fR: [-.2, .075, -.28] })],
    [.27, at(.35, { hips: [.84, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .1], fR: [-.1, .2, .05] }), 'in'],
    [.36, at(.8, { hips: [.86, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .3], fR: [-.18, .075, -.2] })],
    [.44, at(.8, { hips: [.86, 0, -70, 0], spine: [25, 0, 0], chest: [0, -15, 0], head: [-10, 85, 0], hL: [.15, 1.3, .15], hR: [-.47, 1.32, .03], eL: [1, -1, 0], eR: [-1, -1, 0], fL: [.15, .075, .3], fR: [-.18, .075, -.2] })], [.72, at(.8)]] },
  // Dodges, hands kept up: slip the head off the line to either side, duck
  // under, or hop back out of range.
  Street_SlipL: { keys: [[0, S],
    [.12, P({ hips: [.84, 0, -40, -6], spine: [12, 0, -14], chest: [0, -10, -8], head: [12, 48, 6], hL: [.24, 1.28, .33], hR: [-.06, 1.27, .1] }), 'out'],
    [.3, P({ hips: [.84, 0, -40, -6], spine: [12, 0, -14], chest: [0, -10, -8], head: [12, 48, 6], hL: [.24, 1.28, .33], hR: [-.06, 1.27, .1] })], [.48, S]] },
  Street_SlipR: { keys: [[0, S],
    [.12, P({ hips: [.84, 0, -40, 6], spine: [12, 0, 14], chest: [0, -14, 8], head: [12, 48, -6], hL: [-.08, 1.3, .3], hR: [-.38, 1.26, .02] }), 'out'],
    [.3, P({ hips: [.84, 0, -40, 6], spine: [12, 0, 14], chest: [0, -14, 8], head: [12, 48, -6], hL: [-.08, 1.3, .3], hR: [-.38, 1.26, .02] })], [.48, S]] },
  Street_Duck: { keys: [[0, S],
    [.14, P({ hips: [.7, 0, -35, 0], spine: [30, 0, 0], neck: [-6, 0, 0], head: [-12, 45, 0], hL: [.14, 1.08, .42], hR: [-.16, 1.04, .22], fL: [.18, .075, .4], fR: [-.24, .075, -.34] }), 'out'],
    [.32, P({ hips: [.7, 0, -35, 0], spine: [30, 0, 0], neck: [-6, 0, 0], head: [-12, 45, 0], hL: [.14, 1.08, .42], hR: [-.16, 1.04, .22], fL: [.18, .075, .4], fR: [-.24, .075, -.34] })], [.55, S]] },
  Street_StepBack: { keys: [[0, S],
    [.08, at(0, { hips: [.84, 0, -40, 0], spine: [4, 0, 0], fR: [-.22, .14, -.36] })],
    [.22, at(-.42, { hips: [.86, 0, -40, 0], spine: [-6, 0, 0], head: [6, 48, 0], fL: [.16, .16, .3] }), 'out'],
    [.4, at(-.45)]] },
  // The partner's block: the guard shoved back a step by the hit.
  Street_Block: { keys: [[0, GUARD], [.08, over(GUARD, { spine: [4, 0, 0], head: [2, 15, 0], fwd: [-.08] }), 'out'], [.4, over(GUARD, { fwd: [-.1] })]] },
  // Taunt: hands open, wave him in, shrug.
  Street_Taunt: { keys: [[0, S],
    [.3, P({ hips: [.95, 0, 0, 0], spine: [-12, 0, 0], chest: [0, 0, 0], head: [-15, 0, 0], hL: [.55, 1.25, .2], hR: [-.55, 1.25, .2], eL: [0, -1, -1], eR: [0, -1, -1], fL: [.15, .075, .1], fR: [-.15, .075, -.1], rL: [0, 10], rR: [0, -10], g: [0, 0] })],
    [.65, P({ hips: [.95, 0, 0, 0], spine: [-12, 0, 0], chest: [0, 0, 0], head: [-15, 20, 0], hL: [.25, 1.6, .35], hR: [-.55, 1.25, .2], eL: [1, -1, 0], eR: [0, -1, -1], fL: [.15, .075, .1], fR: [-.15, .075, -.1], rL: [0, 10], rR: [0, -10], g: [.6, 0] })],
    [.95, P({ hips: [.95, 0, 0, 0], spine: [-12, 0, 0], chest: [0, 0, 0], head: [-15, -10, 0], hL: [.55, 1.25, .2], hR: [-.55, 1.25, .2], eL: [0, -1, -1], eR: [0, -1, -1], fL: [.15, .075, .1], fR: [-.15, .075, -.1], rL: [0, 10], rR: [0, -10], g: [0, 0] })], [1.3, S]] }
};
for (const c of Object.values(STREET)) c.dur = c.keys.at(-1)[0];
