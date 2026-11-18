// hud.js — everything drawn over the 3D view: the minimap, money, stars,
// health, the objective line, dialogue, banners and toasts, plus the
// start, pause and BUSTED/WASTED screens. The DOM lives in index.html;
// this class drives it.

import { ROADS, SEA_X } from './config.js';

const el = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = el('hud');
    this.money = el('money');
    this.stars = el('stars');
    this.healthFill = el('healthfill');
    this.bustedWrap = el('bustedwrap');
    this.bustedFill = el('bustedfill');
    this.objective = el('objective');
    this.objTimer = el('objtimer');
    this.prompt = el('prompt');
    this.dialogueBox = el('dialogue');
    this.dlgWho = el('dlg-who');
    this.dlgText = el('dlg-text');
    this.bannerBox = el('banner');
    this.bannerTitle = el('banner-title');
    this.bannerSub = el('banner-sub');
    this.toastBox = el('toast');
    this.crosshair = el('crosshair');
    this.startScreen = el('startscreen');
    this.pauseScreen = el('pausescreen');
    this.endFlash = el('endflash');
    this.endTitle = el('end-title');
    this.endSub = el('end-sub');
    this.vignette = el('vignette');
    this.minimap = el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.bannerTime = 0;
    this.toastTime = 0;
    this.endTime = 0;
    this.lastStars = -1;
    this.lastHealth = -1;
  }

  showHud() { this.root.style.display = 'block'; }
  hideHud() { this.root.style.display = 'none'; }

  showStart(hasSave) {
    this.startScreen.style.display = 'flex';
    el('btn-continue').style.display = hasSave ? 'block' : 'none';
  }
  hideStart() { this.startScreen.style.display = 'none'; }
  showPause() { this.pauseScreen.style.display = 'flex'; }
  hidePause() { this.pauseScreen.style.display = 'none'; }

  banner(title, sub) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub || '';
    this.bannerBox.style.opacity = '1';
    this.bannerTime = 3;
  }

  toast(text) {
    this.toastBox.textContent = text;
    this.toastBox.style.opacity = '1';
    this.toastTime = 2.4;
  }

  showDialogue(who, text) {
    this.dlgWho.textContent = who;
    this.dlgText.textContent = text;
    this.dialogueBox.style.display = 'block';
  }
  hideDialogue() { this.dialogueBox.style.display = 'none'; }

  setPrompt(text) {
    this.prompt.textContent = text;
    this.prompt.style.opacity = text ? '1' : '0';
  }

  showEnd(title, sub) {
    this.endTitle.textContent = title;
    this.endSub.textContent = sub || '';
    this.endFlash.style.opacity = '1';
    this.endTime = 2;
  }

  update(dt, s) {
    // s: { money, stars, health, busted, objective, objTimer, urgent, inCar, firing }
    this.money.textContent = '$' + s.money.toLocaleString('en-US');
    if (s.stars !== this.lastStars) {
      this.lastStars = s.stars;
      this.stars.textContent = '★★★★★'.slice(0, s.stars) + '☆☆☆☆☆'.slice(0, 5 - s.stars);
      this.stars.style.color = s.stars > 0 ? '#ffc63c' : 'rgba(255,255,255,0.25)';
    }
    const hp = Math.max(0, Math.round(s.health));
    if (hp !== this.lastHealth) {
      this.lastHealth = hp;
      this.healthFill.style.width = hp + '%';
      this.healthFill.style.background = hp > 35 ? '#7ec850' : '#e0483c';
    }
    this.vignette.style.opacity = s.health < 35 ? String(0.55 * (1 - s.health / 35)) : '0';
    if (s.busted > 0.02) {
      this.bustedWrap.style.display = 'block';
      this.bustedFill.style.width = Math.round(s.busted * 100) + '%';
    } else {
      this.bustedWrap.style.display = 'none';
    }
    this.objective.textContent = s.objective || '';
    if (s.objTimer) {
      this.objTimer.textContent = s.objTimer;
      this.objTimer.style.display = 'inline-block';
      this.objTimer.style.color = s.urgent ? '#ff5a4c' : '#ffd76a';
    } else {
      this.objTimer.style.display = 'none';
    }
    this.crosshair.style.display = (!s.inCar && s.playing) ? 'block' : 'none';

    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) this.bannerBox.style.opacity = '0';
    }
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0) this.toastBox.style.opacity = '0';
    }
    if (this.endTime > 0) {
      this.endTime -= dt;
      if (this.endTime <= 0) this.endFlash.style.opacity = '0';
    }
  }

  // The minimap: streets, the sea, the player, traffic, police, objective.
  drawMinimap(view) {
    const g = this.mm;
    const W = this.minimap.width, H = this.minimap.height;
    const X0 = -245, Z0 = -245, SPAN = 590; // world window shown
    const px = (x) => (x - X0) / SPAN * W;
    const pz = (z) => (z - Z0) / SPAN * H;

    g.fillStyle = '#24313d';
    g.fillRect(0, 0, W, H);
    // sea
    g.fillStyle = '#2e6d94';
    g.fillRect(px(SEA_X), 0, W - px(SEA_X), H);
    // sand
    g.fillStyle = '#c9b183';
    g.fillRect(px(216), 0, px(SEA_X) - px(216), H);
    // blocks
    g.fillStyle = '#31424f';
    for (const cx of [-144, -72, 0, 72, 144]) {
      for (const cz of [-144, -72, 0, 72, 144]) {
        g.fillRect(px(cx - 29), pz(cz - 29), px(cx + 29) - px(cx - 29), pz(cz + 29) - pz(cz - 29));
      }
    }
    // roads
    g.strokeStyle = '#5a6a76';
    g.lineWidth = 3;
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), H); g.stroke();
      g.beginPath(); g.moveTo(0, pz(r)); g.lineTo(W, pz(r)); g.stroke();
    }
    // objective
    if (view.objective) {
      g.strokeStyle = '#ffc63c';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px(view.objective.x), pz(view.objective.z), 6 + Math.sin(view.t * 4) * 1.5, 0, Math.PI * 2);
      g.stroke();
    }
    // traffic
    g.fillStyle = '#aeb8bf';
    for (const c of view.traffic) {
      g.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3);
    }
    // police
    g.fillStyle = '#3f8cff';
    for (const c of view.police) {
      g.beginPath();
      g.arc(px(c.x), pz(c.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    // player arrow
    const x = px(view.player.x), y = pz(view.player.z);
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI - view.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(4.6, 5); g.lineTo(0, 2.4); g.lineTo(-4.6, 5);
    g.closePath(); g.fill();
    g.restore();
  }
}
