import test from 'node:test';
import assert from 'node:assert/strict';
import { UAL, CLIPS, LOCO, MOVES, REACT, BUTTONS, STAMINA, segLen, frame, newFighter, press, pick, tick, activeHits, evading, newTarget, receive, settle, floored } from '../src/brawler.js';
import { STREET, STANCE, GUARD } from '../src/street.js';
import { sample, mix } from '../src/keyframes.js';
import { SWORD_MOVES } from '../src/sword.js';

test('sampling eases between keys and holds the ends', () => {
  const a = { x: [0, 10] }, b = { x: [1, 20] }, keys = [[0, a], [1, b]];
  assert.deepEqual(sample(keys, -1), a); assert.deepEqual(sample(keys, 2), b);
  assert.deepEqual(sample(keys, .5), { x: [.5, 15] });
  assert.ok(sample(keys, .25).x[0] < .25, 'eases in');
  assert.ok(sample([[0, a], [1, b, 'out']], .25).x[0] > .25, "'out' starts fast");
  assert.deepEqual(mix(a, b, 0), a);
});

test('every street pose carries every stance channel; keys run in order; loops close', () => {
  for (const [name, c] of Object.entries(STREET)) {
    assert.ok(name.startsWith('Street_') && c.dur > 0, name);
    for (const [t, pose] of c.keys) {
      assert.deepEqual(Object.keys(pose).sort(), Object.keys(STANCE).sort(), `${name} at ${t}`);
      for (const [ch, v] of Object.entries(pose)) { assert.equal(v.length, STANCE[ch].length, `${name}.${ch}`); assert.ok(v.every(Number.isFinite), `${name}.${ch}`); }
    }
    for (let i = 1; i < c.keys.length; i++) assert.ok(c.keys[i][0] > c.keys[i - 1][0], `${name} keys in order`);
    if (c.loop) for (const ch in STANCE) c.keys[0][1][ch].forEach((v, i) => assert.ok(Math.abs(v - c.keys.at(-1)[1][ch][i]) < 1e-9, `${name} loops (${ch})`));
  }
  assert.deepEqual(Object.keys(GUARD).sort(), Object.keys(STANCE).sort());
});

test('the stance after Jai\'s photo: left foot leads, both fists up at the face, rear elbow out', () => {
  assert.ok(STANCE.fL[2] > 0 && STANCE.fR[2] < 0, 'left foot forward');
  assert.ok(STANCE.hL[1] > 1.35 && STANCE.hR[1] > 1.35, 'fists at face height');
  assert.ok(STANCE.hL[2] > STANCE.hR[2], 'lead fist in front of the rear');
  assert.ok(STANCE.eR[0] < -.9 && Math.abs(STANCE.eR[1]) < .5, 'rear elbow flared out to the side');
  assert.equal(STANCE.hips[2], -40, 'chest turned open over the lead');
});

test('every move plays known clips, inside each clip, and its hits fit its time', () => {
  for (const [key, m] of Object.entries({ ...MOVES, ...REACT })) {
    assert.ok(m.play.length > 0, key);
    for (const s of m.play) { assert.ok(CLIPS[s.clip], `${key}: ${s.clip}`); assert.ok(s.from >= 0 && s.from <= s.to && s.to <= CLIPS[s.clip] && s.speed > 0, `${key}: ${s.clip} span`); }
    assert.ok(m.dur > 0 && m.dur <= m.play.reduce((t, s) => t + segLen(s), 0) + 1e-9, `${key} ends within its clips`);
    for (const h of m.hits ?? []) assert.ok(h.t[0] < h.t[1] && h.t[1] <= m.dur && h.dmg > 0, `${key} hit window`);
    if (m.chain) { assert.ok(MOVES[m.chain], `${key} chains to a move`); assert.ok(m.chainAt < m.dur, `${key} chains before it ends`); }
    if (m.evade) assert.ok(m.evade[0] < m.evade[1] && m.evade[1] <= m.dur, `${key} evade window`);
  }
  for (const n of Object.values(LOCO)) assert.ok(CLIPS[n], n);
});

test('a street fight: Jai\'s moves are his own street clips, bare hands and feet, no weapons', () => {
  for (const [k, m] of Object.entries(MOVES)) { assert.ok(m.play.every(s => s.clip.startsWith('Street_')), k); assert.equal(m.prop, undefined, k); }
  const parts = new Set(Object.values(MOVES).flatMap(m => m.hits.map(h => h.part)));
  assert.deepEqual([...parts].sort(), ['footL', 'footR', 'handL', 'handR', 'kneeR', 'shoulderL']);
  for (const k of ['jab', 'hook', 'highKick', 'lowKick', 'pushKick', 'slipL', 'slipR', 'duck', 'stepBack']) assert.ok(MOVES[k], k);
  assert.equal(LOCO.idle, 'Street_Stance'); assert.equal(LOCO.guard, 'Street_Guard');
});

test('the sword techniques are all kept, on clips still in fighter.glb', () => {
  const sword = Object.keys(UAL).filter(n => /^(Sword|Shield|Idle_Shield)_/.test(n));
  const used = new Set(Object.values(SWORD_MOVES).flatMap(m => m.play.map(s => s.clip)));
  for (const n of sword) assert.ok(used.has(n), n + ' has a sword technique');
  for (const [k, m] of Object.entries(SWORD_MOVES)) for (const s of m.play) assert.ok(UAL[s.clip], `${k}: ${s.clip}`);
  for (const n of ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Regular_Combo', 'Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Block']) assert.ok(used.has(n), n);
});

test('frame walks through segments and holds the last frame', () => {
  const r = REACT.down, held = frame(r, CLIPS.Hit_Knockback + .3);
  assert.deepEqual(frame(r, 0), { i: 0, clip: 'Hit_Knockback', time: 0 });
  assert.equal(held.i, 1); assert.equal(held.time, CLIPS.Hit_Knockback, 'lies still on the floor');
  assert.equal(frame(r, 99).clip, 'LayToIdle');
});

test('a move costs stamina, blocks other moves and finishes', () => {
  const f = newFighter();
  assert.deepEqual(press(f, 'tendang'), { move: 'highKick' });
  assert.equal(f.stamina, STAMINA.max - MOVES.highKick.cost);
  assert.equal(press(f, 'kasar'), null, 'busy');
  tick(f, .3); assert.equal(activeHits(f).length, 1);
  tick(f, MOVES.highKick.dur); assert.equal(f.move, null);
});

test('three tumbuk taps chain jab, straight, then hook', () => {
  const f = newFighter();
  press(f, 'tumbuk'); assert.deepEqual(press(f, 'tumbuk'), { queued: 'cross' });
  assert.equal(tick(f, .1), null, 'waits for the jab to land');
  assert.equal(tick(f, .1), 'cross'); press(f, 'tumbuk');
  assert.equal(tick(f, .25), 'hook');
  assert.equal(f.stamina, STAMINA.max - 6 - 8 - 14);
  assert.equal(press(f, 'tumbuk'), null, 'the hook ends the chain');
  tick(f, MOVES.hook.dur); assert.equal(f.move, null);
});

test('four buttons and the stick pick every move', () => {
  const seen = new Set();
  for (const b of Object.keys(BUTTONS)) for (const dir of [-1, 0, 1]) for (const side of [-1, 0, 1]) { const k = pick(b, dir, side); if (k) seen.add(k); }
  assert.deepEqual([...seen].sort(), Object.keys(MOVES).filter(k => k !== 'cross').sort(), 'the straight comes from the chain');
  assert.equal(pick('tumbuk'), 'jab'); assert.equal(pick('tumbuk', 1), 'hook'); assert.equal(pick('tumbuk', -1), 'uppercut');
  assert.equal(pick('tendang'), 'highKick'); assert.equal(pick('tendang', 1), 'pushKick'); assert.equal(pick('tendang', -1), 'lowKick');
  assert.equal(pick('kasar'), 'knee'); assert.equal(pick('kasar', 1), 'barge'); assert.equal(pick('kasar', -1), 'taunt');
  assert.equal(pick('tahan', 0, 1), 'slipL'); assert.equal(pick('tahan', 0, -1), 'slipR'); assert.equal(pick('tahan', 1), 'duck'); assert.equal(pick('tahan', -1), 'stepBack');
  assert.equal(pick('tahan'), null, 'guard is held, not pressed');
});

test('dodges take him off the line for a moment', () => {
  const f = newFighter(); press(f, 'tahan', 0, 1); assert.ok(!evading(f));
  tick(f, .15); assert.ok(evading(f)); tick(f, .3); assert.ok(!evading(f));
});

test('the taunt costs nothing and brings stamina back', () => {
  const f = newFighter(); f.stamina = 30;
  assert.deepEqual(press(f, 'kasar', -1), { move: 'taunt' }); tick(f, MOVES.taunt.dur);
  assert.equal(f.stamina, 30 + MOVES.taunt.gain);
});

test('tired fighters cannot attack; resting brings stamina back', () => {
  const f = newFighter(); f.stamina = 12;
  assert.deepEqual(press(f, 'tendang'), { fail: 'penat' });
  press(f, 'tumbuk'); tick(f, MOVES.jab.dur); assert.equal(f.move, null); assert.equal(f.stamina, 6);
  tick(f, 1); assert.ok(Math.abs(f.stamina - (6 + STAMINA.regen * (1 - STAMINA.rest))) < 1e-9, 'regen after the rest delay');
});

test('a tireless fighter attacks forever', () => {
  const f = newFighter({ tireless: true });
  for (let i = 0; i < 30; i++) { assert.ok(press(f, 'tendang').move); tick(f, 5); }
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
