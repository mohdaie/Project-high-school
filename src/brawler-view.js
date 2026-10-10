import * as T from 'three';
import { inkViewport } from './illustration.js';
import { createMannequin } from './mannequin.js';
import { sample, mix } from './keyframes.js';
import { STANCE, GUARD, PARTNER, MOVES, newFighter, press, tick, activeHits, grabbing } from './brawler.js';

// Training ring: Jai against a sparring partner who takes the hits.
// Camera from the side, Jai on the left. Stick: right = toward the partner,
// left = back off, up/down = step round him.
const $ = id => document.getElementById(id);
const canvas = $('view'), renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = T.SRGBColorSpace; renderer.shadowMap.enabled = true;
const scene = new T.Scene(); scene.background = new T.Color(0x1f1c2b); scene.fog = new T.Fog(0x1f1c2b, 9, 22);
const camera = new T.PerspectiveCamera(42, 1, .05, 60);
scene.add(new T.HemisphereLight(0xfff1dc, 0x3a4660, 1.15));
const rim = new T.DirectionalLight(0x9fc4ff, .9); rim.position.set(-3, 4, -5); scene.add(rim);
const sun = new T.DirectionalLight(0xffe2bd, 1.5); sun.position.set(2, 7, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); scene.add(sun);
const RING = 3.6, REST = .95;
const floor = new T.Mesh(new T.CircleGeometry(RING + .5, 56), new T.MeshLambertMaterial({ color: 0x3a4660 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const line = new T.Mesh(new T.RingGeometry(RING, RING + .12, 56), new T.MeshBasicMaterial({ color: 0xd8322a })); line.rotation.x = -Math.PI / 2; line.position.y = .003; scene.add(line);
const outer = new T.Mesh(new T.CircleGeometry(30, 32), new T.MeshLambertMaterial({ color: 0x1b1824 })); outer.rotation.x = -Math.PI / 2; outer.position.y = -.01; scene.add(outer);

const me = { m: createMannequin(scene, { body: 0xd9a36c, joint: 0x5b3a28, band: 0xd8322a }), f: newFighter({ tireless: true }), pos: new T.Vector3(-.6, 0, 0), yaw: 0, vel: new T.Vector3(), phase: 0, fwd: 0, seq: 0 };
const foe = { m: createMannequin(scene, { body: 0x8fa3b8, joint: 0x3e4a5c }), pos: new T.Vector3(.6, 0, 0), yaw: 0, hp: 100, react: PARTNER.idle, rw: 0, knock: new T.Vector3(), hold: 0, down: -1, flash: 0 };

// ---- input: keyboard, a floating stick on the left, buttons on the right
const keys = new Set(), stick = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
// Keyboard face buttons sit in the same diamond: I triangle, J square, L circle, K cross.
const KEYMAP = { KeyJ: 'tumbuk', KeyI: 'tendang', KeyL: 'kasar' };
addEventListener('keydown', e => { if (e.repeat) return; keys.add(e.code); if (KEYMAP[e.code]) act(KEYMAP[e.code]); audio(); });
addEventListener('keyup', e => keys.delete(e.code));
let guardHeld = false;
for (const b of document.querySelectorAll('#pad button')) {
  const a = b.dataset.act;
  b.addEventListener('pointerdown', e => { e.preventDefault(); audio(); b.classList.add('on'); if (a === 'tahan') guardHeld = true; else act(a); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { b.classList.remove('on'); if (a === 'tahan') guardHeld = false; });
}
const base = $('stick'), knob = $('knob');
$('tiredBtn').onclick = () => { me.f.tireless = !me.f.tireless; me.f.stamina = 100; $('tiredBtn').textContent = me.f.tireless ? 'Penat: tak' : 'Penat: ya'; $('stamWrap').hidden = me.f.tireless; };
$('listBtn').onclick = () => { const l = $('list'); l.hidden = !l.hidden; $('listBtn').setAttribute('aria-expanded', !l.hidden); };
canvas.addEventListener('pointerdown', e => { if (stick.id !== null || e.clientX > innerWidth * .5) return; audio(); stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; canvas.setPointerCapture(e.pointerId); base.hidden = false; base.style.transform = `translate(${e.clientX - 60}px,${e.clientY - 60}px)`; moveStick(e); });
canvas.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
const endStick = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; base.hidden = true; };
canvas.addEventListener('pointerup', endStick); canvas.addEventListener('pointercancel', endStick);
const R = 50;
function moveStick(e) {
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy), k = l > R ? R / l : 1; dx *= k; dy *= k;
  stick.x = dx / R; stick.y = -dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; knob.classList.toggle('run', Math.hypot(stick.x, stick.y) > .8);
}

// ---- feedback: popups, damage numbers, sound
let popTimer = 0, combo = 0, comboAt = -9, now = 0;
function pop(text, cls = '') { const p = $('pop'); p.textContent = text; p.className = cls; popTimer = .9; }
// The stick toward the partner (1) or away (-1) picks each button's variant.
const stickDir = () => { const x = input().x; return x > .45 ? 1 : x < -.45 ? -1 : 0; };
function act(button) {
  const r = press(me.f, button, stickDir(), me.pos.distanceTo(foe.pos));
  if (r?.move) begin(r.move);
  else if (r?.fail === 'penat') pop('Penat!', 'warn');
  else if (r?.fail === 'jauh') pop('Dekat lagi!', 'warn');
}
// Range assist: an attack started a little out of range steps in by the
// gap before its first hit lands, so near misses connect.
const IDEAL = .85, ASSIST = .9;
function begin(key) {
  me.fwd = 0; pop(MOVES[key].name); me.assist = 0;
  const h = MOVES[key].hits.find(h => !h.auto); if (!h) return;
  const ideal = IDEAL + sample(MOVES[key].keys, h.t[0]).fwd[0], gap = me.pos.distanceTo(foe.pos) - ideal;
  if (gap > 0 && gap < ASSIST) { me.assist = gap / h.t[0]; me.assistUntil = h.t[0]; }
}
// Stick or keys as one analogue input; keys walk, Shift runs.
function input() {
  const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0), run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : .45;
  let x = stick.x + (k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft')) * run, y = stick.y + (k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown')) * run;
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  return { x, y, m: Math.min(1, m) };
}
let ctx = null;
function audio() { $('help').hidden = true; if (!ctx) try { ctx = new AudioContext(); } catch { ctx = false; } }
function thump(heavy) {
  if (!ctx) return; const n = ctx.sampleRate * .12, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = heavy ? 700 : 1400; g.gain.value = heavy ? .9 : .5;
  s.connect(f).connect(g).connect(ctx.destination); s.start();
}
const v3 = new T.Vector3();
function floatText(text, at, cls) {
  v3.copy(at).project(camera); const el = document.createElement('div'); el.className = 'dmg ' + cls; el.textContent = text;
  el.style.left = `${(v3.x * .5 + .5) * innerWidth}px`; el.style.top = `${(-v3.y * .5 + .5) * innerHeight}px`; $('hud').append(el); setTimeout(() => el.remove(), 800);
}

// ---- hits
const SLACK = .07, done = new Set(), TARGETS = [['head', .17, 'head'], ['chest', .22, 'body'], ['hips', .2, 'body'], ['kneeL', .15, 'low'], ['kneeR', .15, 'low']];
let stop = 0, shake = 0;
const pt = new T.Vector3(), tp = new T.Vector3();
function checkHits(d) {
  for (const h of activeHits(me.f)) {
    const id = me.f.seq + ':' + h.i; if (done.has(id) || foe.down >= 0) continue;
    let zone = null;
    if (h.auto) zone = foe.hold > .5 ? h.zone : null;
    else { me.m.point(h.part, pt); for (const [name, r, z] of TARGETS) if (pt.distanceTo(foe.m.point(name, tp)) < r + SLACK) { zone = z; break; } }
    if (!zone) continue;
    done.add(id); foe.hp = Math.max(0, foe.hp - h.dmg); foe.react = PARTNER[zone]; foe.rw = 1; foe.flash = 1;
    foe.knock.addScaledVector(d, h.knock * 4); stop = h.heavy ? .12 : .05; shake = h.heavy ? .12 : .04; thump(h.heavy || h.dmg >= 9);
    combo = now - comboAt < 1.1 ? combo + 1 : 1; comboAt = now;
    floatText('-' + h.dmg, foe.m.point(zone === 'low' ? 'kneeL' : zone === 'head' ? 'head' : 'chest', tp), h.heavy ? 'big' : '');
    if (combo > 1) { $('combo').textContent = `${combo} HIT COMBO`; $('combo').hidden = false; }
    if (foe.hp <= 0) { foe.down = 0; pop('K.O.!', 'ko'); }
  }
}

// ---- loop
// Top speeds at full stick; a light push walks. Speed rises with the push.
const SPEED = { fwd: 3.4, back: 1.8, side: 2.2, guard: .8 }, FREQ = 2.1, DEAD = .12;
const d = new T.Vector3(), n = new T.Vector3(), want = new T.Vector3(), camPos = new T.Vector3(0, 1.4, 4.5), look = new T.Vector3(0, 1, 0);
const xw = new T.Vector3(), zw = new T.Vector3(), held = new T.Vector3();
function walk(p, v, dt) {
  const speed = v.length(); if (speed < .05) { p.hips[0] += Math.sin(now * 6) * .008; return p; }
  const run = T.MathUtils.smoothstep(speed, 1.6, 3), freq = FREQ * (1 + .55 * run);
  me.phase += dt * Math.PI * 2 * freq * Math.min(1, .5 + speed / 2);
  xw.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw)); zw.set(Math.sin(me.yaw), 0, Math.cos(me.yaw));
  const lx = v.dot(xw) / speed, lz = v.dot(zw) / speed, amp = speed / freq / 4;
  for (const [f, o] of [['fL', 0], ['fR', Math.PI]]) {
    const s = Math.sin(me.phase + o), c = Math.cos(me.phase + o);
    p[f][0] += lx * amp * s; p[f][2] += lz * amp * s; p[f][1] += Math.max(0, c) * (.07 + .13 * run);
  }
  // Running: lower, lean into it, hands drop from the guard and pump.
  p.hips[0] -= (.02 + .04 * run) * Math.abs(Math.sin(me.phase * 2)) + .03 * run;
  p.spine[0] += 16 * run * Math.max(0, lz);
  for (const [h, o] of [['hL', Math.PI], ['hR', 0]]) { p[h][1] -= .18 * run; p[h][2] += Math.sin(me.phase + o) * .16 * run * Math.max(0, lz); }
  return p;
}
function step(dt) {
  now += dt;
  d.subVectors(foe.pos, me.pos).setY(0); const sep = d.length(); d.normalize(); n.set(-d.z, 0, d.x);
  // Move
  // Dynamic speed: past the dead zone, speed grows with the push (eased, so
  // small pushes give fine steps and a full push runs).
  const { x: jx, y: jy, m } = input(), push = Math.pow(Math.max(0, m - DEAD) / (1 - DEAD), 1.5), ux = m ? jx / m : 0, uy = m ? jy / m : 0;
  me.f.guard = (guardHeld || keys.has('KeyK') || keys.has('Space')) && !me.f.move;
  want.set(0, 0, 0);
  if (!me.f.move && foe.hold <= 0) {
    want.addScaledVector(d, ux * push * (ux > 0 ? SPEED.fwd : SPEED.back)).addScaledVector(n, -uy * push * SPEED.side);
    if (me.f.guard) want.clampLength(0, SPEED.guard);
  }
  me.vel.lerp(want, 1 - Math.exp(-dt * 10)); me.pos.addScaledVector(me.vel, dt);
  me.yaw = Math.atan2(d.x, d.z);
  const started = tick(me.f, dt); if (started) begin(started);
  // Pose
  let p;
  if (me.f.move) { p = sample(MOVES[me.f.move].keys, me.f.t); const f = p.fwd[0]; me.pos.addScaledVector(d, Math.max(0, f - me.fwd)); me.fwd = f; if (me.assist && me.f.t <= me.assistUntil + dt) me.pos.addScaledVector(d, me.assist * dt); }
  else p = walk(mix(me.f.guard ? GUARD : STANCE, STANCE, 0), me.vel, dt);
  checkHits(d);
  // Partner
  const grab = grabbing(me.f); foe.hold = T.MathUtils.clamp(foe.hold + (grab ? dt * 6 : -dt * 4), 0, 1);
  if (foe.hold > 0) {
    held.set(.05, 0, .95).applyAxisAngle(T.Object3D.DEFAULT_UP, me.yaw).add(me.pos);
    foe.pos.lerp(held, foe.hold); foe.yaw = me.yaw + Math.PI;
  } else {
    foe.pos.addScaledVector(foe.knock, dt); foe.yaw = Math.atan2(-d.x, -d.z);
  }
  foe.knock.multiplyScalar(Math.exp(-dt * 6));
  // Keep apart and inside the ring.
  const gap = foe.pos.distanceTo(me.pos);
  const minGap = me.f.move ? .45 : .62;
  if (foe.hold <= 0 && gap < minGap) { v3.subVectors(me.pos, foe.pos).setY(0).normalize(); me.pos.addScaledVector(v3, minGap - gap); }
  for (const o of [me, foe]) { const r = Math.hypot(o.pos.x, o.pos.z); if (r > RING - .35) o.pos.multiplyScalar((RING - .35) / r); }
  if (foe.hold <= 0 && foe.down < 0) foe.pos.lerp(v3.copy(me.pos).addScaledVector(d, REST), dt * .25);
  let q = mix(PARTNER.idle, foe.react, foe.rw); q.hips[0] += Math.sin(now * 2.2) * .006;
  if (foe.hold > 0) q = mix(q, PARTNER.held, foe.hold);
  foe.rw *= Math.exp(-dt * 6); foe.flash *= Math.exp(-dt * 14);
  foe.m.root.rotation.x = 0;
  if (foe.down >= 0) {
    foe.down += dt; const fall = T.MathUtils.smoothstep(foe.down, 0, .55) * (1 - T.MathUtils.smoothstep(foe.down, 2.4, 3.1));
    foe.m.root.rotation.x = -1.42 * fall; q = mix(q, PARTNER.head, fall);
    if (foe.down > 3.1) { foe.down = -1; foe.hp = 100; pop('Bangun!'); }
  }
  // Apply
  me.m.root.position.copy(me.pos); me.m.root.rotation.y = me.yaw; me.m.pose(p);
  foe.m.root.position.copy(foe.pos); foe.m.root.rotation.y = foe.yaw; foe.m.pose(q); foe.m.flash(foe.flash * .5);
  // Camera: side on, Jai left, pulled back as they separate.
  const mid = v3.addVectors(me.pos, foe.pos).multiplyScalar(.5);
  want.copy(mid).addScaledVector(n, 2.3 + sep * .6).addScaledVector(d, -.5).setY(1.4);
  camPos.lerp(want, 1 - Math.exp(-dt * 4)); look.lerp(mid.setY(.92), 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos); if (shake > 0) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt); }
  camera.lookAt(look);
  // HUD
  $('stam').style.width = `${me.f.stamina}%`; $('stam').classList.toggle('low', me.f.stamina < 20); $('hp').style.width = `${foe.hp}%`;
  if (popTimer > 0 && (popTimer -= dt) <= 0) $('pop').textContent = '';
  if (now - comboAt > 1.1) $('combo').hidden = true;
}
function resize() { inkViewport.set(innerWidth, innerHeight); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 62 : 42; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let last = performance.now(); const debug = { paused: false };
renderer.setAnimationLoop(() => {
  const t = performance.now(), dt = Math.min((t - last) / 1000, .05); last = t;
  if (debug.paused) {} else if (stop > 0) stop -= dt; else step(dt);
  renderer.render(scene, camera);
});
step(0); $('loading').hidden = true;
// For automated checks: run frames and press buttons without a real clock.
window.brawler = { act, step, me, foe, debug, input, dur: () => me.f.move ? MOVES[me.f.move].dur : 0, reach: (part, foeName) => me.m.point(part, pt).distanceTo(foe.m.point(foeName, tp)), TARGETS, set stick(v) { stick.x = v[0]; stick.y = v[1]; } };
