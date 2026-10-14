import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS, LOCO, MOVES, REACT, BUTTONS, STAMINA, segLen, frame, newFighter, press, pick, tick, activeHits, newTarget, receive, settle, floored } from '../src/brawler.js';

test('every move plays known clips, inside each clip, and its hits fit its time', () => {
  for (const [key, m] of Object.entries({ ...MOVES, ...REACT })) {
    assert.ok(m.play.length > 0, key);
    for (const s of m.play) { assert.ok(CLIPS[s.clip], `${key}: ${s.clip}`); assert.ok(s.from >= 0 && s.from <= s.to && s.to <= CLIPS[s.clip] && s.speed > 0, `${key}: ${s.clip} span`); }
    assert.ok(m.dur > 0 && m.dur <= m.play.reduce((t, s) => t + segLen(s), 0) + 1e-9, `${key} ends within its clips`);
    for (const h of m.hits ?? []) assert.ok(h.t[0] < h.t[1] && h.t[1] <= m.dur && h.dmg > 0, `${key} hit window`);
    if (m.chain) { assert.ok(MOVES[m.chain], `${key} chains to a move`); assert.ok(m.chainAt < m.dur, `${key} chains before it ends`); }
  }
  for (const n of Object.values(LOCO)) assert.ok(CLIPS[n], n);
});

test('frame walks through segments and holds the last frame', () => {
  const m = MOVES.slashA;
  assert.deepEqual(frame(m, 0), { i: 0, clip: 'Sword_Regular_A', time: 0 });
  assert.equal(frame(m, .5).clip, 'Sword_Regular_A_Rec');
  assert.ok(Math.abs(frame(m, .5).time - (.5 - CLIPS.Sword_Regular_A)) < 1e-9);
  assert.deepEqual(frame(m, 9), { i: 1, clip: 'Sword_Regular_A_Rec', time: CLIPS.Sword_Regular_A_Rec });
  const down = REACT.down, held = frame(down, CLIPS.Hit_Knockback + .3);
  assert.equal(held.i, 1); assert.equal(held.time, CLIPS.Hit_Knockback, 'lies still on the floor');
  assert.ok(Math.abs(frame(MOVES.jump, .1).time - .13) < 1e-9, 'played faster');
});

test('a move costs stamina, blocks other moves and finishes', () => {
  const f = newFighter();
  assert.deepEqual(press(f, 'berat'), { move: 'heavy' });
  assert.equal(f.stamina, STAMINA.max - MOVES.heavy.cost);
  assert.equal(press(f, 'tong'), null, 'busy');
  tick(f, .45); assert.equal(activeHits(f).length, 1);
  tick(f, MOVES.heavy.dur); assert.equal(f.move, null);
});

test('three tetak taps chain tetak, tetak balik, then tetak penamat', () => {
  const f = newFighter();
  press(f, 'tetak'); assert.deepEqual(press(f, 'tetak'), { queued: 'slashB' });
  assert.equal(tick(f, .2), null, 'waits for the first cut to finish');
  assert.equal(tick(f, .25), 'slashB'); press(f, 'tetak');
  assert.equal(tick(f, .55), 'slashC');
  assert.equal(f.stamina, STAMINA.max - 6 - 7 - 12);
  assert.equal(press(f, 'tetak'), null, 'tetak penamat ends the chain');
  tick(f, MOVES.slashC.dur); assert.equal(f.move, null);
});

test('without a second tap the cut plays its recovery', () => {
  const f = newFighter(); press(f, 'tetak'); tick(f, .6);
  assert.equal(f.move, 'slashA'); assert.equal(frame(MOVES.slashA, f.t).clip, 'Sword_Regular_A_Rec');
});

test('four buttons and the stick pick every move', () => {
  const seen = new Set();
  for (const b of Object.keys(BUTTONS)) for (const dir of [-1, 0, 1]) { const k = pick(b, dir); if (k) seen.add(k); }
  assert.deepEqual([...seen].sort(), Object.keys(MOVES).filter(k => k !== 'slashB' && k !== 'slashC').sort(), 'the later cuts come from the chain');
  assert.equal(pick('tetak', 1), 'dash'); assert.equal(pick('tetak', -1), 'hook');
  assert.equal(pick('berat'), 'heavy'); assert.equal(pick('berat', 1), 'combo'); assert.equal(pick('berat', -1), 'throw');
  assert.equal(pick('tong'), 'bash'); assert.equal(pick('tong', 1), 'shieldDash'); assert.equal(pick('tong', -1), 'scratch');
  assert.equal(pick('tahan', 1), 'slide'); assert.equal(pick('tahan', -1), 'jump');
  assert.equal(pick('tahan'), null, 'guard is held, not pressed');
});

test('weapon moves show their prop', () => {
  for (const [k, m] of Object.entries(MOVES)) if (m.hits.some(h => h.part === 'kayu' || h.part === 'tong')) assert.equal(m.prop, m.hits[0].part, k);
});

test('tired fighters cannot attack; resting brings stamina back', () => {
  const f = newFighter(); f.stamina = 20;
  assert.deepEqual(press(f, 'berat'), { fail: 'penat' });
  press(f, 'tetak'); tick(f, MOVES.slashA.dur); assert.equal(f.move, null); assert.equal(f.stamina, 14);
  tick(f, 1); assert.ok(Math.abs(f.stamina - (14 + STAMINA.regen * (1 - STAMINA.rest))) < 1e-9, 'regen after the rest delay');
});

test('a tireless fighter attacks forever', () => {
  const f = newFighter({ tireless: true });
  for (let i = 0; i < 30; i++) { assert.ok(press(f, 'berat').move); tick(f, 5); }
  assert.equal(f.stamina, STAMINA.max);
});

test('the partner flinches, goes down to heavy hits, and gets up after a K.O.', () => {
  const p = newTarget();
  assert.deepEqual(receive(p, { dmg: 5 }), { dmg: 5, react: 'flinch' });
  assert.deepEqual(receive(p, { dmg: 10, heavy: true }), { dmg: 10, react: 'down' }); assert.ok(floored(p));
  receive(p, { dmg: 4 }); assert.equal(p.react, 'down', 'a flinch does not cut a fall short');
  p.hp = 3; assert.equal(receive(p, { dmg: 5 }).react, 'ko'); assert.equal(p.hp, 0);
  let up = null; for (let t = 0; t < 10 && !up; t += .1) up = settle(p, .1);
  assert.equal(up, 'ko'); assert.equal(p.hp, 100); assert.equal(p.react, null);
});

test('a guard soaks light hits and breaks on heavy ones', () => {
  const p = newTarget(); p.guard = true;
  assert.deepEqual(receive(p, { dmg: 10 }), { dmg: 2, react: 'block' });
  assert.deepEqual(receive(p, { dmg: 10, heavy: true }), { dmg: 6, react: 'break' });
  assert.equal(p.hp, 92);
});
