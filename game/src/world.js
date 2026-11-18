// world.js — builds Palmera Bay itself: the street grid, the buildings with
// their canvas-painted facades, the named landmarks, the beach and marina,
// palms, lamps and the plaza fountain. Also owns the collision boxes every
// mover in the game tests against.

import * as THREE from 'three';
import { ROADS, ROAD_HALF, BLOCK_CENTRES, BEACH_X, SEA_X, COLORS, SPAWN } from './config.js';

export const colliders = [];   // { x, z, hw, hd } axis-aligned boxes
export const parkingSpots = []; // { x, z, heading } places a car can be parked

function addCollider(x, z, hw, hd) {
  const c = { x, z, hw, hd };
  colliders.push(c);
  return c;
}

// Push a circle (pos.x, pos.z, radius) out of every building box.
// Returns true when a push happened (a hit), for crash detection.
export function resolveCollisions(pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const px = c.hw + radius - Math.abs(dx);
    if (px <= 0) continue;
    const pz = c.hd + radius - Math.abs(dz);
    if (pz <= 0) continue;
    if (px < pz) pos.x = c.x + (dx >= 0 ? 1 : -1) * (c.hw + radius);
    else pos.z = c.z + (dz >= 0 ? 1 : -1) * (c.hd + radius);
    hit = true;
  }
  return hit;
}

export function isOnRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < ROAD_HALF + 1) return true;
    if (Math.abs(z - r) < ROAD_HALF + 1) return true;
  }
  return false;
}

// ---------- canvas textures ----------

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(rng, base, floors, cols) {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const fw = 256 / cols, fh = 256 / floors;
    for (let y = 0; y < floors; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng.chance(0.24);
        g.fillStyle = lit ? '#ffe9a8' : (rng.chance(0.5) ? '#2c3e50' : '#3d5a74');
        g.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.2, fw * 0.56, fh * 0.55);
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.2, fw * 0.56, fh * 0.16);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 250, 256, 6);
  });
}

function signTexture(text, bg, fg, sub) {
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(8, 8, 496, 112);
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 52px Georgia, serif';
    g.fillText(text, 256, sub ? 48 : 64);
    if (sub) {
      g.font = '24px Georgia, serif';
      g.fillText(sub, 256, 94);
    }
  });
}

// The whole street plan painted onto one big ground texture: asphalt,
// lane dashes, sidewalks and the block aprons.
function groundTexture() {
  const S = 2048, EXT = 270; // texture covers [-EXT, EXT] on both axes
  const toPx = (v) => (v + EXT) / (2 * EXT) * S;
  return canvasTexture(S, S, (g) => {
    g.fillStyle = '#8aa864'; g.fillRect(0, 0, S, S); // grass base
    // block aprons (sidewalk tone)
    g.fillStyle = '#b9b3a4';
    for (const cx of BLOCK_CENTRES) for (const cz of BLOCK_CENTRES) {
      g.fillRect(toPx(cx - 33), toPx(cz - 33), toPx(cx + 33) - toPx(cx - 33), toPx(cz + 33) - toPx(cz - 33));
    }
    // roads
    g.fillStyle = '#3c3f45';
    for (const r of ROADS) {
      g.fillRect(toPx(r - ROAD_HALF), 0, toPx(r + ROAD_HALF) - toPx(r - ROAD_HALF), S);
      g.fillRect(0, toPx(r - ROAD_HALF), S, toPx(r + ROAD_HALF) - toPx(r - ROAD_HALF));
    }
    // centre dashes
    g.fillStyle = '#e8c85a';
    for (const r of ROADS) {
      for (let v = -252; v < 252; v += 18) {
        if (ROADS.some((o) => Math.abs(v - o) < 12)) continue;
        g.fillRect(toPx(r) - 2, toPx(v), 4, toPx(v + 8) - toPx(v));
        g.fillRect(toPx(v), toPx(r) - 2, toPx(v + 8) - toPx(v), 4);
      }
    }
    // crosswalks at intersections
    g.fillStyle = 'rgba(240,240,240,0.75)';
    for (const rx of ROADS) for (const rz of ROADS) {
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        g.fillRect(toPx(rx + i * 2.6 - 1), toPx(rz - ROAD_HALF - 3.4), 2, 6);
        g.fillRect(toPx(rx + i * 2.6 - 1), toPx(rz + ROAD_HALF - 2.6), 2, 6);
        g.fillRect(toPx(rx - ROAD_HALF - 3.4), toPx(rz + i * 2.6 - 1), 6, 2);
        g.fillRect(toPx(rx + ROAD_HALF - 2.6), toPx(rz + i * 2.6 - 1), 6, 2);
      }
    }
  });
}

// ---------- small builders ----------

const boxGeoCache = new Map();
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function boxAt(parent, w, h, d, mat, x, y, z, ry = 0) {
  const m = box(w, h, d, mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  parent.add(m);
  return m;
}

function makePalm(rng, x, z, parent) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const lean = rng.range(-0.1, 0.1);
  let px = 0, py = 0;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.2 - i * 0.02, 1.6, 6), trunkMat);
    px += lean * 1.4; py += 1.5;
    seg.position.set(px, py, 0);
    seg.rotation.z = -lean;
    seg.castShadow = true;
    palm.add(seg);
  }
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3f, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.32, 3.4, 4), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(px + Math.cos(a) * 1.2, py + 0.75, Math.sin(a) * 1.2);
    leaf.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15);
    leaf.scale.y = 1; leaf.castShadow = true;
    palm.add(leaf);
  }
  palm.position.set(x, 0, z);
  parent.add(palm);
  addCollider(x, z, 0.35, 0.35);
}

function makeLamp(x, z, parent) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4f55 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), poleMat);
  pole.position.y = 2.8; pole.castShadow = true;
  g.add(pole);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe6a3, emissive: 0xffbe5a, emissiveIntensity: 0.7 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), headMat);
  head.position.y = 5.7;
  g.add(head);
  g.position.set(x, 0, z);
  parent.add(g);
  addCollider(x, z, 0.25, 0.25);
}

function makeSign(text, sub, bg, fg, w = 12) {
  const tex = signTexture(text, bg, fg, sub);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  return m;
}

function building(rng, parent, x, z, w, d, h, base, floors, cols) {
  const tex = facadeTexture(rng, base, floors, cols);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const b = boxAt(parent, w, h, d, mat, x, h / 2, z);
  const capMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
  boxAt(parent, w + 0.7, 0.7, d + 0.7, capMat, x, h + 0.3, z);
  if (rng.chance(0.6)) { // rooftop box: water tank / AC unit
    boxAt(parent, rng.range(2, 4), rng.range(1, 2), rng.range(2, 4), capMat,
      x + rng.range(-w / 4, w / 4), h + 1.2, z + rng.range(-d / 4, d / 4));
  }
  addCollider(x, z, w / 2, d / 2);
  return b;
}

// ---------- the world ----------

export function buildWorld(scene, rng) {
  const world = { animated: [] };

  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 190, 640);

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 1.9);
  sun.position.set(-260, 190, -140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  world.sun = sun;

  const city = new THREE.Group();
  scene.add(city);

  // ground with the painted street plan
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(540, 540),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  city.add(ground);

  // sand and sea to the east
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 720),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + 30, 0.02, 0);
  sand.receiveShadow = true;
  city.add(sand);

  const seaTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#2e7fa8'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const y = 14 + i * 28;
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.1 + i) * 3);
      g.stroke();
    }
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(10, 16);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 900),
    new THREE.MeshLambertMaterial({ map: seaTex }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SEA_X + 225, -0.25, 0);
  city.add(sea);
  world.animated.push((t) => { seaTex.offset.set(t * 0.008, t * 0.013); });

  buildLandmarks(scene, city, rng, world);
  buildGenericBlocks(city, rng);
  buildVegetationAndProps(city, rng, world);
  return world;
}

function buildGenericBlocks(city, rng) {
  const landmarkBlocks = new Set(['-144,144', '0,-144', '144,-144', '-72,-72', '72,72', '0,0']);
  const palette = ['#d9c8a9', '#c7d3d8', '#e3b7a0', '#b5c4b1', '#d8d2c4', '#c9b8d6', '#a8c8d8', '#e8dcc0'];
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      if (landmarkBlocks.has(cx + ',' + cz)) continue;
      const n = rng.int(2, 4);
      const spots = [
        [-14, -14], [14, -14], [-14, 14], [14, 14],
      ];
      for (let i = 0; i < n; i++) {
        const [ox, oz] = spots[(i + rng.int(0, 1)) % spots.length];
        const w = rng.range(15, 24), d = rng.range(15, 24);
        const tall = rng.chance(0.3);
        const h = tall ? rng.range(26, 44) : rng.range(9, 22);
        building(rng, city, cx + ox + rng.range(-2, 2), cz + oz + rng.range(-2, 2),
          w, d, h, rng.pick(palette), Math.max(3, Math.round(h / 3.4)), rng.int(4, 7));
      }
      // a parking row along the south curb of most blocks
      if (rng.chance(0.75)) {
        for (let i = 0; i < 3; i++) {
          parkingSpots.push({ x: cx - 16 + i * 13, z: cz + 30.5, heading: Math.PI / 2 });
        }
      }
    }
  }
  // curbside parking on the outer ring roads
  for (const r of [-180, 180]) {
    for (let v = -160; v <= 160; v += 26) {
      parkingSpots.push({ x: r + (r < 0 ? -9.5 : 9.5), z: v, heading: 0 });
      parkingSpots.push({ x: v, z: r + (r < 0 ? -9.5 : 9.5), heading: Math.PI / 2 });
    }
  }
}

function buildLandmarks(scene, city, rng, world) {
  const L = SPAWN;

  // --- Ríos Auto Works (garage), block (-144, 144) ---
  {
    const g = new THREE.Group(); city.add(g);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd86f3c });
    boxAt(g, 34, 9, 22, wallMat, L.garage.x, 4.5, L.garage.z - 8);
    addCollider(L.garage.x, L.garage.z - 8, 17, 11);
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x22262b });
    boxAt(g, 10, 6, 0.6, darkMat, L.garage.x - 8, 3, L.garage.z + 3.4); // bay doors
    boxAt(g, 10, 6, 0.6, darkMat, L.garage.x + 8, 3, L.garage.z + 3.4);
    const sign = makeSign('RÍOS AUTO WORKS', 'REPAIRS • TUNING • STORAGE', '#263238', '#ffb74d', 24);
    sign.position.set(L.garage.x, 10.6, L.garage.z + 3.6);
    g.add(sign);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x9a958a });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), padMat);
    pad.rotation.x = -Math.PI / 2; pad.position.set(L.garage.x, 0.04, L.garage.z + 16);
    pad.receiveShadow = true; g.add(pad);
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
    for (let i = 0; i < 3; i++) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 12), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(L.garage.x + 14, 0.5 + i * 0.05, L.garage.z + 12 + i * 0.2);
      tire.castShadow = true; g.add(tire);
    }
    parkingSpots.push({ x: L.garage.x - 10, z: L.garage.z + 16, heading: Math.PI });
    parkingSpots.push({ x: L.garage.x + 2, z: L.garage.z + 17, heading: Math.PI });
  }

  // --- Palmera Grand hotel, block (0, -144) ---
  {
    const g = new THREE.Group(); city.add(g);
    const tex = facadeTexture(rng, '#e8d9ae', 14, 6);
    const tower = boxAt(g, 24, 52, 24, new THREE.MeshLambertMaterial({ map: tex }), L.hotel.x, 26, L.hotel.z - 6);
    tower.castShadow = true;
    addCollider(L.hotel.x, L.hotel.z - 6, 12, 12);
    const sign = makeSign('PALMERA GRAND', 'HOTEL & CASINO', '#37474f', '#ffd54f', 20);
    sign.position.set(L.hotel.x, 55, L.hotel.z + 6.4);
    g.add(sign);
    const awningMat = new THREE.MeshLambertMaterial({ color: 0x8e2f32 });
    boxAt(g, 16, 0.6, 6, awningMat, L.hotel.x, 4.4, L.hotel.z + 9);
    parkingSpots.push({ x: L.hotel.x - 8, z: L.hotel.z + 16, heading: Math.PI });
    parkingSpots.push({ x: L.hotel.x + 8, z: L.hotel.z + 16, heading: Math.PI });
  }

  // --- Pier 9 warehouse, on the beach strip ---
  {
    const g = new THREE.Group(); city.add(g);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x7d8a96 });
    boxAt(g, 16, 10, 34, wallMat, L.pier9.x, 5, L.pier9.z);
    addCollider(L.pier9.x, L.pier9.z, 8, 17);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x546e7a });
    boxAt(g, 17.5, 0.8, 35.5, roofMat, L.pier9.x, 10.4, L.pier9.z);
    const sign = makeSign('PIER 9', 'STORAGE CO.', '#37474f', '#eceff1', 11);
    sign.position.set(L.pier9.x - 8.4, 7.5, L.pier9.z);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9834f });
    for (let i = 0; i < 5; i++) {
      const cx = L.pier9.x - 12 + rng.range(-2, 2), cz = L.pier9.z - 12 + i * 6;
      boxAt(g, 2.6, 2.6, 2.6, crateMat, cx, 1.3, cz, rng.range(0, 0.6));
      addCollider(cx, cz, 1.5, 1.5);
    }
  }

  // --- Vista Heights mansion, block (144, -144) ---
  {
    const g = new THREE.Group(); city.add(g);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    boxAt(g, 26, 8, 18, wallMat, L.mansion.x, 4, L.mansion.z - 4);
    addCollider(L.mansion.x, L.mansion.z - 4, 13, 9);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xa34a3a });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(19, 7, 4), roofMat);
    roof.position.set(L.mansion.x, 11.5, L.mansion.z - 4);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.72);
    roof.castShadow = true;
    g.add(roof);
    const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x3e7d3a });
    boxAt(g, 30, 1.6, 1.2, hedgeMat, L.mansion.x, 0.8, L.mansion.z + 14);
    boxAt(g, 1.2, 1.6, 24, hedgeMat, L.mansion.x - 16, 0.8, L.mansion.z + 2);
    boxAt(g, 1.2, 1.6, 24, hedgeMat, L.mansion.x + 16, 0.8, L.mansion.z + 2);
    addCollider(L.mansion.x, L.mansion.z + 14, 15, 0.8);
    const driveMat = new THREE.MeshLambertMaterial({ color: 0xcac0aa });
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(10, 22), driveMat);
    drive.rotation.x = -Math.PI / 2;
    drive.position.set(L.mansion.x + 6, 0.04, L.mansion.z + 16);
    drive.receiveShadow = true; g.add(drive);
    parkingSpots.push({ x: L.mansion.x + 6, z: L.mansion.z + 12, heading: Math.PI });
  }

  // --- Hospital, block (-72, -72) ---
  {
    const g = new THREE.Group(); city.add(g);
    const tex = facadeTexture(rng, '#eef1f2', 6, 7);
    boxAt(g, 30, 20, 20, new THREE.MeshLambertMaterial({ map: tex }), L.hospital.x, 10, L.hospital.z - 8);
    addCollider(L.hospital.x, L.hospital.z - 8, 15, 10);
    const sign = makeSign('HOSPITAL', 'PALMERA GENERAL', '#eceff1', '#c62828', 15);
    sign.position.set(L.hospital.x, 22.5, L.hospital.z + 2.4);
    g.add(sign);
    const crossMat = new THREE.MeshLambertMaterial({ color: 0xc62828 });
    boxAt(g, 1.2, 4, 0.4, crossMat, L.hospital.x + 10, 17, L.hospital.z + 2.3);
    boxAt(g, 4, 1.2, 0.4, crossMat, L.hospital.x + 10, 17, L.hospital.z + 2.3);
  }

  // --- Police station, block (72, 72) ---
  {
    const g = new THREE.Group(); city.add(g);
    const tex = facadeTexture(rng, '#5b7a99', 4, 6);
    boxAt(g, 30, 13, 20, new THREE.MeshLambertMaterial({ map: tex }), L.station.x, 6.5, L.station.z - 10);
    addCollider(L.station.x, L.station.z - 10, 15, 10);
    const sign = makeSign('PALMERA PD', 'POLICE DEPARTMENT', '#1a2f45', '#eceff1', 16);
    sign.position.set(L.station.x, 15, L.station.z + 0.4);
    g.add(sign);
    parkingSpots.push({ x: L.station.x - 9, z: L.station.z + 8, heading: Math.PI });
    parkingSpots.push({ x: L.station.x + 0, z: L.station.z + 8, heading: Math.PI });
    parkingSpots.push({ x: L.station.x + 9, z: L.station.z + 8, heading: Math.PI });
  }

  // --- Marina: boardwalk, pier, boats ---
  {
    const g = new THREE.Group(); city.add(g);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
    const walk = boxAt(g, 7, 0.5, 190, woodMat, 234, 0.25, 10);
    walk.castShadow = false;
    const pier = boxAt(g, 56, 0.5, 9, woodMat, SEA_X + 24, 0.25, L.marina.z);
    pier.castShadow = false;
    for (let x = SEA_X + 2; x < SEA_X + 50; x += 8) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 6), woodMat);
      post.position.set(x, -0.6, L.marina.z - 4.2); g.add(post);
      const post2 = post.clone(); post2.position.z = L.marina.z + 4.2; g.add(post2);
    }
    const sign = makeSign('PALMERA MARINA', 'BOATS • BAIT • CHARTERS', '#274156', '#ffd54f', 13);
    sign.position.set(228, 5.4, L.marina.z - 14);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6d543a });
    for (const dz of [-16, -12]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.6, 6), postMat);
      p.position.set(228, 2.8, L.marina.z + dz); g.add(p);
      addCollider(228, L.marina.z + dz, 0.3, 0.3);
    }
    // little boats bobbing by the pier
    const hullCols = [0xe8e3d8, 0xc65b4e, 0x4e7fc6, 0xe0a83c];
    for (let i = 0; i < 4; i++) {
      const boat = new THREE.Group();
      const hull = boxAt(boat, 5.5, 1.1, 2, new THREE.MeshLambertMaterial({ color: hullCols[i] }), 0, 0.4, 0);
      hull.castShadow = false;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 5), postMat);
      mast.position.y = 3.4; boat.add(mast);
      const bx = SEA_X + 12 + (i % 2) * 16, bz = L.marina.z - 12 + i * 9;
      boat.position.set(bx, -0.2, bz);
      boat.rotation.y = rng.range(-0.3, 0.3);
      g.add(boat);
      world.animated.push((t) => {
        boat.position.y = -0.2 + Math.sin(t * 1.3 + i * 1.7) * 0.16;
        boat.rotation.z = Math.sin(t * 0.9 + i) * 0.03;
      });
    }
  }
}

function buildVegetationAndProps(city, rng, world) {
  // plaza with a fountain on the centre block (0, 0)
  {
    const plazaMat = new THREE.MeshLambertMaterial({ color: COLORS.plaza });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(26, 28), plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.05, 0);
    plaza.receiveShadow = true;
    city.add(plaza);
    const basinMat = new THREE.MeshLambertMaterial({ color: 0x8d99a6 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 1.1, 18), basinMat);
    basin.position.set(0, 0.55, 0); basin.castShadow = true;
    city.add(basin);
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x3f9ec6, transparent: true, opacity: 0.85 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.3, 18), waterMat);
    water.position.set(0, 1.05, 0);
    city.add(water);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 3.4, 10), basinMat);
    column.position.set(0, 2.4, 0); column.castShadow = true;
    city.add(column);
    const sprayMat = new THREE.MeshLambertMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.55 });
    const spray = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 12, 1, true), sprayMat);
    spray.position.set(0, 5, 0);
    city.add(spray);
    world.animated.push((t) => {
      spray.scale.set(1 + Math.sin(t * 6) * 0.06, 1 + Math.sin(t * 8.3) * 0.1, 1 + Math.cos(t * 5.1) * 0.06);
      spray.rotation.y = t * 0.7;
    });
    addCollider(0, 0, 7, 7);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      makePalm(rng, Math.cos(a) * 17, Math.sin(a) * 17, city);
    }
  }

  // palms along sidewalks, the beach and the plaza corners
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      if (rng.chance(0.8)) makePalm(rng, cx - 31 + rng.range(-1, 1), cz - 31 + rng.range(-1, 1), city);
      if (rng.chance(0.5)) makePalm(rng, cx + 31, cz + 31, city);
    }
  }
  for (let z = -200; z <= 200; z += 26) {
    if (rng.chance(0.75)) makePalm(rng, 222 + rng.range(-2, 2), z + rng.range(-4, 4), city);
  }

  // lamps at intersections
  for (const rx of ROADS) for (const rz of ROADS) {
    makeLamp(rx + ROAD_HALF + 1.2, rz + ROAD_HALF + 1.2, city);
    makeLamp(rx - ROAD_HALF - 1.2, rz - ROAD_HALF - 1.2, city);
  }

  // crates and barriers near the warehouse and around roadworks
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9834f });
  for (let i = 0; i < 8; i++) {
    const cx = rng.range(-200, 200), cz = rng.pick(ROADS) + (rng.chance(0.5) ? 10.5 : -10.5);
    boxAt(city, 2.2, 2.2, 2.2, crateMat, cx, 1.1, cz, rng.range(0, 1));
    addCollider(cx, cz, 1.3, 1.3);
  }
}
