import * as T from 'three';
import { inkViewport, toon } from './illustration.js';
import { newBreath, breathe } from './breath.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadFighter, createFighter, PARTS, TARGETS } from './fighter.js?v=0.6.0';
import { loadRig, loadModel, createActor } from './actor.js';
import { wear } from './wear.js?v=0.6.0';
import { MOVES, REACT, newFighter, press, tick, activeHits, newTarget, receive, settle, floored } from './brawler.js?v=0.6.0';

// Training ring: Jai against a sparring partner who takes the hits. Both are
// the UAL2 mannequin; Jai wears Amir's model over his. Camera from the side, Jai on the left. Stick: right =
// toward the partner, left = back off, up/down = step round him.
const $ = id => document.getElementById(id);
const canvas = $('view'), renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = T.SRGBColorSpace; renderer.shadowMap.enabled = true;
const scene = new T.Scene(); scene.background = new T.Color(0x1f1c2b); scene.fog = new T.Fog(0x1f1c2b, 9, 22);
const camera = new T.PerspectiveCamera(42, 1, .05, 60);
scene.add(new T.HemisphereLight(0xfff1dc, 0x3a4660, 1.15));
const rim = new T.DirectionalLight(0x9fc4ff, .9); rim.position.set(-3, 4, -5); scene.add(rim);
const sun = new T.DirectionalLight(0xffe2bd, 1.5); sun.position.set(2, 7, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); scene.add(sun);
const RING = 3.6, REST = 1.1;
const floor = new T.Mesh(new T.CircleGeometry(RING + .5, 56), new T.MeshLambertMaterial({ color: 0x3a4660 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const line = new T.Mesh(new T.RingGeometry(RING, RING + .12, 56), new T.MeshBasicMaterial({ color: 0xd8322a })); line.rotation.x = -Math.PI / 2; line.position.y = .003; scene.add(line);
const outer = new T.Mesh(new T.CircleGeometry(30, 32), new T.MeshLambertMaterial({ color: 0x1b1824 })); outer.rotation.x = -Math.PI / 2; outer.position.y = -.01; scene.add(outer);

const me = { f: newFighter({ tireless: true }), pos: new T.Vector3(-.65, 0, 0), yaw: 0, vel: new T.Vector3(), breath: newBreath(), path: new T.Vector3(), seq: -1, prev: {} };
const foe = { s: newTarget(), pos: new T.Vector3(.65, 0, 0), yaw: 0, knock: new T.Vector3(), flash: 0, breath: newBreath(), path: new T.Vector3(), react: null, t: 0 };

// Hosts that cannot serve .glb get each model as base64 text beside it
// (window.GLB_TXT set by the page).
const glbText = window.GLB_TXT ? url => fetch(url.replace(/(\?|$)/, '.txt$1')).then(r => r.text()).then(b => { const bin = atob(b.trim()), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new GLTFLoader().parseAsync(a.buffer, ''); }) : undefined;

// ---- input: keyboard, a floating stick on the left, buttons on the right
const keys = new Set(), stick = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
// Keyboard face buttons sit in the same diamond: I triangle, J square, L circle, K cross.
const KEYMAP = { KeyJ: 'tetak', KeyI: 'berat', KeyL: 'tong', KeyK: 'tahan', Space: 'tahan' };
addEventListener('keydown', e => { if (e.repeat) return; keys.add(e.code); if (KEYMAP[e.code]) act(KEYMAP[e.code]); audio(); });
addEventListener('keyup', e => keys.delete(e.code));
let guardHeld = false;
for (const b of document.querySelectorAll('#pad button')) {
  const a = b.dataset.act;
  b.addEventListener('pointerdown', e => { e.preventDefault(); audio(); b.classList.add('on'); if (a === 'tahan') guardHeld = true; act(a); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { b.classList.remove('on'); if (a === 'tahan') guardHeld = false; });
}
const base = $('stick'), knob = $('knob');
$('tiredBtn').onclick = () => { me.f.tireless = !me.f.tireless; me.f.stamina = 100; $('tiredBtn').textContent = me.f.tireless ? 'Penat: tak' : 'Penat: ya'; $('stamWrap').hidden = me.f.tireless; };
$('modelBtn').onclick = () => { if (amir) { amir.show(!amir.on); $('modelBtn').textContent = amir.on ? 'Watak: Jai' : 'Watak: mannequin'; } };
$('guardBtn').onclick = () => { foe.s.guard = !foe.s.guard; $('guardBtn').textContent = foe.s.guard ? 'Kawan: tahan' : 'Kawan: terbuka'; };
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
  if (!jai) return;
  const r = press(me.f, button, stickDir());
  if (r?.move) begin(r.move);
  else if (r?.fail === 'penat') pop('Penat!', 'warn');
}
// Range assist: an attack started a little out of range steps in by the
// gap before its first hit lands, so near misses connect.
const ASSIST = .9;
function begin(key) {
  const m = MOVES[key]; pop(m.name); me.assist = 0;
  const first = m.hits[0]?.t[0] ?? m.throw?.at; if (first === undefined || m.throw) return;
  const gap = me.pos.distanceTo(foe.pos) - m.reach;
  if (gap > 0 && gap < ASSIST) { me.assist = gap / first; me.assistUntil = first; }
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
function thump(heavy, blocked) {
  if (!ctx) return; const n = ctx.sampleRate * .12, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = buf; f.type = blocked ? 'bandpass' : 'lowpass'; f.frequency.value = blocked ? 2600 : heavy ? 700 : 1400; g.gain.value = heavy ? .9 : .5;
  s.connect(f).connect(g).connect(ctx.destination); s.start();
}
const v3 = new T.Vector3();
function floatText(text, at, cls) {
  v3.copy(at).project(camera); const el = document.createElement('div'); el.className = 'dmg ' + cls; el.textContent = text;
  el.style.left = `${(v3.x * .5 + .5) * innerWidth}px`; el.style.top = `${(-v3.y * .5 + .5) * innerHeight}px`; $('hud').append(el); setTimeout(() => el.remove(), 800);
}

// ---- hits: strike points are swept from the last frame, so a fast swing
// cannot pass through a target between frames.
const SLACK = .05, done = new Set();
let stop = 0, shake = 0;
const tp = new T.Vector3(), sp = new T.Vector3();
function touch(points, prev, r) {
  for (const [name, tr, zone] of TARGETS) {
    foe.fig.point(name, tp);
    for (let i = 0; i < points.length; i++) for (let s = 0; s <= 1; s += .25) {
      sp.copy(prev?.[i] ?? points[i]).lerp(points[i], s);
      if (sp.distanceTo(tp) < tr + r + SLACK) return zone;
    }
  }
  return null;
}
function land(hit, d, at) {
  const { dmg, react } = receive(foe.s, hit), blocked = react === 'block' || react === 'break';
  foe.flash = 1; foe.knock.addScaledVector(d, hit.knock * (blocked ? 1 : 2.5));
  stop = hit.heavy ? .12 : .05; shake = hit.heavy ? .12 : .04; thump(hit.heavy || dmg >= 9, react === 'block');
  combo = now - comboAt < 1.1 ? combo + 1 : 1; comboAt = now;
  floatText(react === 'block' ? 'Tahan -' + dmg : '-' + dmg, at, hit.heavy ? 'big' : '');
  if (react === 'break') pop('Pecah tahan!', 'warn');
  if (combo > 1) { $('combo').textContent = `${combo} HIT COMBO`; $('combo').hidden = false; }
  if (react === 'ko') pop('K.O.!', 'ko');
}
function checkHits(d) {
  const cur = {};
  for (const h of activeHits(me.f)) {
    const pts = cur[h.part] ??= jai.strike(h.part), id = me.f.seq + ':' + h.i;
    if (done.has(id) || floored(foe.s)) continue;
    const zone = touch(pts, me.prev[h.part], PARTS[h.part].r); if (!zone) continue;
    done.add(id); land(h, d, foe.fig.point(zone === 'low' ? 'shinL' : zone === 'head' ? 'head' : 'chest', new T.Vector3()));
  }
  // Keep every part's points for the next frame's sweep.
  for (const p of Object.keys(PARTS)) me.prev[p] = cur[p] ?? jai.strike(p);
}
// Thrown chalk: an arc from the hand.
const chalks = [], chalkGeo = new T.CylinderGeometry(.015, .015, .09, 8), chalkMat = toon(0xf4f1e8);
// It leaves Jai's own hand and arcs onto the partner's chest.
const GRAVITY = 6;
function throwChalk(d) {
  const c = MOVES.throw.throw, mesh = new T.Mesh(chalkGeo, chalkMat); mesh.position.copy(jai.strike('handR', 1, true)[0]); scene.add(mesh);
  const aim = foe.fig.point('chest', new T.Vector3()).sub(mesh.position), fly = Math.max(.08, aim.length() / c.speed);
  chalks.push({ mesh, v: aim.divideScalar(fly).setY(aim.y + GRAVITY * fly / 2), prev: mesh.position.clone(), life: 1.5, hit: { dmg: c.dmg, knock: c.knock } });
}
function flyChalk(dt, d) {
  for (let i = chalks.length - 1; i >= 0; i--) {
    const c = chalks[i]; c.prev.copy(c.mesh.position); c.v.y -= GRAVITY * dt; c.mesh.position.addScaledVector(c.v, dt); c.mesh.rotation.x += dt * 25; c.life -= dt;
    const zone = floored(foe.s) ? null : touch([c.mesh.position], [c.prev], .03);
    if (zone) land(c.hit, d, c.mesh.position.clone());
    if (zone || c.life < 0 || c.mesh.position.y < 0) { scene.remove(c.mesh); chalks.splice(i, 1); }
  }
}

// ---- loop
// Top speeds at full stick; a light push walks. Speed rises with the push.
const SPEED = { fwd: 3.4, back: 1.8, side: 2.2, guard: .8 }, DEAD = .12;
const d = new T.Vector3(), n = new T.Vector3(), want = new T.Vector3(), camPos = new T.Vector3(0, 1.4, 4.5), look = new T.Vector3(0, 1, 0), pv = new T.Vector3();
// Apply a move's root motion since the last frame, turned to face `yaw`.
function travel(o, fig, m, t, key, yaw) {
  if (o.key !== key) { o.key = key; o.path.set(0, 0, 0); }
  fig.path(m, t, pv); const dx = pv.x - o.path.x, dz = pv.z - o.path.z; o.path.copy(pv);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  o.pos.x += (dx * c + dz * s) * m.rm; o.pos.z += (-dx * s + dz * c) * m.rm;
}
let jai = null, amir = null;
// Amir's model (from Malaysian-retro-game, refined in Blender) is a 1.5 m
// child; scaled toward the mannequin's height so the reach matches.
const AMIR_SCALE = 1.17, fighterModel = new URL('../assets/models/amir-fighter.glb', import.meta.url).href;
function step(dt) {
  now += dt;
  d.subVectors(foe.pos, me.pos).setY(0); const sep = d.length(); d.normalize(); n.set(-d.z, 0, d.x);
  // Move. Dynamic speed: past the dead zone, speed grows with the push
  // (eased, so small pushes give fine steps and a full push runs).
  const { x: jx, y: jy, m: push0 } = input(), push = Math.pow(Math.max(0, push0 - DEAD) / (1 - DEAD), 1.5), ux = push0 ? jx / push0 : 0, uy = push0 ? jy / push0 : 0;
  me.f.guard = (guardHeld || keys.has('KeyK') || keys.has('Space')) && !me.f.move;
  want.set(0, 0, 0);
  if (!me.f.move) {
    want.addScaledVector(d, ux * push * (ux > 0 ? SPEED.fwd : SPEED.back)).addScaledVector(n, -uy * push * SPEED.side);
    if (me.f.guard) want.clampLength(0, SPEED.guard);
  }
  me.vel.lerp(want, 1 - Math.exp(-dt * 10)); me.pos.addScaledVector(me.vel, dt);
  me.yaw = Math.atan2(d.x, d.z);
  const t0 = me.f.t, started = tick(me.f, dt); if (started) begin(started);
  const m = me.f.move && MOVES[me.f.move];
  if (m) {
    // Root motion carries Jai in, but never closer than the move's reach.
    const s0 = me.pos.distanceTo(foe.pos); travel(me, jai, m, me.f.t, me.f.seq, me.yaw);
    const s1 = me.pos.distanceTo(foe.pos); if (m.reach && s1 < s0 && s1 < m.reach) me.pos.addScaledVector(d, -Math.min(s0 - s1, m.reach - s1));
    if (me.assist && me.f.t <= me.assistUntil + dt) me.pos.addScaledVector(d, me.assist * dt);
    if (m.throw && t0 < m.throw.at && me.f.t >= m.throw.at && !started) throwChalk(d);
  }
  const speed = me.vel.length() * (me.vel.dot(d) < -.1 ? -1 : 1);
  const breath = breathe(me.breath, dt, { moving: Math.min(1, me.vel.length() / SPEED.fwd), attacking: !!m });
  jai.group.position.copy(me.pos); jai.group.rotation.y = me.yaw;
  jai.drive(dt, { m, t: me.f.t, speed, guard: me.f.guard, breath, prop: m?.prop });
  checkHits(d); flyChalk(dt, d);
  // Partner
  const was = foe.s.react, up = settle(foe.s, dt);
  if (up === 'ko') pop('Bangun!');
  const r = foe.s.react && REACT[foe.s.react];
  if (r) { if (foe.s.react !== was || foe.s.t < foe.t) foe.key = null; travel(foe, foe.fig, r, foe.s.t, foe.s.react + '@' + foe.s.hp, foe.yaw); }
  foe.t = foe.s.t;
  foe.pos.addScaledVector(foe.knock, dt); foe.yaw = Math.atan2(-d.x, -d.z);
  foe.knock.multiplyScalar(Math.exp(-dt * 6));
  // Keep apart and inside the ring.
  const gap = foe.pos.distanceTo(me.pos), minGap = floored(foe.s) ? .3 : me.f.move ? .5 : .65;
  if (gap < minGap) { v3.subVectors(me.pos, foe.pos).setY(0).normalize(); me.pos.addScaledVector(v3, minGap - gap); }
  for (const o of [me, foe]) { const r = Math.hypot(o.pos.x, o.pos.z); if (r > RING - .35) o.pos.multiplyScalar((RING - .35) / r); }
  if (!foe.s.react) foe.pos.lerp(v3.copy(me.pos).addScaledVector(d, REST), dt * .25);
  // The partner breathes harder after taking hits.
  if (foe.s.react) foe.breath.effort = Math.min(1, foe.breath.effort + dt * 2);
  foe.flash *= Math.exp(-dt * 14);
  foe.fig.group.position.copy(foe.pos); foe.fig.group.rotation.y = foe.yaw;
  foe.fig.drive(dt, { m: r, t: foe.s.t, guard: foe.s.guard && !r, breath: breathe(foe.breath, dt), prop: r?.prop });
  foe.fig.flash(foe.flash * .5);
  // Camera: side on, Jai left, pulled back as they separate.
  const mid = v3.addVectors(me.pos, foe.pos).multiplyScalar(.5);
  want.copy(mid).addScaledVector(n, 2.4 + sep * .6).addScaledVector(d, -.5).setY(1.4);
  camPos.lerp(want, 1 - Math.exp(-dt * 4)); look.lerp(mid.setY(.92), 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos); if (shake > 0) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt); }
  camera.lookAt(look);
  // Close-up views for checks (window.brawler.debug.view = [back, side, height]).
  if (debug.view) { const [a, b, h] = debug.view, c = me.pos.clone().lerp(foe.pos, .5).setY(1); camera.position.copy(c).addScaledVector(d, a).addScaledVector(n, b).setY(h); camera.lookAt(c); }
  // HUD
  $('stam').style.width = `${me.f.stamina}%`; $('stam').classList.toggle('low', me.f.stamina < 20); $('hp').style.width = `${foe.s.hp}%`;
  if (popTimer > 0 && (popTimer -= dt) <= 0) $('pop').textContent = '';
  if (now - comboAt > 1.1) $('combo').hidden = true;
}
function resize() { inkViewport.set(innerWidth, innerHeight); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 62 : 42; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const debug = { paused: false };
Promise.all([loadFighter(undefined, glbText), Promise.all([loadRig(undefined, glbText), loadModel(fighterModel, glbText)]).catch(e => { console.warn('Amir unavailable', e); return null; })]).then(([gltf, look]) => {
  jai = createFighter(scene, gltf, { body: 0xd9a36c, joint: 0x5b3a28 });
  foe.fig = createFighter(scene, gltf, { body: 0x8fa3b8, joint: 0x3e4a5c });
  if (look) amir = wear(jai, createActor(scene, 0, 0, 'amir', ...look), AMIR_SCALE);
  else $('modelBtn').hidden = true;
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const t = performance.now(), dt = Math.min((t - last) / 1000, .05); last = t;
    if (debug.paused) {} else if (stop > 0) stop -= dt; else step(dt);
    renderer.render(scene, camera);
  });
  step(0); $('loading').hidden = true;
  // For automated checks: run frames and press buttons without a real clock.
  window.brawler = { act, step, me, foe, debug, jai, get amir() { return amir; }, input, render: () => renderer.render(scene, camera), set stick(v) { stick.x = v[0]; stick.y = v[1]; } };
}).catch(e => { console.error(e); $('loading').textContent = 'Gagal muat watak. Cuba muat semula.'; });
