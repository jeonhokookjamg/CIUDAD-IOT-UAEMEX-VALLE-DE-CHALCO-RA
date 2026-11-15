import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ROBOT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduce) {
  try { init(); } catch (e) { /* el vigilante mostrará el respaldo */ }
}

function init() {
  const canvas = document.getElementById('escena3d');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.15));
  const dir = new THREE.DirectionalLight(0xffffff, 1.7);
  dir.position.set(4, 8, 6);
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // Si el 3D arrancó, el respaldo en emojis se queda oculto
  ['pet-fallback', 'bus-fallback'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  let W = 8, H = 8.7;
  const groundFor = z => -H / 2 + 0.12 + z * 0.38;

  // ---------------- AUTOBÚS 3D ----------------
  function buildBus() {
    const g = new THREE.Group();
    const teal = new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.45, metalness: 0.15 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfdbfe, roughness: 0.15, metalness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.4, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });
    const hub = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.35, metalness: 0.6 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.7, 1.02, 1.04, 4, 0.09), teal);
    body.position.y = 0.72;
    g.add(body);
    const winBand = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.34, 1.06), glass);
    winBand.position.y = 0.92;
    g.add(winBand);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.86), glass);
    shield.position.set(1.36, 0.88, 0);
    g.add(shield);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.1, 1.05), gold);
    stripe.position.y = 0.5;
    g.add(stripe);
    const lightGeo = new THREE.SphereGeometry(0.055, 12, 12);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 1.2 });
    [-0.32, 0.32].forEach(z => {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(1.36, 0.52, z);
      g.add(l);
    });
    const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.12, 20);
    wheelGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.13, 16);
    hubGeo.rotateX(Math.PI / 2);
    const wheels = [];
    [[0.88, 0.53], [0.88, -0.53], [-0.88, 0.53], [-0.88, -0.53]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(x, 0.21, z);
      const hc = new THREE.Mesh(hubGeo, hub);
      hc.position.copy(w.position);
      g.add(w); g.add(hc);
      wheels.push(w, hc);
    });
    return { group: g, wheels };
  }

  const bus = buildBus();
  scene.add(bus.group);
  const busState = { mode: 'wait', t: 1.4, dir: 1, speed: 1.55, x: 0 };

  function layoutBus() {
    const targetLen = Math.min(1.9, W * 0.44);
    bus.group.scale.setScalar(targetLen / 2.7);
    bus.group.position.y = groundFor(-0.55);
    bus.group.position.z = -0.55;
    if (busState.mode === 'wait') bus.group.position.x = -(W / 2 + 2.4);
  }
  function startBus() {
    busState.dir = Math.random() < 0.5 ? 1 : -1;
    busState.x = -busState.dir * (W / 2 + 2.2);
    bus.group.rotation.y = busState.dir > 0 ? 0 : Math.PI;
    busState.mode = 'drive';
  }
  function updateBus(dt, t) {
    if (busState.mode === 'wait') {
      busState.t -= dt;
      if (busState.t <= 0) startBus();
      return;
    }
    busState.x += busState.dir * busState.speed * dt;
    bus.group.position.x = busState.x;
    bus.group.position.y = groundFor(-0.55) + Math.abs(Math.sin(t * 9)) * 0.02;
    const spin = (busState.speed / (0.21 * bus.group.scale.x)) * dt;
    bus.wheels.forEach(w => { w.rotation.z -= spin; });
    if (Math.abs(busState.x) > W / 2 + 2.4) {
      busState.mode = 'wait';
      busState.t = 3 + Math.random() * 5;
    }
  }

  // ---------------- ROBOT 3D ----------------
  // El modelo va dentro de un grupo (wrap): así su tamaño y su base
  // quedan corregidos sin importar la escala/origen del archivo GLB.
  const robotWrap = new THREE.Group();
  scene.add(robotWrap);
  let robot = null, mixer = null, current = null;
  const actions = {};
  const rState = { mode: 'idle', t: 1.4, px: 0, pz: 0, tx: 0, tz: 0, dur: 3, prog: 0, face: 0 };

  function play(name, fade) {
    if (!actions[name] || current === name) return;
    const next = actions[name];
    if (current && actions[current]) actions[current].fadeOut(fade || 0.25);
    next.reset().fadeIn(fade || 0.25).play();
    current = name;
  }
  function pickTarget() {
    rState.tx = (Math.random() * 2 - 1) * Math.max(0.4, W / 2 - 1.1);
    rState.tz = -0.5 + Math.random() * 0.85;
    const dx = rState.tx - rState.px, dz = rState.tz - rState.pz;
    const dist = Math.hypot(dx, dz);
    rState.dur = Math.max(1.2, dist / 1.05);
    rState.prog = 0;
    rState.face = Math.atan2(dx, dz);
    rState.mode = 'walk';
    play('Walking');
  }
  function updateRobot(dt) {
    if (!robot) return;
    if (rState.mode === 'idle') {
      robotWrap.rotation.y += (0 - robotWrap.rotation.y) * Math.min(1, dt * 4);
      rState.t -= dt;
      if (rState.t <= 0) {
        const r = Math.random();
        if (r < 0.22) { rState.mode = 'act'; rState.t = 2.2; play('Wave'); }
        else if (r < 0.36) { rState.mode = 'act'; rState.t = 3.2; play('Dance'); }
        else pickTarget();
      }
    } else if (rState.mode === 'act') {
      robotWrap.rotation.y += (0 - robotWrap.rotation.y) * Math.min(1, dt * 4);
      rState.t -= dt;
      if (rState.t <= 0) { rState.mode = 'idle'; rState.t = 0.7; play('Idle'); }
    } else if (rState.mode === 'walk') {
      rState.prog += dt / rState.dur;
      const p = Math.min(1, rState.prog);
      robotWrap.position.x = rState.px + (rState.tx - rState.px) * p;
      robotWrap.position.z = rState.pz + (rState.tz - rState.pz) * p;
      let d = rState.face - robotWrap.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      robotWrap.rotation.y += d * Math.min(1, dt * 6);
      if (p >= 1) {
        rState.px = rState.tx; rState.pz = rState.tz;
        rState.mode = 'idle'; rState.t = 0.9 + Math.random() * 2.2;
        play('Idle');
      }
    }
    robotWrap.position.y = groundFor(robotWrap.position.z);
  }

  new GLTFLoader().load(ROBOT_URL, gltf => {
    robot = gltf.scene;
    robotWrap.add(robot);
    robot.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(robot);
    let size = box.getSize(new THREE.Vector3());
    let s = size.y > 0 ? 1.85 / size.y : 0;
    if (!isFinite(s) || s <= 0) s = 0.9;
    robot.scale.setScalar(s);
    robot.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(robot);
    robot.position.x -= (box.min.x + box.max.x) / 2;
    robot.position.z -= (box.min.z + box.max.z) / 2;
    robot.position.y -= box.min.y;
    rState.px = -W / 4; rState.pz = 0;
    robotWrap.position.set(rState.px, groundFor(0), 0);
    mixer = new THREE.AnimationMixer(robot);
    gltf.animations.forEach(c => { actions[c.name] = mixer.clipAction(c); });
    play('Idle');
  }, undefined, () => {
    const f = document.getElementById('pet-fallback');
    if (f) f.style.display = 'block';
  });

  // ---------------- BUCLE ----------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    H = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    W = H * camera.aspect;
    layoutBus();
    if (robot) {
      rState.px = THREE.MathUtils.clamp(rState.px, -W / 2 + 0.8, W / 2 - 0.8);
      robotWrap.position.x = rState.px;
    }
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let first = true;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (mixer) mixer.update(dt);
    updateRobot(dt);
    updateBus(dt, t);
    renderer.render(scene, camera);
    if (first) { first = false; window.__tresOk = true; }
  });
}
