const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;

// Gait values are fractions of the character's leg length (hip to ankle), so
// children and adults share one cycle. `run` blends 0 (walk) to 1 (sprint);
// a boolean still works. Reach and pelvis drop are paired so every stance
// target stays inside the straightened leg.
export function gaitShape(run = 0) {
  run = clamp(Number(run), 0, 1);
  return {
    support: mix(.62, .38, run),
    reach: mix(.27, .40, run),
    lift: mix(.13, .27, run),
    drop: mix(.045, .095, run),
    bounce: mix(.015, .03, run),
    cycle: mix(1.9, 4.2, run)
  };
}

// A stance lasts longer than a swing when walking; running adds a flight
// phase. The foot stays flat and low during support, then clears the ground
// and returns in a smooth arc.
export function footCycle(phase, run = 0) {
  const { support, reach, lift } = gaitShape(run);
  const cycle = ((phase / TAU) % 1 + 1) % 1;
  if (cycle < support) return { z: reach * (1 - 2 * cycle / support), lift: 0, roll: 0, stance: true };
  const swing = (cycle - support) / (1 - support);
  return {
    z: reach * (2 * smooth(swing) - 1),
    lift: lift * Math.sin(Math.PI * swing),
    roll: -.32 * Math.sin(Math.PI * swing),
    stance: false
  };
}

// Two-bone sagittal IK, with +Z facing forward and knee flexion around +X.
export function solveLeg(y, z, upper = .5, lower = .5) {
  const length = clamp(Math.hypot(y, z), Math.abs(upper - lower) + .00001, upper + lower - .00001);
  const hip = Math.atan2(-z, -y) - Math.acos(clamp((upper * upper + length * length - lower * lower) / (2 * upper * length), -1, 1));
  const knee = Math.PI - Math.acos(clamp((upper * upper + lower * lower - length * length) / (2 * upper * lower), -1, 1));
  return { hip, knee };
}

export function gaitPose(phase, time, amount, run = 0) {
  amount = clamp(amount, 0, 1); run = clamp(Number(run), 0, 1);
  const shape = gaitShape(run), stance = Math.PI * shape.support;
  // `wave` peaks while the first foot is forward; the same-side arm swings
  // back and that hip leads, as in a natural contralateral stride.
  const wave = Math.cos(phase - stance + Math.PI / 2), weight = Math.cos(phase - stance);
  // Highest over the supporting leg, lowest as weight passes between feet.
  const rise = shape.bounce * (.5 + .5 * Math.cos(2 * (phase - stance)));
  const idle = -.002 - .0015 * Math.sin(time * 2.3);
  return {
    x: -weight * mix(.018, .010, run) * amount,
    y: (rise - shape.drop) * amount + idle * (1 - amount),
    hipYaw: wave * mix(.07, .11, run) * amount,
    hipRoll: -weight * .03 * amount,
    chestYaw: -wave * mix(.12, .2, run) * amount,
    chestRoll: weight * .03 * amount,
    lean: mix(.05, .2, run) * amount,
    feet: [0, Math.PI].map(offset => {
      const step = footCycle(phase + offset, run);
      return { ...step, z: step.z * amount, lift: step.lift * amount, roll: step.roll * amount };
    }),
    arms: [wave, -wave].map(value => ({
      swing: value * mix(.42, .95, run) * amount,
      bend: -mix(.14, .18, amount) - (mix(.18, 1.25, run) + Math.max(0, -value) * mix(.2, .25, run)) * amount
    }))
  };
}
