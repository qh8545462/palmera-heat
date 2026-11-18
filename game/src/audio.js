// audio.js — every sound in Palmera Heat is synthesised with WebAudio:
// engine, siren, gunshots, crashes, chimes and a small bassline loop.
// Nothing is loaded from a file. The context starts on the first user
// gesture (the start screen button), as browsers require.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = 0;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // engine: a sawtooth through a lowpass, pitch follows speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // siren: a square wave whose pitch wobbles between two tones
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  // speedRatio 0..1 while driving, null when not in a car
  engine(speedRatio) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    if (speedRatio === null) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    } else {
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.05);
      this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.05, t, 0.05);
    }
  }

  // level 0..1: how present the police siren should be this frame
  siren(level) {
    if (!this.ctx || !this.sirenOsc) return;
    const t = this.ctx.currentTime;
    if (level <= 0) {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.1);
    } else {
      const wobble = 660 + 240 * (0.5 + 0.5 * Math.sin(t * 5.2));
      this.sirenOsc.frequency.setTargetAtTime(wobble, t, 0.03);
      this.sirenGain.gain.setTargetAtTime(0.028 * level, t, 0.1);
    }
  }

  blip(freq = 660, dur = 0.07, vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  chime() { this.blip(880, 0.12, 0.12); setTimeout(() => this.blip(1320, 0.16, 0.1), 70); }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.16;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  crash(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.28;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.4 * Math.min(1, strength);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  // A lazy minor-key bassline with soft hats, stepped by the game loop.
  updateMusic(dt, playing) {
    if (!this.ctx || !playing) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.235;
    const scale = [0, 0, 7, 0, 5, 0, 3, 10]; // A minor groove, semitone offsets
    const step = this.musicStep++ % scale.length;
    const root = 55 * Math.pow(2, scale[step] / 12);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = root * 2;
    gain.gain.setValueAtTime(0.055, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + 0.24);
    if (step % 2 === 0) { // hat: a breath of high noise
      const dur = 0.03;
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7000;
      const hg = this.ctx.createGain();
      hg.gain.value = 0.012;
      src.connect(hp).connect(hg).connect(this.master);
      src.start(t);
    }
  }
}
