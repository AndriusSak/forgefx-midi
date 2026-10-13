/**
 * Pure audio DSP for the cab-IR import path: a `.wav` reader, mono mix-down, a windowed-sinc resampler,
 * the minimum-phase transform (MPT) and auto-trim. NO device knowledge lives here — it turns bytes into
 * `Float64Array`s and back into shorter ones, and every function is checked against a signal whose output
 * can be computed independently (see `test/gen3/fm3/cab-ir-audio.test.ts`).
 *
 * BROWSER-SAFE: no `node:` imports, no Buffer — plain typed arrays, so Axis can run the conversion
 * client-side from the self-contained `forgefx-midi/devices/gen3/cabIrConvert` subpath.
 */

// ── WAV reader ───────────────────────────────────────────────────────────────────────────────────

export interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** `pcm` = integer PCM (format tag 1), `float` = IEEE float (tag 3). */
  format: 'pcm' | 'float';
  /** Sample frames per channel. */
  frames: number;
  /** One array per channel, normalised to ±1.0 (PCM divided by 2^(bits-1)). */
  channelData: Float64Array[];
}

const WAVE_FORMAT_PCM = 0x0001;
const WAVE_FORMAT_FLOAT = 0x0003;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

function tag4(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
}

/**
 * Parse a RIFF/WAVE file: integer PCM at 16 / 24 / 32 bits and IEEE float32, mono or multi-channel
 * (including WAVE_FORMAT_EXTENSIBLE wrapping either). Anything else (8-bit, float64, compressed) throws
 * with the exact reason — an IR must never be decoded by guessing.
 */
export function parseWav(input: Uint8Array | readonly number[]): WavData {
  const b = input instanceof Uint8Array ? input : Uint8Array.from(input);
  if (b.length < 12 || tag4(b, 0) !== 'RIFF' || tag4(b, 8) !== 'WAVE') {
    throw new Error('parseWav: not a RIFF/WAVE file (missing the RIFF…WAVE header)');
  }
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fmt: { tag: number; channels: number; rate: number; bits: number; blockAlign: number } | null = null;
  let dataAt = -1;
  let dataLen = 0;
  let pos = 12;
  while (pos + 8 <= b.length) {
    const id = tag4(b, pos);
    const size = dv.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > b.length) throw new Error('parseWav: truncated fmt chunk');
      let tag = dv.getUint16(body, true);
      if (tag === WAVE_FORMAT_EXTENSIBLE) {
        if (size < 26 || body + 26 > b.length) throw new Error('parseWav: truncated WAVE_FORMAT_EXTENSIBLE fmt chunk');
        tag = dv.getUint16(body + 24, true); // first two bytes of the SubFormat GUID
      }
      fmt = {
        tag,
        channels: dv.getUint16(body + 2, true),
        rate: dv.getUint32(body + 4, true),
        blockAlign: dv.getUint16(body + 12, true),
        bits: dv.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      dataAt = body;
      // a streamed/odd file may declare a size past EOF (or 0xFFFFFFFF): clamp to what is there
      dataLen = Math.min(size, b.length - body);
      break;
    }
    pos = body + size + (size & 1); // chunks are word-aligned
  }
  if (!fmt) throw new Error('parseWav: no fmt chunk');
  if (dataAt < 0) throw new Error('parseWav: no data chunk');
  if (fmt.channels < 1) throw new Error('parseWav: zero channels');
  if (fmt.rate < 1) throw new Error('parseWav: zero sample rate');

  const format: 'pcm' | 'float' | null =
    fmt.tag === WAVE_FORMAT_PCM ? 'pcm' : fmt.tag === WAVE_FORMAT_FLOAT ? 'float' : null;
  if (!format) throw new Error(`parseWav: unsupported WAVE format tag 0x${fmt.tag.toString(16)} (only PCM and IEEE float)`);
  const okBits = format === 'pcm' ? [16, 24, 32] : [32];
  if (!okBits.includes(fmt.bits)) {
    throw new Error(`parseWav: ${fmt.bits}-bit ${format} is not supported (PCM 16/24/32 and float 32 only)`);
  }
  const bytesPer = fmt.bits / 8;
  const frameBytes = bytesPer * fmt.channels;
  const frames = Math.floor(dataLen / frameBytes);
  const channelData = Array.from({ length: fmt.channels }, () => new Float64Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const at = dataAt + i * frameBytes + c * bytesPer;
      let v: number;
      if (format === 'float') v = dv.getFloat32(at, true);
      else if (fmt.bits === 16) v = dv.getInt16(at, true) / 32768;
      else if (fmt.bits === 24) {
        let n = b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
        if (n & 0x800000) n -= 0x1000000;
        v = n / 8388608;
      } else v = dv.getInt32(at, true) / 2147483648;
      channelData[c]![i] = Number.isFinite(v) ? v : 0;
    }
  }
  return { sampleRate: fmt.rate, channels: fmt.channels, bitsPerSample: fmt.bits, format, frames, channelData };
}

/** Average all channels into one. (A cab IR is mono; averaging keeps a stereo file's common content.) */
export function mixToMono(w: WavData): Float64Array {
  if (w.channels === 1) return Float64Array.from(w.channelData[0]!);
  const out = new Float64Array(w.frames);
  for (const ch of w.channelData) for (let i = 0; i < w.frames; i++) out[i]! += ch[i]!;
  for (let i = 0; i < w.frames; i++) out[i]! /= w.channels;
  return out;
}

// ── resampler ────────────────────────────────────────────────────────────────────────────────────

/** Zero-crossings on each side of the sinc kernel (before any widening for down-sampling). */
export const RESAMPLE_HALF_WIDTH = 16;

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** Blackman–Harris window over `u` ∈ [-1, 1] (0 outside) — a low-sidelobe taper for the sinc kernel. */
function bh(u: number): number {
  if (u <= -1 || u >= 1) return 0;
  const t = (u + 1) * Math.PI; // 0..2π
  return 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
}

/**
 * Windowed-sinc resample from `fromRate` to `toRate`. Output length is `round(n · to / from)`. When
 * down-sampling the kernel's cutoff drops to the new Nyquist (anti-alias). Samples outside the input are
 * treated as zero, so an IR's tail rings out naturally and its start is not reflected.
 */
export function resample(x: Float64Array, fromRate: number, toRate: number): Float64Array {
  if (!(fromRate > 0) || !(toRate > 0)) throw new Error('resample: rates must be positive');
  if (fromRate === toRate) return Float64Array.from(x);
  const ratio = fromRate / toRate; // input samples per output sample
  const cutoff = Math.min(1, toRate / fromRate);
  const half = RESAMPLE_HALF_WIDTH / cutoff; // kernel half-width in INPUT samples
  const outLen = Math.round((x.length * toRate) / fromRate);
  const out = new Float64Array(outLen);
  for (let n = 0; n < outLen; n++) {
    const t = n * ratio;
    const lo = Math.max(0, Math.ceil(t - half));
    const hi = Math.min(x.length - 1, Math.floor(t + half));
    let acc = 0;
    for (let k = lo; k <= hi; k++) {
      const d = t - k;
      acc += x[k]! * cutoff * sinc(d * cutoff) * bh(d / half);
    }
    out[n] = acc;
  }
  return out;
}

// ── FFT (radix-2, in place) ──────────────────────────────────────────────────────────────────────

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place radix-2 FFT of `re`/`im` (length a power of two). `inverse` applies the 1/N scaling. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error('fft: length must be a power of two and re/im must match');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a]! += xr;
        im[a]! += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i]! /= n; im[i]! /= n; }
}

// ── minimum-phase transform ──────────────────────────────────────────────────────────────────────

/** Zero-padding factor for the cepstral method (time-aliasing of the cepstrum falls as this grows). */
export const MPT_PAD_FACTOR = 8;

/**
 * Minimum-phase counterpart of `x` (homomorphic / cepstral method): same magnitude response, the energy
 * moved as early in time as any causal signal with that magnitude allows. Output has the input's length.
 *
 *   X = FFT(x)  →  c = IFFT(ln|X|)  →  fold the cepstrum causal (c[0], 2·c[1..N/2-1], c[N/2])
 *   →  H = exp(FFT(c_min))  →  h = IFFT(H)
 *
 * A bin whose magnitude is below `1e-12 × the largest` is floored so ln() stays finite (that is what an
 * exactly-zero spectrum would otherwise do). A silent input is returned unchanged.
 */
export function minimumPhase(x: Float64Array): Float64Array {
  const len = x.length;
  if (len === 0) return new Float64Array(0);
  const n = nextPow2(len * MPT_PAD_FACTOR);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  let maxMag = 0;
  const mag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    mag[i] = Math.hypot(re[i]!, im[i]!);
    if (mag[i]! > maxMag) maxMag = mag[i]!;
  }
  if (maxMag === 0) return Float64Array.from(x);
  const floor = maxMag * 1e-12;
  const cr = new Float64Array(n);
  const ci = new Float64Array(n);
  for (let i = 0; i < n; i++) cr[i] = Math.log(Math.max(mag[i]!, floor));
  fft(cr, ci, true); // real cepstrum (imag ≈ 0)
  const fr = new Float64Array(n);
  const fi = new Float64Array(n);
  fr[0] = cr[0]!;
  for (let i = 1; i < n / 2; i++) fr[i] = 2 * cr[i]!;
  fr[n / 2] = cr[n / 2]!;
  fft(fr, fi); // log of the minimum-phase spectrum: real = ln|H|, imag = phase
  const hr = new Float64Array(n);
  const hi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const m = Math.exp(fr[i]!);
    hr[i] = m * Math.cos(fi[i]!);
    hi[i] = m * Math.sin(fi[i]!);
  }
  fft(hr, hi, true);
  return hr.slice(0, len);
}

// ── auto-trim ────────────────────────────────────────────────────────────────────────────────────

export interface AutoTrimResult {
  samples: Float64Array;
  /** Samples removed from the start (leading silence). */
  leadingRemoved: number;
  /** The input's absolute peak (0 for silence). */
  peakIn: number;
  /** Linear gain applied so the output peak is `targetPeak`. */
  gain: number;
}

/** Leading-silence threshold, dB relative to the file's own peak. */
export const AUTO_TRIM_THRESHOLD_DB = -60;

/**
 * Auto-trim: strip LEADING silence — everything before the first sample whose magnitude reaches
 * `thresholdDb` below the peak — then normalise so the peak is `targetPeak`. A silent input is returned
 * untouched (nothing to anchor either step on). The trailing end is left to the container-length fit.
 */
export function autoTrim(
  x: Float64Array,
  opts: { thresholdDb?: number; targetPeak?: number } = {},
): AutoTrimResult {
  const thresholdDb = opts.thresholdDb ?? AUTO_TRIM_THRESHOLD_DB;
  const targetPeak = opts.targetPeak ?? 1;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return { samples: Float64Array.from(x), leadingRemoved: 0, peakIn: 0, gain: 1 };
  const thr = peak * Math.pow(10, thresholdDb / 20);
  let first = 0;
  while (first < x.length && Math.abs(x[first]!) < thr) first++;
  const gain = targetPeak / peak;
  const out = new Float64Array(x.length - first);
  for (let i = 0; i < out.length; i++) out[i] = x[first + i]! * gain;
  return { samples: out, leadingRemoved: first, peakIn: peak, gain };
}

/**
 * Fit `x` to exactly `length` samples: zero-pad a short signal; truncate a long one with a half-Hann
 * fade-out over its last `fade` samples so the cut does not click. Returns whether it truncated.
 */
export function fitLength(x: Float64Array, length: number, fade = 64): { samples: Float64Array; truncated: boolean } {
  const out = new Float64Array(length);
  if (x.length <= length) {
    out.set(x);
    return { samples: out, truncated: false };
  }
  out.set(x.subarray(0, length));
  const f = Math.min(fade, length);
  for (let i = 0; i < f; i++) {
    const w = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / f)); // 1 → 0 across the fade
    out[length - f + i]! *= w;
  }
  return { samples: out, truncated: true };
}
