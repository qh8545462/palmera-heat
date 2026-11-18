// input.js — keyboard and mouse state for the whole game. Everything reads
// the shared `keys` set and the accumulated mouse movement; pointer lock is
// requested by main.js when play begins.

export const keys = new Set();
const edges = new Set();
export const mouse = { dx: 0, dy: 0, down: false, clicked: false };
export let pointerLocked = false;

const HANDLED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function initInput(dom) {
  window.addEventListener('keydown', (e) => {
    if (HANDLED.has(e.code)) e.preventDefault();
    if (!e.repeat) edges.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });

  dom.addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  dom.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === dom;
  });
}

export function lockPointer(dom) {
  if (document.pointerLockElement !== dom) dom.requestPointerLock();
}

export function releasePointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

// Called once per frame by the loop: hands out the mouse delta gathered
// since last frame and clears the one-frame click flag.
export function consumeMouse() {
  const out = { dx: mouse.dx, dy: mouse.dy, clicked: mouse.clicked };
  mouse.dx = 0; mouse.dy = 0; mouse.clicked = false;
  return out;
}

export function pressed(code) { return keys.has(code); }

// The set of keys whose keydown arrived since the last call — an edge
// survives even when a whole tap fits between two rendered frames.
export function consumeEdges() {
  const out = new Set(edges);
  edges.clear();
  return out;
}
