import test from 'node:test';
import assert from 'node:assert/strict';
import { newBreath, breathe, BREATH } from '../src/breath.js';

const run = (b, secs, ctx, dt = 1 / 60) => { const out = []; for (let t = 0; t < secs; t += dt) out.push(breathe(b, dt, ctx)); return out; };

test('at rest the chest rises and falls smoothly at a slow rate', () => {
  const b = newBreath(), v = run(b, 10, {});
  assert.ok(Math.max(...v) > .4 && Math.min(...v) < -.4, 'breathes in and out');
  for (let i = 1; i < v.length; i++) assert.ok(Math.abs(v[i] - v[i - 1]) < .05, 'no jumps');
  const peaks = v.filter((x, i) => i && i < v.length - 1 && x > v[i - 1] && x >= v[i + 1]).length;
  assert.equal(peaks, Math.round(10 * BREATH.rest), 'about one breath every three seconds');
});

test('attacking holds a full breath, then lets it out', () => {
  const b = newBreath(); run(b, 1, {});
  const held = run(b, .4, { attacking: true });
  assert.ok(held.at(-1) > .95, 'held in');
  const after = run(b, .8, {});
  assert.ok(Math.min(...after) < -.2, 'pushed out after the attack');
});

test('effort builds with work and settles at rest, quickening the breath', () => {
  const b = newBreath(); run(b, 4, { moving: 1, attacking: true });
  assert.ok(b.effort > .9);
  const p0 = b.phase; breathe(b, .1, {}); const fast = (b.phase - p0 + 1) % 1;
  run(b, 15, {}); assert.ok(b.effort < .05, 'settles');
  const p1 = b.phase; breathe(b, .1, {}); const slow = (b.phase - p1 + 1) % 1;
  assert.ok(fast > slow * 2);
});
