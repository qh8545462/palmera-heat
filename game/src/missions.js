// missions.js — the story of Palmera Heat: Val Ríos feeds Dani work from
// Ríos Auto Works. An intro chat, three story jobs (a delivery, a hot
// package, and the one-of-one Azul RS), then the endless Boost List.

import * as THREE from 'three';
import { SPAWN } from './config.js';
import { addHeat, setStars, clearHeat } from './police.js';

const INTRO_LINES = [
  { who: 'Val Ríos', text: 'Dani Marrero. You actually came. Palmera Bay eats newcomers, you know.' },
  { who: 'Dani', text: 'Then feed me work before it feeds on me, Val.' },
  { who: 'Val Ríos', text: 'That red Comet GT by the bay doors — a buyer waits at the marina. Drive it clean, no dents, no sirens.' },
  { who: 'Val Ríos', text: 'Do it right and there is more where that came from. Keys are in it. Go.' },
];

export function createMissions(scene) {
  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xffc63c, transparent: true, opacity: 0.34,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 34, 18, 1, true), markerMat);
  marker.position.y = 17;
  marker.visible = false;
  scene.add(marker);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffc63c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.visible = false;
  scene.add(ring);

  return {
    stage: 0,           // 0 intro, 1 first wheels, 2 cold package, 3 azul, 4 boost list
    phase: 'go',        // sub-state inside a stage ('go' | 'return' | 'timed' ...)
    timer: 0,
    car: null,          // the car the current job is about
    dialogue: null,
    marker, ring,
    objective: { text: '', x: SPAWN.garage.x, z: SPAWN.garage.z },
    boostModel: '',
  };
}

function setObjective(m, text, x, z) {
  m.objective.text = text;
  m.objective.x = x; m.objective.z = z;
}

function startDialogue(m, hud, lines, onDone) {
  m.dialogue = { lines, index: 0, onDone };
  hud.showDialogue(lines[0].who, lines[0].text);
}

export function advanceDialogue(m, hud) {
  if (!m.dialogue) return;
  m.dialogue.index++;
  if (m.dialogue.index >= m.dialogue.lines.length) {
    const done = m.dialogue.onDone;
    m.dialogue = null;
    hud.hideDialogue();
    if (done) done();
  } else {
    const line = m.dialogue.lines[m.dialogue.index];
    hud.showDialogue(line.who, line.text);
  }
}

// Begin whatever stage the state says (used at new game and on continue).
export function beginStage(m, G) {
  const { hud } = G;
  m.car = null;
  m.timer = 0;
  if (m.stage === 0) {
    setObjective(m, 'Talk to Val at Ríos Auto Works', G.val.mesh.position.x, G.val.mesh.position.z);
  } else if (m.stage === 1) {
    m.phase = 'go';
    m.car = G.spawnCar('comet', SPAWN.garage.x - 10, SPAWN.garage.z + 16, Math.PI, {});
    setObjective(m, 'Get in the red Comet GT at the garage', m.car.mesh.position.x, m.car.mesh.position.z);
    hud.banner('FIRST WHEELS', 'Deliver the Comet GT to the marina');
  } else if (m.stage === 2) {
    m.phase = 'pickup';
    setObjective(m, 'Pick up the package at Pier 9 warehouse', SPAWN.pier9.x - 12, SPAWN.pier9.z + 8);
    hud.banner('COLD PACKAGE', 'Pick up at Pier 9 — then run it to the Grand');
  } else if (m.stage === 3) {
    m.phase = 'steal';
    m.car = G.spawnCar('azul', SPAWN.mansion.x + 6, SPAWN.mansion.z + 12, Math.PI, {});
    setObjective(m, 'Steal the Azul RS at Vista Heights', m.car.mesh.position.x, m.car.mesh.position.z);
    hud.banner('THE AZUL COUPE', 'One of one. The owner will notice.');
  } else {
    beginBoost(m, G);
  }
}

function beginBoost(m, G) {
  m.stage = 4;
  m.phase = 'steal';
  // a random parked car somewhere in the city becomes the order
  const parked = G.cars.filter((c) => c.driver === 'parked' && !c.police);
  if (!parked.length) { setObjective(m, 'Wait for the next order…', SPAWN.garage.x, SPAWN.garage.z); return; }
  const target = parked[G.rng.int(0, parked.length - 1)];
  m.car = target;
  m.boostModel = target.modelName;
  setObjective(m, `Boost the ${target.modelName} — Val has a buyer`, target.mesh.position.x, target.mesh.position.z);
}

function completeStage(m, G, reward, bannerTitle, bannerSub) {
  G.money += reward;
  G.jobsDone++;
  G.audio.chime();
  G.hud.banner(bannerTitle, bannerSub + `  +$${reward}`);
  G.hud.toast(`$${G.money} in your pocket`);
  m.stage++;
  G.saveGame();
  beginStage(m, G);
}

export function updateMissions(m, G, dt, t) {
  const { player, hud, wanted } = G;
  const px = player.inCar ? player.car.mesh.position.x : player.pos.x;
  const pz = player.inCar ? player.car.mesh.position.z : player.pos.z;

  // marker follows the objective
  const show = !!m.objective.text && !m.dialogue;
  m.marker.visible = show; m.ring.visible = show;
  if (show) {
    m.marker.position.x = m.objective.x;
    m.marker.position.z = m.objective.z;
    m.ring.position.x = m.objective.x;
    m.ring.position.z = m.objective.z;
    m.ring.scale.setScalar(1 + Math.sin(t * 3.2) * 0.12);
  }

  if (m.dialogue) return;

  const distTo = (x, z) => Math.hypot(px - x, pz - z);

  if (m.stage === 0) {
    setObjective(m, 'Talk to Val at Ríos Auto Works', G.val.mesh.position.x, G.val.mesh.position.z);
    if (distTo(G.val.mesh.position.x, G.val.mesh.position.z) < 4 && !player.inCar) {
      hud.setPrompt('Press E — talk to Val');
      if (G.interactPressed) {
        hud.setPrompt('');
        startDialogue(m, hud, INTRO_LINES, () => { m.stage = 1; G.saveGame(); beginStage(m, G); });
      }
    } else {
      hud.setPrompt('');
    }
    return;
  }

  // a wrecked job car respawns where it started
  if (m.car && m.car.wrecked && m.phase !== 'deliver') {
    hud.toast('The car is wrecked — Val sends another');
    const spot = m.stage === 1
      ? { x: SPAWN.garage.x - 10, z: SPAWN.garage.z + 16 }
      : { x: SPAWN.mansion.x + 6, z: SPAWN.mansion.z + 12 };
    if (m.stage === 1 || m.stage === 3) {
      m.car = G.spawnCar(m.stage === 1 ? 'comet' : 'azul', spot.x, spot.z, Math.PI, {});
    }
  }

  if (m.stage === 1) {
    if (m.phase === 'go') {
      if (player.car === m.car) {
        m.phase = 'deliver';
        setObjective(m, 'Drive the Comet GT to the marina', SPAWN.marina.x, SPAWN.marina.z);
        hud.toast('Easy on the paint');
      } else {
        setObjective(m, 'Get in the red Comet GT at the garage', m.car.mesh.position.x, m.car.mesh.position.z);
      }
    } else if (m.phase === 'deliver') {
      if (player.car !== m.car) { m.phase = 'go'; }
      else if (distTo(SPAWN.marina.x, SPAWN.marina.z) < 13) {
        player.exitCar();
        completeStage(m, G, 250, 'FIRST WHEELS — DONE', 'The buyer is all smiles.');
      }
    }
  } else if (m.stage === 2) {
    if (m.phase === 'pickup') {
      if (distTo(SPAWN.pier9.x - 12, SPAWN.pier9.z + 8) < 11) {
        m.phase = 'timed';
        m.timer = 260;
        setStars(wanted, Math.max(wanted.stars, 2));
        addHeat(wanted, 10);
        hud.banner('PACKAGE HOT', 'The Grand valet. Clock is running.');
        G.audio.blip(1180, 0.1, 0.14);
        setObjective(m, 'Deliver to the Palmera Grand valet', SPAWN.hotel.x, SPAWN.hotel.z + 16);
      }
    } else if (m.phase === 'timed') {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.phase = 'pickup';
        setObjective(m, 'The package went cold — pick it up again at Pier 9', SPAWN.pier9.x - 12, SPAWN.pier9.z + 8);
        hud.toast('Too slow. The buyer walked.');
      } else if (distTo(SPAWN.hotel.x, SPAWN.hotel.z + 16) < 14) {
        completeStage(m, G, 600, 'COLD PACKAGE — DELIVERED', 'No questions asked.');
      }
    }
  } else if (m.stage === 3) {
    if (m.phase === 'steal') {
      if (player.car === m.car) {
        m.phase = 'deliver';
        setStars(wanted, Math.max(wanted.stars, 3));
        hud.banner('AZUL RS — TAKEN', 'Every cop in Palmera just woke up');
        setObjective(m, 'Bring the Azul RS to Ríos Auto Works', SPAWN.garage.x, SPAWN.garage.z + 14);
      } else {
        setObjective(m, 'Steal the Azul RS at Vista Heights', m.car.mesh.position.x, m.car.mesh.position.z);
      }
    } else if (m.phase === 'deliver') {
      if (player.car !== m.car) m.phase = 'steal';
      else if (distTo(SPAWN.garage.x, SPAWN.garage.z + 14) < 15) {
        player.exitCar();
        clearHeat(wanted);
        completeStage(m, G, 1200, 'THE AZUL COUPE — YOURS', 'Val clears the heat with a phone call.');
      }
    }
  } else if (m.stage === 4) {
    if (!m.car) { beginBoost(m, G); return; }
    if (m.phase === 'steal') {
      if (player.car === m.car) {
        m.phase = 'deliver';
        addHeat(wanted, 30);
        setObjective(m, `Deliver the ${m.boostModel} to Ríos Auto Works`, SPAWN.garage.x, SPAWN.garage.z + 14);
      } else {
        setObjective(m, `Boost the ${m.boostModel} — Val has a buyer`, m.car.mesh.position.x, m.car.mesh.position.z);
      }
    } else if (m.phase === 'deliver') {
      if (player.car !== m.car) m.phase = 'steal';
      else if (distTo(SPAWN.garage.x, SPAWN.garage.z + 14) < 15) {
        player.exitCar();
        const reward = 220 + G.jobsDone * 15;
        G.money += reward;
        G.jobsDone++;
        G.audio.chime();
        hud.banner('BOOST DELIVERED', `Another happy buyer.  +$${reward}`);
        G.saveGame();
        m.car = null;
        beginBoost(m, G);
      }
    }
  }
}

export function objectiveText(m) {
  if (m.stage === 2 && m.phase === 'timed') {
    const s = Math.max(0, Math.ceil(m.timer));
    const mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    return { text: m.objective.text, timer: `${mm}:${ss}`, urgent: s < 45 };
  }
  return { text: m.objective.text, timer: null, urgent: false };
}
