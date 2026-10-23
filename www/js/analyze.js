/* SQUAD SOUND — темп (BPM) и тональность трека.
 * Файл декодируется в 11 025 Гц моно (браузер делает это в своём потоке), сам разбор идёт в Web Worker,
 * чтобы интерфейс и звук не подвисали.
 *  BPM: огибающая атак (спектральный поток, окно 512, шаг 128) → автокорреляция 60–200 уд/мин
 *       с мягким предпочтением 120, итог приводится к 70–180.
 *  Тональность: хрома по FFT 4096 (100 Гц – 2 кГц, каждый кадр нормирован, чтобы бас и громкие места
 *       не перевешивали) → корреляция с профилями Шаата (24 тональности). Определение примерное.
 */
(function () {
  'use strict';

  const SR = 11025;
  const MAX_SEC = 240;

  const WORKER = `
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const xr = re[i + k + h] * cr - im[i + k + h] * ci, xi = re[i + k + h] * ci + im[i + k + h] * cr;
        re[i + k + h] = re[i + k] - xr; im[i + k + h] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const hann = (n) => { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w; };

function bpmOf(x, sr) {
  const N = 512, H = 128, w = hann(N), re = new Float32Array(N), im = new Float32Array(N);
  const frames = Math.floor((x.length - N) / H);
  if (frames < 200) return 0;
  const env = new Float32Array(frames);
  let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
  for (let f = 0; f < frames; f++) {
    const o = f * H;
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * w[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    for (let k = 1; k < N / 2; k++) {
      cur[k] = Math.log(1 + 100 * Math.hypot(re[k], im[k]));
      const d = cur[k] - prev[k];
      if (d > 0) flux += d;
    }
    env[f] = flux;
    const t = prev; prev = cur; cur = t;
  }
  // убираем медленный дрейф (скользящее среднее ~0,5 с)
  const fps = sr / H, win = Math.round(fps / 2);
  const hp = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += env[f]; if (f >= win) acc -= env[f - win];
    const v = env[f] - acc / Math.min(f + 1, win);
    hp[f] = v > 0 ? v : 0;
  }
  const minLag = Math.floor(fps * 60 / 200), maxLag = Math.ceil(fps * 60 / 60);
  const ac = new Float32Array(maxLag + 2);
  for (let l = minLag - 1; l <= maxLag + 1; l++) {
    let s = 0;
    for (let f = l; f < frames; f++) s += hp[f] * hp[f - l];
    ac[l] = s / (frames - l);
  }
  let best = -1, bl = 0;
  for (let l = minLag; l <= maxLag; l++) {
    const bpm = 60 * fps / l;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const v = ac[l] * prior;
    if (v > best) { best = v; bl = l; }
  }
  if (!bl || best <= 0) return 0;
  const a = ac[bl - 1], b = ac[bl], c = ac[bl + 1];
  const den = a - 2 * b + c;
  const lag = bl + (den ? 0.5 * (a - c) / den : 0);
  let bpm = 60 * fps / lag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}

const MAJ = [6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.4];
const MIN = [6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 5.2, 4.0, 2.7, 4.3, 3.2];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function corr(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
}
function keyOf(x, sr) {
  const N = 4096, w = hann(N), re = new Float32Array(N), im = new Float32Array(N);
  const chroma = new Float64Array(12);
  const pc = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = k * sr / N;
    if (f < 100 || f > 2000) continue;
    pc[k] = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
  }
  const hop = N * 2;
  for (let o = 0; o + N <= x.length; o += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const fr = new Float64Array(12);
    for (let k = 1; k < N / 2; k++) if (pc[k] >= 0) fr[pc[k]] += Math.hypot(re[k], im[k]);
    const mx = Math.max(...fr);
    if (mx > 1e-6) for (let i = 0; i < 12; i++) chroma[i] += fr[i] / mx;
  }
  if (!chroma.some((v) => v > 0)) return '';
  let best = -2, name = '';
  for (let r = 0; r < 12; r++) {
    const rot = Array.from({ length: 12 }, (_, i) => chroma[(i + r) % 12]);
    const cM = corr(rot, MAJ), cm = corr(rot, MIN);
    if (cM > best) { best = cM; name = NAMES[r]; }
    if (cm > best) { best = cm; name = NAMES[r] + 'm'; }
  }
  return name;
}
onmessage = (e) => {
  const { id, pcm, sr } = e.data;
  try { postMessage({ id, bpm: bpmOf(pcm, sr), key: keyOf(pcm, sr) }); }
  catch (err) { postMessage({ id, error: String(err && err.message || err) }); }
};
`;

  let worker = null, seq = 0;
  const waiting = new Map();
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'application/javascript' })));
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.rej(new Error(e.data.error)); else w.res({ bpm: e.data.bpm, key: e.data.key, peaks: w.peaks });
    };
    worker.onerror = (e) => { waiting.forEach((w) => w.rej(new Error(e.message || 'worker'))); waiting.clear(); worker = null; };
    return worker;
  }

  // ArrayBuffer файла → {bpm, key}
  async function run(buf) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ab = await new AC(1, 1, SR).decodeAudioData(buf);
    // форма волны для ползунка: 160 столбиков по пикам всего трека (0..255)
    const PK = 160, ch0 = ab.getChannelData(0), ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0;
    const step = ab.length / PK, peaks = new Array(PK);
    let top = 1e-6;
    for (let b = 0; b < PK; b++) {
      let m = 0;
      for (let i = Math.floor(b * step), e = Math.floor((b + 1) * step); i < e; i += 4) { const v = Math.abs(ch0[i]) + Math.abs(ch1[i]); if (v > m) m = v; }
      peaks[b] = m; if (m > top) top = m;
    }
    for (let b = 0; b < PK; b++) peaks[b] = Math.round(peaks[b] / top * 255);
    const start = ab.duration > 60 ? Math.floor(10 * SR) : 0; // вступление часто без барабанов
    const len = Math.min(ab.length - start, MAX_SEC * SR);
    if (len < 8 * SR) throw new Error('слишком короткий трек');
    const pcm = new Float32Array(len);
    for (let c = 0; c < ab.numberOfChannels; c++) {
      const d = ab.getChannelData(c);
      for (let i = 0; i < len; i++) pcm[i] += d[start + i] / ab.numberOfChannels;
    }
    const id = ++seq;
    return new Promise((res, rej) => {
      waiting.set(id, { res, rej, peaks });
      getWorker().postMessage({ id, pcm, sr: SR }, [pcm.buffer]);
    });
  }

  // Камелот (для диджеев): Am = 8A, C = 8B
  const CAMELOT = { 'G#m': '1A', 'D#m': '2A', 'A#m': '3A', Fm: '4A', Cm: '5A', Gm: '6A', Dm: '7A', Am: '8A', Em: '9A', Bm: '10A', 'F#m': '11A', 'C#m': '12A',
    B: '1B', 'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B', 'A#': '6B', F: '7B', C: '8B', G: '9B', D: '10B', A: '11B', E: '12B' };

  window.SquadAnalyze = { run, camelot: (k) => CAMELOT[k] || '' };
})();
