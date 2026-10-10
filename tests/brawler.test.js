import test from 'node:test';
import assert from 'node:assert/strict';
import { sample, mix } from '../src/keyframes.js';
import { STANCE, MOVES, BUTTONS, STAMINA, CLOSE, newFighter, press, pick, tick, activeHits, grabbing } from '../src/brawler.js';

test('sampling eases between keys and holds the ends', () => {
  const a = { x: [0, 10] }, b = { x: [1, 20] }, keys = [[0, a], [1, b]];
  assert.deepEqual(sample(keys, -1), a); assert.deepEqual(sample(keys, 2), b);
  assert.deepEqual(sample(keys, .5), { x: [.5, 15] });
  assert.ok(sample(keys, .25).x[0] < .25, 'eases in');
  assert.deepEqual(mix(a, b, 0), a);
});

test('every move key carries every stance channel and ends back in stance', () => {
  for (const [key, m] of Object.entries(MOVES)) {
    for (const [t, pose] of m.keys) {
      assert.deepEqual(Object.keys(pose).sort(), Object.keys(STANCE).sort(), `${key} at ${t}`);
      for (const [ch, v] of Object.entries(pose)) assert.equal(v.length, STANCE[ch].length, `${key}.${ch}`);
    }
    for (let i = 1; i < m.keys.length; i++) assert.ok(m.keys[i][0] > m.keys[i - 1][0], `${key} keys in order`);
    assert.equal(m.keys.at(-1)[0], m.dur, `${key} lasts its keys`);
    const end = m.keys.at(-1)[1]; for (const ch in STANCE) if (ch !== 'fwd') assert.deepEqual(end[ch], STANCE[ch], `${key} ends in stance (${ch})`);
    for (const h of m.hits) assert.ok(h.t[0] < h.t[1] && h.t[1] <= m.dur && h.dmg > 0, `${key} hit window`);
  }
});

test('a move costs stamina, blocks other moves and finishes', () => {
  const f = newFighter();
  assert.deepEqual(press(f, 'tendang'), { move: 'roundhouse' });
  assert.equal(f.stamina, STAMINA.max - MOVES.roundhouse.cost);
  assert.equal(press(f, 'kasar'), null, 'busy');
  tick(f, .3); assert.equal(activeHits(f).length, 1);
  tick(f, .6); assert.equal(f.move, null);
});

test('three tumbuk taps chain jab, straight, then the haymaker', () => {
  const f = newFighter();
  press(f, 'tumbuk'); press(f, 'tumbuk');
  assert.equal(tick(f, .2), 'cross'); press(f, 'tumbuk');
  assert.equal(tick(f, .25), 'haymaker');
  assert.equal(f.stamina, STAMINA.max - 6 - 8 - 18);
  assert.equal(press(f, 'tumbuk'), null, 'the haymaker ends the chain');
});

test('four buttons and the stick pick every move', () => {
  const seen = new Set();
  for (const b of Object.keys(BUTTONS)) for (const dir of [-1, 0, 1]) for (const near of [.5, 2]) { const k = pick(b, dir, near); if (k) seen.add(k); }
  assert.deepEqual([...seen].sort(), Object.keys(MOVES).filter(k => k !== 'cross' && k !== 'haymaker').sort(), 'straight and haymaker come from the chain');
  assert.equal(pick('tumbuk', -1), 'uppercut'); assert.equal(pick('tendang', 1), 'pushKick'); assert.equal(pick('tendang', -1), 'lowKick');
  assert.equal(pick('kasar', 0, CLOSE), 'headlock'); assert.equal(pick('kasar', 0, 2), 'barge'); assert.equal(pick('kasar', 1), 'knee'); assert.equal(pick('kasar', -1), 'taunt');
  assert.equal(pick('tahan'), null, 'guard is held, not pressed');
});

test('tired fighters cannot attack; resting and taunting bring stamina back', () => {
  const f = newFighter(); f.stamina = 5;
  assert.deepEqual(press(f, 'tendang'), { fail: 'penat' });
  press(f, 'kasar', -1); tick(f, 1.4); assert.equal(f.stamina, 30);
  tick(f, 1); assert.equal(f.stamina, 30 + STAMINA.regen * (1 - STAMINA.rest), 'regen after the rest delay');
});

test('the headlock needs the opponent close and holds them for its grab', () => {
  const f = newFighter();
  assert.deepEqual(press(f, 'kasar', 0, 2), { move: 'barge' }, 'too far: barge in instead');
  tick(f, 1); assert.deepEqual(press(f, 'kasar', 0, .9), { move: 'headlock' }); tick(f, 1); assert.ok(grabbing(f));
  tick(f, 1.2); assert.ok(!grabbing(f));
});

test('guard and partner poses carry every channel', async () => {
  const { GUARD, PARTNER } = await import('../src/brawler.js');
  for (const [k, p] of Object.entries({ GUARD, ...PARTNER })) assert.deepEqual(Object.keys(p).sort(), Object.keys(STANCE).sort(), k);
});
