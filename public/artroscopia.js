import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

/* ── Anatomical structures (checklist + labels) ── */
const STRUCT_DEFS = [
  { id: 'cfm', name: 'Cóndilo femoral medial',          desc: 'Superficie articular del fémur, lado interno de la rodilla.' },
  { id: 'cfl', name: 'Cóndilo femoral lateral',          desc: 'Superficie articular del fémur, lado externo de la rodilla.' },
  { id: 'mm',  name: 'Menisco medial',                   desc: 'Fibrocartílago en forma de "C" que amortigua el compartimento medial.' },
  { id: 'ml',  name: 'Menisco lateral',                  desc: 'Fibrocartílago más circular que amortigua el compartimento lateral.' },
  { id: 'lca', name: 'Ligamento cruzado anterior (LCA)', desc: 'Estabilizador central, visible en la escotadura intercondílea.' },
  { id: 'plt', name: 'Platillo tibial',                  desc: 'Superficie articular superior de la tibia.' },
];
const discovered = new Set();

/* ── Entry portals ── */
const PORTALS = {
  AL: { name: 'Anterolateral',  entry: new THREE.Vector3( 1.6, -1.0,  5.8), into: new THREE.Vector3(-0.8, 0.8, -1.0) },
  AM: { name: 'Anteromedial',   entry: new THREE.Vector3(-1.6, -1.0,  5.8), into: new THREE.Vector3( 0.8, 0.8, -1.0) },
  PM: { name: 'Posteromedial',  entry: new THREE.Vector3(-1.4, -0.4, -5.6), into: new THREE.Vector3( 0.4, 1.0,  1.0) },
};
const MAX_STEER = THREE.MathUtils.degToRad(38);

/* ── Mutable sim state ── */
const state = {
  portalKey: 'AL',
  lensAngle: THREE.MathUtils.degToRad(30),
  scopeRotation: 0,
  depth: 3.0,
  maxDepth: 9,
  yawOffset: 0,
  pitchOffset: 0,
  lightIntensity: 12,
  fov: 80,
};

/* ── DOM refs ── */
const viewportWrap = document.getElementById('viewport-wrap');
const canvas = document.getElementById('sim-canvas');
const labelBox = document.getElementById('structure-label');
const readoutEl = document.getElementById('readout');
const checklistEl = document.getElementById('checklist');
const checklistCountEl = document.getElementById('checklist-count');

/* ── Toast (mirrors public/app.js pattern) ── */
let toastTimer;
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

/* ── Checklist UI ── */
function buildChecklist() {
  checklistEl.innerHTML = '';
  for (const def of STRUCT_DEFS) {
    const li = document.createElement('li');
    li.className = 'struct-item';
    li.dataset.id = def.id;
    li.innerHTML = `<span class="struct-dot"></span><span>${def.name}</span>`;
    checklistEl.appendChild(li);
  }
}
function markChecklist(id) {
  const li = checklistEl.querySelector(`[data-id="${id}"]`);
  if (li) {
    li.classList.add('found');
    li.querySelector('.struct-dot').textContent = '✓';
  }
  checklistCountEl.textContent = `(${discovered.size}/${STRUCT_DEFS.length})`;
}

/* ── Scene setup ── */
const scene = new THREE.Scene();

const scopeCamera = new THREE.PerspectiveCamera(state.fov, 4 / 3, 0.05, 50);
const externalCamera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setScissorTest(true);
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const ambient = new THREE.AmbientLight(0x1a1a26, 0.6);
scene.add(ambient);

const spot = new THREE.SpotLight(0xfff1d8, state.lightIntensity, 14, THREE.MathUtils.degToRad(42), 0.4, 1.6);
const spotTarget = new THREE.Object3D();
spotTarget.position.set(0, 0, -1);
scopeCamera.add(spot, spotTarget);
spot.target = spotTarget;
spot.position.set(0, 0, 0);
scene.add(scopeCamera);

/* ── Materials ── */
const matBone      = new THREE.MeshStandardMaterial({ color: 0xf2e4cf, roughness: 0.55, metalness: 0.05 });
const matMeniscus   = new THREE.MeshStandardMaterial({ color: 0xe8d9b8, roughness: 0.6 });
const matLigament   = new THREE.MeshStandardMaterial({ color: 0xeae0c8, roughness: 0.4 });
const matFat        = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.7 });
const matCapsule    = new THREE.MeshStandardMaterial({ color: 0xb33a4a, roughness: 0.85, side: THREE.BackSide, transparent: true, opacity: 0.97 });
const matShaft       = new THREE.MeshStandardMaterial({ color: 0xcfcfd6, metalness: 0.7, roughness: 0.25 });
const matTip         = new THREE.MeshBasicMaterial({ color: 0x36e2ff });

/* ── Joint capsule (cavity wall, seen from inside) ── */
const capsule = new THREE.Mesh(new THREE.SphereGeometry(6, 48, 32), matCapsule);
capsule.scale.set(1.15, 1, 1.3);
scene.add(capsule);

/* ── Femoral condyles ── */
function makeCondyle(x) {
  const g = new THREE.SphereGeometry(2.1, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const m = new THREE.Mesh(g, matBone);
  m.position.set(x, 2.6, -0.8);
  m.rotation.x = Math.PI;
  return m;
}
const condyleMedial = makeCondyle(-1.5);
const condyleLateral = makeCondyle(1.6);
scene.add(condyleMedial, condyleLateral);

/* ── Tibial plateau ── */
const tibia = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.0, 1.6, 32), matBone);
tibia.position.set(0, -2.4, -0.6);
scene.add(tibia);

/* ── Menisci (partial tori) ── */
function makeMeniscus(x, arc, rotZ) {
  const g = new THREE.TorusGeometry(1.55, 0.32, 12, 28, arc);
  const m = new THREE.Mesh(g, matMeniscus);
  m.position.set(x, -1.55, -0.6);
  m.rotation.x = Math.PI / 2;
  m.rotation.z = rotZ;
  return m;
}
const meniscusMedial = makeMeniscus(-1.6, Math.PI * 1.5, 0.4);
const meniscusLateral = makeMeniscus(1.6, Math.PI * 1.7, -0.4);
scene.add(meniscusMedial, meniscusLateral);

/* ── Cruciate ligaments ── */
function limbBetween(p1, p2, radius, mat) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(radius, radius, len, 10);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(p1).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}
const acl = limbBetween(new THREE.Vector3(0.3, 1.6, -1.6), new THREE.Vector3(0.2, -1.9, 1.0), 0.28, matLigament);
const pcl = limbBetween(new THREE.Vector3(-0.2, 1.9, -1.2), new THREE.Vector3(-0.1, -1.7, -1.6), 0.3, matLigament);
scene.add(acl, pcl);

/* ── Fat pad (Hoffa) ── */
const fatPad = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), matFat);
fatPad.scale.set(1.3, 0.7, 0.9);
fatPad.position.set(0.2, -0.4, 3.6);
scene.add(fatPad);

const STRUCT_OBJECTS = {
  cfm: condyleMedial, cfl: condyleLateral,
  mm: meniscusMedial, ml: meniscusLateral,
  lca: acl, plt: tibia,
};

/* ── Shaft + tip marker (visible mainly in external view) ── */
const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 8), matShaft);
const tipMarker = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), matTip);
scene.add(shaftMesh, tipMarker);

function updateShaft(entry, tip) {
  const dir = new THREE.Vector3().subVectors(tip, entry);
  const len = Math.max(dir.length(), 0.001);
  shaftMesh.position.copy(entry).addScaledVector(dir, 0.5);
  shaftMesh.scale.set(1, len, 1);
  shaftMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

/* ── Camera placement: portal → steering → depth → lens offset ── */
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function updateCamera() {
  const portal = PORTALS[state.portalKey];
  const baseDir = new THREE.Vector3().subVectors(portal.into, portal.entry).normalize();

  let right = new THREE.Vector3().crossVectors(WORLD_UP, baseDir);
  right = right.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : right.normalize();
  const up = new THREE.Vector3().crossVectors(baseDir, right).normalize();

  const steered = baseDir.clone()
    .applyAxisAngle(up, state.yawOffset)
    .applyAxisAngle(right, state.pitchOffset)
    .normalize();

  const tip = portal.entry.clone().addScaledVector(steered, state.depth);

  let r2 = new THREE.Vector3().crossVectors(WORLD_UP, steered);
  r2 = r2.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : r2.normalize();
  const u2 = new THREE.Vector3().crossVectors(steered, r2).normalize();

  const lat = r2.clone().multiplyScalar(Math.cos(state.scopeRotation))
    .addScaledVector(u2, Math.sin(state.scopeRotation));
  const viewDir = steered.clone().multiplyScalar(Math.cos(state.lensAngle))
    .addScaledVector(lat, Math.sin(state.lensAngle))
    .normalize();

  scopeCamera.position.copy(tip);
  scopeCamera.lookAt(tip.clone().add(viewDir));
  if (scopeCamera.fov !== state.fov) {
    scopeCamera.fov = state.fov;
    scopeCamera.updateProjectionMatrix();
  }
  spot.intensity = state.lightIntensity;

  return { tip, viewDir, entry: portal.entry, portalName: portal.name };
}

/* ── Structure detection (cone + distance test) ── */
function detectStructure(tip, viewDir) {
  let bestId = null, bestScore = -1;
  for (const [id, obj] of Object.entries(STRUCT_OBJECTS)) {
    const center = new THREE.Vector3();
    obj.getWorldPosition(center);
    const toObj = center.clone().sub(tip);
    const dist = toObj.length();
    if (dist > 5.5) continue;
    toObj.normalize();
    const dot = toObj.dot(viewDir);
    if (dot < 0.78) continue;
    const score = dot - dist * 0.03;
    if (score > bestScore) { bestScore = score; bestId = id; }
  }
  return bestId;
}

function handleDetection(tip, viewDir) {
  const id = detectStructure(tip, viewDir);
  if (id) {
    const def = STRUCT_DEFS.find(s => s.id === id);
    labelBox.querySelector('.label-name').textContent = def.name;
    labelBox.querySelector('.label-desc').textContent = def.desc;
    labelBox.classList.remove('hidden');
    if (!discovered.has(id)) {
      discovered.add(id);
      markChecklist(id);
      showToast(`🔍 Estructura identificada: ${def.name}`);
      if (discovered.size === STRUCT_DEFS.length) {
        setTimeout(() => showToast('🏆 ¡Inspección artroscópica completa!'), 1700);
      }
    }
  } else {
    labelBox.classList.add('hidden');
  }
}

/* ── Sizing & multi-viewport (scope view + external picture-in-picture) ── */
let width = 0, height = 0;
const insetFrameEl = document.getElementById('inset-frame');

function insetSize() {
  const w = Math.round(width * 0.30);
  const h = Math.round(w * 0.72);
  return { w, h, margin: 14 };
}

function resize() {
  width = viewportWrap.clientWidth;
  height = viewportWrap.clientHeight;
  if (!width || !height) return;
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height, false);
  scopeCamera.aspect = width / height;
  scopeCamera.updateProjectionMatrix();

  const { w, h } = insetSize();
  externalCamera.aspect = w / h;
  externalCamera.updateProjectionMatrix();
  insetFrameEl.style.width = w + 'px';
  insetFrameEl.style.height = h + 'px';
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(viewportWrap);

/* ── Pointer steering ── */
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', e => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  const sens = 0.004;
  state.yawOffset = THREE.MathUtils.clamp(state.yawOffset - dx * sens, -MAX_STEER, MAX_STEER);
  state.pitchOffset = THREE.MathUtils.clamp(state.pitchOffset - dy * sens, -MAX_STEER, MAX_STEER);
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

/* ── Keyboard fallback (steering + depth) ── */
window.addEventListener('keydown', e => {
  const stepAngle = THREE.MathUtils.degToRad(2.5);
  if (e.key === 'ArrowLeft') state.yawOffset = THREE.MathUtils.clamp(state.yawOffset + stepAngle, -MAX_STEER, MAX_STEER);
  if (e.key === 'ArrowRight') state.yawOffset = THREE.MathUtils.clamp(state.yawOffset - stepAngle, -MAX_STEER, MAX_STEER);
  if (e.key === 'ArrowUp') state.pitchOffset = THREE.MathUtils.clamp(state.pitchOffset - stepAngle, -MAX_STEER, MAX_STEER);
  if (e.key === 'ArrowDown') state.pitchOffset = THREE.MathUtils.clamp(state.pitchOffset + stepAngle, -MAX_STEER, MAX_STEER);
  if (e.key === ']' || e.key === '+') updateRangeValue('depth-range', 0.2);
  if (e.key === '[' || e.key === '-') updateRangeValue('depth-range', -0.2);
});
function updateRangeValue(id, delta) {
  const el = document.getElementById(id);
  const next = THREE.MathUtils.clamp(parseFloat(el.value) + delta, parseFloat(el.min), parseFloat(el.max));
  el.value = next;
  el.dispatchEvent(new Event('input'));
}

/* ── Control panel wiring ── */
function wireControls() {
  document.getElementById('portal-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    document.querySelectorAll('#portal-buttons .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.portalKey = btn.dataset.portal;
    state.yawOffset = 0; state.pitchOffset = 0; state.depth = 3.0;
    document.getElementById('depth-range').value = 3.0;
  });

  document.getElementById('lens-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    document.querySelectorAll('#lens-buttons .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.lensAngle = THREE.MathUtils.degToRad(parseFloat(btn.dataset.angle));
  });

  document.getElementById('depth-range').addEventListener('input', e => {
    state.depth = parseFloat(e.target.value);
  });
  document.getElementById('rotation-range').addEventListener('input', e => {
    state.scopeRotation = THREE.MathUtils.degToRad(parseFloat(e.target.value));
  });
  document.getElementById('light-range').addEventListener('input', e => {
    state.lightIntensity = parseFloat(e.target.value);
  });
  document.getElementById('fov-range').addEventListener('input', e => {
    state.fov = parseFloat(e.target.value);
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    state.yawOffset = 0; state.pitchOffset = 0; state.depth = 3.0; state.scopeRotation = 0;
    document.getElementById('depth-range').value = 3.0;
    document.getElementById('rotation-range').value = 0;
    showToast('↺ Vista reiniciada');
  });
}

/* ── Render loop ── */
const clock = new THREE.Clock();
function render() {
  requestAnimationFrame(render);
  if (!width || !height) return;

  const t = clock.getElapsedTime();
  externalCamera.position.set(Math.sin(t * 0.15) * 11, 5.5, Math.cos(t * 0.15) * 11);
  externalCamera.lookAt(0, 0, 0);

  const { tip, viewDir, entry, portalName } = updateCamera();
  updateShaft(entry, tip);
  tipMarker.position.copy(tip);
  handleDetection(tip, viewDir);

  readoutEl.textContent =
    `${portalName} · óptica ${Math.round(THREE.MathUtils.radToDeg(state.lensAngle))}° · ` +
    `prof. ${state.depth.toFixed(1)}/${state.maxDepth} cm · rot. ${Math.round(THREE.MathUtils.radToDeg(state.scopeRotation))}°`;

  renderer.setViewport(0, 0, width, height);
  renderer.setScissor(0, 0, width, height);
  renderer.render(scene, scopeCamera);

  const { w, h, margin } = insetSize();
  renderer.setViewport(width - w - margin, margin, w, h);
  renderer.setScissor(width - w - margin, margin, w, h);
  renderer.render(scene, externalCamera);
}

buildChecklist();
wireControls();
resize();
render();
