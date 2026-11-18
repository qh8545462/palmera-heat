// pedestrians.js — the people of Palmera Bay: low-poly walkers looping the
// sidewalk rings around each block. They stroll, they flee from danger,
// and they go down when a car or a bullet finds them.

import * as THREE from 'three';
import { BLOCK_CENTRES } from './config.js';
import { resolveCollisions } from './world.js';

const SKIN = [0xe8b98d, 0xc68863, 0x8d5a3b, 0xf0c8a0, 0x6e442a];
const SHIRTS = [0xd95f4b, 0x4b7fd9, 0x53a06a, 0xe0b83c, 0xe8e3d8, 0x9a6fc0, 0x3fa8a0, 0xd97fb0];
const PANTS = [0x3a4453, 0x6b5136, 0x2e2e33, 0x7a7f85, 0x54486e];

function buildPerson(rng, opts = {}) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin || rng.pick(SKIN) });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt || rng.pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants || rng.pick(PANTS) });

  function limb(mat, w, h, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  }
  const legL = limb(pants, 0.17, 0.8, -0.13, 0.82, 0);
  const legR = limb(pants, 0.17, 0.8, 0.13, 0.82, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.3), shirt);
  torso.position.y = 1.16; torso.castShadow = true;
  group.add(torso);
  const armL = limb(shirt, 0.13, 0.66, -0.35, 1.46, 0);
  const armR = limb(shirt, 0.13, 0.66, 0.35, 1.46, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), skin);
  head.position.y = 1.72; head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.12, 0.37),
    new THREE.MeshLambertMaterial({ color: opts.hair || rng.pick([0x2a1e14, 0x4a3220, 0x8a6b46, 0xd8cfc0, 0x14161c]) }));
  hair.position.y = 1.94;
  group.add(hair);

  return { group, legL, legR, armL, armR };
}

export function createPerson(scene, rng, opts = {}) {
  const parts = buildPerson(rng, opts);
  parts.group.position.set(opts.x || 0, 0, opts.z || 0);
  scene.add(parts.group);
  return {
    mesh: parts.group,
    parts,
    heading: opts.heading || 0,
    state: 'walk', // walk | flee | down | stand
    corner: 0,
    blockCx: 0, blockCz: 0,
    ringDir: 1,
    speed: 0,
    phase: Math.random() * 6,
    downTimer: 0,
    fleeTimer: 0,
    fleeFrom: { x: 0, z: 0 },
    isNpc: !!opts.npc,
    name: opts.name || '',
  };
}

const RING_HALF = 30.5;
function cornerOf(ped, idx) {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]][idx % 4];
  return { x: ped.blockCx + c[0] * RING_HALF, z: ped.blockCz + c[1] * RING_HALF };
}

export function createCrowd(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const ped = createPerson(scene, rng, {});
    ped.blockCx = rng.pick(BLOCK_CENTRES);
    ped.blockCz = rng.pick(BLOCK_CENTRES);
    ped.corner = rng.int(0, 3);
    ped.ringDir = rng.chance(0.5) ? 1 : -1;
    const start = cornerOf(ped, ped.corner);
    ped.mesh.position.set(
      start.x + rng.range(-8, 8), 0, start.z + rng.range(-8, 8));
    ped.heading = rng.range(0, Math.PI * 2);
    peds.push(ped);
  }
  return peds;
}

export function knockDown(ped, stayDown = false) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downTimer = stayDown ? 9999 : 7;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.25;
}

export function scarePed(ped, fromX, fromZ, seconds = 3.5) {
  if (ped.state === 'down' || ped.isNpc) return;
  ped.state = 'flee';
  ped.fleeTimer = seconds;
  ped.fleeFrom.x = fromX; ped.fleeFrom.z = fromZ;
}

export function updatePedestrians(peds, danger, dt) {
  for (const ped of peds) {
    const pos = ped.mesh.position;
    if (ped.state === 'down') {
      if (ped.downTimer < 9000) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
        }
      }
      continue;
    }
    if (ped.state === 'stand') {
      animate(ped, 0, dt);
      ped.mesh.rotation.y = ped.heading;
      continue;
    }

    // react to danger: a fast car, a chase, gunfire nearby
    if (danger) {
      const dx = pos.x - danger.x, dz = pos.z - danger.z;
      if (dx * dx + dz * dz < danger.radius * danger.radius) {
        scarePed(ped, danger.x, danger.z, 2.5);
      }
    }

    let targetSpeed = 1.9;
    let tx, tz;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      const dx = pos.x - ped.fleeFrom.x, dz = pos.z - ped.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      tx = pos.x + (dx / len) * 10; tz = pos.z + (dz / len) * 10;
      targetSpeed = 6.4;
    } else {
      const corner = cornerOf(ped, ped.corner);
      tx = corner.x; tz = corner.z;
      const dx = tx - pos.x, dz = tz - pos.z;
      if (dx * dx + dz * dz < 1.4) {
        ped.corner = (ped.corner + ped.ringDir + 4) % 4;
      }
    }

    const dx = tx - pos.x, dz = tz - pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx / dist, dz / dist);
    let diff = want - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += THREE.MathUtils.clamp(diff, -6 * dt, 6 * dt);
    ped.speed = THREE.MathUtils.damp(ped.speed || 0, targetSpeed, 6, dt);
    pos.x += Math.sin(ped.heading) * ped.speed * dt;
    pos.z += Math.cos(ped.heading) * ped.speed * dt;
    if (!ped.isNpc) resolveCollisions(pos, 0.4);
    ped.mesh.rotation.y = ped.heading;
    animate(ped, ped.speed, dt);
  }
}

function animate(ped, speed, dt) {
  ped.phase += dt * (2 + speed * 1.9);
  const swing = Math.min(0.6, speed * 0.16) * Math.sin(ped.phase);
  ped.parts.legL.rotation.x = swing;
  ped.parts.legR.rotation.x = -swing;
  ped.parts.armL.rotation.x = -swing * 0.8;
  ped.parts.armR.rotation.x = swing * 0.8;
  ped.mesh.position.y = speed > 0.2 ? Math.abs(Math.sin(ped.phase)) * 0.05 : 0;
}
