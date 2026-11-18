// vehicles.js — the cars of Palmera Bay: how they look (boxy low-poly
// bodies, painted in the city palette), the named models, and the arcade
// driving physics shared by the player, the traffic and the police.

import * as THREE from 'three';
import { CAR } from './config.js';

export const CAR_MODELS = {
  palma:   { name: 'Palma Sedan',   topSpeed: 30, accel: 13, colors: [0xc0c6cc, 0x7a8894, 0x94553f, 0x4f6f8f, 0xd8d3c3] },
  crucero: { name: 'Crucero Hatch', topSpeed: 28, accel: 12, colors: [0xb84a39, 0x3f7d5a, 0xd8a03c, 0x707880] },
  brava:   { name: 'Brava Pickup',  topSpeed: 27, accel: 12, colors: [0x8a4f2c, 0x5d6d4e, 0x9aa0a4] },
  solana:  { name: 'Solana Cabrio', topSpeed: 33, accel: 15, colors: [0xe3e0d5, 0xc65b4e, 0x3f6f9f] },
  comet:   { name: 'Comet GT',      topSpeed: 37, accel: 18, colors: [0xd8483c] },
  azul:    { name: 'Azul RS',       topSpeed: 39, accel: 19, colors: [0x1450c8] },
  cruiser: { name: 'Interceptor',   topSpeed: 36, accel: 17, colors: [0xf0f2f4] },
};

let smokeGroup = null;
const puffs = [];

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(70,70,70,0.55)');
  grad.addColorStop(1, 'rgba(70,70,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}
let smokeTex = null;

function buildCarMesh(modelKey, color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x22384a });

  const isPickup = modelKey === 'brava';
  const isSport = modelKey === 'comet' || modelKey === 'azul';

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, isSport ? 0.52 : 0.62, 4.3), paint);
  body.position.y = isSport ? 0.52 : 0.62;
  body.castShadow = true;
  group.add(body);

  if (isPickup) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 1.5), paint);
    cab.position.set(0, 1.2, 0.55); cab.castShadow = true; group.add(cab);
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.4, 1.2), glass);
    cabGlass.position.set(0, 1.24, 0.55); group.add(cabGlass);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.9), dark);
    bed.position.set(0, 0.95, -1.15); group.add(bed);
  } else {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.62, 0.5, isSport ? 1.7 : 2.1), glass);
    cabin.position.set(0, isSport ? 0.95 : 1.12, isSport ? -0.25 : -0.1);
    cabin.castShadow = true;
    group.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.09, isSport ? 1.5 : 1.9), paint);
    roof.position.set(0, isSport ? 1.22 : 1.4, isSport ? -0.25 : -0.1);
    group.add(roof);
  }

  // lights
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 0.55 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xa02020, emissive: 0x7a1010, emissiveIntensity: 0.5 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), headMat);
    h.position.set(sx, 0.66, 2.16); group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailMat);
    t.position.set(sx, 0.7, -2.16); group.add(t);
  }

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push({ pivot, wheel, front: wz > 0 });
  }

  let lightBar = null;
  if (isPolice) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), dark);
    barBase.position.set(0, 1.52, -0.1);
    group.add(barBase);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 1 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2a5aff, emissive: 0x2040ff, emissiveIntensity: 1 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.42), redMat);
    red.position.set(-0.33, 1.66, -0.1); group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.42), blueMat);
    blue.position.set(0.33, 1.66, -0.1); group.add(blue);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.3, 4.32),
      new THREE.MeshLambertMaterial({ color: 0x1a2f45 }));
    stripe.position.y = 0.6; group.add(stripe);
    lightBar = { redMat, blueMat };
  }

  return { group, wheels, lightBar };
}

export function createCar(scene, modelKey, opts = {}) {
  const model = CAR_MODELS[modelKey];
  const color = opts.color !== undefined ? opts.color : model.colors[0];
  const { group, wheels, lightBar } = buildCarMesh(modelKey, color, !!opts.police);
  group.position.set(opts.x || 0, 0, opts.z || 0);
  scene.add(group);
  const car = {
    model: modelKey,
    modelName: model.name,
    mesh: group,
    wheels,
    lightBar,
    heading: opts.heading || 0,
    speed: 0,
    steerVis: 0,
    health: CAR.maxHealth,
    wrecked: false,
    police: !!opts.police,
    driver: opts.driver || 'parked', // parked | traffic | police | player
    smokeTimer: 0,
    flashPhase: Math.random() * 6,
  };
  group.rotation.y = car.heading;
  return car;
}

export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

// Arcade car physics: one step. ctrl = { throttle -1..1, steer -1..1, handbrake }
export function stepCarPhysics(car, ctrl, dt) {
  if (car.wrecked) {
    car.speed = THREE.MathUtils.damp(car.speed, 0, 4, dt);
    moveCar(car, dt);
    return;
  }
  const model = CAR_MODELS[car.model];
  const topSpeed = model.topSpeed * (0.45 + 0.55 * (car.health / CAR.maxHealth));
  const throttle = THREE.MathUtils.clamp(ctrl.throttle, -1, 1);

  if (throttle > 0) {
    car.speed += model.accel * throttle * dt * (car.speed < 0 ? 2.4 : 1);
  } else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;              // braking
    else car.speed = Math.max(car.speed + model.accel * throttle * dt, -CAR.maxReverse);
  }
  car.speed -= car.speed * CAR.drag * dt * 0.35;
  if (!ctrl.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 0.6 * dt);
  car.speed = THREE.MathUtils.clamp(car.speed, -CAR.maxReverse, topSpeed);

  const speedRatio = THREE.MathUtils.clamp(Math.abs(car.speed) / 12, 0, 1);
  const steerTarget = THREE.MathUtils.clamp(ctrl.steer, -1, 1) * (ctrl.handbrake ? 1.25 : 1);
  car.steerVis = THREE.MathUtils.damp(car.steerVis, steerTarget, 10, dt);
  const turn = car.steerVis * CAR.gripTurn * speedRatio * (ctrl.handbrake ? 1.5 : 1);
  car.heading += turn * dt * (car.speed < 0 ? -1 : 1);

  moveCar(car, dt);

  // wheel visuals
  const spin = car.speed * dt / 0.36;
  for (const w of car.wheels) {
    w.wheel.rotation.x += spin;
    if (w.front) w.pivot.rotation.y = car.steerVis * 0.42;
  }
}

function moveCar(car, dt) {
  const f = forwardOf(car.heading);
  car.mesh.position.x += f.x * car.speed * dt;
  car.mesh.position.z += f.z * car.speed * dt;
  car.mesh.rotation.y = car.heading;
  // a little body roll and pitch for feel
  car.mesh.rotation.z = THREE.MathUtils.damp(car.mesh.rotation.z, -car.steerVis * Math.min(0.06, Math.abs(car.speed) * 0.0022), 8, dt);
}

export function damageCar(car, amount) {
  if (car.wrecked) return;
  car.health = Math.max(0, car.health - amount);
  if (car.health <= 0) car.wrecked = true;
}

// Smoke (and fire, when wrecked) puffs for damaged cars.
export function updateVehicleEffects(scene, cars, dt) {
  if (!smokeGroup) {
    smokeGroup = new THREE.Group();
    smokeTex = smokeTexture();
    scene.add(smokeGroup);
  }
  for (const car of cars) {
    if (car.health < 55 || car.wrecked) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = car.wrecked ? 0.07 : 0.22;
        const mat = new THREE.SpriteMaterial({
          map: smokeTex, transparent: true, depthWrite: false,
          color: car.wrecked ? 0xd8732c : 0xffffff,
        });
        const s = new THREE.Sprite(mat);
        const p = car.mesh.position;
        s.position.set(p.x + (Math.random() - 0.5) * 0.6, 1.2, p.z + (Math.random() - 0.5) * 0.6);
        s.scale.setScalar(0.7);
        smokeGroup.add(s);
        puffs.push({ s, life: 0, max: 1.1 + Math.random() * 0.5 });
      }
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life += dt;
    const k = p.life / p.max;
    p.s.position.y += dt * 2.2;
    p.s.scale.setScalar(0.7 + k * 2.4);
    p.s.material.opacity = 0.6 * (1 - k);
    if (k >= 1) {
      smokeGroup.remove(p.s);
      p.s.material.dispose();
      puffs.splice(i, 1);
    }
  }
}

// Flash a police light bar red/blue in turn.
export function updateLightBar(car, t) {
  if (!car.lightBar) return;
  const on = Math.sin(t * 11 + car.flashPhase) > 0;
  car.lightBar.redMat.emissiveIntensity = on ? 2.2 : 0.15;
  car.lightBar.blueMat.emissiveIntensity = on ? 0.15 : 2.2;
}
