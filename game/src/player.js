// player.js — Dani Marrero: on-foot movement with a mouse-look camera,
// getting in and out of cars, driving them, and the pistol — a hitscan
// shot with a tracer that pedestrians and cars both feel.

import * as THREE from 'three';
import { PLAYER, CAR } from './config.js';
import { pressed, consumeMouse } from './input.js';
import { createPerson, knockDown } from './pedestrians.js';
import { stepCarPhysics, damageCar, forwardOf } from './vehicles.js';
import { resolveCollisions } from './world.js';
import { addHeat } from './police.js';

export class Player {
  constructor(scene, rng) {
    this.person = createPerson(scene, rng, {
      x: 0, z: 0, shirt: 0x207a78, pants: 0x2e2a26, skin: 0xc68863, hair: 0x1d150e, npc: true,
    });
    this.mesh = this.person.mesh;
    this.heading = Math.PI; // face the garage forecourt at spawn
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.car = null;
    this.health = PLAYER.maxHealth;
    this.fireTimer = 0;
    this.sinceDamage = 99;
    this.walkPhase = 0;
    this.tracers = [];
    this.scene = scene;
  }

  get pos() { return this.mesh.position; }
  get inCar() { return !!this.car; }
  get speed() { return this.car ? this.car.speed : (this.moveSpeed || 0); }

  place(x, z, heading = this.heading) {
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.camYaw = heading;
    this.mesh.rotation.y = heading;
  }

  enterCar(car) {
    this.car = car;
    car.driver = 'player';
    car.speed = 0;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.car) return null;
    const car = this.car;
    this.car = null;
    car.driver = 'parked';
    const right = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.mesh.position.set(
      car.mesh.position.x + right.x * 2.4, 0,
      car.mesh.position.z + right.z * 2.4);
    resolveCollisions(this.mesh.position, PLAYER.radius);
    this.mesh.visible = true;
    this.heading = car.heading;
    this.camYaw = car.heading;
    return car;
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    this.sinceDamage = 0;
  }

  // The per-frame update. ctx carries the world the player acts on.
  update(dt, ctx) {
    const m = consumeMouse();
    this.sinceDamage += dt;
    if (this.health > 0 && this.health < PLAYER.maxHealth && this.sinceDamage > PLAYER.regenDelay) {
      this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.regenRate * dt);
    }
    this.fireTimer -= dt;
    this.updateTracers(dt);
    if (this.car) this.updateDriving(dt, m, ctx);
    else this.updateOnFoot(dt, m, ctx);
  }

  updateOnFoot(dt, m, ctx) {
    this.camYaw -= m.dx * 0.0026;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + m.dy * 0.0022, -0.15, 1.0);

    let ix = 0, iz = 0;
    if (pressed('KeyW') || pressed('ArrowUp')) iz += 1;
    if (pressed('KeyS') || pressed('ArrowDown')) iz -= 1;
    if (pressed('KeyA') || pressed('ArrowLeft')) ix -= 1;
    if (pressed('KeyD') || pressed('ArrowRight')) ix += 1;
    const sprint = pressed('ShiftLeft') || pressed('ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    // forward is (sin, cos); screen-right is (-cos, sin)
    const mx = (sin * iz - cos * ix);
    const mz = (cos * iz + sin * ix);
    const len = Math.hypot(mx, mz);
    this.moveSpeed = len > 0.01 ? speed : 0;
    if (len > 0.01) {
      const nx = mx / len, nz = mz / len;
      this.pos.x += nx * speed * dt;
      this.pos.z += nz * speed * dt;
      this.heading = Math.atan2(nx, nz);
    }
    resolveCollisions(this.pos, PLAYER.radius);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -250, 330);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -250, 250);

    // limbs + facing
    this.walkPhase += dt * (this.moveSpeed > 0.2 ? 9 : 0);
    const swing = this.moveSpeed > 0.2 ? Math.sin(this.walkPhase) * 0.55 : 0;
    const P = this.person.parts;
    P.legL.rotation.x = swing; P.legR.rotation.x = -swing;
    P.armL.rotation.x = -swing * 0.7; P.armR.rotation.x = swing * 0.7;
    this.mesh.position.y = this.moveSpeed > 0.2 ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0;
    // face the camera direction when firing, else the move direction
    const face = ctx.firing ? this.camYaw : this.heading;
    this.mesh.rotation.y = face;

    // camera: behind and above, looking at the chest
    const dist = 6.4;
    const cx = this.pos.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.pos.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = 1.6 + Math.sin(this.camPitch) * dist;
    ctx.camera.position.set(cx, Math.max(0.7, cy), cz);
    ctx.camera.lookAt(this.pos.x, 1.45, this.pos.z);
  }

  updateDriving(dt, m, ctx) {
    const car = this.car;
    if (this.autoDrive) {
      // a staged scene drives the car (shots.js); just work the camera
      this.camYaw = car.heading;
      const dist = 9.6;
      const cx = car.mesh.position.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
      const cz = car.mesh.position.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
      const cy = 2.2 + Math.sin(this.camPitch) * dist;
      ctx.camera.position.set(cx, Math.max(1, cy), cz);
      ctx.camera.lookAt(car.mesh.position.x, 1.6, car.mesh.position.z);
      this.heading = car.heading;
      return;
    }
    // free-look offset that eases back to the car's heading
    this.camYaw -= m.dx * 0.003;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + m.dy * 0.002, 0.05, 0.9);
    let diff = car.heading - this.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camYaw += diff * Math.min(1, dt * (Math.abs(car.speed) > 3 ? 3.2 : 0.8));

    const ctrl = {
      throttle: (pressed('KeyW') || pressed('ArrowUp') ? 1 : 0) + (pressed('KeyS') || pressed('ArrowDown') ? -1 : 0),
      steer: (pressed('KeyA') || pressed('ArrowLeft') ? 1 : 0) + (pressed('KeyD') || pressed('ArrowRight') ? -1 : 0),
      handbrake: pressed('Space'),
    };
    stepCarPhysics(car, ctrl, dt);
    this.heading = car.heading;

    const dist = 9.6;
    const cx = car.mesh.position.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = car.mesh.position.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = 2.2 + Math.sin(this.camPitch) * dist;
    ctx.camera.position.set(cx, Math.max(1, cy), cz);
    ctx.camera.lookAt(car.mesh.position.x, 1.6, car.mesh.position.z);
  }

  // One pistol shot toward the camera's centre. Returns what was hit.
  shoot(ctx) {
    if (this.fireTimer > 0 || this.inCar) return null;
    this.fireTimer = 0.14;
    ctx.audio.gunshot();
    addHeat(ctx.wanted, 8);

    const cam = ctx.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const from = this.pos.clone(); from.y = 1.42;

    let bestT = 70;
    let hitKind = null;
    let hitRef = null;
    // pedestrians: a chest-high sphere test
    for (const ped of ctx.peds) {
      if (ped.state === 'down') continue;
      const c = ped.mesh.position.clone(); c.y = 1.15;
      const t = raySphere(origin, dir, c, 0.75);
      if (t !== null && t < bestT) { bestT = t; hitKind = 'ped'; hitRef = ped; }
    }
    // cars: a generous sphere over the body
    for (const car of ctx.cars) {
      if (car === this.car) continue;
      const c = car.mesh.position.clone(); c.y = 0.8;
      const t = raySphere(origin, dir, c, 2.3);
      if (t !== null && t < bestT) { bestT = t; hitKind = 'car'; hitRef = car; }
    }

    const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
    this.spawnTracer(from, end);

    if (hitKind === 'ped') {
      knockDown(hitRef);
      hitRef.downTimer = 16;
      addHeat(ctx.wanted, 22);
      ctx.onPedShot && ctx.onPedShot(hitRef);
    } else if (hitKind === 'car') {
      damageCar(hitRef, 14);
      if (hitRef.police) addHeat(ctx.wanted, 18);
    }
    return hitKind;
  }

  spawnTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.95,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.09) * 0.95;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}

function raySphere(origin, dir, centre, radius) {
  const ox = centre.x - origin.x, oy = centre.y - origin.y, oz = centre.z - origin.z;
  const t = ox * dir.x + oy * dir.y + oz * dir.z;
  if (t < 0) return null;
  const d2 = ox * ox + oy * oy + oz * oz - t * t;
  if (d2 > radius * radius) return null;
  return t;
}

export { forwardOf };
