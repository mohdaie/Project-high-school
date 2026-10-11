import * as T from 'three';
import { loadRig, loadModel, createActor, MODELS } from './actor.js';
import { createCharacter } from './characters.js';
import { inkViewport } from './illustration.js';

// Character viewer: Amir and Nur, copied from Malaysian-retro-game, face each
// other on a placeholder mat so their skeleton and motion can be checked on a
// phone before the fighting moves are built.
const canvas = document.getElementById('view'), msg = document.getElementById('msg'), bar = document.getElementById('bar');
const renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.shadowMap.enabled = true;
const scene = new T.Scene(); scene.background = new T.Color(0x1d1b26);
const camera = new T.PerspectiveCamera(40, 1, .05, 100);
scene.add(new T.HemisphereLight(0xe5f3ff, 0x5a4f63, 1.2));
const sun = new T.DirectionalLight(0xffedda, 1.3); sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
const mat = new T.Mesh(new T.CircleGeometry(3, 48), new T.MeshLambertMaterial({ color: 0x8a3b32 })); mat.rotation.x = -Math.PI / 2; mat.receiveShadow = true; scene.add(mat);
const ring = new T.Mesh(new T.RingGeometry(2.6, 2.75, 48), new T.MeshBasicMaterial({ color: 0xf4efe6 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .002; scene.add(ring);

const MOVES = { idle: 'Diri', walk: 'Jalan', jog: 'Lari', crouch: 'Cangkung', jump: 'Lompat', wave: 'Lambai' };
let move = 'idle', fighters = [], jumpAt = -1;
for (const [key, label] of Object.entries(MOVES)) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.move = key; b.setAttribute('aria-pressed', key === move);
  b.onclick = () => {
    if (key === 'wave') { fighters.forEach(f => f.wave?.()); return; }
    if (key === 'jump') { jumpAt = 0; return; }
    move = key; bar.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.move === move));
  };
  bar.append(b);
}

const rig = await loadRig().catch(e => { console.warn('Motion capture unavailable', e); return null; });
for (const [kind, x] of [['amir', -.8], ['nur', .8]]) {
  const model = rig ? await loadModel(MODELS[kind]).catch(() => null) : null;
  const f = rig ? createActor(scene, x, 0, kind, rig, model) : createCharacter(scene, x, 0, kind);
  f.group.position.set(x, -.065, 0); f.group.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; fighters.push(f);
}
msg.textContent = rig ? 'Seret untuk pusing kamera · cubit untuk zum' : 'Mocap tak dapat dimuat: badan dari kod';

// Drag to orbit, pinch or wheel to zoom.
let yaw = .5, pitch = .18, dist = 4.2; const pts = new Map();
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); });
canvas.addEventListener('pointerup', e => pts.delete(e.pointerId)); canvas.addEventListener('pointercancel', e => pts.delete(e.pointerId));
canvas.addEventListener('pointermove', e => {
  const p = pts.get(e.pointerId); if (!p) return;
  if (pts.size === 1) { yaw -= (e.clientX - p[0]) * .008; pitch = T.MathUtils.clamp(pitch + (e.clientY - p[1]) * .005, -.1, 1.2); }
  else { const [a, b] = [...pts.values()], before = Math.hypot(a[0] - b[0], a[1] - b[1]); p[0] = e.clientX; p[1] = e.clientY; const after = Math.hypot(a[0] - b[0], a[1] - b[1]); dist = T.MathUtils.clamp(dist * before / (after || 1), 1.5, 9); return; }
  p[0] = e.clientX; p[1] = e.clientY;
});
canvas.addEventListener('wheel', e => { dist = T.MathUtils.clamp(dist * Math.exp(e.deltaY * .001), 1.5, 9); }, { passive: true });

function resize() { inkViewport.set(innerWidth, innerHeight); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let last = performance.now(); const SPEED = { walk: 1.1, jog: 2.6 };
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; const speed = SPEED[move] || 0;
  let state = { crouch: move === 'crouch' };
  if (jumpAt >= 0) { jumpAt += dt; state = jumpAt < dt * 1.5 ? { jumped: true } : jumpAt < .55 ? { air: true } : { landed: true }; if (jumpAt >= .55) jumpAt = -1; }
  for (const f of fighters) f.animate(dt, speed ? 1 : 0, move === 'jog', speed * dt, null, state);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, .9 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); camera.lookAt(0, .8, 0);
  renderer.render(scene, camera);
});
