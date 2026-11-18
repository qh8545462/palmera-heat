// config.js — shared tuning constants for Palmera Heat: the city grid, the
// palette, and the numbers every other system reads. One place to tune.

export const ROADS = [-180, -108, -36, 36, 108, 180]; // road centre lines, both axes
export const ROAD_HALF = 7;                            // half the road width
export const LANE = 3.4;                               // lane offset from a road centre
export const BLOCK_CENTRES = [-144, -72, 0, 72, 144];  // block centres between roads
export const CITY_MIN = -216;
export const CITY_MAX = 216;
export const BEACH_X = 226;                            // sand starts east of here
export const SEA_X = 258;                              // water starts east of here

export const SAVE_KEY = 'palmera-heat-save-v1';

export const PLAYER = {
  walkSpeed: 6.2,
  sprintSpeed: 10.5,
  radius: 0.55,
  maxHealth: 100,
  regenDelay: 5,
  regenRate: 6,
};

export const CAR = {
  maxSpeed: 34,          // m/s, ~122 km/h
  maxReverse: 9,
  accel: 15,
  brake: 30,
  drag: 0.55,
  gripTurn: 2.35,        // rad/s at full lock, scaled by speed
  radius: 1.55,
  maxHealth: 100,
};

export const WANTED = {
  heatPerStar: 50,
  maxStars: 5,
  drainSecondsPerStar: 26, // unseen time to lose one star
  sightRange: 62,
};

export const SPAWN = {
  player: { x: -128, z: 158 },       // on foot outside the garage forecourt
  garage: { x: -144, z: 144 },
  marina: { x: 214, z: 40 },
  hotel: { x: 0, z: -128 },
  pier9: { x: 208, z: -84 },
  mansion: { x: 144, z: -144 },
  hospital: { x: -72, z: -58 },
  station: { x: 72, z: 88 },
};

export const COLORS = {
  sky: 0x8ec9e8,
  fog: 0xf2c99a,
  sun: 0xffdfae,
  sand: 0xe8cf9e,
  sea: 0x2e7fa8,
  road: 0x3c3f45,
  sidewalk: 0xb9b3a4,
  grass: 0x77a75a,
  plaza: 0xcfc4ae,
};
