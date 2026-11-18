// traffic.js — the city's traffic: cars that pick a lane, follow it with
// pure-pursuit steering, turn at junctions, and stop for the car ahead.
// Routes are generated ahead of the car a junction at a time.

import { ROADS, LANE } from './config.js';
import { createCar, stepCarPhysics, forwardOf } from './vehicles.js';

const MODELS = ['palma', 'crucero', 'brava', 'solana'];

// lane point for a route state at coordinate t along its axis of travel
function lanePoint(state, t) {
  if (state.axis === 'v') {
    return { x: state.road + (state.dir > 0 ? -LANE : LANE), z: t };
  }
  return { x: t, z: state.road + (state.dir > 0 ? LANE : -LANE) };
}

function nextJunctionAhead(state, along) {
  let best = null;
  for (const j of ROADS) {
    const d = (j - along) * state.dir;
    if (d > 4 && (best === null || d < best.d)) best = { at: j, d };
  }
  return best;
}

// Append one junction's worth of points to the driver's path and advance
// the route state. Returns false when the road ends (a U-turn is added).
function extendRoute(driver, rng) {
  const st = driver.state;
  const pos = driver.car.mesh.position;
  const along = st.axis === 'v' ? pos.z : pos.x;
  const junction = nextJunctionAhead(st, along);
  if (!junction) {
    // road stub ends: swing around to the opposite lane and head back
    const endT = (st.axis === 'v' ? pos.z : pos.x) + st.dir * 26;
    driver.path.push(lanePoint(st, endT));
    st.dir = -st.dir;
    driver.path.push(lanePoint(st, endT - st.dir * 4));
    return true;
  }
  const roll = rng.float();
  const turn = roll < 0.52 ? 'straight' : roll < 0.76 ? 'left' : 'right';
  const entry = lanePoint(st, junction.at);
  if (turn === 'straight') {
    driver.path.push(entry);
    driver.path.push(lanePoint(st, junction.at + st.dir * 14));
    return true;
  }
  const newState = { axis: st.axis === 'v' ? 'h' : 'v', road: junction.at, dir: 1 };
  if (st.axis === 'v') newState.dir = turn === 'left' ? st.dir : -st.dir;
  else newState.dir = turn === 'left' ? -st.dir : st.dir;
  // corner: where the two lanes cross
  const corner = st.axis === 'v'
    ? { x: entry.x, z: lanePoint(newState, 0).z }
    : { x: lanePoint(newState, 0).x, z: entry.z };
  const exitBase = st.axis === 'v' ? st.road : st.road;
  const exit = lanePoint(newState, exitBase + newState.dir * 12);
  driver.path.push(entry, corner, exit);
  driver.state = newState;
  return true;
}

function rebuildLengths(driver) {
  const pts = driver.path;
  driver.lengths = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z;
    driver.lengths.push(driver.lengths[i - 1] + Math.hypot(dx, dz));
  }
  driver.total = driver.lengths[driver.lengths.length - 1];
}

function pointAt(driver, s) {
  const pts = driver.path, lens = driver.lengths;
  if (s <= 0) return pts[0];
  if (s >= driver.total) return pts[pts.length - 1];
  let lo = 0, hi = lens.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (lens[mid] <= s) lo = mid; else hi = mid;
  }
  const segLen = lens[lo + 1] - lens[lo] || 1;
  const k = (s - lens[lo]) / segLen;
  return {
    x: pts[lo].x + (pts[lo + 1].x - pts[lo].x) * k,
    z: pts[lo].z + (pts[lo + 1].z - pts[lo].z) * k,
  };
}

export function createTraffic(scene, rng, count) {
  const drivers = [];
  for (let i = 0; i < count; i++) {
    const axis = rng.chance(0.5) ? 'v' : 'h';
    const road = rng.pick(ROADS);
    const dir = rng.chance(0.5) ? 1 : -1;
    const state = { axis, road, dir };
    const along = rng.range(-190, 190);
    const p = lanePoint(state, along);
    const heading = axis === 'v' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const model = rng.pick(MODELS);
    const car = createCar(scene, model, {
      x: p.x, z: p.z, heading,
      color: rng.pick(['#c0c6cc', '#7a8894', '#94553f', '#4f6f8f', '#d8d3c3', '#b84a39', '#3f7d5a', '#d8a03c']),
      driver: 'traffic',
    });
    const driver = {
      car, state, path: [p], lengths: [0], total: 0, s: 0,
      cruise: rng.range(10.5, 14),
    };
    for (let k = 0; k < 4; k++) extendRoute(driver, rng);
    rebuildLengths(driver);
    drivers.push(driver);
  }
  return drivers;
}

export function updateTraffic(drivers, allCars, rng, dt) {
  for (const d of drivers) {
    const car = d.car;
    if (car.wrecked) { stepCarPhysics(car, { throttle: 0, steer: 0 }, dt); continue; }
    const pos = car.mesh.position;

    // advance s: project the car onto its current segment neighbourhood
    let bestS = d.s, bestDist = Infinity;
    const from = Math.max(0, d.s - 4), to = Math.min(d.total, d.s + 14);
    for (let s = from; s <= to; s += 1.5) {
      const p = pointAt(d, s);
      const dist = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (dist < bestDist) { bestDist = dist; bestS = s; }
    }
    d.s = bestS;

    // keep enough road ahead
    if (d.total - d.s < 55) {
      const before = d.path.length;
      extendRoute(d, rng);
      if (d.path.length > before) rebuildLengths(d);
    }
    // prune the road behind: drop points well behind the car and shift s
    if (d.s > 60 && d.path.length > 6) {
      let cut = 0;
      while (cut < d.lengths.length - 2 && d.lengths[cut + 1] < d.s - 20) cut++;
      if (cut > 0) {
        const removed = d.lengths[cut];
        d.path.splice(0, cut);
        rebuildLengths(d);
        d.s = Math.max(0, d.s - removed);
      }
    }

    const lookAhead = 6 + Math.abs(car.speed) * 0.55;
    const target = pointAt(d, d.s + lookAhead);
    const f = forwardOf(car.heading);
    const dx = target.x - pos.x, dz = target.z - pos.z;
    const localX = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    const localZ = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const angle = Math.atan2(localX, localZ);
    const steer = Math.max(-1, Math.min(1, angle * 1.7));

    // stop for a car ahead
    let blocked = false;
    for (const other of allCars) {
      if (other === car) continue;
      const ox = other.mesh.position.x - pos.x, oz = other.mesh.position.z - pos.z;
      const ahead = ox * f.x + oz * f.z;
      const side = Math.abs(ox * f.z - oz * f.x);
      if (ahead > 0 && ahead < 8.5 && side < 1.9) { blocked = true; break; }
    }

    let throttle = 0;
    const curveSlow = Math.max(0.35, 1 - Math.abs(angle) * 0.9);
    const targetSpeed = blocked ? 0 : d.cruise * curveSlow;
    if (car.speed < targetSpeed - 0.4) throttle = 0.75;
    else if (car.speed > targetSpeed + 0.4) throttle = blocked ? -1 : -0.35;
    stepCarPhysics(car, { throttle, steer, handbrake: false }, dt);
  }
}
