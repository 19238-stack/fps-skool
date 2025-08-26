// main.js - Module
import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.154.0/examples/jsm/controls/PointerLockControls.js';

const canvas = document.getElementById('c');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky-ish

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 2000);
camera.position.set(0, 1.6, 5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

window.addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// LIGHTS
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.7);
dir.position.set(5,10,2);
scene.add(dir);

// FLOOR
const floorGeo = new THREE.PlaneGeometry(200,200);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI/2;
floor.position.y = 0;
scene.add(floor);

// POINTER LOCK CONTROLS (first-person)
const controls = new PointerLockControls(camera, document.body);
document.addEventListener('click', () => {
  // clicking canvas or Start will lock pointer
});
const keys = { w:false, a:false, s:false, d:false };
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyD') keys.d = true;
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyD') keys.d = false;
});

// UI
const startBtn = document.getElementById('startBtn');
const gamemodeSel = document.getElementById('gamemode');
const difficultyEl = document.getElementById('difficulty');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const timerWrap = document.getElementById('timerWrap');
const livesEl = document.getElementById('lives');
const livesWrap = document.getElementById('livesWrap');
const messageEl = document.getElementById('message');

let mode = 'practice';
let difficulty = 1;

// Game state
let targets = [];
const targetGroup = new THREE.Group();
scene.add(targetGroup);

let score = 0;
let timer = 60;
let lives = 3;
let running = false;
let lastSpawn = 0;
let spawnInterval = 1500; // ms (will be adjusted by difficulty)
let clock = new THREE.Clock();

// Raycaster for shooting
const raycaster = new THREE.Raycaster();

// Simple reticle (center)
const reticle = document.createElement('div');
reticle.style.position = 'absolute';
reticle.style.left = '50%';
reticle.style.top = '50%';
reticle.style.width = '10px';
reticle.style.height = '10px';
reticle.style.marginLeft = '-5px';
reticle.style.marginTop = '-5px';
reticle.style.border = '2px solid rgba(255,255,255,0.9)';
reticle.style.borderRadius = '50%';
reticle.style.zIndex = 5;
document.body.appendChild(reticle);

// Helper: spawn a target at random position ahead of player
function spawnTarget(type='static') {
  const size = THREE.MathUtils.lerp(0.25, 0.6, Math.random());
  const geo = new THREE.SphereGeometry(size, 12, 12);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5), metalness:0.2, roughness:0.6 });
  const mesh = new THREE.Mesh(geo, mat);
  // Place in a semicircle in front of camera, between 5 and 25 units away
  const angle = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(90));
  const distance = THREE.MathUtils.randFloat(6, 22);
  const x = Math.sin(angle) * distance + camera.position.x + (Math.random()-0.5)*6;
  const z = -Math.cos(angle) * distance + camera.position.z + (Math.random()-0.5)*6;
  const y = THREE.MathUtils.randFloat(1.0, 3.0);
  mesh.position.set(x, y, z);
  mesh.userData = { type, size, hit:false, speed: THREE.MathUtils.randFloat(0.3, 1.2) };
  targetGroup.add(mesh);
  targets.push(mesh);
}

// Remove target nicely
function destroyTarget(t) {
  const idx = targets.indexOf(t);
  if (idx >= 0) targets.splice(idx,1);
  targetGroup.remove(t);
}

// Shooting handler
function shoot() {
  if (!running) return;
  // cast a ray from camera center forward
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const intersects = raycaster.intersectObjects(targets, false);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    score += 1;
    scoreEl.textContent = score;
    // small pop animation (scale up, then remove)
    const originalScale = hit.scale.clone();
    const tweenDur = 0.12;
    // quick scale-up
    hit.scale.setScalar(originalScale.x * 1.4);
    setTimeout(()=> destroyTarget(hit), tweenDur*1000);
  }
}

// Movement update
const velocity = new THREE.Vector3();
function updateMovement(dt) {
  const speed = 4.5;
  const move = new THREE.Vector3();
  if (keys.w) move.z -= 1;
  if (keys.s) move.z += 1;
  if (keys.a) move.x -= 1;
  if (keys.d) move.x += 1;
  if (move.lengthSq() > 0) {
    move.normalize();
    // transform to camera orientation on Y only
    const e = camera.matrix.elements;
    const forward = new THREE.Vector3(-e[8], 0, -e[10]).normalize();
    const right = new THREE.Vector3(e[0], 0, e[2]).normalize();
    const dir = forward.multiplyScalar(move.z).add(right.multiplyScalar(move.x));
    camera.position.addScaledVector(dir, speed * dt);
  }
}

// Simple survival behavior: move targets slowly toward player
function updateTargets(dt) {
  for (let i = targets.length - 1; i >= 0; --i) {
    const t = targets[i];
    if (t.userData.type === 'moving') {
      const dir = new THREE.Vector3().subVectors(camera.position, t.position);
      const dist = dir.length();
      if (dist < 1.4) {
        // target reached player
        destroyTarget(t);
        lives--;
        livesEl.textContent = lives;
        if (lives <= 0) endGame('You were overwhelmed!');
        continue;
      }
      dir.normalize();
      t.position.addScaledVector(dir, t.userData.speed * dt);
    } else {
      // small idle float for static targets
      t.position.y += Math.sin(performance.now()*0.001 + i) * 0.0005;
    }

    // Optionally despawn far-away targets
    if (t.position.distanceTo(camera.position) > 250) destroyTarget(t);
  }
}

// Game loop
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  // spawn logic
  if (running) {
    const now = performance.now();
    if (now - lastSpawn > spawnInterval) {
      lastSpawn = now;
      // spawn count depends on difficulty
      const count = difficulty;
      for (let i = 0; i < count; i++) {
        const type = (mode === 'survival' && Math.random() < 0.6) ? 'moving' : 'static';
        spawnTarget(type);
      }
    }

    if (mode === 'timed') {
      timer -= dt;
      timerEl.textContent = Math.max(0, Math.floor(timer));
      if (timer <= 0) {
        endGame('Time up!');
      }
    }

    updateTargets(dt);
    updateMovement(dt);
  }

  renderer.render(scene, camera);
}
animate();

// Input handlers
window.addEventListener('mousedown', (e)=> {
  if (e.button === 0) shoot();
});

// Start / mode handlers
startBtn.addEventListener('click', startGame);
gamemodeSel.addEventListener('change', (e) => mode = e.target.value);
difficultyEl.addEventListener('input', (e)=>{
  difficulty = parseInt(e.target.value,10);
  // adjust spawnInterval by difficulty: higher diff => faster spawn
  spawnInterval = 1700 / difficulty;
});

function startGame() {
  // reset
  score = 0;
  scoreEl.textContent = score;
  // clear targets
  targets.forEach(t => targetGroup.remove(t));
  targets = [];
  // settings by mode
  mode = gamemodeSel.value;
  difficulty = parseInt(difficultyEl.value,10);
  spawnInterval = 1700 / difficulty;
  if (mode === 'timed') {
    timer = 60;
    timerWrap.style.display = 'inline';
    livesWrap.style.display = 'none';
  } else if (mode === 'survival') {
    lives = 3 + difficulty; // a bit more lives for lower difficulty
    livesEl.textContent = lives;
    timerWrap.style.display = 'none';
    livesWrap.style.display = 'inline';
  } else {
    // practice
    timerWrap.style.display = 'none';
    livesWrap.style.display = 'none';
  }
  messageEl.textContent = '';
  running = true;
  lastSpawn = performance.now();
  clock.start();

  // request pointer lock
  controls.lock();
  controls.addEventListener('lock', () => {
    // hide overlay hint if locked
  });

  controls.addEventListener('unlock', () => {
    // player unlocked pointer (paused)
  });
}

// End game
function endGame(msg) {
  running = false;
  messageEl.textContent = `${msg} — Score: ${score}`;
  controls.unlock();
  clock.stop();
}

// Small improvement: if pointer lock isn't supported, show a message
if (!('pointerLockElement' in document || 'mozPointerLockElement' in document)) {
  messageEl.textContent = 'Warning: Pointer Lock API not supported in this browser.';
}
