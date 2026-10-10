// Idle actions for the townsfolk, as joint poses over time. Each returns
// target rotations (radians) that characters.js blends over the walk pose:
//   arms:   [right, left], each [forward/back, twist, out/in] or null to leave alone
//           (forward is negative; for the right arm, out is negative, for the left positive)
//   elbows: [right, left] bend, negative folds the forearm forward, or null
//   torso, head: [pitch, turn, tilt] added on top (pitch > 0 leans forward/looks down)
// `t` is seconds since the action started.
const S = Math.sin;
export const ACTIONS = {
  // Wave hello with the right hand.
  wave: t => ({ arms: [[-.3, 0, -2.4], null], elbows: [-.35 + .4 * S(t * 9), null], head: [-.05, 0, .08] }),
  // Look around, slowly, left then right.
  look: t => ({ head: [0, .7 * S(t * .9), 0], torso: [0, .18 * S(t * .9), 0] }),
  // Stir a pot with the right hand.
  stir: t => ({ arms: [[-.75 + .12 * S(t * 4), 0, -.12 + .12 * Math.cos(t * 4)], [-.4, 0, .1]], elbows: [-1.05, -1.2], torso: [.14, 0, 0], head: [.3, 0, 0] }),
  // Wipe a table or counter, side to side.
  wipe: t => ({ arms: [[-.95 + .08 * S(t * 6), 0, -.15 - .35 * S(t * 3)], null], elbows: [-.55, null], torso: [.28, .1 * S(t * 3), 0], head: [.35, 0, 0] }),
  // Write in a notebook held in the left hand.
  write: t => ({ arms: [[-.55, 0, .12], [-.5, 0, -.2]], elbows: [-1.3 + .08 * S(t * 12), -1.45], head: [.38, 0, 0] }),
  // Read something held in both hands.
  read: t => ({ arms: [[-.45, 0, .14], [-.45, 0, -.14]], elbows: [-1.5, -1.5], head: [.36, .05 * S(t * .7), 0] }),
  // Fan the face against the afternoon heat.
  fan: t => ({ arms: [[-.85, 0, -.25], null], elbows: [-2.05 + .18 * S(t * 11), null], head: [-.08, 0, -.05] }),
  // Stretch both arms over the head.
  stretch: t => ({ arms: [[-2.85, 0, -.15], [-2.85, 0, .15]], elbows: [-.15, -.15], torso: [-.12, 0, .05 * S(t * 1.5)], head: [-.25, 0, 0] }),
  // Hands on hips.
  hips: () => ({ arms: [[1.16, .67, -1.26], [1.16, -.67, 1.26]], elbows: [-1.6, -1.6], head: [-.03, 0, 0] }),
  // Arms folded across the chest.
  fold: () => ({ arms: [[-.6, 0, .32], [-.6, 0, -.32]], elbows: [-1.85, -1.85], head: [.04, 0, 0] }),
  // Chat with hand gestures.
  talk: t => ({ arms: [[-.5 + .15 * S(t * 3), 0, -.1], [-.3, 0, .1]], elbows: [-1.2 + .25 * S(t * 4), -.8], head: [.04 * S(t * 5), .15 * S(t * 2), 0] }),
  // Bend down to the ground: weeding, picking up, setting down a toy car.
  bend: t => ({ arms: [[-.85, 0, -.05], [-.85 + .15 * S(t * 3), 0, .05]], elbows: [-.25, -.25], torso: [.85, 0, 0], head: [-.25, 0, 0] }),
  // Scratch the head, thinking.
  scratch: t => ({ arms: [[-2.3, 0, -.55], null], elbows: [-2.1 + .12 * S(t * 14), null], head: [.05, 0, .15] }),
  // Glance at a wristwatch on the left wrist.
  check: () => ({ arms: [null, [-.53, -.87, -.32]], elbows: [null, -1.75], head: [.32, .2, 0] }),
  // A slow, friendly nod.
  nod: t => ({ head: [.18 * Math.max(0, S(t * 3.5)), 0, 0] }),
  // The barber's snip: scissors raised to head height, comb hand ready.
  snip: t => ({ arms: [[-1.35, 0, -.25], [-.9, 0, .2]], elbows: [-1.1 + .07 * S(t * 16), -1.3], head: [.15, .1 * S(t * .8), 0] }),
  // Hand sewing: the right hand draws the thread up and out.
  sew: t => ({ arms: [[-.6 - .25 * Math.max(0, S(t * 3)), 0, .1], [-.55, 0, -.12]], elbows: [-1.2 + .35 * Math.max(0, S(t * 3)), -1.35], torso: [.12, 0, 0], head: [.42, 0, 0] }),
  // Pumping a bicycle tyre: bent over, both hands working the pump.
  pump: t => ({ arms: [[-.55 + .25 * S(t * 5), 0, .12], [-.55 + .25 * S(t * 5), 0, -.12]], elbows: [-.6 - .3 * S(t * 5), -.6 - .3 * S(t * 5)], torso: [.55 + .08 * S(t * 5), 0, 0], head: [-.1, 0, 0] }),
  // Sweeping the yard with a penyapu lidi, side to side.
  sweep: t => ({ arms: [[-.5, 0, -.1 + .35 * S(t * 2.4)], [-.35, 0, .1 + .35 * S(t * 2.4)]], elbows: [-.4, -.5], torso: [.32, .2 * S(t * 2.4), 0], head: [.3, 0, 0] }),
  // Rocking the baby in its sling, swaying gently.
  rock: t => ({ arms: [[-.55, 0, .3], [-.55, 0, -.3]], elbows: [-1.45, -1.45], torso: [.06, 0, .07 * S(t * 1.6)], head: [.3, 0, .08 * S(t * 1.6)] }),
  // Lifting the rod and flicking the line out over the water.
  cast: t => ({ arms: [[-1 - .35 * Math.max(0, S(t * .8)), 0, -.1], [-.5, 0, .05]], elbows: [-.7, -1.2], head: [-.12, 0, 0] })
};
export const ACTION_NAMES = Object.keys(ACTIONS);
