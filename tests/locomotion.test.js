import test from 'node:test';
import assert from 'node:assert/strict';
import { footCycle, solveLeg, gaitPose, gaitShape } from '../src/locomotion.js';

const RUNS = [0, .25, .5, .75, 1];
test('foot support is flat, swing clears the ground and cycle boundaries meet', () => {
  for (const run of [...RUNS, false, true]) {
    let support = 0, swing = 0;
    for (let i = 0; i < 360; i++) {
      const foot = footCycle(i * Math.PI / 180, run);
      if (foot.stance) { assert.equal(foot.lift, 0); assert.equal(foot.roll, 0); support++; }
      else { assert.ok(foot.lift >= 0); swing++; }
    }
    assert.ok(support > 0 && swing > 0);
    const a = footCycle(0, run), b = footCycle(Math.PI * 2 - .000001, run);
    assert.ok(Math.abs(a.z - b.z) < .00001);
    assert.ok(b.lift < .00001);
  }
});
test('running blends into longer strides, a flight phase and a forward lean', () => {
  const walk = gaitShape(0), sprint = gaitShape(1);
  assert.ok(sprint.reach > walk.reach && sprint.cycle > walk.cycle && sprint.lift > walk.lift);
  assert.ok(walk.support > .5, 'walking always keeps a foot down');
  assert.ok(sprint.support < .5, 'sprinting has both feet off the ground');
  assert.ok(gaitPose(1, 0, 1, 1).lean > gaitPose(1, 0, 1, 0).lean);
});
test('two-bone legs reach every foot target without reverse knee bends', () => {
  // Gait values are fractions of leg length, so test a unit leg split evenly.
  for (const run of RUNS) for (let phase = 0; phase < Math.PI * 2; phase += .05) {
    const pose = gaitPose(phase, 0, 1, run);
    for (const foot of pose.feet) {
      const y = foot.lift - 1 - pose.y, z = foot.z;
      assert.ok(Math.hypot(y, z) < 1, `run ${run} phase ${phase.toFixed(2)} target lies inside the leg`);
      const leg = solveLeg(y, z, .5, .5);
      const solvedY = -.5 * Math.cos(leg.hip) - .5 * Math.cos(leg.hip + leg.knee);
      const solvedZ = -.5 * Math.sin(leg.hip) - .5 * Math.sin(leg.hip + leg.knee);
      assert.ok(Math.abs(solvedY - y) < .00001);
      assert.ok(Math.abs(solvedZ - z) < .00001);
      assert.ok(leg.knee >= 0 && leg.knee < Math.PI);
    }
  }
});
test('arms swing against the same-side leg', () => {
  for (const run of RUNS) {
    let forward = -Infinity, back = -Infinity, footPhase = 0, armPhase = 0;
    for (let phase = 0; phase < Math.PI * 2; phase += .01) {
      const pose = gaitPose(phase, 0, 1, run);
      if (pose.feet[0].z > forward) { forward = pose.feet[0].z; footPhase = phase; }
      if (pose.arms[0].swing > back) { back = pose.arms[0].swing; armPhase = phase; }
    }
    // Positive swing carries the hand back, so it peaks near the same-side
    // foot's furthest forward reach.
    assert.ok(Math.abs(Math.atan2(Math.sin(armPhase - footPhase), Math.cos(armPhase - footPhase))) < .8);
  }
});
test('standing keeps the legs nearly straight', () => {
  for (const time of [0, .4, 1.3, 2.7]) {
    const pose = gaitPose(0, time, 0);
    assert.ok(pose.y <= 0 && pose.y > -.01);
  }
});
test('stopping settles both feet and removes travel sway and arm swings', () => {
  for (const phase of [0, .7, 2, 5]) {
    const pose = gaitPose(phase, 1, 0);
    assert.equal(Math.abs(pose.x), 0);
    assert.equal(Math.abs(pose.hipYaw), 0);
    assert.ok(pose.feet.every(foot => Math.abs(foot.z) === 0 && foot.lift === 0 && Math.abs(foot.roll) === 0));
    assert.ok(pose.arms.every(arm => Math.abs(arm.swing) === 0));
  }
});
