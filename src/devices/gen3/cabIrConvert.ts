/**
 * `.wav` → user-cab IR container: the conversion pipeline, with every unproven assumption NAMED.
 *
 * Self-contained browser-safe subpath: `forgefx-midi/devices/gen3/cabIrConvert` (Axis runs it client-side).
 * It also re-exports the container helpers the import/rename UI needs, so the client imports one module.
 *
 * ─── ⚠ STATUS: ONE IMPULSE AUDITIONED; ENCODING CONSTRAINED, NOT DISCRIMINATED ─────────────────────
 * One impulse was converted by this pipeline, uploaded, accepted by the unit (the slot read back
 * `populated`, with our name) and AUDITIONED — it sounded TRANSPARENT. That proves the TRANSPORT, the name
 * round-trip and end-to-end ACCEPTANCE. It does NOT discriminate the sample ENCODING: the impulse's single
 * word `0x3F800000` read as int32 Q31 is `1065353216 / 2³¹ = 0.496` — STILL an impulse, STILL transparent,
 * only ~6 dB quieter — and every other word is zero (which decodes as zero under almost any encoding). So the
 * encoding is CONSTRAINED — silence, hash and gross garbage are ruled out — but NOT DISCRIMINATED between
 * IEEE-754 float32 and int32 Q31. What IS established:
 *   • the container's TRANSPORT (frame geometry, checksums, the content-XOR close value) — the same
 *     codec path that stored a verbatim container, a renamed container and a blank container on hardware;
 *   • the DSP stages, against signals with independently computed answers (test/gen3/fm3/cab-ir-audio).
 * What is NOT established — and is the crux:
 *
 *   A1  THE SAMPLE ENCODING. The 2040 sample slots are 32-bit words (5 LSB-first septets each) — that much
 *       is geometry. What a word MEANS is constrained but not discriminated (see the status above): the one
 *       real specimen measured 2026-10-08 did not read as plausible PCM or float32 under any alignment tried
 *       (see cabIrSyx.ts), and no sample-bearing container exists in this repo or on this host to re-check
 *       (the only specimens on disk are the all-zero-sample hardware-test containers — their data is silence
 *       under any encoding). So the encoder below is an ASSUMPTION, isolated in one object
 *       (`ASSUMED_FLOAT32_ENCODING`), named in every report, pinned by a test that must be edited the day a
 *       real capture decodes the field: slot k carries sample k as a little-endian IEEE-754 float32 in ±1.0,
 *       at 48 kHz.
 *   A2  Sample rate 48 kHz, time order (slot 0 = first sample), full scale 1.0.
 *   A3  The name-slot flag pattern (copied from the specimen) and the model byte (0x11 = FM3).
 *
 * ─── WHAT THE UNIT'S CLOSE CHECK DOES AND DOES NOT PROTECT ────────────────────────────────────────
 * The close frame is a content XOR over the bytes sent. A container whose close does not match its
 * content is DISCARDED by the unit (0x13, destination untouched). That makes a CORRUPT or hand-edited
 * container fail closed. It does NOT make a semantically wrong conversion fail closed: this module
 * COMPUTES the close from its own output, so a container with the wrong sample encoding passes the check,
 * is STORED, and reads `populated` — exactly as a zeroed-sample container did on hardware (stored, a silent
 * IR). So "uploaded and populated" can never mean "converted correctly"; only a listening test on the unit
 * can. The UI must say so.
 */
import {
  CAB_IR_SAMPLE_SLOTS,
  CAB_IR_KNOWN_GEOMETRY_MODELS,
  CAB_IR_NAME_CHARS,
  buildCabIrContainerFromWords,
  computeCabIrClosePayload,
  type CabIrDestination,
} from './cabIrSyx.js';
import { autoTrim, fitLength, minimumPhase, mixToMono, parseWav, resample } from './cabIrAudio.js';

export {
  parseCabIrSyx,
  buildCabIrSyx,
  renameCabIrSyx,
  cabIrUserSlot,
  CAB_IR_SAMPLE_SLOTS,
  CAB_IR_NAME_CHARS,
} from './cabIrSyx.js';
export type { CabIrSyx, CabIrDestination } from './cabIrSyx.js';
export { parseWav } from './cabIrAudio.js';

/** The rate the container is assumed to be authored at (A2). */
export const CAB_IR_SAMPLE_RATE = 48000;
/** Longest signal run through the min-phase transform (FFT cost grows with it); the IR's energy is far inside it. */
export const CAB_IR_MAX_WORK_SAMPLES = 16384;

export const CAB_IR_CONVERSION_STATUS =
  'MEASURED (Standard output format) — 2026-10-30: a ruler WAV with known samples was imported by FM3-Edit ' +
    '(IR Output Format = Standard) and exported; the export decodes cleanly as 2040 little-endian IEEE-754 ' +
    'float32 samples at 48 kHz, and this encoder now reproduces that file byte-for-byte (only the start ' +
    "frame's destination differs). Two rules the earlier containers got wrong: the 32nd name slot is a NUL " +
    'terminator (0x80 with its flag — 0xA0 marks UltraRes), and the payload must be Standard. UltraRes payloads ' +
    'are still opaque (7.98 bits/byte, no standard codec decodes them), so UltraRes is NOT writable.';

// ── the assumed sample encoding (A1) ────────────────────────────────────────────────────────────

export interface CabIrSampleEncoding {
  readonly id: string;
  readonly label: string;
  /** True while no real container has confirmed this encoding. */
  readonly assumed: boolean;
  /** One sample (±1.0 float) → one uint32 chunk word. */
  encode(sample: number): number;
  /** The inverse, for round-trip checks. */
  decode(word: number): number;
}

const _buf = new ArrayBuffer(4);
const _f32 = new Float32Array(_buf);
const _u32 = new Uint32Array(_buf);

/** ASSUMPTION A1 — see the module header. Replace (do not "tune") once a real capture decodes the field. */
export const ASSUMED_FLOAT32_ENCODING: CabIrSampleEncoding = {
  id: 'float32-standard',
  label: 'IEEE-754 float32 LE, 48 kHz (MEASURED against an FM3-Edit Standard export, 2026-10-30)',
  assumed: false,
  encode(sample: number): number {
    _f32[0] = Number.isFinite(sample) ? sample : 0;
    return _u32[0]!;
  },
  decode(word: number): number {
    _u32[0] = word;
    return _f32[0]!;
  },
};

// ── output formats (the container geometry choice) ──────────────────────────────────────────────

export interface CabIrOutputFormat {
  id: string;
  label: string;
  /** Selectable? A false format is rendered DISABLED with `reason` — never silently dropped. */
  available: boolean;
  reason: string;
  /** Sample slots the format carries (when available). */
  samples?: number;
}

/**
 * The container geometries the converter knows. Only the geometry measured on the FM3/Axe-Fx III family
 * (10 frames: 1 start + 8 × 256-chunk data + 1 close, model bytes 0x10/0x11) can be WRITTEN: it is the
 * one whose frame prefix, chunk count and close rule were reproduced and hardware-cycled. The other two
 * are listed with the exact reason they are not offered, so the choice FM3-Edit has is visible, not faked.
 */
export const CAB_IR_OUTPUT_FORMATS: readonly CabIrOutputFormat[] = [
  {
    id: 'std-2040',
    label: 'Standard — 2040 samples (8 × 256-chunk frames)',
    available: true,
    reason: '',
    samples: CAB_IR_SAMPLE_SLOTS,
  },
  {
    id: 'legacy-66x32',
    label: 'Legacy geometry — 66 × 32-chunk frames',
    available: false,
    reason:
      'Observed only on model bytes 0x03/0x07 containers; its start/data prefixes were never captured for writing, and this unit family takes the 8 × 256 geometry.',
  },
  {
    id: 'ultrares',
    label: 'UltraRes',
    available: false,
    reason:
      'No UltraRes container exists in the repo or its fixtures, so its length and encoding are unknown. Not guessed — it needs a capture of FM3-Edit exporting/uploading one.',
  },
];

// ── names ───────────────────────────────────────────────────────────────────────────────────────

/** A container name from a file name: extension dropped, non-7-bit-printable → `_`, cut to 32 characters. */
export function cabIrNameFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  const clean = [...base].map((c) => (c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x7f ? c : '_')).join('').trim();
  return (clean || 'Imported IR').slice(0, CAB_IR_NAME_CHARS);
}

// ── the pipeline ────────────────────────────────────────────────────────────────────────────────

export interface CabIrConvertOptions {
  /** Where the container's start frame points (`cabIrUserSlot(n)`). */
  dest: CabIrDestination;
  /** The container name (≤ 32 chars, 7-bit). Default: derived from `filename`. */
  name?: string;
  filename?: string;
  /** SysEx model byte (default 0x11, the FM3). Must be a model whose geometry is measured. */
  model?: number;
  /** Minimum-phase transform. Default off. */
  minimumPhase?: boolean;
  /** Auto-trim: strip leading silence, normalise the peak. Default off. */
  autoTrim?: boolean;
  /** An `available: true` entry of `CAB_IR_OUTPUT_FORMATS`. Default `std-2040`. */
  outputFormat?: string;
  /** Default `ASSUMED_FLOAT32_ENCODING`. Explicit so a test (or the day's real decode) can inject one. */
  encoding?: CabIrSampleEncoding;
}

export interface CabIrConvertReport {
  status: typeof CAB_IR_CONVERSION_STATUS;
  source: { sampleRate: number; channels: number; bitsPerSample: number; format: 'pcm' | 'float'; frames: number };
  /** Human-readable pipeline, in order, for the UI. */
  steps: string[];
  resampledFrom: number | null;
  mixedDownFromChannels: number | null;
  minimumPhase: boolean;
  autoTrim: { applied: boolean; leadingRemoved: number; gainDb: number };
  workTruncated: boolean;
  /** The IR was longer than the container and was cut (with a fade). */
  truncated: boolean;
  outputFormat: string;
  outputSamples: number;
  /** Peak of the final samples (linear, 1.0 = full scale). */
  peak: number;
  encoding: { id: string; label: string; assumed: boolean };
  /** The close payload the container carries — what the unit's close check will be asked to match. */
  closePayload: number[];
  name: string;
}

export interface CabIrConvertResult {
  /** Complete `.syx` wire bytes: start + 8 data + close, close computed from the content. */
  container: number[];
  /** The final 2040 samples (±1.0) — for a waveform preview. */
  samples: Float64Array;
  report: CabIrConvertReport;
}

function peakOf(x: Float64Array): number {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
}

/**
 * Convert `.wav` bytes into an uploadable container. Throws (with the reason) on an unreadable file, an
 * unavailable output format or an unmeasured model — never produces a half-meaningful container.
 */
export function convertWavToCabIr(wav: Uint8Array | readonly number[], opts: CabIrConvertOptions): CabIrConvertResult {
  const formatId = opts.outputFormat ?? 'std-2040';
  const format = CAB_IR_OUTPUT_FORMATS.find((f) => f.id === formatId);
  if (!format) throw new Error(`convertWavToCabIr: unknown output format "${formatId}"`);
  if (!format.available) throw new Error(`convertWavToCabIr: output format "${format.label}" is not available — ${format.reason}`);
  const model = opts.model ?? 0x11;
  if (!CAB_IR_KNOWN_GEOMETRY_MODELS.includes(model)) {
    throw new Error(`convertWavToCabIr: model 0x${model.toString(16)} has no measured IR geometry (known: ${CAB_IR_KNOWN_GEOMETRY_MODELS.map((m) => `0x${m.toString(16)}`).join(', ')})`);
  }
  const encoding = opts.encoding ?? ASSUMED_FLOAT32_ENCODING;
  const name = opts.name ?? cabIrNameFromFilename(opts.filename ?? 'Imported IR');

  const w = parseWav(wav);
  const steps: string[] = [`read ${w.bitsPerSample}-bit ${w.format === 'float' ? 'float' : 'PCM'} ${w.channels}ch ${w.sampleRate} Hz, ${w.frames} samples`];
  if (w.frames === 0) throw new Error('convertWavToCabIr: the file has no samples');
  let x = mixToMono(w);
  const mixedDownFromChannels = w.channels > 1 ? w.channels : null;
  if (mixedDownFromChannels) steps.push(`averaged ${w.channels} channels to mono`);
  let resampledFrom: number | null = null;
  if (w.sampleRate !== CAB_IR_SAMPLE_RATE) {
    x = resample(x, w.sampleRate, CAB_IR_SAMPLE_RATE);
    resampledFrom = w.sampleRate;
    steps.push(`resampled ${w.sampleRate} → ${CAB_IR_SAMPLE_RATE} Hz`);
  }
  let workTruncated = false;
  if (x.length > CAB_IR_MAX_WORK_SAMPLES) {
    x = fitLength(x, CAB_IR_MAX_WORK_SAMPLES, 256).samples;
    workTruncated = true;
    steps.push(`kept the first ${CAB_IR_MAX_WORK_SAMPLES} samples for processing`);
  }
  if (opts.minimumPhase) {
    x = minimumPhase(x);
    steps.push('minimum-phase transform');
  }
  let trim = { applied: false, leadingRemoved: 0, gainDb: 0 };
  if (opts.autoTrim) {
    const r = autoTrim(x);
    x = r.samples;
    trim = { applied: true, leadingRemoved: r.leadingRemoved, gainDb: 20 * Math.log10(r.gain) };
    steps.push(`auto-trim: removed ${r.leadingRemoved} leading samples, normalised to peak 1.0 (${trim.gainDb >= 0 ? '+' : ''}${trim.gainDb.toFixed(2)} dB)`);
  }
  const fit = fitLength(x, format.samples ?? CAB_IR_SAMPLE_SLOTS);
  if (fit.truncated) steps.push(`cut to ${fit.samples.length} samples with a 64-sample fade-out`);
  else if (x.length < fit.samples.length) steps.push(`zero-padded to ${fit.samples.length} samples`);

  const words = Array.from(fit.samples, (s) => encoding.encode(s));
  const container = buildCabIrContainerFromWords(model, opts.dest, name, words);
  return {
    container,
    samples: fit.samples,
    report: {
      status: CAB_IR_CONVERSION_STATUS,
      source: { sampleRate: w.sampleRate, channels: w.channels, bitsPerSample: w.bitsPerSample, format: w.format, frames: w.frames },
      steps,
      resampledFrom,
      mixedDownFromChannels,
      minimumPhase: !!opts.minimumPhase,
      autoTrim: trim,
      workTruncated,
      truncated: fit.truncated,
      outputFormat: format.id,
      outputSamples: fit.samples.length,
      peak: peakOf(fit.samples),
      encoding: { id: encoding.id, label: encoding.label, assumed: encoding.assumed },
      closePayload: computeCabIrClosePayload(container),
      name,
    },
  };
}

/**
 * The container's own transport self-check: the close frame must equal the XOR of its content. A mismatch is
 * the exact condition the unit DISCARDS (0x13), so a caller refusing to hand such bytes over is the "fails
 * closed" property — for a CORRUPT container only (see the header: it does not, and cannot, catch a wrong
 * sample encoding). Exported through `forgefx-midi/devices/gen3` and this subpath so an import UI CAN run it
 * before offering an upload. NOTE (2026-10-13): nothing in Axis calls it yet — `grep -rn
 * cabIrContainerSelfConsistent Axis/src` finds none — so this is an available helper, NOT a gate that is
 * actually in place. Wire it (or remove this note) the day the UI runs it.
 */
export function cabIrContainerSelfConsistent(container: readonly number[]): boolean {
  const close = computeCabIrClosePayload(container);
  // the close frame is the last frame: F0 00 01 74 mm 7C <5 septets> cs F7
  const tail = container.slice(container.length - 2 - 5, container.length - 2);
  return close.length === 5 && close.every((b, i) => b === tail[i]);
}
