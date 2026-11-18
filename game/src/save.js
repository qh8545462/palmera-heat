// save.js — the localStorage save: money, story stage and finished jobs.
// Small on purpose; the game stays playable with no save at all.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.stage !== 'number') return null;
    return { money: data.money, stage: data.stage, jobsDone: data.jobsDone | 0 };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      stage: state.stage,
      jobsDone: state.jobsDone,
    }));
  } catch {
    // storage full or blocked: the run simply is not saved
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}
