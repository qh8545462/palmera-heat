// main.js — Palmera Heat's entry point: builds the city and everyone in
// it, runs the game loop, and wires the states together (menu, playing,
// paused, busted, wasted) with the collisions between cars and people.

import * as THREE from 'three';
import { SPAWN } from './config.js';
import { Rng } from './rng.js';
import { initInput, pressed, mouse, consumeMouse, consumeEdges, lockPointer, releasePointer, pointerLocked } from './input.js';
import { buildWorld, parkingSpots } from './world.js';
import { createCar, updateVehicleEffects, damageCar } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createCrowd, createPerson, updatePedestrians, knockDown } from './pedestrians.js';
import { Police, createWanted, addHeat, updateWanted, clearHeat } from './police.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { createMissions, beginStage, updateMissions, advanceDialogue, objectiveText } from './missions.js';
import { loadSave, writeSave } from './save.js';
import { shotSceneFromUrl, setupShotScene, updateShotScene } from './shots.js';

const shotScene = shotSceneFromUrl();
const rng = new Rng(shotScene ? 1337 : (Date.now() % 100000));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(40, 26, 60);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initInput(renderer.domElement);

const world = buildWorld(scene, rng);
const hud = new Hud();
const audio = new GameAudio();

// ---- the game context every system reads ----
const G = {
  scene, camera, rng, hud, audio,
  state: 'menu',
  money: 120,
  jobsDone: 0,
  cars: [],
  peds: [],
  traffic: [],
  wanted: createWanted(),
  interactPressed: false,
  shotMode: !!shotScene,
  autopilot: null,
  time: 0,
  overTimer: 0,
  saveGame() {
    writeSave({ money: G.money, stage: G.missions.stage, jobsDone: G.jobsDone });
  },
  spawnCar(model, x, z, heading, opts = {}) {
    const car = createCar(scene, model, { x, z, heading, ...opts });
    G.cars.push(car);
    return car;
  },
};

G.player = new Player(scene, rng);
G.player.place(SPAWN.player.x, SPAWN.player.z, Math.PI);
G.police = new Police(scene, rng);
G.missions = createMissions(scene);

// Val Ríos, waiting by the garage doors
G.val = createPerson(scene, rng, {
  x: SPAWN.garage.x + 7, z: SPAWN.garage.z + 13,
  shirt: 0xb84a39, pants: 0x2e2e33, skin: 0x8d5a3b, hair: 0x14161c, npc: true, name: 'Val Ríos',
});
G.val.state = 'stand';
G.val.heading = Math.PI;
G.val.mesh.rotation.y = Math.PI;

// the crowd and the parked cars of the city
G.peds = createCrowd(scene, rng, 26);
const PARKED_MODELS = ['palma', 'crucero', 'brava', 'solana'];
const shuffled = [...parkingSpots].sort(() => rng.float() - 0.5);
let parkedCount = 0;
for (const spot of shuffled) {
  if (parkedCount >= 24) break;
  const nearGarage = Math.hypot(spot.x - SPAWN.garage.x, spot.z - SPAWN.garage.z) < 22;
  const mansionDrive = Math.abs(spot.x - (SPAWN.mansion.x + 6)) < 3 && Math.abs(spot.z - (SPAWN.mansion.z + 12)) < 3;
  if (nearGarage || mansionDrive) continue;
  const model = rng.pick(PARKED_MODELS);
  G.spawnCar(model, spot.x, spot.z, spot.heading, { color: rng.pick([0xc0c6cc, 0x7a8894, 0x94553f, 0x4f6f8f, 0xd8d3c3, 0xb84a39, 0x3f7d5a, 0xd8a03c, 0x9aa0a4]) });
  parkedCount++;
}
// two cruisers parked at the station, lights off
G.spawnCar('cruiser', SPAWN.station.x - 9, SPAWN.station.z + 8, Math.PI, { police: true });
G.spawnCar('cruiser', SPAWN.station.x + 9, SPAWN.station.z + 8, Math.PI, { police: true });

G.traffic = createTraffic(scene, rng, 14);
for (const d of G.traffic) G.cars.push(d.car);

window.__palmera = G;

// ---- flow ----

function startGame(fromSave) {
  audio.ensure();
  const save = fromSave ? loadSave() : null;
  if (save) {
    G.money = save.money;
    G.jobsDone = save.jobsDone;
    G.missions.stage = save.stage;
  } else {
    G.money = 120;
    G.jobsDone = 0;
    G.missions.stage = 0;
  }
  clearHeat(G.wanted);
  G.police.clearAll();
  G.player.health = 100;
  if (G.player.car) G.player.exitCar();
  G.player.place(SPAWN.player.x, SPAWN.player.z, Math.PI);
  beginStage(G.missions, G);
  hud.hideStart();
  hud.showHud();
  G.state = 'playing';
  if (!G.shotMode) lockPointer(renderer.domElement);
  hud.banner('PALMERA BAY', G.missions.stage === 0 ? 'Val is waiting at Ríos Auto Works' : 'Back to work, Dani');
}

function doBusted() {
  G.state = 'over';
  G.overTimer = 1.8;
  const fine = Math.min(200, G.money);
  G.money -= fine;
  hud.showEnd('BUSTED', `The Palmera PD take $${fine} and your afternoon.`);
  audio.blip(180, 0.3, 0.16);
  clearHeat(G.wanted);
  G.police.clearAll();
  if (G.player.car) { const c = G.player.car; G.player.exitCar(); c.driver = 'parked'; }
  G.player.health = 100;
  G.player.place(SPAWN.station.x, SPAWN.station.z + 16, Math.PI);
  G.saveGame();
}

function doWasted() {
  G.state = 'over';
  G.overTimer = 1.8;
  const bill = Math.min(150, G.money);
  G.money -= bill;
  hud.showEnd('WASTED', `Palmera General patches you up for $${bill}.`);
  audio.blip(140, 0.35, 0.16);
  G.wanted.heat *= 0.5;
  if (G.player.car) { const c = G.player.car; G.player.exitCar(); c.driver = 'parked'; }
  G.player.health = 100;
  G.player.place(SPAWN.hospital.x, SPAWN.hospital.z + 14, 0);
  G.saveGame();
}

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
document.getElementById('btn-quit').addEventListener('click', () => {
  togglePause(false);
  G.state = 'menu';
  hud.hideHud();
  hud.showStart(!!loadSave());
  releasePointer();
});

function togglePause(on) {
  if (on && G.state === 'playing') {
    G.state = 'paused';
    hud.showPause();
    releasePointer();
  } else if (!on && G.state === 'paused') {
    G.state = 'playing';
    hud.hidePause();
    if (!G.shotMode) lockPointer(renderer.domElement);
  }
}

document.addEventListener('pointerlockchange', () => {
  if (!pointerLocked && G.state === 'playing' && !G.shotMode && !G.missions.dialogue) {
    // the player pressed Esc or the browser dropped the lock: pause
    togglePause(true);
  }
});

// ---- per-frame helpers ----

// key edges for this frame, filled at the top of the loop from input.js
let frameEdges = new Set();
function keyEdge(code) { return frameEdges.has(code); }

function nearestEnterableCar() {
  let best = null, bestD = 3.6;
  for (const car of G.cars) {
    if (car.police || car.wrecked || car === G.player.car) continue;
    const d = Math.hypot(car.mesh.position.x - G.player.pos.x, car.mesh.position.z - G.player.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterExit() {
  const player = G.player;
  if (player.inCar) {
    if (Math.abs(player.car.speed) < 4) player.exitCar();
    return;
  }
  const car = nearestEnterableCar();
  if (!car) return;
  if (car.driver === 'traffic') {
    const i = G.traffic.findIndex((d) => d.car === car);
    if (i >= 0) G.traffic.splice(i, 1);
  }
  const wasMissionCar = G.missions.car === car;
  player.enterCar(car);
  audio.blip(520, 0.06, 0.1);
  if (!wasMissionCar && !car.hotwired) {
    car.hotwired = true;
    addHeat(G.wanted, 12);
    hud.toast(`Hotwired the ${car.modelName}`);
  }
}

function collideCars(dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 3.3 * 3.3 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (3.3 - d) / 2;
      const nx = dx / d, nz = dz / d;
      const rel = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4;
      if (a.driver !== 'parked') { a.mesh.position.x -= nx * push; a.mesh.position.z -= nz * push; }
      if (b.driver !== 'parked') { b.mesh.position.x += nx * push; b.mesh.position.z += nz * push; }
      if (rel > 3) {
        const dmg = (rel - 3) * 1.5;
        damageCar(a, dmg); damageCar(b, dmg);
        if (a === G.player.car || b === G.player.car) {
          audio.crash(Math.min(1, rel / 14));
          G.player.hurt(dmg * 0.25);
          const other = a === G.player.car ? b : a;
          if (other.police) addHeat(G.wanted, 20);
        }
        a.speed *= 0.55; b.speed *= 0.55;
      }
    }
  }
  void dt;
}

function collideCarsWithPeds() {
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 3.5) continue;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.mesh.position.x - car.mesh.position.x, ped.mesh.position.z - car.mesh.position.z);
      if (d < 1.7) {
        knockDown(ped);
        damageCar(car, 2);
        car.speed *= 0.82;
        if (car === G.player.car) {
          addHeat(G.wanted, 30);
          audio.crash(0.5);
          hud.toast('You hit a pedestrian!');
        }
      }
    }
    // the player on foot, run down
    if (!G.player.inCar && car !== G.player.car && Math.abs(car.speed) > 4) {
      const d = Math.hypot(G.player.pos.x - car.mesh.position.x, G.player.pos.z - car.mesh.position.z);
      if (d < 1.8) {
        G.player.hurt(22);
        const away = Math.atan2(G.player.pos.x - car.mesh.position.x, G.player.pos.z - car.mesh.position.z);
        G.player.pos.x += Math.sin(away) * 2.4;
        G.player.pos.z += Math.cos(away) * 2.4;
        audio.crash(0.7);
      }
    }
  }
}

// ---- the loop ----

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  G.time += dt;
  const t = G.time;
  frameEdges = consumeEdges();

  for (const fn of world.animated) fn(t);

  if (G.state === 'menu') {
    const a = t * 0.05;
    camera.position.set(Math.sin(a) * 85, 34, Math.cos(a) * 85);
    camera.lookAt(0, 4, 30);
    updateTraffic(G.traffic, G.cars, rng, dt);
    updatePedestrians(G.peds, null, dt);
    updateVehicleEffects(scene, G.cars, dt);
    renderer.render(scene, camera);
    return;
  }
  if (G.state === 'paused') {
    renderer.render(scene, camera);
    return;
  }
  if (G.state === 'over') {
    G.overTimer -= dt;
    if (G.overTimer <= 0) {
      G.state = 'playing';
      if (!G.shotMode) lockPointer(renderer.domElement);
    }
    renderer.render(scene, camera);
    return;
  }

  // playing
  const missions = G.missions;
  G.interactPressed = keyEdge('KeyE');
  const advanceKey = G.interactPressed || keyEdge('Enter');

  if (keyEdge('KeyM')) {
    audio.setMuted(!audio.muted);
    hud.toast(audio.muted ? 'Sound off' : 'Sound on');
  }
  if (keyEdge('KeyP')) { togglePause(true); renderer.render(scene, camera); return; }

  const dialogueOpen = !!missions.dialogue;
  if (dialogueOpen && advanceKey) advanceDialogue(missions, hud);

  const ctx = {
    camera, audio, wanted: G.wanted, peds: G.peds, cars: G.cars,
    firing: false, onPedShot: null,
  };

  if (G.shotMode) updateShotScene(G, dt);

  if (!dialogueOpen) {
    ctx.firing = mouse.down;
    G.player.update(dt, ctx);
    if (mouse.down) G.player.shoot(ctx);
    if (keyEdge('KeyF')) tryEnterExit();
  } else {
    // keep the camera where the player left it during dialogue, and
    // swallow mouse movement so the camera does not jump afterwards
    consumeMouse();
    G.player.updateTracers(dt);
  }

  updateMissions(missions, G, dt, t);
  updateTraffic(G.traffic, G.cars, rng, dt);

  const playerInfo = {
    x: G.player.inCar ? G.player.car.mesh.position.x : G.player.pos.x,
    z: G.player.inCar ? G.player.car.mesh.position.z : G.player.pos.z,
    speed: G.player.speed,
    onFoot: !G.player.inCar,
    heading: G.player.heading,
  };
  const policeResult = G.police.update(dt, G.wanted, playerInfo, t);
  updateWanted(G.wanted, dt, policeResult.seen && G.wanted.stars > 0);

  collideCars(dt);
  collideCarsWithPeds();

  // danger for the crowd: a fast player car or an active chase
  let danger = null;
  if (G.player.inCar && Math.abs(G.player.car.speed) > 8) {
    danger = { x: playerInfo.x, z: playerInfo.z, radius: 13 };
  } else if (G.wanted.stars > 0 && policeResult.nearest < 26) {
    danger = { x: playerInfo.x, z: playerInfo.z, radius: 11 };
  }
  updatePedestrians(G.peds, danger, dt);
  // Val stands still
  G.val.mesh.rotation.y = G.val.heading;
  updateVehicleEffects(scene, G.cars, dt);

  // audio beds
  audio.engine(G.player.inCar ? Math.abs(G.player.car.speed) / 34 : null);
  audio.siren(G.wanted.stars > 0 ? Math.max(0, 1 - policeResult.nearest / 75) : 0);
  audio.updateMusic(dt, true);

  // endings
  if (policeResult.busted) { doBusted(); renderer.render(scene, camera); return; }
  if (G.player.health <= 0) { doWasted(); renderer.render(scene, camera); return; }

  // HUD
  const obj = objectiveText(missions);
  hud.update(dt, {
    money: G.money, stars: G.wanted.stars, health: G.player.health,
    busted: G.wanted.bustedMeter, objective: obj.text, objTimer: obj.timer,
    urgent: obj.urgent, inCar: G.player.inCar, playing: true,
  });
  hud.drawMinimap({
    player: { x: playerInfo.x, z: playerInfo.z, heading: G.player.inCar ? G.player.car.heading : G.player.camYaw },
    traffic: G.traffic.map((d) => d.car.mesh.position),
    police: G.police.cruisers.map((c) => c.car.mesh.position),
    objective: missions.objective.text ? missions.objective : null,
    t,
  });

  // contextual prompt
  if (!dialogueOpen && !G.player.inCar) {
    const near = nearestEnterableCar();
    if (near && !(missions.stage === 0)) hud.setPrompt(`Press F — drive the ${near.modelName}`);
    else if (missions.stage !== 0) hud.setPrompt('');
  } else if (G.player.inCar) {
    hud.setPrompt('');
  }

  renderer.render(scene, camera);
}

// ---- boot ----
if (shotScene) {
  G.missions.stage = 4; // scenes pose their own objective state
  setupShotScene(G, shotScene);
  hud.showHud();
} else {
  hud.showStart(!!loadSave());
}
frame();
