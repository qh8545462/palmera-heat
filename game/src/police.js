// police.js — the Palmera PD: the wanted system (heat, stars, going
// unseen to cool off, the BUSTED meter) and the cruiser AI that spawns on
// the ring roads, chases, rams and searches the last place it saw you.

import * as THREE from 'three';
import { ROADS, WANTED } from './config.js';
import { createCar, stepCarPhysics, updateLightBar, forwardOf } from './vehicles.js';
import { resolveCollisions } from './world.js';

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    unseenTime: 0,
    seen: false,
    bustedMeter: 0,
  };
}

export function addHeat(wanted, amount) {
  wanted.heat = Math.min(WANTED.heatPerStar * WANTED.maxStars, wanted.heat + amount);
}

export function setStars(wanted, stars) {
  wanted.heat = Math.max(wanted.heat, stars * WANTED.heatPerStar);
}

export function clearHeat(wanted) {
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.bustedMeter = 0;
  wanted.unseenTime = 0;
}

function refreshStars(wanted) {
  wanted.stars = wanted.heat <= 0 ? 0
    : Math.min(WANTED.maxStars, Math.ceil(wanted.heat / WANTED.heatPerStar));
}

// dt step: cools the heat while no cruiser can see the player.
export function updateWanted(wanted, dt, seen) {
  wanted.seen = seen;
  if (seen) {
    wanted.unseenTime = 0;
  } else if (wanted.heat > 0) {
    wanted.unseenTime += dt;
    const drain = (WANTED.heatPerStar / WANTED.drainSecondsPerStar) * dt;
    wanted.heat = Math.max(0, wanted.heat - drain);
  }
  refreshStars(wanted);
}

export class Police {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cruisers = []; // { car, state, stuckTime, reverseTime, searchTarget }
    this.lastKnown = { x: 0, z: 0 };
    this.spawnTimer = 0;
  }

  desiredCount(stars) {
    return stars <= 0 ? 0 : Math.min(2 + stars, 6);
  }

  spawnCruiser(playerPos) {
    // on a ring road, 80–170 m from the player, never on top of them
    for (let tries = 0; tries < 14; tries++) {
      const vertical = this.rng.chance(0.5);
      const road = this.rng.pick(ROADS);
      const along = THREE.MathUtils.clamp(
        (vertical ? playerPos.z : playerPos.x) + this.rng.range(-150, 150), -205, 205);
      const x = vertical ? road : along;
      const z = vertical ? along : road;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d < 78 || d > 172) continue;
      const heading = Math.atan2(playerPos.x - x, playerPos.z - z);
      const car = createCar(this.scene, 'cruiser', { x, z, heading, police: true, driver: 'police' });
      this.cruisers.push({ car, stuckTime: 0, reverseTime: 0, wander: 0, tx: x, tz: z });
      return car;
    }
    return null;
  }

  removeCruiser(entry) {
    this.scene.remove(entry.car.mesh);
    const i = this.cruisers.indexOf(entry);
    if (i >= 0) this.cruisers.splice(i, 1);
  }

  clearAll() {
    while (this.cruisers.length) this.removeCruiser(this.cruisers[0]);
  }

  // player: { x, z, speed, onFoot } — returns { seen, nearest, busted }
  update(dt, wanted, player, t) {
    const want = this.desiredCount(wanted.stars);
    this.spawnTimer -= dt;
    if (this.cruisers.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 1.1;
      this.spawnCruiser(player);
    }
    if (wanted.stars <= 0) {
      // stand down: cruisers far away leave the world
      for (let i = this.cruisers.length - 1; i >= 0; i--) {
        const c = this.cruisers[i];
        const d = Math.hypot(c.car.mesh.position.x - player.x, c.car.mesh.position.z - player.z);
        if (d > 120) this.removeCruiser(c);
      }
    }

    let seen = false;
    let nearest = Infinity;
    for (const entry of this.cruisers) {
      const car = entry.car;
      updateLightBar(car, t);
      const pos = car.mesh.position;
      const dist = Math.hypot(pos.x - player.x, pos.z - player.z);
      nearest = Math.min(nearest, dist);
      const canSee = dist < WANTED.sightRange;
      if (canSee) {
        seen = true;
        this.lastKnown.x = player.x; this.lastKnown.z = player.z;
      }
      if (dist > 320 && wanted.stars > 0) {
        // too far to matter: jump it back onto the ring near the player
        this.removeCruiser(entry);
        continue;
      }

      // target: the player when seen, else the last known spot, else wander
      let tx, tz, topSpeed;
      if (canSee) {
        const lead = Math.min(0.6, dist / 60);
        tx = player.x + Math.sin(player.heading || 0) * player.speed * lead;
        tz = player.z + Math.cos(player.heading || 0) * player.speed * lead;
        topSpeed = 1;
      } else if (wanted.stars > 0) {
        entry.wander -= dt;
        if (entry.wander <= 0) {
          entry.wander = 4;
          entry.tx = this.lastKnown.x + this.rng.range(-30, 30);
          entry.tz = this.lastKnown.z + this.rng.range(-30, 30);
        }
        tx = entry.tx; tz = entry.tz;
        topSpeed = 0.62;
      } else {
        tx = pos.x + Math.sin(car.heading) * 20;
        tz = pos.z + Math.cos(car.heading) * 20;
        topSpeed = 0.4;
      }

      // steering: pure pursuit toward the target point
      const f = forwardOf(car.heading);
      const dx = tx - pos.x, dz = tz - pos.z;
      const localX = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
      const localZ = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      const angle = Math.atan2(localX, localZ);
      let steer = THREE.MathUtils.clamp(angle * 1.8, -1, 1);
      let throttle = 0;

      // stuck against a building? back out and try again
      const moved = Math.abs(car.speed);
      if (entry.reverseTime > 0) {
        entry.reverseTime -= dt;
        throttle = -0.9;
        steer = -steer;
      } else {
        if (Math.abs(angle) < 1.2 && moved < 0.8 && wanted.stars > 0 && dist > 9) {
          entry.stuckTime += dt;
          if (entry.stuckTime > 0.8) { entry.reverseTime = 0.65; entry.stuckTime = 0; }
        } else entry.stuckTime = Math.max(0, entry.stuckTime - dt);
        const distFactor = THREE.MathUtils.clamp(dist / 14, 0.25, 1);
        const wantSpeed = (canSee ? 33 : 20) * topSpeed * distFactor;
        if (car.speed < wantSpeed) throttle = 0.95;
        else throttle = -0.3;
        // slow right down when nose-to-nose with the player on foot
        if (player.onFoot && dist < 5) throttle = car.speed > 2 ? -0.6 : 0;
      }

      const beforeX = pos.x, beforeZ = pos.z;
      stepCarPhysics(car, { throttle, steer, handbrake: Math.abs(angle) > 1.1 }, dt);
      if (resolveCollisions(pos, 1.5)) {
        // bounced off a building: shed speed
        if (Math.abs(car.speed) > 6) car.speed *= 0.4;
        void beforeX; void beforeZ;
      }
    }

    // BUSTED: cornered — a cruiser close while you are slow or on foot
    let bustedNow = false;
    const cornered = nearest < 7.5 && (player.onFoot || Math.abs(player.speed) < 2.5);
    if (wanted.stars > 0 && cornered && seen) {
      wanted.bustedMeter = Math.min(1, wanted.bustedMeter + dt / 2.2);
      if (wanted.bustedMeter >= 1) bustedNow = true;
    } else {
      wanted.bustedMeter = Math.max(0, wanted.bustedMeter - dt / 1.4);
    }

    return { seen, nearest, busted: bustedNow };
  }
}
