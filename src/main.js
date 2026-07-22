import * as THREE from 'three';
import './style.css';

const CHARACTERS = [
  { id: 'thor', name: 'Thor', title: 'The Brave', skin: '#f2bb8d', hair: '#d6a23e', shirt: '#df4d3f', pants: '#315b83' },
  { id: 'njord', name: 'Njord', title: 'The Explorer', skin: '#efb786', hair: '#8b5a2d', shirt: '#298a8c', pants: '#263f62' },
  { id: 'elliot', name: 'Elliot', title: 'The Inventor', skin: '#d99b71', hair: '#4c3028', shirt: '#e89c32', pants: '#48515d' },
  { id: 'leah', name: 'Leah', title: 'The Trailblazer', skin: '#e8aa7d', hair: '#6b3827', shirt: '#9d55a7', pants: '#354b72' },
];

const BLOCKS = {
  grass: { color: 0x58a84f, label: 'Grass' },
  dirt: { color: 0x8b5b36, label: 'Dirt' },
  stone: { color: 0x7c8588, label: 'Stone' },
  wood: { color: 0x8c5a31, label: 'Wood' },
  sand: { color: 0xe5ca72, label: 'Sand' },
  brick: { color: 0xb6533f, label: 'Brick' },
  leaves: { color: 0x3f8a49, label: 'Leaves' },
  water: { color: 0x4bb8dd, label: 'Water' },
};

const PLACEABLE = ['grass', 'dirt', 'stone', 'wood', 'sand', 'brick'];
const WORLD_RADIUS = 20;
const WATER_LEVEL = 2;
const world = new Map();
const meshes = new Map();
const keys = Object.create(null);
const isTouchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const hasNativeTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const touchMove = new THREE.Vector2();
let movePointer = null;
let lookPointer = null;
let lastLookX = 0;
let lastLookY = 0;
let selectedCharacter = null;
let selectedBlock = 0;
let playing = false;
let thirdPerson = false;
let yaw = 0;
let pitch = -0.1;
let verticalVelocity = 0;
let grounded = false;
let jumpQueuedUntil = 0;
let playerInWater = false;
let toastTimer;

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bd5f4);
scene.fog = new THREE.Fog(0x9eddf2, 22, 66);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xc9efff, 0x6f7c4e, 2.1));
const sun = new THREE.DirectionalLight(0xfff0c3, 2.8);
sun.position.set(-18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

const sunCube = new THREE.Mesh(
  new THREE.BoxGeometry(4, 4, 1),
  new THREE.MeshBasicMaterial({ color: 0xffe36d, fog: false })
);
sunCube.position.set(-28, 27, -40);
scene.add(sunCube);

const blockGroup = new THREE.Group();
scene.add(blockGroup);
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const materials = {};
for (const [type, data] of Object.entries(BLOCKS)) {
  materials[type] = makeBlockMaterial(type, data.color);
}

function makeBlockMaterial(type, color) {
  const size = 64;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = size;
  const ctx = texCanvas.getContext('2d');
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, size, size);
  const seed = [...type].reduce((n, c) => n + c.charCodeAt(0), 0);
  for (let i = 0; i < 110; i++) {
    const x = (i * 29 + seed * 7) % size;
    const y = (i * 47 + seed * 13) % size;
    const light = (i % 3 === 0) ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
    ctx.fillStyle = light;
    const p = 2 + (i % 3);
    ctx.fillRect(x, y, p, p);
  }
  if (type === 'brick') {
    ctx.strokeStyle = 'rgba(55,25,20,.38)';
    ctx.lineWidth = 3;
    for (let y = 0; y <= size; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
      const offset = (y / 16) % 2 ? 8 : 24;
      for (let x = offset; x < size; x += 32) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 16); ctx.stroke(); }
    }
  }
  const texture = new THREE.CanvasTexture(texCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({
    map: texture,
    transparent: type === 'water' || type === 'leaves',
    opacity: type === 'water' ? 0.68 : type === 'leaves' ? 0.94 : 1,
    depthWrite: type !== 'water',
  });
}

function key(x, y, z) { return `${x},${y},${z}`; }
function getBlock(x, y, z) { return world.get(key(x, y, z)); }
function setBlock(x, y, z, type) { world.set(key(x, y, z), type); }

function terrainHeight(x, z) {
  const rolling = Math.sin(x * 0.29) * 1.25 + Math.cos(z * 0.24) * 1.1 + Math.sin((x + z) * 0.13) * 1.35;
  const detail = (hash(x, z) - 0.5) * 1.1;
  return Math.round(3.2 + rolling + detail);
}

function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function generateWorld() {
  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
      const h = terrainHeight(x, z);
      for (let y = -3; y <= h; y++) {
        let type = y === h ? 'grass' : y >= h - 2 ? 'dirt' : 'stone';
        if (h <= WATER_LEVEL + 1 && y === h) type = 'sand';
        setBlock(x, y, z, type);
      }
      if (h < WATER_LEVEL) setBlock(x, WATER_LEVEL, z, 'water');
    }
  }

  const treeSpots = [
    [-13,-8], [-9,11], [-4,-13], [3,13], [8,-10], [12,7], [15,-3], [-16,4], [5,5], [-7,1]
  ];
  for (const [x, z] of treeSpots) addTree(x, z);

  for (const [worldKey] of world) {
    const [x, y, z] = worldKey.split(',').map(Number);
    refreshBlock(x, y, z);
  }
  makeClouds();
}

function addTree(x, z) {
  const ground = terrainHeight(x, z);
  if (ground <= WATER_LEVEL + 1) return;
  const trunk = 3 + Math.floor(hash(x + 9, z - 4) * 2);
  for (let i = 1; i <= trunk; i++) setBlock(x, ground + i, z, 'wood');
  const top = ground + trunk;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 1; dy++) {
    if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < 4 && !getBlock(x + dx, top + dy, z + dz)) {
      setBlock(x + dx, top + dy, z + dz, 'leaves');
    }
  }
  setBlock(x, top + 2, z, 'leaves');
}

function isExposed(x, y, z) {
  const type = getBlock(x, y, z);
  if (!type) return false;
  const neighbors = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  return neighbors.some(([dx,dy,dz]) => {
    const next = getBlock(x+dx, y+dy, z+dz);
    return !next || (next === 'water' && type !== 'water');
  });
}

function refreshBlock(x, y, z) {
  const id = key(x, y, z);
  const existing = meshes.get(id);
  const type = getBlock(x, y, z);
  const shouldRender = type && isExposed(x, y, z);
  if (existing && (!shouldRender || existing.userData.type !== type)) {
    blockGroup.remove(existing);
    meshes.delete(id);
  }
  if (shouldRender && !meshes.has(id)) {
    const mesh = new THREE.Mesh(boxGeometry, materials[type]);
    mesh.position.set(x, y, z);
    mesh.userData = { x, y, z, type };
    mesh.castShadow = type !== 'water' && type !== 'leaves';
    mesh.receiveShadow = true;
    blockGroup.add(mesh);
    meshes.set(id, mesh);
  }
}

function refreshAround(x, y, z) {
  refreshBlock(x,y,z);
  for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) refreshBlock(x+dx,y+dy,z+dz);
}

function makeClouds() {
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .88 });
  const pieces = [[-13,15,-18, 7], [12,18,-25, 9], [24,13,2, 6], [-27,19,10, 8]];
  for (const [x,y,z,w] of pieces) {
    const group = new THREE.Group();
    for (let i=0; i<3; i++) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w * (.55 + i*.12), 1.2 + (i%2), 2.5), cloudMat);
      part.position.set((i-1)*2.3, i%2*.55, 0);
      group.add(part);
    }
    group.position.set(x,y,z);
    cloudGroup.add(group);
  }
}

const player = {
  position: new THREE.Vector3(0, 8, 8),
  radius: .3,
  height: 1.72,
};

const avatar3D = new THREE.Group();
scene.add(avatar3D);
let leftArm, rightArm, leftLeg, rightLeg;

function makeAvatar(character) {
  avatar3D.clear();
  const mat = (color) => new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
  const part = (w,h,d,color,x,y,z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color));
    mesh.position.set(x,y,z); mesh.castShadow = true; avatar3D.add(mesh); return mesh;
  };
  part(.52,.5,.48,character.skin,0,1.48,0);
  part(.54,.18,.5,character.hair,0,1.72,0);
  part(.56,.62,.32,character.shirt,0, .91,0);
  leftArm = part(.18,.64,.22,character.shirt,-.38,.92,0);
  rightArm = part(.18,.64,.22,character.shirt,.38,.92,0);
  part(.18,.24,.22,character.skin,-.38,.48,0);
  part(.18,.24,.22,character.skin,.38,.48,0);
  leftLeg = part(.24,.58,.28,character.pants,-.16,.31,0);
  rightLeg = part(.24,.58,.28,character.pants,.16,.31,0);
}

function highestSolidAt(x, z, maxY = 30) {
  const bx = Math.round(x), bz = Math.round(z);
  for (let y = Math.floor(maxY); y >= -3; y--) {
    const type = getBlock(bx, y, bz);
    if (type && type !== 'water' && type !== 'leaves') return y;
  }
  return -4;
}

function respawn() {
  const ground = highestSolidAt(0, 0);
  player.position.set(0, ground + .51, 0);
  verticalVelocity = 0;
}

function setupCharacterCards() {
  const grid = document.querySelector('#character-grid');
  grid.innerHTML = CHARACTERS.map(c => `
    <button class="character-card" data-character="${c.id}" style="--skin:${c.skin};--hair:${c.hair};--shirt:${c.shirt};--pants:${c.pants}">
      <span class="avatar" aria-hidden="true">
        <i class="head"></i><i class="body"></i><i class="arm left"></i><i class="arm right"></i><i class="leg left"></i><i class="leg right"></i>
      </span>
      <span><strong>${c.name}</strong><small>${c.title}</small></span>
    </button>`).join('');
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.character-card');
    if (!card) return;
    document.querySelectorAll('.character-card').forEach(el => el.classList.remove('selected'));
    card.classList.add('selected');
    selectedCharacter = CHARACTERS.find(c => c.id === card.dataset.character);
    document.querySelector('#play-button').disabled = false;
  });
}

function setupHotbar() {
  const hotbar = document.querySelector('#hotbar');
  hotbar.innerHTML = PLACEABLE.map((type, i) => `
    <div class="slot ${i === selectedBlock ? 'selected' : ''}" data-slot="${i}" style="--block-color:#${BLOCKS[type].color.toString(16).padStart(6,'0')}">
      <small>${i+1}</small><i></i><span>${BLOCKS[type].label}</span>
    </div>`).join('');
}

function selectBlock(index) {
  if (index < 0 || index >= PLACEABLE.length) return;
  selectedBlock = index;
  setupHotbar();
  showToast(`${BLOCKS[PLACEABLE[index]].label} selected`);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1300);
}

function startGame() {
  if (!selectedCharacter) return;
  makeAvatar(selectedCharacter);
  respawn();
  document.querySelector('#title-screen').classList.add('hidden');
  document.querySelector('#pause-screen').classList.add('hidden');
  document.querySelector('#hud').classList.remove('hidden');
  const badge = document.querySelector('#player-badge');
  badge.style.setProperty('--badge-color', selectedCharacter.shirt);
  badge.innerHTML = `<i></i><span>${selectedCharacter.name.toUpperCase()} · ${selectedCharacter.title.toUpperCase()}</span>`;
  playing = true;
  if (!isTouchDevice) canvas.requestPointerLock();
  showToast(`Welcome, ${selectedCharacter.name}!`);
}

function pauseGame() {
  if (!playing) return;
  document.querySelector('#pause-screen').classList.remove('hidden');
}

function resumeGame() {
  document.querySelector('#pause-screen').classList.add('hidden');
  if (!isTouchDevice) canvas.requestPointerLock();
}

document.querySelector('#play-button').addEventListener('click', startGame);
document.querySelector('#resume-button').addEventListener('click', resumeGame);
document.querySelector('#change-character').addEventListener('click', () => {
  playing = false;
  document.querySelector('#pause-screen').classList.add('hidden');
  document.querySelector('#hud').classList.add('hidden');
  document.querySelector('#title-screen').classList.remove('hidden');
});
document.querySelector('#help-button').addEventListener('click', () => {
  document.exitPointerLock();
  document.querySelector('#help-modal').classList.remove('hidden');
});
document.querySelector('#close-help').addEventListener('click', () => {
  document.querySelector('#help-modal').classList.add('hidden');
  if (playing && !isTouchDevice) canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (!isTouchDevice && playing && document.pointerLockElement !== canvas && document.querySelector('#help-modal').classList.contains('hidden')) pauseGame();
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * .0024;
  pitch -= e.movementY * .0022;
  pitch = THREE.MathUtils.clamp(pitch, -1.42, 1.42);
});

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (/^Digit[1-6]$/.test(e.code)) selectBlock(Number(e.code.at(-1)) - 1);
  if (e.code === 'KeyT' && playing) {
    thirdPerson = !thirdPerson;
    showToast(thirdPerson ? 'Explorer camera' : 'First-person camera');
  }
  if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) {
    if (playing) canvas.requestPointerLock();
    return;
  }
  if (e.button === 0) mineBlock();
  if (e.button === 2) placeBlock();
});

document.querySelector('#hotbar').addEventListener('pointerdown', (e) => {
  const slot = e.target.closest('[data-slot]');
  if (slot) selectBlock(Number(slot.dataset.slot));
});

const movePad = document.querySelector('#move-pad');
const moveStick = document.querySelector('#move-stick');
function updateMovePad(clientX, clientY) {
  const rect = movePad.getBoundingClientRect();
  const max = rect.width * .32;
  let dx = clientX - (rect.left + rect.width / 2);
  let dy = clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy);
  if (length > max) { dx = dx / length * max; dy = dy / length * max; }
  if (length < max * .12) { dx = 0; dy = 0; }
  touchMove.set(dx / max, -dy / max);
  moveStick.style.transform = `translate(${dx}px, ${dy}px)`;
}

function clearMove() {
  movePointer = null;
  touchMove.set(0,0);
  moveStick.style.transform = '';
}

function updateTouchLook(clientX, clientY) {
  yaw -= (clientX - lastLookX) * .008;
  pitch -= (clientY - lastLookY) * .007;
  pitch = THREE.MathUtils.clamp(pitch, -1.42, 1.42);
  lastLookX = clientX;
  lastLookY = clientY;
}

if (hasNativeTouch) {
  movePad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    movePointer = touch.identifier;
    updateMovePad(touch.clientX, touch.clientY);
  }, { passive: false });
  movePad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = [...e.changedTouches].find(t => t.identifier === movePointer) || [...e.touches].find(t => t.identifier === movePointer);
    if (touch) updateMovePad(touch.clientX, touch.clientY);
  }, { passive: false });
  const finishMoveTouch = (e) => {
    if ([...e.changedTouches].some(t => t.identifier === movePointer)) clearMove();
  };
  movePad.addEventListener('touchend', finishMoveTouch, { passive: false });
  movePad.addEventListener('touchcancel', finishMoveTouch, { passive: false });

  canvas.addEventListener('touchstart', (e) => {
    if (!playing || lookPointer !== null) return;
    const touch = e.changedTouches[0];
    lookPointer = touch.identifier;
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = [...e.changedTouches].find(t => t.identifier === lookPointer) || [...e.touches].find(t => t.identifier === lookPointer);
    if (touch) updateTouchLook(touch.clientX, touch.clientY);
  }, { passive: false });
  const finishLookTouch = (e) => {
    if ([...e.changedTouches].some(t => t.identifier === lookPointer)) lookPointer = null;
  };
  canvas.addEventListener('touchend', finishLookTouch, { passive: false });
  canvas.addEventListener('touchcancel', finishLookTouch, { passive: false });
} else {
  movePad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    movePointer = e.pointerId;
    movePad.setPointerCapture(e.pointerId);
    updateMovePad(e.clientX, e.clientY);
  });
  movePad.addEventListener('pointermove', (e) => { if (e.pointerId === movePointer) updateMovePad(e.clientX, e.clientY); });
  const releaseMovePointer = (e) => { if (e.pointerId === movePointer) clearMove(); };
  movePad.addEventListener('pointerup', releaseMovePointer);
  movePad.addEventListener('pointercancel', releaseMovePointer);
}

function bindTouchAction(id, action) {
  const button = document.querySelector(id);
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); action(true); });
  button.addEventListener('pointerup', (e) => { e.preventDefault(); action(false); });
  button.addEventListener('pointercancel', () => action(false));
}
bindTouchAction('#touch-jump', pressed => {
  if (pressed) jumpQueuedUntil = performance.now() + 300;
});
bindTouchAction('#touch-mine', pressed => { if (pressed) mineBlock(); });
bindTouchAction('#touch-build', pressed => { if (pressed) placeBlock(); });
bindTouchAction('#touch-camera', pressed => {
  if (!pressed) return;
  thirdPerson = !thirdPerson;
  showToast(thirdPerson ? 'Explorer camera' : 'First-person camera');
});

const raycaster = new THREE.Raycaster();
raycaster.far = 6;
function aimedBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  return raycaster.intersectObjects(blockGroup.children, false)[0];
}

function mineBlock() {
  const hit = aimedBlock();
  if (!hit || hit.object.userData.type === 'water') return;
  const {x,y,z,type} = hit.object.userData;
  world.delete(key(x,y,z));
  refreshAround(x,y,z);
  showToast(`${BLOCKS[type].label} collected`);
}

function placeBlock() {
  const hit = aimedBlock();
  if (!hit || !hit.face) return;
  const normal = hit.face.normal;
  const pos = hit.object.position.clone().add(normal).round();
  if (Math.abs(pos.x - player.position.x) < .65 && Math.abs(pos.z - player.position.z) < .65 && pos.y < player.position.y + 1.8 && pos.y > player.position.y - .6) return;
  setBlock(pos.x,pos.y,pos.z,PLACEABLE[selectedBlock]);
  refreshAround(pos.x,pos.y,pos.z);
}

const clock = new THREE.Clock();
function updatePlayer(dt, elapsed) {
  const input = new THREE.Vector2(
    (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchMove.x,
    (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + touchMove.y
  );
  if (input.lengthSq() > 1) input.normalize();
  const speed = keys.ShiftLeft || keys.ShiftRight || (isTouchDevice && touchMove.length() > .88) ? 6.4 : 4.25;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const dx = (input.x * cos - input.y * sin) * speed * dt;
  const dz = (-input.x * sin - input.y * cos) * speed * dt;
  const oldX = player.position.x, oldZ = player.position.z;
  const oldGround = highestSolidAt(oldX, oldZ, player.position.y + 1);
  const nextGroundX = highestSolidAt(oldX + dx, oldZ, player.position.y + 1);
  if (nextGroundX <= oldGround + 1 || player.position.y > nextGroundX + 1.4) player.position.x += dx;
  const nextGroundZ = highestSolidAt(player.position.x, oldZ + dz, player.position.y + 1);
  if (nextGroundZ <= oldGround + 1 || player.position.y > nextGroundZ + 1.4) player.position.z += dz;

  const groundBlock = highestSolidAt(player.position.x, player.position.z, player.position.y + .2);
  playerInWater = getBlock(Math.round(player.position.x), WATER_LEVEL, Math.round(player.position.z)) === 'water';
  const waterFloatY = WATER_LEVEL + .2 + Math.sin(elapsed * 2.4) * .025;
  const groundY = playerInWater ? Math.max(groundBlock + .51, waterFloatY) : groundBlock + .51;
  grounded = player.position.y <= groundY + .06 && verticalVelocity <= 0;
  if (grounded) {
    player.position.y = groundY;
    verticalVelocity = 0;
    if (keys.Space || performance.now() < jumpQueuedUntil) {
      verticalVelocity = playerInWater ? 5.6 : 7.1;
      grounded = false;
      jumpQueuedUntil = 0;
    }
  } else {
    verticalVelocity -= 18 * dt;
    player.position.y += verticalVelocity * dt;
    if (verticalVelocity <= 0 && player.position.y <= groundY) { player.position.y = groundY; verticalVelocity = 0; grounded = true; }
  }
  if (player.position.y < -12) respawn();

  const moving = input.lengthSq() > .01;
  avatar3D.position.copy(player.position);
  avatar3D.rotation.y = yaw;
  if (leftArm) {
    const swing = moving && grounded ? Math.sin(elapsed * 10 * (speed/4.25)) * .65 : 0;
    leftArm.rotation.x = swing; rightArm.rotation.x = -swing;
    leftLeg.rotation.x = -swing; rightLeg.rotation.x = swing;
  }

  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  if (thirdPerson) {
    const forward = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const target = player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    camera.position.copy(target).addScaledVector(forward, -5).add(new THREE.Vector3(0, 1.1, 0));
    camera.lookAt(target);
    avatar3D.visible = true;
  } else {
    camera.position.copy(player.position).add(new THREE.Vector3(0, 1.54, 0));
    avatar3D.visible = false;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  const elapsed = clock.elapsedTime;
  if (playing && (isTouchDevice || document.pointerLockElement === canvas)) updatePlayer(dt, elapsed);
  cloudGroup.position.x = ((elapsed * .22 + 35) % 70) - 35;
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setupCharacterCards();
setupHotbar();
generateWorld();
camera.position.set(8, 10, 13);
camera.lookAt(0,3,0);

if (new URLSearchParams(location.search).has('debug')) {
  window.__BLOCKWORLD_DEBUG__ = {
    playerPosition: () => player.position.toArray(),
    moveInput: () => touchMove.toArray(),
    view: () => ({ yaw, pitch, thirdPerson }),
    state: () => ({ grounded, playerInWater, worldBlocks: world.size }),
    setView: (nextYaw, nextPitch) => { yaw = nextYaw; pitch = nextPitch; },
    findWater: () => {
      for (const [id, type] of world) if (type === 'water') return id.split(',').map(Number);
      return null;
    },
    teleport: (x, z) => {
      player.position.set(x, highestSolidAt(x, z) + .51, z);
      verticalVelocity = 0;
    },
  };
}
animate();
