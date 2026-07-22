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

const TOOL_DEFS = {
  hands: { name: 'Bare Hands', icon: '✋', reach: 6, damage: 1, note: 'Basic mining' },
  wood_pick: { name: 'Wood Pick', icon: '⛏', reach: 7, damage: 1, note: '+1 stone drops' },
  stone_pick: { name: 'Stone Pick', icon: '⛏', reach: 8, damage: 2, note: '+2 stone drops' },
  axe: { name: 'Trail Axe', icon: '🪓', reach: 6.5, damage: 2, note: '+2 wood drops' },
  sword: { name: 'Stone Sword', icon: '⚔', reach: 6.5, damage: 3, note: 'Heavy monster damage' },
};

const RECIPES = [
  { id: 'sticks', name: 'Four Sticks', icon: '╫', costs: { wood: 1 }, grants: { sticks: 4 } },
  { id: 'wood_pick', name: 'Wood Pick', icon: '⛏', costs: { wood: 3, sticks: 2 }, tool: 'wood_pick' },
  { id: 'stone_pick', name: 'Stone Pick', icon: '⛏', costs: { stone: 3, sticks: 2 }, tool: 'stone_pick' },
  { id: 'axe', name: 'Trail Axe', icon: '🪓', costs: { wood: 3, sticks: 2 }, tool: 'axe' },
  { id: 'sword', name: 'Stone Sword', icon: '⚔', costs: { stone: 2, sticks: 1 }, tool: 'sword' },
  { id: 'bricks', name: 'Four Bricks', icon: '▦', costs: { dirt: 2, stone: 2 }, grants: { brick: 4 } },
  { id: 'builder_bundle', name: 'Builder Bundle', icon: '▣', costs: { wood: 2, stone: 2 }, grants: { grass: 4, dirt: 4, sand: 4 } },
];

const inventory = { grass: 16, dirt: 16, stone: 8, wood: 8, sand: 8, brick: 8, sticks: 0 };
const ownedTools = new Set(['hands']);
const collectedCaches = new Set();
const lootCaches = [];
const lootSpawnedChunks = new Set();
let equippedTool = 'hands';

const PLACEABLE = ['grass', 'dirt', 'stone', 'wood', 'sand', 'brick'];
const CHUNK_SIZE = 12;
const WATER_LEVEL = 2;
const world = new Map();
const meshes = new Map();
const generatedChunks = new Set();
const activeChunks = new Set();
const keys = Object.create(null);
const isTouchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const hasNativeTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const RENDER_DISTANCE = isTouchDevice ? 2 : 3;
const touchMove = new THREE.Vector2();
let currentChunkX = Number.NaN;
let currentChunkZ = Number.NaN;
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
const DAY_LENGTH_SECONDS = 240;
let worldTime = .06;
let dayNumber = 1;
let nightActive = false;
let health = 5;
let damageCooldown = 0;
let nextMonsterSpawn = 0;
const monsters = [];

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

const hemisphere = new THREE.HemisphereLight(0xc9efff, 0x6f7c4e, 2.1);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xfff0c3, 2.8);
sun.position.set(-18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;
const moonLight = new THREE.DirectionalLight(0x9ab9ff, 0);
moonLight.target = sunTarget;
scene.add(moonLight);

const sunCube = new THREE.Mesh(
  new THREE.BoxGeometry(4, 4, 1),
  new THREE.MeshBasicMaterial({ color: 0xffe36d, fog: false })
);
sunCube.position.set(-28, 27, -40);
scene.add(sunCube);

const moonCube = new THREE.Mesh(
  new THREE.BoxGeometry(3.1, 3.1, .8),
  new THREE.MeshBasicMaterial({ color: 0xc9dbff, fog: false })
);
scene.add(moonCube);

const starGeometry = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < 240; i++) {
  const angle = hash(i * 17, i * 31) * Math.PI * 2;
  const radius = 42 + hash(i * 7, i * 13) * 18;
  starPositions.push(Math.cos(angle) * radius, 17 + hash(i * 23, i * 3) * 28, Math.sin(angle) * radius);
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xe7efff, size: .38, transparent: true, opacity: 0, depthWrite: false, fog: false });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

const blockGroup = new THREE.Group();
scene.add(blockGroup);
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
const monsterGroup = new THREE.Group();
scene.add(monsterGroup);
const lootGroup = new THREE.Group();
scene.add(lootGroup);

const targetOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
  new THREE.LineBasicMaterial({ color: 0xffdf4f, transparent: true, opacity: .95 })
);
targetOutline.visible = false;
scene.add(targetOutline);

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

function chunkKey(cx, cz) { return `${cx}:${cz}`; }
function chunkAt(value) { return Math.floor(value / CHUNK_SIZE); }

function generateChunk(cx, cz) {
  const id = chunkKey(cx, cz);
  if (generatedChunks.has(id)) return;
  generatedChunks.add(id);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  for (let x = startX; x < startX + CHUNK_SIZE; x++) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
      const h = terrainHeight(x, z);
      for (let y = -3; y <= h; y++) {
        let type = y === h ? 'grass' : y >= h - 2 ? 'dirt' : 'stone';
        if (h <= WATER_LEVEL + 1 && y === h) type = 'sand';
        setBlock(x, y, z, type);
      }
      if (h < WATER_LEVEL) setBlock(x, WATER_LEVEL, z, 'water');
    }
  }

  for (let x = startX + 1; x < startX + CHUNK_SIZE - 1; x++) {
    for (let z = startZ + 1; z < startZ + CHUNK_SIZE - 1; z++) {
      if (hash(x * 3 + 19, z * 3 - 7) > .982) addTree(x, z);
    }
  }
  spawnLootForChunk(cx, cz);
}

function renderChunk(cx, cz) {
  const id = chunkKey(cx, cz);
  activeChunks.add(id);
  generateChunk(cx, cz);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  for (let x = startX - 2; x < startX + CHUNK_SIZE + 2; x++) {
    for (let z = startZ - 2; z < startZ + CHUNK_SIZE + 2; z++) {
      const maxY = terrainHeight(x, z) + 8;
      for (let y = -3; y <= maxY; y++) refreshBlock(x, y, z);
    }
  }
  for (const cache of lootCaches) {
    if (cache.cx === cx && cache.cz === cz && !cache.collected) cache.group.visible = true;
  }
}

function unloadChunk(cx, cz) {
  const id = chunkKey(cx, cz);
  for (const [blockId, mesh] of meshes) {
    if (chunkAt(mesh.userData.x) === cx && chunkAt(mesh.userData.z) === cz) {
      blockGroup.remove(mesh);
      meshes.delete(blockId);
    }
  }
  activeChunks.delete(id);
  for (const cache of lootCaches) {
    if (cache.cx === cx && cache.cz === cz) cache.group.visible = false;
  }
}

function updateWorldChunks(force = false) {
  const centerX = chunkAt(player.position.x);
  const centerZ = chunkAt(player.position.z);
  if (!force && centerX === currentChunkX && centerZ === currentChunkZ) return;
  currentChunkX = centerX;
  currentChunkZ = centerZ;

  const desired = new Set();
  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      const cx = centerX + dx, cz = centerZ + dz;
      desired.add(chunkKey(cx, cz));
      generateChunk(cx, cz);
    }
  }
  for (const id of [...activeChunks]) {
    if (!desired.has(id)) {
      const [cx, cz] = id.split(':').map(Number);
      unloadChunk(cx, cz);
    }
  }
  for (const id of desired) {
    if (!activeChunks.has(id)) {
      const [cx, cz] = id.split(':').map(Number);
      renderChunk(cx, cz);
    }
  }
}

function generateWorld() {
  updateWorldChunks(true);
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

function spawnLootForChunk(cx, cz) {
  const id = chunkKey(cx, cz);
  if (lootSpawnedChunks.has(id)) return;
  lootSpawnedChunks.add(id);
  const isStarter = cx === 0 && cz === 0;
  if (!isStarter && hash(cx * 17 + 5, cz * 29 - 11) < .68) return;
  if (collectedCaches.has(id)) return;

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  let x = isStarter ? 4 : startX + 2 + Math.floor(hash(cx * 7, cz * 13) * (CHUNK_SIZE - 4));
  let z = isStarter ? 4 : startZ + 2 + Math.floor(hash(cx * 19, cz * 3) * (CHUNK_SIZE - 4));
  for (let attempt = 0; attempt < 5 && getBlock(x, WATER_LEVEL, z) === 'water'; attempt++) {
    x = startX + 2 + Math.floor(hash(cx * 31 + attempt, cz * 11) * (CHUNK_SIZE - 4));
    z = startZ + 2 + Math.floor(hash(cx * 5, cz * 23 + attempt) * (CHUNK_SIZE - 4));
  }
  if (getBlock(x, WATER_LEVEL, z) === 'water') return;

  const roll = hash(cx * 43 + 9, cz * 37 - 2);
  const tool = isStarter ? 'wood_pick' : roll < .25 ? 'axe' : roll < .5 ? 'sword' : roll < .75 ? 'stone_pick' : 'wood_pick';
  const grants = isStarter ? { wood: 4, stone: 3 } : roll < .5 ? { wood: 3, dirt: 4 } : { stone: 3, brick: 2 };
  createLootCache({ id, cx, cz, x, z, tool, grants });
}

function createLootCache(data) {
  const group = new THREE.Group();
  const caseMaterial = new THREE.MeshLambertMaterial({ color: 0xd69b33 });
  const bandMaterial = new THREE.MeshLambertMaterial({ color: 0x245f63 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffe46f, transparent: true, opacity: .72 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(.9, .5, .72), caseMaterial);
  base.position.y = .27;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(.94, .22, .76), caseMaterial);
  lid.position.y = .62;
  const band = new THREE.Mesh(new THREE.BoxGeometry(.2, .55, .77), bandMaterial);
  band.position.y = .29;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(.3, .08, .3), glowMaterial);
  glow.position.y = .8;
  group.add(base, lid, band, glow);
  group.traverse(object => { if (object.isMesh) object.castShadow = true; });
  const ground = highestSolidAt(data.x, data.z);
  group.position.set(data.x, ground + .51, data.z);
  const cache = { ...data, group, lid, glow, collected: false };
  group.userData.cache = cache;
  lootCaches.push(cache);
  lootGroup.add(group);
}

function collectLootCache(cache) {
  if (cache.collected) return;
  cache.collected = true;
  cache.group.visible = false;
  collectedCaches.add(cache.id);
  const alreadyOwned = ownedTools.has(cache.tool);
  ownedTools.add(cache.tool);
  for (const [material, amount] of Object.entries(cache.grants)) inventory[material] = (inventory[material] || 0) + amount;
  if (alreadyOwned) {
    inventory.wood += 2;
    inventory.stone += 2;
  } else {
    equippedTool = cache.tool;
  }
  setupHotbar();
  renderPack();
  updatePackButton();
  saveProgress();
  showToast(alreadyOwned ? 'Supply cache: bonus blocks!' : `Found ${TOOL_DEFS[cache.tool].name}!`);
}

function updateLootCaches(elapsed) {
  if (!playing) return;
  for (const cache of lootCaches) {
    if (cache.collected || !cache.group.visible) continue;
    cache.glow.rotation.y = elapsed * 2.2;
    cache.glow.position.y = .8 + Math.sin(elapsed * 3 + cache.x) * .07;
    cache.lid.rotation.y = Math.sin(elapsed * 1.2 + cache.z) * .035;
    if (cache.group.position.distanceTo(player.position) < 1.45) collectLootCache(cache);
  }
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
  const chunkIsActive = activeChunks.has(chunkKey(chunkAt(x), chunkAt(z)));
  const shouldRender = type && chunkIsActive && isExposed(x, y, z);
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

let cloudMaterial;
function makeClouds() {
  cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .88 });
  const pieces = [[-13,15,-18, 7], [12,18,-25, 9], [24,13,2, 6], [-27,19,10, 8]];
  for (const [x,y,z,w] of pieces) {
    const group = new THREE.Group();
    for (let i=0; i<3; i++) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w * (.55 + i*.12), 1.2 + (i%2), 2.5), cloudMaterial);
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

function createNightling(x, z) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x25213f, transparent: true });
  const limbMaterial = new THREE.MeshLambertMaterial({ color: 0x34305b, transparent: true });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x9dffcf, transparent: true });
  const part = (w, h, d, material, px, py, pz) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(.62, .68, .38, bodyMaterial, 0, .92, 0);
  part(.58, .52, .5, limbMaterial, 0, 1.52, 0);
  part(.14, .12, .03, eyeMaterial, -.15, 1.58, -.27);
  part(.14, .12, .03, eyeMaterial, .15, 1.58, -.27);
  const leftArmMob = part(.18, .75, .2, limbMaterial, -.43, .98, -.05);
  const rightArmMob = part(.18, .75, .2, limbMaterial, .43, .98, -.05);
  const leftLegMob = part(.23, .58, .25, bodyMaterial, -.17, .3, 0);
  const rightLegMob = part(.23, .58, .25, bodyMaterial, .17, .3, 0);
  const ground = highestSolidAt(x, z);
  group.position.set(x, ground + .51, z);
  const monster = {
    group,
    health: 3,
    speed: 1.25 + hash(x, z) * .55,
    phase: hash(z, x) * Math.PI * 2,
    parts: [leftArmMob, rightArmMob, leftLegMob, rightLegMob],
    materials: [bodyMaterial, limbMaterial, eyeMaterial],
  };
  group.userData.monster = monster;
  monsterGroup.add(group);
  monsters.push(monster);
  return monster;
}

function removeMonster(monster) {
  const index = monsters.indexOf(monster);
  if (index >= 0) monsters.splice(index, 1);
  monsterGroup.remove(monster.group);
  monster.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
  monster.materials.forEach(material => material.dispose());
}

function clearMonsters() {
  for (const monster of [...monsters]) removeMonster(monster);
}

function spawnNightling(elapsed) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const seed = Math.floor(elapsed * 9) + monsters.length * 13 + attempt * 7;
    const angle = hash(seed, dayNumber * 19) * Math.PI * 2;
    const distance = 8 + hash(seed * 3, 41) * 7;
    const x = Math.round(player.position.x + Math.cos(angle) * distance);
    const z = Math.round(player.position.z + Math.sin(angle) * distance);
    if (getBlock(x, WATER_LEVEL, z) === 'water') continue;
    createNightling(x, z);
    return;
  }
}

function takeDamage(monster) {
  if (damageCooldown > 0) return;
  damageCooldown = 1.05;
  health = Math.max(0, health - 1);
  updateHealthHud();
  const away = player.position.clone().sub(monster.group.position).setY(0).normalize();
  player.position.addScaledVector(away, .7);
  verticalVelocity = 3.2;
  const flash = document.querySelector('#damage-flash');
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 180);
  if (health <= 0) {
    clearMonsters();
    respawn();
    showToast('The Nightlings got you — back to camp!');
  } else {
    showToast(`Ouch! ${health} ${health === 1 ? 'heart' : 'hearts'} left`);
  }
}

function updateMonsters(dt, elapsed) {
  damageCooldown = Math.max(0, damageCooldown - dt);
  if (!playing) return;
  if (nightActive) {
    nextMonsterSpawn -= dt;
    const cap = isTouchDevice ? 6 : 9;
    if (nextMonsterSpawn <= 0 && monsters.length < cap) {
      spawnNightling(elapsed);
      nextMonsterSpawn = 3.2 + hash(Math.floor(elapsed), monsters.length) * 2.8;
    }
  }

  for (const monster of [...monsters]) {
    if (!nightActive) { removeMonster(monster); continue; }
    const delta = player.position.clone().sub(monster.group.position);
    const distance = delta.length();
    if (distance > 34) { removeMonster(monster); continue; }
    delta.y = 0;
    if (distance > .9 && delta.lengthSq() > .01) {
      delta.normalize();
      const nextX = monster.group.position.x + delta.x * monster.speed * dt;
      const nextZ = monster.group.position.z + delta.z * monster.speed * dt;
      const ground = highestSolidAt(nextX, nextZ, monster.group.position.y + 2);
      const targetY = ground + .51;
      if (targetY <= monster.group.position.y + 1.1) {
        monster.group.position.x = nextX;
        monster.group.position.z = nextZ;
        monster.group.position.y = THREE.MathUtils.lerp(monster.group.position.y, targetY, Math.min(1, dt * 8));
      }
      monster.group.rotation.y = Math.atan2(delta.x, delta.z) + Math.PI;
    } else {
      takeDamage(monster);
    }
    const swing = Math.sin(elapsed * 8 + monster.phase) * .55;
    monster.parts[0].rotation.x = swing;
    monster.parts[1].rotation.x = -swing;
    monster.parts[2].rotation.x = -swing;
    monster.parts[3].rotation.x = swing;
    monster.group.position.y += Math.sin(elapsed * 5 + monster.phase) * .0015;
  }
}

function monsterFromObject(object) {
  let current = object;
  while (current && current !== monsterGroup) {
    if (current.userData.monster) return current.userData.monster;
    current = current.parent;
  }
  return null;
}

function damageMonster(monster) {
  monster.health -= TOOL_DEFS[equippedTool].damage;
  monster.group.scale.setScalar(1.14);
  setTimeout(() => monster.group.scale.setScalar(1), 90);
  if (monster.health <= 0) {
    removeMonster(monster);
    showToast('Nightling defeated!');
  } else {
    showToast(`Nightling: ${monster.health} hits left`);
  }
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
  player.position.set(0, 8, 0);
  updateWorldChunks(true);
  const ground = highestSolidAt(0, 0);
  player.position.set(0, ground + .51, 0);
  verticalVelocity = 0;
  health = 5;
  updateHealthHud();
}

function updateHealthHud() {
  const display = document.querySelector('#health-display');
  display.textContent = `${'♥'.repeat(health)}${'♡'.repeat(5 - health)}`;
  display.setAttribute('aria-label', `${health} of 5 hearts`);
  display.classList.toggle('danger', health <= 2);
}

function updateDayNight(dt) {
  if (playing) {
    const previous = worldTime;
    worldTime = (worldTime + dt / DAY_LENGTH_SECONDS) % 1;
    if (worldTime < previous) dayNumber++;
  }

  const angle = worldTime * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const dayAmount = THREE.MathUtils.smoothstep(sunHeight, -.2, .32);
  const twilight = Math.max(0, 1 - Math.abs(sunHeight) / .32) * (1 - dayAmount * .25);
  const isNight = sunHeight < -.18;
  const sky = new THREE.Color(0x071225).lerp(new THREE.Color(0x8bd5f4), dayAmount);
  sky.lerp(new THREE.Color(0xef8a64), twilight * .38);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  scene.fog.near = THREE.MathUtils.lerp(12, 19, dayAmount);
  scene.fog.far = THREE.MathUtils.lerp(38, isTouchDevice ? 48 : 58, dayAmount);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(.88, 1.05, dayAmount);

  const orbitRadius = 43;
  sun.position.set(player.position.x + Math.cos(angle) * orbitRadius, 8 + sunHeight * 38, player.position.z - 22);
  sunTarget.position.set(player.position.x, 0, player.position.z);
  sun.intensity = THREE.MathUtils.lerp(.08, 2.8, dayAmount);
  hemisphere.intensity = THREE.MathUtils.lerp(.52, 2.1, dayAmount);
  hemisphere.color.set(isNight ? 0x7893cc : 0xc9efff);
  hemisphere.groundColor.set(isNight ? 0x202742 : 0x6f7c4e);
  moonLight.position.set(player.position.x - Math.cos(angle) * orbitRadius, 10 - sunHeight * 35, player.position.z + 18);
  moonLight.intensity = (1 - dayAmount) * .72;

  sunCube.position.set(player.position.x + Math.cos(angle) * 38, 10 + sunHeight * 34, player.position.z - 40);
  sunCube.visible = sunHeight > -.22;
  moonCube.position.set(player.position.x - Math.cos(angle) * 38, 10 - sunHeight * 34, player.position.z - 40);
  moonCube.visible = sunHeight < .3;
  stars.position.set(player.position.x, 0, player.position.z);
  starMaterial.opacity = Math.pow(1 - dayAmount, 1.6) * .95;
  if (cloudMaterial) cloudMaterial.opacity = THREE.MathUtils.lerp(.28, .88, dayAmount);

  const hour24 = Math.floor((worldTime * 24 + 6) % 24);
  const minutes = Math.floor((((worldTime * 24 + 6) % 1) * 60) / 10) * 10;
  const phase = sunHeight < -.18 ? 'NIGHT' : sunHeight < .16 && Math.cos(angle) > 0 ? 'MORNING' : sunHeight < .16 ? 'SUNSET' : Math.cos(angle) < -.78 ? 'AFTERNOON' : 'DAYTIME';
  const timeDisplay = document.querySelector('#time-display');
  timeDisplay.classList.toggle('night', isNight);
  timeDisplay.innerHTML = `<i>${isNight ? '☾' : sunHeight < .2 ? '◐' : '☀'}</i><b>DAY ${dayNumber} · ${phase} ${String(hour24).padStart(2,'0')}:${String(minutes).padStart(2,'0')}</b>`;
  document.querySelector('#danger-banner').classList.toggle('show', isNight && playing);

  if (isNight !== nightActive) {
    nightActive = isNight;
    nextMonsterSpawn = 0;
    if (playing) showToast(isNight ? 'Night falls… stay alert!' : 'Sunrise! The Nightlings retreat.');
    if (!isNight) clearMonsters();
  }
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

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('four-builders-progress-v1'));
    if (!saved) return;
    for (const key of Object.keys(inventory)) {
      if (Number.isFinite(saved.inventory?.[key])) inventory[key] = Math.max(0, Math.floor(saved.inventory[key]));
    }
    for (const tool of saved.tools || []) if (TOOL_DEFS[tool]) ownedTools.add(tool);
    if (TOOL_DEFS[saved.equipped] && ownedTools.has(saved.equipped)) equippedTool = saved.equipped;
    for (const id of saved.collectedCaches || []) collectedCaches.add(id);
  } catch (error) {
    console.warn('Could not load saved explorer progress.', error);
  }
}

function saveProgress() {
  localStorage.setItem('four-builders-progress-v1', JSON.stringify({
    inventory,
    tools: [...ownedTools],
    equipped: equippedTool,
    collectedCaches: [...collectedCaches],
  }));
}

function updatePackButton() {
  const tool = TOOL_DEFS[equippedTool];
  document.querySelector('#pack-button').innerHTML = `<i>${tool.icon}</i><span>${tool.name.toUpperCase()}</span>`;
}

function recipeCostText(recipe) {
  return Object.entries(recipe.costs).map(([item, amount]) => `${amount} ${item.replace('_',' ')}`).join(' · ');
}

function canCraft(recipe) {
  if (recipe.tool && ownedTools.has(recipe.tool)) return false;
  return Object.entries(recipe.costs).every(([item, amount]) => (inventory[item] || 0) >= amount);
}

function craftRecipe(recipeId) {
  const recipe = RECIPES.find(item => item.id === recipeId);
  if (!recipe || !canCraft(recipe)) return;
  for (const [item, amount] of Object.entries(recipe.costs)) inventory[item] -= amount;
  for (const [item, amount] of Object.entries(recipe.grants || {})) inventory[item] = (inventory[item] || 0) + amount;
  if (recipe.tool) {
    ownedTools.add(recipe.tool);
    equippedTool = recipe.tool;
    updatePackButton();
  }
  setupHotbar();
  renderPack();
  saveProgress();
  showToast(`Crafted ${recipe.name}!`);
}

function equipTool(toolId) {
  if (!ownedTools.has(toolId)) return;
  equippedTool = toolId;
  updatePackButton();
  renderPack();
  saveProgress();
  showToast(`${TOOL_DEFS[toolId].name} equipped`);
}

function renderPack() {
  const materials = [
    ...PLACEABLE.map(type => ({ id: type, name: BLOCKS[type].label, color: BLOCKS[type].color })),
    { id: 'sticks', name: 'Sticks', color: 0xb78043 },
  ];
  document.querySelector('#material-grid').innerHTML = materials.map(material => `
    <div class="material-item" style="--material-color:#${material.color.toString(16).padStart(6,'0')}">
      <i></i><span>${material.name}<strong>${inventory[material.id] || 0}</strong></span>
    </div>`).join('');

  document.querySelector('#tool-grid').innerHTML = [...ownedTools].map(toolId => {
    const tool = TOOL_DEFS[toolId];
    return `<button class="tool-card ${toolId === equippedTool ? 'selected' : ''}" data-tool="${toolId}">
      <i>${tool.icon}</i><span><strong>${tool.name}</strong>${tool.note}</span>
    </button>`;
  }).join('');

  document.querySelector('#recipe-grid').innerHTML = RECIPES.map(recipe => {
    const craftable = canCraft(recipe);
    const owned = recipe.tool && ownedTools.has(recipe.tool);
    return `<button class="recipe-card ${craftable ? 'can-craft' : ''}" data-recipe="${recipe.id}" ${craftable ? '' : 'disabled'}>
      <i>${recipe.icon}</i><span><strong>${recipe.name}</strong>${recipeCostText(recipe)}</span><em>${owned ? 'OWNED' : craftable ? 'CRAFT' : 'NEED ITEMS'}</em>
    </button>`;
  }).join('');

  const equipped = TOOL_DEFS[equippedTool];
  document.querySelector('#equipped-summary').innerHTML = `<i>${equipped.icon}</i><span>EQUIPPED<strong>${equipped.name}</strong>${equipped.note}</span>`;
}

function setupHotbar() {
  const hotbar = document.querySelector('#hotbar');
  hotbar.innerHTML = PLACEABLE.map((type, i) => `
    <div class="slot ${i === selectedBlock ? 'selected' : ''} ${inventory[type] <= 0 ? 'empty' : ''}" data-slot="${i}" style="--block-color:#${BLOCKS[type].color.toString(16).padStart(6,'0')}">
      <small>${i+1}</small><i></i><em>${inventory[type]}</em><span>${BLOCKS[type].label}</span>
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
document.querySelector('#pack-button').addEventListener('click', () => {
  renderPack();
  document.querySelector('#pack-modal').classList.remove('hidden');
  document.exitPointerLock();
});
document.querySelector('#close-pack').addEventListener('click', () => {
  document.querySelector('#pack-modal').classList.add('hidden');
  if (playing && !isTouchDevice) canvas.requestPointerLock();
});
document.querySelector('#tool-grid').addEventListener('click', (event) => {
  const tool = event.target.closest('[data-tool]');
  if (tool) equipTool(tool.dataset.tool);
});
document.querySelector('#recipe-grid').addEventListener('click', (event) => {
  const recipe = event.target.closest('[data-recipe]');
  if (recipe) craftRecipe(recipe.dataset.recipe);
});

document.addEventListener('pointerlockchange', () => {
  const noModalOpen = document.querySelector('#help-modal').classList.contains('hidden') && document.querySelector('#pack-modal').classList.contains('hidden');
  if (!isTouchDevice && playing && document.pointerLockElement !== canvas && noModalOpen) pauseGame();
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

document.querySelector('#hotbar').addEventListener('click', (e) => {
  e.preventDefault();
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

function bindTapAction(id, action) {
  const button = document.querySelector(id);
  let lastTouch = 0;
  button.addEventListener('touchend', (event) => {
    event.preventDefault();
    lastTouch = performance.now();
    action();
  }, { passive: false });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (performance.now() - lastTouch > 450) action();
  });
}
bindTapAction('#touch-jump', () => {
  jumpQueuedUntil = performance.now() + 300;
});
bindTapAction('#touch-mine', mineBlock);
bindTapAction('#touch-build', placeBlock);
bindTapAction('#touch-camera', () => {
  thirdPerson = !thirdPerson;
  showToast(thirdPerson ? 'Explorer camera' : 'First-person camera');
});

const raycaster = new THREE.Raycaster();
const aimSamples = [[0,0], [0,-.055], [0,.055], [-.055,0], [.055,0]];
function aimedBlock(centerOnly = false) {
  raycaster.far = TOOL_DEFS[equippedTool].reach;
  const samples = centerOnly ? aimSamples.slice(0, 1) : aimSamples;
  for (const [x, y] of samples) {
    raycaster.setFromCamera(new THREE.Vector2(x,y), camera);
    const hit = raycaster.intersectObjects(blockGroup.children, false)[0];
    if (hit) return hit;
  }
  return null;
}

let nextTargetScan = 0;
function updateTargeting(elapsed) {
  if (!playing || elapsed < nextTargetScan) return;
  nextTargetScan = elapsed + .16;
  const hit = aimedBlock(true);
  const label = document.querySelector('#target-label');
  const crosshair = document.querySelector('.crosshair');
  if (hit) {
    targetOutline.position.copy(hit.object.position);
    targetOutline.visible = true;
    label.textContent = `${BLOCKS[hit.object.userData.type].label.toUpperCase()} · READY`;
    label.classList.add('ready');
    crosshair.classList.add('targeted');
  } else {
    targetOutline.visible = false;
    label.textContent = 'AIM AT A BLOCK';
    label.classList.remove('ready');
    crosshair.classList.remove('targeted');
  }
}

function mineBlock() {
  raycaster.far = TOOL_DEFS[equippedTool].reach;
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const monsterHit = raycaster.intersectObjects(monsterGroup.children, true)[0];
  const hit = aimedBlock();
  if (monsterHit && monsterHit.distance <= TOOL_DEFS[equippedTool].reach && (!hit || monsterHit.distance < hit.distance)) {
    const monster = monsterFromObject(monsterHit.object);
    if (monster) damageMonster(monster);
    return;
  }
  if (!hit) { showToast('Aim the crosshair at a block'); return; }
  if (hit.object.userData.type === 'water') { showToast('Water cannot be mined'); return; }
  const {x,y,z,type} = hit.object.userData;
  world.delete(key(x,y,z));
  refreshAround(x,y,z);
  let amount = 1;
  if (type === 'stone' && equippedTool === 'wood_pick') amount = 2;
  if (type === 'stone' && equippedTool === 'stone_pick') amount = 3;
  if (type === 'wood' && equippedTool === 'axe') amount = 3;
  if (Object.hasOwn(inventory, type)) inventory[type] += amount;
  if (type === 'leaves') inventory.sticks += 1;
  setupHotbar();
  renderPack();
  saveProgress();
  showToast(`${BLOCKS[type].label} +${amount}`);
}

function placeBlock() {
  const hit = aimedBlock();
  if (!hit || !hit.face) { showToast('Aim the crosshair at a block'); return; }
  const type = PLACEABLE[selectedBlock];
  if ((inventory[type] || 0) <= 0) { showToast(`No ${BLOCKS[type].label} left — mine or craft more`); return; }
  const normal = hit.face.normal;
  const pos = hit.object.position.clone().add(normal).round();
  if (Math.abs(pos.x - player.position.x) < .65 && Math.abs(pos.z - player.position.z) < .65 && pos.y < player.position.y + 1.8 && pos.y > player.position.y - .6) { showToast('Cannot build inside your explorer'); return; }
  const existing = getBlock(pos.x, pos.y, pos.z);
  if (existing && existing !== 'water') { showToast('That space is already filled'); return; }
  setBlock(pos.x,pos.y,pos.z,type);
  refreshAround(pos.x,pos.y,pos.z);
  inventory[type]--;
  setupHotbar();
  renderPack();
  saveProgress();
  showToast(`${BLOCKS[type].label} placed`);
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

  updateWorldChunks();

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
  updateDayNight(dt);
  if (playing && (isTouchDevice || document.pointerLockElement === canvas)) updatePlayer(dt, elapsed);
  updateMonsters(dt, elapsed);
  updateLootCaches(elapsed);
  updateTargeting(elapsed);
  cloudGroup.position.x = player.position.x + ((elapsed * .22 + 35) % 70) - 35;
  cloudGroup.position.z = player.position.z;
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setupCharacterCards();
loadProgress();
setupHotbar();
renderPack();
updatePackButton();
generateWorld();
camera.position.set(8, 10, 13);
camera.lookAt(0,3,0);

if (new URLSearchParams(location.search).has('debug')) {
  window.__BLOCKWORLD_DEBUG__ = {
    playerPosition: () => player.position.toArray(),
    cameraState: () => ({ position: camera.position.toArray(), rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z] }),
    aimed: () => {
      const hit = aimedBlock();
      return hit ? { position: hit.object.position.toArray(), type: hit.object.userData.type, distance: hit.distance } : null;
    },
    moveInput: () => touchMove.toArray(),
    view: () => ({ yaw, pitch, thirdPerson }),
    state: () => ({
      grounded,
      playerInWater,
      worldBlocks: world.size,
      generatedChunks: generatedChunks.size,
      activeChunks: activeChunks.size,
      worldTime,
      dayNumber,
      nightActive,
      monsters: monsters.length,
      health,
      lootCaches: lootCaches.filter(cache => !cache.collected).length,
    }),
    inventory: () => ({ ...inventory }),
    tools: () => ({ owned: [...ownedTools], equipped: equippedTool }),
    setView: (nextYaw, nextPitch) => { yaw = nextYaw; pitch = nextPitch; },
    setTime: (time) => { worldTime = ((time % 1) + 1) % 1; updateDayNight(0); nextMonsterSpawn = 0; },
    monsterHealth: () => monsters.map(monster => monster.health),
    spawnMonsterAhead: () => {
      clearMonsters();
      const monster = createNightling(Math.round(player.position.x), Math.round(player.position.z - 2));
      monster.group.position.set(player.position.x, player.position.y, player.position.z - 2);
      return monster.health;
    },
    prepareInteractionTarget: () => {
      thirdPerson = false;
      yaw = 0;
      pitch = 0;
      const x = Math.round(player.position.x);
      const y = Math.floor(player.position.y + 1.54);
      const z = Math.round(player.position.z - 3);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        setBlock(x + dx, y + dy, z, 'stone');
        setBlock(x + dx, y + dy, z - 1, 'stone');
        refreshAround(x + dx, y + dy, z);
        refreshAround(x + dx, y + dy, z - 1);
      }
      return [x, y, z];
    },
    blockAt: (x, y, z) => getBlock(x, y, z) || null,
    findWater: () => {
      for (const [id, type] of world) if (type === 'water') return id.split(',').map(Number);
      return null;
    },
    teleport: (x, z) => {
      player.position.set(x, 8, z);
      updateWorldChunks(true);
      player.position.y = highestSolidAt(x, z) + .51;
      verticalVelocity = 0;
    },
  };
}
animate();
