// 全程序化音效（WebAudio），不依赖任何音频素材
export class Sfx {
  constructor() { this.ctx = null; }

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 风声：带通噪声 + 慢速 LFO
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 220;
    lfo.connect(lg); lg.connect(bp.frequency);
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    n.connect(bp); bp.connect(this.wind); this.wind.connect(this.master);
    n.start(); lfo.start();

    // 低频压迫感 drone（3D 房间用）
    this.drone = ctx.createGain(); this.drone.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    for (const f of [41, 43.5, 61.7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.22;
      o.connect(g); g.connect(lp); o.start();
    }
    lp.connect(this.drone); this.drone.connect(this.master);

    // 电流嗡鸣
    this.humG = ctx.createGain(); this.humG.gain.value = 0;
    for (const [f, v] of [[100, .5], [200, .2], [300, .08]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = v;
      o.connect(g); g.connect(this.humG); o.start();
    }
    this.humG.connect(this.master);
  }

  _out(vol = 1, pan = 0) {
    const g = this.ctx.createGain(); g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  noise({ dur = .2, freq = 800, q = 1, vol = 1, pan = 0, type = 'lowpass', when = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(1, t + 0.005);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(e); e.connect(this._out(vol, pan));
    s.start(t, Math.random()); s.stop(t + dur + .05);
  }

  tone({ freq = 440, f2 = null, dur = .2, type = 'sine', vol = 1, pan = 0, when = 0, attack = .005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(1, t + attack);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(this._out(vol, pan));
    o.start(t); o.stop(t + dur + .05);
  }

  setWind(v) { if (this.ctx) this.wind.gain.setTargetAtTime(v, this.ctx.currentTime, .6); }
  setDrone(v) { if (this.ctx) this.drone.gain.setTargetAtTime(v, this.ctx.currentTime, .8); }
  hum(on) { if (this.ctx) this.humG.gain.setTargetAtTime(on ? .09 : 0, this.ctx.currentTime, on ? .2 : .02); }

  knock(n, { vol = 1, pan = 0, gap = .45, when = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const w = when + i * gap;
      this.tone({ freq: 120, f2: 55, dur: .16, vol: vol * 1.3, pan, when: w });
      this.noise({ dur: .07, freq: 700, vol: vol * .8, pan, when: w });
    }
  }
  step(vol = .3, pan = 0) {
    this.noise({ dur: .11, freq: 170 + Math.random() * 60, vol, pan });
    this.tone({ freq: 70, f2: 45, dur: .09, vol: vol * .8, pan });
  }
  blip() { this.tone({ freq: 660, f2: 990, dur: .09, type: 'square', vol: .12 }); this.tone({ freq: 990, f2: 1320, dur: .1, type: 'square', vol: .1, when: .09 }); }
  tick() { this.tone({ freq: 520, dur: .03, type: 'square', vol: .05 }); }
  clunk(pan = 0) { this.noise({ dur: .09, freq: 1400, vol: .7, pan }); this.tone({ freq: 180, f2: 90, dur: .12, type: 'square', vol: .25, pan }); }
  creak(vol = .4, pan = 0, dur = .8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(260 + Math.random() * 60, t + dur * .5);
    o.frequency.linearRampToValueAtTime(170, t + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 9;
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(1, t + dur * .3);
    e.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(e); e.connect(this._out(vol, pan));
    o.start(t); o.stop(t + dur + .05);
  }
  door() { this.creak(.35, 0, .6); this.noise({ dur: .18, freq: 300, vol: .7, when: .55 }); this.tone({ freq: 80, f2: 50, dur: .15, vol: .6, when: .55 }); }
  slam(pan = 0) { this.noise({ dur: .45, freq: 350, vol: 1.6, pan }); this.tone({ freq: 70, f2: 35, dur: .4, vol: 1.5, pan }); }
  crash(pan = 0) {
    for (let i = 0; i < 6; i++) this.noise({ dur: .12 + Math.random() * .15, freq: 2500 + Math.random() * 3000, type: 'highpass', vol: .5, pan, when: i * .05 + Math.random() * .04 });
    this.tone({ freq: 110, f2: 60, dur: .2, vol: .8, pan });
  }
  pop() { this.noise({ dur: .1, freq: 3000, type: 'highpass', vol: 1.3 }); this.tone({ freq: 900, f2: 80, dur: .18, type: 'square', vol: .5 }); }
  hiss(pan = 0) { this.noise({ dur: .9, freq: 4000, type: 'highpass', vol: .5, pan }); this.tone({ freq: 300, f2: 40, dur: .8, type: 'sawtooth', vol: .25, pan }); }
  heartbeat(vol = .5) {
    this.tone({ freq: 62, f2: 40, dur: .13, vol });
    this.tone({ freq: 55, f2: 36, dur: .15, vol: vol * .7, when: .2 });
  }
  thump(vol = .8, pan = 0) { this.tone({ freq: 75, f2: 38, dur: .5, vol, pan }); this.noise({ dur: .2, freq: 200, vol: vol * .6, pan }); }
  // 跳吓刺耳和弦
  stinger(vol = 1) {
    for (const m of [1, 1.06, 1.414, 2.12, 2.97, 4.1]) {
      this.tone({ freq: 196 * m, f2: 196 * m * (.92 + Math.random() * .2), dur: 1.3, type: 'sawtooth', vol: vol * .28, pan: Math.random() * 1.2 - .6, attack: .01 });
    }
    this.noise({ dur: .7, freq: 1800, type: 'highpass', vol: vol * 1.1 });
    this.tone({ freq: 55, f2: 30, dur: 1.1, vol: vol * 1.4 });
  }
  // 墙体移动的低频隆隆声
  rumble(dur = 1.8) {
    this.noise({ dur, freq: 110, vol: 2.2 }); this.noise({ dur: dur * .8, freq: 420, q: 2, type: 'bandpass', vol: .5 });
    this.tone({ freq: 46, f2: 30, dur, type: 'sawtooth', vol: .5, attack: .15 });
  }
  // 追逐音乐：150 BPM 的十六分音符低音 + 鼓点 + 颤动的不协和高音
  chase(on) {
    if (!this.ctx) return;
    if (!on) {
      clearInterval(this._chT); this._chT = null;
      if (this._chS) { const { g, os } = this._chS; g.gain.setTargetAtTime(0, this.ctx.currentTime, .15); setTimeout(() => os.forEach((o) => o.stop()), 900); this._chS = null; }
      return;
    }
    if (this._chT) return;
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = .8;
    const trem = ctx.createGain(); trem.gain.value = .6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = .4; lfo.connect(lg); lg.connect(trem.gain);
    const os = [293.7, 587.3, 622.3, 880].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bp); o.start(); return o; });
    lfo.start(); os.push(lfo);
    bp.connect(trem); trem.connect(g); g.connect(this.master);
    g.gain.setTargetAtTime(.075, ctx.currentTime, .4);
    this._chS = { g, os };
    const bass = [73.4, 73.4, 87.3, 73.4, 110, 73.4, 103.8, 98];
    let i = 0;
    this._chT = setInterval(() => {
      const st = i % 16;
      if (st % 4 === 0) this.tone({ freq: 120, f2: 36, dur: .17, vol: 1.1 });
      if (st % 8 === 4) this.noise({ dur: .13, freq: 1700, q: .8, type: 'bandpass', vol: .7 });
      if (st % 2 === 1) this.noise({ dur: .04, freq: 7000, type: 'highpass', vol: .18 });
      this.tone({ freq: bass[(i >> 1) % 8] * (st % 2 ? 2 : 1), dur: .1, type: 'sawtooth', vol: .2 });
      if (st === 14) this.tone({ freq: 1244, f2: 1175, dur: .22, type: 'square', vol: .05 });
      i++;
    }, 100);
  }
  glitch() {
    for (let i = 0; i < 7; i++) this.tone({ freq: 80 + Math.random() * 1800, dur: .04, type: 'square', vol: .16, when: i * .05 });
    this.noise({ dur: .35, freq: 2500, type: 'bandpass', q: 3, vol: .5 });
  }
}
