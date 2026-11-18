// shots.js — deterministic staging for screenshots. With ?shot=<scene>
// the game skips the menu, seeds everything the same way, and poses a
// scene that shows the game's systems: drive, chase, foot, combat.
// An autopilot holds the moving scenes together while the shot is taken.

import { SPAWN } from './config.js';
import { setStars } from './police.js';
import { knockDown } from './pedestrians.js';
import { stepCarPhysics } from './vehicles.js';

export function shotSceneFromUrl() {
  const q = new URLSearchParams(location.search);
  return q.get('shot');
}

export function setupShotScene(G, name) {
  const { player, hud, missions, wanted } = G;
  G.money = 1450;
  hud.showHud();
  hud.hideStart();

  if (name === 'drive') {
    const car = G.spawnCar('comet', -36 - 3.4, -70, 0, {});
    player.place(-36 - 3.4, -76, 0);
    player.enterCar(car);
    car.speed = 15;
    player.camYaw = 0; player.camPitch = 0.19;
    // traffic sharing the avenue: one car ahead, one coming the other way
    G.spawnCar('palma', -36 - 3.4, -28, 0, { color: 0xd8d3c3 });
    G.spawnCar('crucero', -36 + 3.4, -16, Math.PI, { color: 0x3f7d5a });
    missions.stage = 2; missions.phase = 'timed'; missions.timer = 187;
    missions.objective.text = 'Deliver to the Palmera Grand valet';
    missions.objective.x = SPAWN.hotel.x; missions.objective.z = SPAWN.hotel.z + 16;
    G.autopilot = { heading: 0 };
    hud.toast('The Grand valet. Clock is running.');
  } else if (name === 'chase') {
    const car = G.spawnCar('azul', 36 + 3.4, 40, Math.PI, {});
    player.place(36 + 3.4, 46, Math.PI);
    player.enterCar(car);
    car.speed = 19;
    player.camYaw = Math.PI; player.camPitch = 0.22;
    G.money = 2300;
    setStars(wanted, 4);
    missions.stage = 3; missions.phase = 'deliver';
    missions.car = car; // the job car, so the mission logic tracks it
    missions.objective.text = 'Bring the Azul RS to Ríos Auto Works';
    missions.objective.x = SPAWN.garage.x; missions.objective.z = SPAWN.garage.z + 14;
    // cruisers where the chase camera can see them: one coming head-on in
    // the opposite lane, one ahead on the right, one on the tail
    const spots = [
      [36 - 3.4, -6, 0, 12],
      [43.5, 14, Math.PI, 16],
      [36 - 3.4, 60, Math.PI, 22],
    ];
    for (const [x, z, h, v] of spots) {
      const c = G.spawnCar('cruiser', x, z, h, { police: true });
      c.speed = v;
      G.police.cruisers.push({ car: c, stuckTime: 0, reverseTime: 0, wander: 0, tx: x, tz: z });
    }
    G.autopilot = { heading: Math.PI };
  } else if (name === 'foot') {
    // at the marina, angled toward the pier: boats and sea ahead
    player.place(246, 46, Math.PI / 2 + 0.3);
    player.camYaw = Math.PI / 2 + 0.3; player.camPitch = 0.15;
    // dialogue freezes the player update, so pose the camera by hand
    const dist = 6.4;
    G.camera.position.set(
      player.pos.x - Math.sin(player.camYaw) * Math.cos(player.camPitch) * dist,
      1.6 + Math.sin(player.camPitch) * dist,
      player.pos.z - Math.cos(player.camYaw) * Math.cos(player.camPitch) * dist);
    G.camera.lookAt(player.pos.x, 1.45, player.pos.z);
    // Val stands with Dani at the pier head, turned toward him
    G.val.mesh.position.set(252.5, 0, 42.5);
    G.val.heading = Math.atan2(246 - 252.5, 46 - 42.5);
    G.val.mesh.rotation.y = G.val.heading;
    missions.stage = 1; missions.phase = 'deliver';
    missions.objective.text = 'Meet Val at the marina';
    missions.objective.x = SPAWN.marina.x; missions.objective.z = SPAWN.marina.z;
    missions.dialogue = { lines: [{ who: 'Val Ríos', text: '' }], index: 0, onDone: null };
    hud.showDialogue('Val Ríos', 'Clean paint, full tank, buyer happy. That is how you last in Palmera, Dani.');
  } else if (name === 'combat') {
    player.place(-30, -8, Math.PI / 2);
    player.camYaw = Math.PI / 2; player.camPitch = 0.34;
    player.heading = Math.PI / 2;
    G.money = 860;
    setStars(wanted, 3);
    // the boost target: a parked Palma across town, marker on it
    const target = G.spawnCar('palma', 72, -70, Math.PI / 2, {});
    missions.stage = 4; missions.phase = 'steal';
    missions.car = target;
    missions.boostModel = target.modelName;
    missions.objective.text = 'Boost the Palma Sedan — Val has a buyer';
    missions.objective.x = 72; missions.objective.z = -72;
    // a cruiser closing in head-on, lights going
    const c = G.spawnCar('cruiser', -3, -5, -Math.PI / 2, { police: true });
    c.speed = 5;
    G.police.cruisers.push({ car: c, stuckTime: 0, reverseTime: 0, wander: 0, tx: -3, tz: -5 });
    // the aftermath at Dani's feet: a pedestrian down across the view,
    // a bystander fleeing, and the rest of the crowd cleared out of frame
    const downed = G.peds[0];
    if (downed) {
      downed.mesh.position.set(-25, 0.25, -3.5);
      knockDown(downed, true);
      downed.mesh.rotation.x = 0;
      downed.mesh.rotation.z = Math.PI / 2; // lie across the view, not away from it
    }
    const runner = G.peds[1];
    if (runner) {
      runner.mesh.position.set(-23, 0, -19);
      runner.state = 'flee';
      runner.fleeTimer = 99;
      runner.fleeFrom.x = -30; runner.fleeFrom.z = -8;
    }
    for (let i = 2; i < G.peds.length; i++) {
      const p = G.peds[i];
      if (Math.hypot(p.mesh.position.x + 30, p.mesh.position.z + 8) < 17) {
        p.mesh.position.set(120, 0, 120);
        p.blockCx = 72; p.blockCz = 72;
      }
    }
  }
  G.player.autoDrive = !!G.autopilot;
  G.state = 'playing';
}

// Holds a staged drive together: gentle throttle, keep the heading.
export function updateShotScene(G, dt) {
  if (!G.autopilot || !G.player.car) return;
  const car = G.player.car;
  let diff = G.autopilot.heading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  stepCarPhysics(car, {
    throttle: car.speed < 17 ? 0.7 : 0,
    steer: Math.max(-0.6, Math.min(0.6, diff * 2)),
    handbrake: false,
  }, dt);
  G.player.camYaw = car.heading;
}
