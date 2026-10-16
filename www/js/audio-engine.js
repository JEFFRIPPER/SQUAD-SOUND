/* SQUAD SOUND — аудиодвижок на Web Audio API.
 *
 * Цепочка:
 * <audio A|B> → (кроссфейд) → pitch (AudioWorklet) → preamp → EQ x10 → bass → width(M/S)
 *        → [dry | reverb | echo] → pan (+8D LFO) → limiter → master → analyser → out
 */
(function () {
  'use strict';

  const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  // Гранулярный pitch-shifter: две «читающие головки» по кольцевому буферу
  // с треугольно-синусным кроссфейдом. Скорость не меняет, только тон.
  const PITCH_WORKLET = `
class SquadPitch extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.size = 16384;
    this.win = Math.round(sampleRate * 0.05);
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.w = 0;
    this.phase = 0;
  }
  read(ch, d) {
    const b = this.buf[ch];
    let pos = this.w - d;
    while (pos < 0) pos += this.size;
    const i = Math.floor(pos);
    const f = pos - i;
    return b[i % this.size] * (1 - f) + b[(i + 1) % this.size] * f;
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output.length) return true;
    const ratio = params.ratio[0];
    const n = output[0].length;
    const chans = Math.min(output.length, 2);
    if (!input.length) { for (const o of output) o.fill(0); return true; }
    if (Math.abs(ratio - 1) < 1e-4) {
      for (let c = 0; c < output.length; c++) output[c].set(input[Math.min(c, input.length - 1)]);
      return true;
    }
    const step = (1 - ratio) / this.win;
    for (let s = 0; s < n; s++) {
      for (let c = 0; c < chans; c++) {
        const src = input[Math.min(c, input.length - 1)];
        this.buf[c][this.w] = src[s];
      }
      let p1 = this.phase;
      let p2 = p1 + 0.5; if (p2 >= 1) p2 -= 1;
      const d1 = p1 * this.win + 2;
      const d2 = p2 * this.win + 2;
      const g1 = Math.sin(Math.PI * p1);
      const g2 = Math.sin(Math.PI * p2);
      for (let c = 0; c < chans; c++) {
        output[c][s] = this.read(c, d1) * g1 + this.read(c, d2) * g2;
      }
      this.w = (this.w + 1) % this.size;
      this.phase += step;
      if (this.phase >= 1) this.phase -= 1;
      if (this.phase < 0) this.phase += 1;
    }
    for (let c = chans; c < output.length; c++) output[c].set(output[0]);
    return true;
  }
}
registerProcessor('squad-pitch', SquadPitch);
`;

  function makeImpulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const ir = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return ir;
  }

  class AudioEngine {
    // Две «деки» (два <audio>) — для кроссфейда и переходов без пауз.
    constructor(audioEl, audioEl2) {
      this.decks = [audioEl, audioEl2].filter(Boolean);
      this.active = 0;
      this.ctx = null;
      this.ready = null;
      this.state = {
        speed: 1, pitch: 0, vinyl: false,
        eqOn: true, preamp: 0, eq: EQ_FREQS.map(() => 0),
        bass: 0, width: 1, balance: 0,
        reverbMix: 0, reverbSize: 2.5,
        echoMix: 0, echoTime: 0.3, echoFeedback: 0.35,
        eightD: false, eightDSpeed: 0.15,
        limiter: true, volume: 0.9,
      };
    }

    // AudioContext можно создать только после жеста пользователя.
    init() {
      if (this.ready) return this.ready;
      this.ready = this._build();
      return this.ready;
    }

    async _build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC({ latencyHint: 'playback' });
      this.ctx = ctx;
      const n = {};
      this.nodes = n;

      n.input = ctx.createGain();
      n.deckGain = this.decks.map((el, i) => {
        const g = ctx.createGain();
        g.gain.value = i === this.active ? 1 : 0;
        ctx.createMediaElementSource(el).connect(g).connect(n.input);
        return g;
      });

      n.pitch = null;
      try {
        const url = URL.createObjectURL(new Blob([PITCH_WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        n.pitch = new AudioWorkletNode(ctx, 'squad-pitch', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        });
      } catch (e) {
        console.warn('Pitch worklet недоступен, тон будет связан со скоростью', e);
      }

      n.preamp = ctx.createGain();
      n.eq = EQ_FREQS.map((f, i) => {
        const b = ctx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f;
        b.Q.value = 1.1;
        return b;
      });
      n.bass = ctx.createBiquadFilter();
      n.bass.type = 'lowshelf';
      n.bass.frequency.value = 90;

      // Стерео-ширина: L' = L·a + R·b, R' = R·a + L·b
      n.split = ctx.createChannelSplitter(2);
      n.merge = ctx.createChannelMerger(2);
      n.ll = ctx.createGain(); n.rl = ctx.createGain();
      n.rr = ctx.createGain(); n.lr = ctx.createGain();
      n.split.connect(n.ll, 0); n.ll.connect(n.merge, 0, 0);
      n.split.connect(n.rl, 1); n.rl.connect(n.merge, 0, 0);
      n.split.connect(n.rr, 1); n.rr.connect(n.merge, 0, 1);
      n.split.connect(n.lr, 0); n.lr.connect(n.merge, 0, 1);

      n.dry = ctx.createGain();
      n.convolver = ctx.createConvolver();
      n.reverbWet = ctx.createGain();
      n.delay = ctx.createDelay(2);
      n.feedback = ctx.createGain();
      n.echoWet = ctx.createGain();
      n.bus = ctx.createGain();

      n.pan = ctx.createStereoPanner();
      n.lfo = ctx.createOscillator();
      n.lfoDepth = ctx.createGain();
      n.lfo.connect(n.lfoDepth).connect(n.pan.pan);
      n.lfo.start();

      n.limiter = ctx.createDynamicsCompressor();
      n.limiter.threshold.value = -3;
      n.limiter.knee.value = 3;
      n.limiter.ratio.value = 20;
      n.limiter.attack.value = 0.003;
      n.limiter.release.value = 0.15;
      n.master = ctx.createGain();
      n.analyser = ctx.createAnalyser();
      n.analyser.fftSize = 2048;
      n.analyser.smoothingTimeConstant = 0.8;

      // Сборка графа
      let head = n.input;
      if (n.pitch) { head.connect(n.pitch); head = n.pitch; }
      head.connect(n.preamp);
      let prev = n.preamp;
      for (const b of n.eq) { prev.connect(b); prev = b; }
      prev.connect(n.bass);
      n.bass.connect(n.split);

      n.merge.connect(n.dry).connect(n.bus);
      n.merge.connect(n.convolver).connect(n.reverbWet).connect(n.bus);
      n.merge.connect(n.delay);
      n.delay.connect(n.feedback).connect(n.delay);
      n.delay.connect(n.echoWet).connect(n.bus);

      n.bus.connect(n.pan);
      this._routeLimiter();

      n.master.connect(n.analyser).connect(ctx.destination);

      this._lastIr = null;
      this.applyAll();
      return this;
    }

    get audio() { return this.decks[this.active]; }
    get idle() { return this.decks[1 - this.active] || null; }

    // Мгновенно переключить активную деку (без фейда)
    swap() {
      if (!this.idle) return;
      this.active = 1 - this.active;
      this._gains(0);
    }

    // Плавный переход на другую деку (равная мощность), seconds — длительность
    crossfade(seconds) {
      if (!this.idle) return;
      this.active = 1 - this.active;
      this._gains(seconds);
    }

    _gains(seconds) {
      const n = this.nodes;
      if (!n) return;
      const t = this.ctx.currentTime;
      n.deckGain.forEach((g, i) => {
        const on = i === this.active;
        const from = g.gain.value;
        g.gain.cancelScheduledValues(t);
        if (!seconds) { g.gain.setValueAtTime(on ? 1 : 0, t); return; }
        const N = 64, curve = new Float32Array(N);
        for (let k = 0; k < N; k++) {
          const x = k / (N - 1);
          const target = on ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2);
          curve[k] = on ? Math.max(from, target) : Math.min(from, target);
        }
        try { g.gain.setValueCurveAtTime(curve, t + 0.005, seconds); }
        catch (_) { g.gain.setValueAtTime(on ? 1 : 0, t); }
      });
    }

    _routeLimiter() {
      const n = this.nodes;
      try { n.pan.disconnect(); } catch (_) {}
      try { n.limiter.disconnect(); } catch (_) {}
      if (this.state.limiter) {
        n.pan.connect(n.limiter).connect(n.master);
      } else {
        n.pan.connect(n.master);
      }
    }

    set(key, value) {
      this.state[key] = value;
      if (this.ctx) this.apply(key);
      else if (key === 'speed' || key === 'vinyl' || key === 'volume') this.apply(key);
    }

    setEqBand(i, db) {
      this.state.eq[i] = db;
      if (this.ctx) this.apply('eq');
    }

    load(state) {
      Object.assign(this.state, state || {});
      if (!Array.isArray(this.state.eq) || this.state.eq.length !== EQ_FREQS.length) {
        this.state.eq = EQ_FREQS.map(() => 0);
      }
      this.applyAll();
    }

    applyAll() {
      ['speed', 'eq', 'bass', 'width', 'balance', 'reverb', 'echo', 'eightD', 'limiter', 'volume']
        .forEach((k) => this.apply(k));
    }

    apply(key) {
      const s = this.state;
      const decks = this.decks;
      const n = this.nodes;
      const t = this.ctx ? this.ctx.currentTime : 0;
      const smooth = (param, v) => param.setTargetAtTime(v, t, 0.03);

      switch (key) {
        case 'speed': case 'pitch': case 'vinyl': {
          // Винил: тон меняется вместе со скоростью (Nightcore / Slowed)
          const keep = !s.vinyl;
          for (const a of decks) {
            a.playbackRate = s.speed;
            a.preservesPitch = keep;
            a.mozPreservesPitch = keep;
            a.webkitPreservesPitch = keep;
          }
          if (n && n.pitch) {
            n.pitch.parameters.get('ratio').value = Math.pow(2, s.pitch / 12);
          }
          break;
        }
        case 'volume':
          if (n) { decks.forEach((a) => { a.volume = 1; }); smooth(n.master.gain, s.volume * s.volume); }
          else decks.forEach((a) => { a.volume = s.volume * s.volume; });
          break;
        case 'eq': case 'eqOn': case 'preamp':
          if (!n) break;
          smooth(n.preamp.gain, Math.pow(10, (s.eqOn ? s.preamp : 0) / 20));
          n.eq.forEach((b, i) => smooth(b.gain, s.eqOn ? s.eq[i] : 0));
          break;
        case 'bass':
          if (n) smooth(n.bass.gain, s.bass);
          break;
        case 'width': {
          if (!n) break;
          const w = s.width;
          const same = (1 + w) / 2;
          const cross = (1 - w) / 2;
          smooth(n.ll.gain, same); smooth(n.rr.gain, same);
          smooth(n.rl.gain, cross); smooth(n.lr.gain, cross);
          break;
        }
        case 'balance':
          if (n) smooth(n.pan.pan, s.balance);
          break;
        case 'reverb': case 'reverbMix': case 'reverbSize': {
          if (!n) break;
          if (this._lastIr !== s.reverbSize) {
            n.convolver.buffer = makeImpulse(this.ctx, s.reverbSize, 2.5 + s.reverbSize);
            this._lastIr = s.reverbSize;
          }
          smooth(n.reverbWet.gain, s.reverbMix * 1.4);
          smooth(n.dry.gain, 1 - s.reverbMix * 0.35);
          break;
        }
        case 'echo': case 'echoMix': case 'echoTime': case 'echoFeedback':
          if (!n) break;
          smooth(n.delay.delayTime, s.echoTime);
          smooth(n.feedback.gain, Math.min(s.echoFeedback, 0.9));
          smooth(n.echoWet.gain, s.echoMix);
          break;
        case 'eightD': case 'eightDSpeed':
          if (!n) break;
          smooth(n.lfo.frequency, s.eightDSpeed);
          smooth(n.lfoDepth.gain, s.eightD ? 0.9 : 0);
          break;
        case 'limiter':
          if (n) this._routeLimiter();
          break;
      }
    }

    get hasPitch() { return !!(this.nodes && this.nodes.pitch); }
    get analyser() { return this.nodes ? this.nodes.analyser : null; }
  }

  AudioEngine.EQ_FREQS = EQ_FREQS;
  window.AudioEngine = AudioEngine;
})();
