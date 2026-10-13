// `.wav` → user-cab IR conversion (cabIrAudio.ts + cabIrConvert.ts).
//
// Every expectation below is derived INDEPENDENTLY of the code under test: WAV fixtures are written by a
// test-local byte writer, resampler / MPT answers come from closed-form signals (a sine; a one-pole
// decay and its time reverse), the container checks use hand-derived septets and a test-local XOR.
//
// What this suite deliberately does NOT claim: that the container's sample WORDS mean what the unit
// thinks they mean. That encoding is an assumption (ASSUMED_FLOAT32_ENCODING) and the first test that
// pins it says so by name.
import { fractalChecksum } from '../../../src/shared/checksum.js';
import { parseCabIrSyx, buildCabIrSyx, cabIrContentXor, CAB_IR_SAMPLE_SLOTS } from '../../../src/devices/gen3/cabIrSyx.js';
import { fft, parseWav, mixToMono, resample, minimumPhase, autoTrim, fitLength } from '../../../src/devices/gen3/cabIrAudio.js';
import {
  convertWavToCabIr,
  cabIrContainerSelfConsistent,
  cabIrNameFromFilename,
  ASSUMED_FLOAT32_ENCODING,
  CAB_IR_OUTPUT_FORMATS,
  type CabIrSampleEncoding,
} from '../../../src/devices/gen3/cabIrConvert.js';

export const CAB_IR_CONVERT_CASE_COUNT = 28;

// ── test-local WAV writer (independent of parseWav) ───────────────────────────────────────────────
function wavBytes(opts: {
  tag: number;
  bits: number;
  channels?: number;
  rate?: number;
  interleaved: number[]; // raw integer sample values, or floats for tag 3
  extensible?: boolean;
  oddChunkBefore?: boolean;
}): Uint8Array {
  const ch = opts.channels ?? 1;
  const rate = opts.rate ?? 48000;
  const bytesPer = opts.bits / 8;
  const data = new DataView(new ArrayBuffer(opts.interleaved.length * bytesPer));
  opts.interleaved.forEach((v, i) => {
    const at = i * bytesPer;
    if (opts.tag === 3) data.setFloat32(at, v, true);
    else if (opts.bits === 16) data.setInt16(at, v, true);
    else if (opts.bits === 8) data.setUint8(at, v);
    else if (opts.bits === 24) {
      const u = v < 0 ? v + 0x1000000 : v;
      data.setUint8(at, u & 0xff);
      data.setUint8(at + 1, (u >> 8) & 0xff);
      data.setUint8(at + 2, (u >> 16) & 0xff);
    } else data.setInt32(at, v, true);
  });
  const fmtLen = opts.extensible ? 40 : 16;
  const fmt = new DataView(new ArrayBuffer(fmtLen));
  fmt.setUint16(0, opts.extensible ? 0xfffe : opts.tag, true);
  fmt.setUint16(2, ch, true);
  fmt.setUint32(4, rate, true);
  fmt.setUint32(8, rate * ch * bytesPer, true);
  fmt.setUint16(12, ch * bytesPer, true);
  fmt.setUint16(14, opts.bits, true);
  if (opts.extensible) {
    fmt.setUint16(16, 22, true);
    fmt.setUint16(18, opts.bits, true);
    fmt.setUint16(24, opts.tag, true); // SubFormat GUID first two bytes
  }
  const chunk = (id: string, body: Uint8Array): number[] => {
    const h = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 4; i++) h.setUint8(i, id.charCodeAt(i));
    h.setUint32(4, body.length, true);
    return [...new Uint8Array(h.buffer), ...body, ...(body.length & 1 ? [0] : [])];
  };
  const body: number[] = [...'WAVE'].map((c) => c.charCodeAt(0));
  if (opts.oddChunkBefore) body.push(...chunk('LIST', Uint8Array.from([1, 2, 3])));
  body.push(...chunk('fmt ', new Uint8Array(fmt.buffer)));
  body.push(...chunk('data', new Uint8Array(data.buffer)));
  const riff = new DataView(new ArrayBuffer(8));
  [...'RIFF'].forEach((c, i) => riff.setUint8(i, c.charCodeAt(0)));
  riff.setUint32(4, body.length, true);
  return Uint8Array.from([...new Uint8Array(riff.buffer), ...body]);
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

export function runCabIrConvertTests(): void {
  const failures: string[] = [];
  const t = (name: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      failures.push(`${name}: ${(e as Error).message}`);
    }
  };
  const eq = (a: unknown, b: unknown, what: string) => {
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    if (ja !== jb) throw new Error(`${what}: got ${ja}, want ${jb}`);
  };
  const ok = (cond: boolean, what: string) => {
    if (!cond) throw new Error(what);
  };
  const throws = (fn: () => void, re: RegExp, what: string) => {
    let msg = '';
    try {
      fn();
    } catch (e) {
      msg = (e as Error).message;
    }
    if (!re.test(msg)) throw new Error(`${what}: expected /${re.source}/, got "${msg}"`);
  };

  // ── WAV reader ──────────────────────────────────────────────────────────────────────────────
  t('wav: PCM16 normalises by 2^15', () => {
    const w = parseWav(wavBytes({ tag: 1, bits: 16, interleaved: [0, 16384, -16384, 32767, -32768] }));
    eq([...w.channelData[0]!], [0, 0.5, -0.5, 32767 / 32768, -1], 'samples');
    eq([w.sampleRate, w.channels, w.bitsPerSample, w.format], [48000, 1, 16, 'pcm'], 'header');
  });
  t('wav: PCM24 sign-extends and normalises by 2^23', () => {
    const w = parseWav(wavBytes({ tag: 1, bits: 24, interleaved: [4194304, -4194304, 8388607, -8388608] }));
    eq([...w.channelData[0]!], [0.5, -0.5, 8388607 / 8388608, -1], 'samples');
  });
  t('wav: PCM32 normalises by 2^31', () => {
    const w = parseWav(wavBytes({ tag: 1, bits: 32, interleaved: [1073741824, -2147483648] }));
    eq([...w.channelData[0]!], [0.5, -1], 'samples');
  });
  t('wav: float32 is read as-is, WAVE_FORMAT_EXTENSIBLE and an odd-sized chunk before data are handled', () => {
    const w = parseWav(wavBytes({ tag: 3, bits: 32, interleaved: [0.25, -0.75], extensible: true, oddChunkBefore: true }));
    eq([...w.channelData[0]!], [0.25, -0.75], 'samples');
    eq(w.format, 'float', 'format');
  });
  t('wav: stereo splits channels and mono mix-down averages them', () => {
    const w = parseWav(wavBytes({ tag: 1, bits: 16, channels: 2, interleaved: [16384, -16384, 32767 - 32767 + 8192, 24576] }));
    eq(w.frames, 2, 'frames');
    eq([...w.channelData[0]!], [0.5, 0.25], 'left');
    eq([...w.channelData[1]!], [-0.5, 0.75], 'right');
    eq([...mixToMono(w)], [0, 0.5], 'mix');
  });
  t('wav: refuses 8-bit, float64, a non-RIFF file and a file with no data chunk — with the reason', () => {
    throws(() => parseWav(wavBytes({ tag: 1, bits: 8, interleaved: [128, 129] })), /8-bit pcm is not supported/, '8-bit');
    const f64 = wavBytes({ tag: 3, bits: 32, interleaved: [0] });
    new DataView(f64.buffer).setUint16(34, 64, true); // claim 64-bit float
    throws(() => parseWav(f64), /64-bit float is not supported/, 'float64');
    throws(() => parseWav(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), /not a RIFF\/WAVE/, 'not riff');
    const noData = wavBytes({ tag: 1, bits: 16, interleaved: [0] }).slice(0, 36);
    throws(() => parseWav(noData), /no data chunk/, 'no data');
  });

  // ── FFT ─────────────────────────────────────────────────────────────────────────────────────
  t('fft: matches a naive DFT, and the inverse round-trips', () => {
    const n = 16;
    const xr = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + 0.2 * i);
    const xi = new Float64Array(n);
    const re = Float64Array.from(xr);
    const im = new Float64Array(n);
    fft(re, im);
    for (let k = 0; k < n; k++) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        sr += xr[j]! * Math.cos((2 * Math.PI * j * k) / n);
        si -= xr[j]! * Math.sin((2 * Math.PI * j * k) / n);
      }
      ok(near(re[k]!, sr, 1e-9) && near(im[k]!, si, 1e-9), `bin ${k}: ${re[k]},${im[k]} vs ${sr},${si}`);
    }
    fft(re, im, true);
    for (let j = 0; j < n; j++) ok(near(re[j]!, xr[j]!, 1e-9) && near(im[j]!, xi[j]!, 1e-9), `round trip sample ${j}`);
  });

  // ── resampler ───────────────────────────────────────────────────────────────────────────────
  t('resample: a 1 kHz sine at 44.1 kHz becomes the 1 kHz sine at 48 kHz (interior error < 1e-3)', () => {
    const x = Float64Array.from({ length: 4410 }, (_, n) => Math.sin((2 * Math.PI * 1000 * n) / 44100));
    const y = resample(x, 44100, 48000);
    eq(y.length, 4800, 'length = round(4410·48000/44100)');
    let worst = 0;
    for (let n = 100; n < 4700; n++) worst = Math.max(worst, Math.abs(y[n]! - Math.sin((2 * Math.PI * 1000 * n) / 48000)));
    ok(worst < 1e-3, `worst interior error ${worst}`);
  });
  t('resample: down-sampling 48 → 24 kHz keeps 1 kHz and removes 15 kHz (above the new Nyquist)', () => {
    const tone = (hz: number) => Float64Array.from({ length: 4800 }, (_, n) => Math.sin((2 * Math.PI * hz * n) / 48000));
    const keep = resample(tone(1000), 48000, 24000);
    let worst = 0;
    for (let n = 100; n < 2300; n++) worst = Math.max(worst, Math.abs(keep[n]! - Math.sin((2 * Math.PI * 1000 * n) / 24000)));
    ok(worst < 1e-3, `1 kHz interior error ${worst}`);
    const gone = resample(tone(15000), 48000, 24000);
    let peak = 0;
    for (let n = 100; n < 2300; n++) peak = Math.max(peak, Math.abs(gone[n]!));
    ok(peak < 0.02, `15 kHz residue ${peak}`);
  });
  t('resample: equal rates are an exact copy', () => {
    const x = Float64Array.from([0.1, -0.2, 0.3]);
    const y = resample(x, 48000, 48000);
    eq([...y], [...x], 'copy');
    ok(y !== x, 'a new array, not the input');
  });

  // ── minimum-phase transform ─────────────────────────────────────────────────────────────────
  const decay = Float64Array.from({ length: 64 }, (_, n) => Math.pow(0.6, n)); // a one-pole decay IS minimum phase
  t('mpt: an already minimum-phase signal (0.6^n) is returned unchanged', () => {
    const m = minimumPhase(decay);
    let worst = 0;
    for (let i = 0; i < 64; i++) worst = Math.max(worst, Math.abs(m[i]! - decay[i]!));
    ok(worst < 1e-6, `worst deviation ${worst}`);
  });
  t('mpt: the time-reverse of 0.6^n (maximum phase, same magnitude) maps back onto 0.6^n', () => {
    const rev = Float64Array.from(decay).reverse();
    const m = minimumPhase(rev);
    let worst = 0;
    for (let i = 0; i < 64; i++) worst = Math.max(worst, Math.abs(m[i]! - decay[i]!));
    ok(worst < 1e-4, `worst deviation ${worst}`);
    const early = (a: Float64Array) => a.slice(0, 8).reduce((s, v) => s + v * v, 0);
    ok(early(m) > 0.9 * m.reduce((s, v) => s + v * v, 0), 'MPT output is front-loaded');
    ok(early(rev) < 1e-3, 'the input was not front-loaded');
  });
  t('mpt: the magnitude response is preserved', () => {
    const rev = Float64Array.from(decay).reverse();
    const m = minimumPhase(rev);
    const mag = (a: Float64Array) => {
      const re = new Float64Array(512);
      const im = new Float64Array(512);
      re.set(a);
      fft(re, im);
      return Float64Array.from(re, (r, i) => Math.hypot(r, im[i]!));
    };
    const a = mag(rev);
    const b = mag(m);
    let worst = 0;
    for (let i = 0; i < 512; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!) / a[i]!);
    ok(worst < 1e-4, `worst relative magnitude error ${worst}`);
  });
  t('mpt: silence in, silence out (no NaN)', () => {
    eq([...minimumPhase(new Float64Array(8))], [0, 0, 0, 0, 0, 0, 0, 0], 'silence');
  });

  // ── auto-trim / fit ─────────────────────────────────────────────────────────────────────────
  t('auto-trim: strips samples below −60 dB of peak at the start, then normalises to peak 1.0', () => {
    // peak 0.5 → threshold 0.5·10^-3 = 5e-4; 1e-5 is below it, 0.25 is the first above
    const r = autoTrim(Float64Array.from([0, 0, 0, 1e-5, 0.25, 0.5, -0.1]));
    eq(r.leadingRemoved, 4, 'leading removed');
    eq([...r.samples], [0.5, 1, -0.2], 'normalised output');
    eq([r.peakIn, r.gain], [0.5, 2], 'peak and gain');
  });
  t('auto-trim: a quiet INTERIOR sample is kept (only the leading silence goes) and silence is untouched', () => {
    const r = autoTrim(Float64Array.from([0.5, 1e-9, 0.25]));
    eq(r.leadingRemoved, 0, 'nothing leading');
    eq([...r.samples], [1, 2e-9, 0.5], 'gain applied to all');
    const s = autoTrim(new Float64Array(4));
    eq([s.leadingRemoved, s.gain, [...s.samples]], [0, 1, [0, 0, 0, 0]], 'silent input');
  });
  t('fitLength: zero-pads short input; truncation fades the last samples to exactly 0 and flags it', () => {
    const p = fitLength(Float64Array.from([1, 1]), 4);
    eq([[...p.samples], p.truncated], [[1, 1, 0, 0], false], 'pad');
    const c = fitLength(new Float64Array(100).fill(1), 50, 10);
    eq(c.truncated, true, 'truncated flag');
    eq(c.samples.length, 50, 'length');
    eq(c.samples[39], 1, 'before the fade');
    ok(near(c.samples[40]!, 0.5 * (1 + Math.cos(0.1 * Math.PI)), 1e-12), 'first fade sample');
    eq(c.samples[49], 0, 'last sample is exactly 0');
  });

  // ── the assumed encoding ────────────────────────────────────────────────────────────────────
  t('ASSUMPTION A1 pinned: the assumed encoding is float32 bits — 1.0→0x3F800000, −1.0→0xBF800000, 0→0 (EDIT THIS TEST when a real capture decodes the field)', () => {
    eq(ASSUMED_FLOAT32_ENCODING.assumed, true, 'flagged assumed');
    eq(ASSUMED_FLOAT32_ENCODING.encode(1), 0x3f800000, '1.0');
    eq(ASSUMED_FLOAT32_ENCODING.encode(-1), 0xbf800000, '-1.0');
    eq(ASSUMED_FLOAT32_ENCODING.encode(0), 0, '0');
    eq(ASSUMED_FLOAT32_ENCODING.decode(0x3f000000), 0.5, 'decode 0.5');
  });

  // ── the pipeline + container ────────────────────────────────────────────────────────────────
  const dest = { index: 4, page: 0x11 }; // user slot 133
  // an impulse of 0.5 at sample 10 in a 48 kHz mono float file
  const impulse = Float32Array.from({ length: 64 }, (_, n) => (n === 10 ? 0.5 : 0));
  const impulseWav = () => wavBytes({ tag: 3, bits: 32, interleaved: [...impulse] });

  t('convert: impulse + auto-trim → slot 0 carries 1.0 (hand-derived septets 00 00 00 7C 03), the rest 0', () => {
    const r = convertWavToCabIr(impulseWav(), { dest, name: 'IMPULSE', autoTrim: true });
    const ir = parseCabIrSyx(r.container);
    eq(ir.name, 'IMPULSE', 'name');
    eq(ir.sampleSlots, CAB_IR_SAMPLE_SLOTS, 'sample slots');
    eq(r.report.autoTrim, { applied: true, leadingRemoved: 10, gainDb: 20 * Math.log10(2) }, 'trim report');
    // first data frame payload: 00 02, 8 name chunks (40 bytes), then sample slot 0
    const payload = ir.frames[1]!.slice(6, ir.frames[1]!.length - 2);
    eq(payload.slice(2 + 40, 2 + 40 + 5), [0x00, 0x00, 0x00, 0x7c, 0x03], 'slot 0 = float32 1.0 as 5 LSB-first septets');
    eq(payload.slice(2 + 45, 2 + 50), [0, 0, 0, 0, 0], 'slot 1 = 0');
  });
  t('convert: the close frame equals an INDEPENDENT XOR (name chunks 0x20202020 ×7 ^ 0xA0202020 ^ every sample word)', () => {
    const r = convertWavToCabIr(impulseWav(), { dest, name: '', autoTrim: true });
    // 7 identical blank-name words XOR to 0x20202020; the flagged last one is 0xA0202020 → 0x80000000;
    // the only non-zero sample word is 1.0 = 0x3F800000.
    const want = (0x80000000 ^ 0x3f800000) >>> 0; // 0xBF800000
    const septets = [0, 7, 14, 21, 28].map((s) => (want >>> s) & 0x7f);
    eq(parseCabIrSyx(r.container).endPayload, septets, 'close payload');
    eq(r.report.closePayload, septets, 'report echoes the same close');
    eq(cabIrContentXor(r.container), want, 'codec XOR agrees');
  });
  t('convert: geometry — start 12 B, 8 data frames of 1290 B, close 13 B, every frame checksum valid, dest in the start frame', () => {
    const r = convertWavToCabIr(impulseWav(), { dest, name: 'G' });
    const ir = parseCabIrSyx(r.container); // strict: throws on any bad checksum
    eq(ir.frames.map((f) => f.length), [12, ...Array(8).fill(1290), 13], 'frame lengths');
    eq(ir.startPayload, [4, 0x11, 0x00, 0x10], 'start payload [index,page,00,10]');
    ok(ir.frames.every((f) => f[f.length - 2] === fractalChecksum(f.slice(0, f.length - 2))), 'checksums');
    eq(ir.modelId, 0x11, 'model');
  });
  t('convert: fails closed for a CORRUPT container — one flipped sample septet makes the close mismatch, and the self-check says so', () => {
    const r = convertWavToCabIr(impulseWav(), { dest, name: 'C', autoTrim: true });
    ok(cabIrContainerSelfConsistent(r.container), 'a fresh container is self-consistent');
    // the first data frame starts after the 12-byte start frame: F0 00 01 74 11 7B | 00 02 | chunks…
    // (frame checksum left stale on purpose: the close/XOR check is independent of it)
    const at = 12 + 6 + 2 + 41;
    const bad2 = [...r.container];
    bad2[at] ^= 0x01;
    ok(!cabIrContainerSelfConsistent(bad2), 'a flipped sample septet is detected (this is what the unit answers 0x13 to)');
  });
  t('convert: it does NOT fail closed for a wrong ENCODING — an injected encoding yields a self-consistent container (documented limit)', () => {
    const q31: CabIrSampleEncoding = {
      id: 'test-q31',
      label: 'test int32',
      assumed: true,
      encode: (s) => (Math.round(s * 2147483647) >>> 0),
      decode: (w) => ((w | 0) / 2147483648),
    };
    const r = convertWavToCabIr(impulseWav(), { dest, name: 'Q', autoTrim: true, encoding: q31 });
    ok(cabIrContainerSelfConsistent(r.container), 'consistent — the unit would STORE it regardless of the encoding');
    eq(r.report.encoding.id, 'test-q31', 'the report names the encoding used');
    const payload = parseCabIrSyx(r.container).frames[1]!.slice(6);
    ok(JSON.stringify(payload.slice(2 + 40, 2 + 45)) !== JSON.stringify([0, 0, 0, 0x7c, 0x03]), 'different encoding, different bytes');
  });
  t('convert: report carries the CONSTRAINED status, the assumed-encoding flag and the ordered steps', () => {
    const r = convertWavToCabIr(wavBytes({ tag: 1, bits: 16, channels: 2, rate: 44100, interleaved: [0, 0, 8192, 8192, 0, 0] }), { dest, name: 'R', minimumPhase: true, autoTrim: true });
    // The status must state the MEASURED claim: one impulse auditioned, encoding CONSTRAINED but not
    // discriminated (a wrong encoding could still sound transparent at ~6 dB quieter under Q31).
    ok(/^CONSTRAINED/.test(r.report.status), 'status says CONSTRAINED (one impulse auditioned; not discriminated)');
    ok(/not.*discriminate/i.test(r.report.status), 'status says the encoding is not discriminated');
    eq(r.report.encoding.assumed, true, 'encoding assumed');
    eq(r.report.mixedDownFromChannels, 2, 'mixdown noted');
    eq(r.report.resampledFrom, 44100, 'resample noted');
    eq(r.report.minimumPhase, true, 'mpt noted');
    ok(r.report.steps.some((s) => /minimum-phase/.test(s)) && r.report.steps.some((s) => /auto-trim/.test(s)), 'steps list MPT and auto-trim');
    ok(near(r.report.peak, 1, 1e-9), 'auto-trim normalised the peak to 1.0');
  });
  t('convert: a long file is cut to 2040 samples with the truncation reported; a short one is zero-padded', () => {
    const long = wavBytes({ tag: 3, bits: 32, interleaved: Array.from({ length: 5000 }, () => 0.25) });
    const lr = convertWavToCabIr(long, { dest, name: 'L' });
    eq([lr.report.truncated, lr.report.outputSamples], [true, 2040], 'long');
    eq(lr.samples[2039], 0, 'faded to zero');
    const sr = convertWavToCabIr(impulseWav(), { dest, name: 'S' });
    eq(sr.report.truncated, false, 'short not truncated');
    eq(sr.samples.length, 2040, 'padded to 2040');
  });
  t('convert: refuses unavailable output formats (UltraRes, legacy 66×32) and an unmeasured model — with the reason', () => {
    throws(() => convertWavToCabIr(impulseWav(), { dest, name: 'U', outputFormat: 'ultrares' }), /not available — No UltraRes container exists/, 'ultrares');
    throws(() => convertWavToCabIr(impulseWav(), { dest, name: 'U', outputFormat: 'legacy-66x32' }), /not available/, 'legacy');
    throws(() => convertWavToCabIr(impulseWav(), { dest, name: 'U', model: 0x07 }), /no measured IR geometry/, 'model 0x07');
    eq(CAB_IR_OUTPUT_FORMATS.filter((f) => !f.available).every((f) => f.reason.length > 20), true, 'every disabled format explains itself');
  });
  t('convert: the produced container survives a rename through the existing codec (close recomputed, still consistent)', () => {
    const r = convertWavToCabIr(impulseWav(), { dest, name: 'BEFORE', autoTrim: true });
    const renamed = buildCabIrSyx(parseCabIrSyx(r.container), { name: 'AFTER' });
    eq(parseCabIrSyx(renamed).name, 'AFTER', 'renamed');
    ok(cabIrContainerSelfConsistent(renamed), 'consistent after the rename');
  });
  t('names: a file name becomes a ≤32-char 7-bit name (extension dropped, path stripped, non-ASCII → _)', () => {
    eq(cabIrNameFromFilename('C:\\irs\\Mesa 4x12 SM57.wav'), 'Mesa 4x12 SM57', 'windows path');
    eq(cabIrNameFromFilename('/x/Café.wav'), 'Caf_', 'non-ascii');
    eq(cabIrNameFromFilename('a'.repeat(50) + '.wav').length, 32, 'cut to 32');
    eq(cabIrNameFromFilename('.wav'), 'Imported IR', 'empty falls back');
  });

  if (failures.length) {
    throw new Error(`[cab-ir-convert] ${failures.length} case(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
}
