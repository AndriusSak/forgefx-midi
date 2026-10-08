// User-cab IR `.syx` container (§2.5) — goldens for the MEASURED geometry.
//
// The geometry below is not invented: every constant was measured on a real FM3-Edit export
// (slot U1.001, `U1.001_LT_TV_Mix_7.syx`, 10,345 bytes, model 0x11, 10/10 frame checksums valid)
// on 2026-10-08. What the fixture does NOT carry is the specimen's SAMPLE payload — that belongs to
// a commercial IR, and the codec deliberately does not decode it anyway. The fixture is synthesized
// with the measured frame/chunk geometry, and the NAME bytes are the specimen's real ones
// (40 bytes of ASCII), so the name decode is anchored to observed data rather than to the parser's
// own inverse.
import { fractalChecksum } from '../../../src/shared/checksum.js';
import { pack5Septet32 } from '../../../src/gen3/axe-fx-iii/setParam.js';
import {
  parseCabIrSyx,
  buildCabIrSyx,
  renameCabIrSyx,
  retargetCabIrStart,
  buildCabIrStartPayload,
  cabIrStartDestination,
  cabIrUserSlot,
  cabIrScratchpad,
  interpretCabIrAcks,
  CAB_IR_FN_START,
  CAB_IR_FN_DATA,
  CAB_IR_FN_END,
  CAB_IR_NAME_CHARS,
  CAB_IR_NAME_CHUNKS,
  CAB_IR_CHUNKS_PER_FRAME,
  CAB_IR_SAMPLE_SLOTS,
} from '../../../src/devices/gen3/cabIrSyx.js';

const MODEL_FM3 = 0x11;

/** The specimen's real first data frame, chunks 0..7 — "LT TV Mix 7" + 21 spaces, flag bit set on slot 31. */
const SPECIMEN_NAME_CHUNKS: readonly (readonly number[])[] = [
  [0x4c, 0x28, 0x01, 0x21, 0x05],
  [0x56, 0x40, 0x34, 0x4a, 0x06],
  [0x78, 0x40, 0x5c, 0x01, 0x02],
  [0x20, 0x40, 0x00, 0x01, 0x02],
  [0x20, 0x40, 0x00, 0x01, 0x02],
  [0x20, 0x40, 0x00, 0x01, 0x02],
  [0x20, 0x40, 0x00, 0x01, 0x02],
  [0x20, 0x40, 0x00, 0x01, 0x0a],
];

const frame = (fn: number, payload: readonly number[]): number[] => {
  const body = [0xf0, 0x00, 0x01, 0x74, MODEL_FM3, fn, ...payload];
  return [...body, fractalChecksum(body), 0xf7];
};

/** Synthesize a container with the MEASURED geometry: 1×0x7A + 8×0x7B (256 chunks) + 1×0x7C. */
function synthIr(opts: { nameChunks?: readonly (readonly number[])[]; sampleValue?: (i: number) => number } = {}): number[] {
  const nameChunks = opts.nameChunks ?? SPECIMEN_NAME_CHUNKS;
  const sample = opts.sampleValue ?? ((i: number) => (i * 2654435761) >>> 0);
  const chunks: number[] = [];
  for (const c of nameChunks) chunks.push(...c);
  for (let i = 0; i < CAB_IR_SAMPLE_SLOTS; i++) chunks.push(...pack5Septet32(sample(i)));
  const frames: number[] = [];
  frames.push(...frame(CAB_IR_FN_START, [0x7f, 0x7f, 0x00, 0x10]));
  for (let f = 0; f < 8; f++) {
    const slice = chunks.slice(f * CAB_IR_CHUNKS_PER_FRAME * 5, (f + 1) * CAB_IR_CHUNKS_PER_FRAME * 5);
    frames.push(...frame(CAB_IR_FN_DATA, [0x00, 0x02, ...slice]));
  }
  frames.push(...frame(CAB_IR_FN_END, [0x4d, 0x12, 0x08, 0x5d, 0x03]));
  return frames;
}

export const CAB_IR_SYX_CASE_COUNT = 19;

/** Runs every case, then throws ONE combined error naming each failure (runner convention: `[suite]` prefix). */
export function runCabIrSyxTests(): void {
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

  // ── the specimen's own bytes ────────────────────────────────────────────────────────────────
  t('specimen name chunks decode to "LT TV Mix 7" (observed bytes, not a round-trip)', () => {
    const ir = parseCabIrSyx(synthIr());
    eq(ir.name, 'LT TV Mix 7', 'name');
    eq(ir.nameRaw.length, CAB_IR_NAME_CHARS, 'raw name length');
  });

  t('the name slot flag bit (bit 7) is reported, not silently masked', () => {
    const ir = parseCabIrSyx(synthIr());
    const flagged = ir.nameSlotFlags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    eq(flagged, [31], 'flagged slots (the specimen sets bit 7 on slot 31)');
  });

  t('measured geometry: 10 frames, 8 data frames, 2040 sample slots', () => {
    const ir = parseCabIrSyx(synthIr());
    eq(ir.frames.length, 10, 'frame count');
    eq(ir.sampleSlots, CAB_IR_SAMPLE_SLOTS, 'sample slots');
    eq(ir.sampleSlots, 2040, 'sample slots (literal)');
    eq(ir.dataPrefixes.length, 8, 'data frames');
  });

  t('start/end payloads are carried verbatim', () => {
    const ir = parseCabIrSyx(synthIr());
    eq(ir.startPayload, [0x7f, 0x7f, 0x00, 0x10], 'start payload');
    eq(ir.endPayload, [0x4d, 0x12, 0x08, 0x5d, 0x03], 'end payload (the unverified value)');
  });

  // ── replay ──────────────────────────────────────────────────────────────────────────────────
  t('default build is a BYTE-IDENTICAL replay (nothing is recomputed)', () => {
    const bytes = synthIr();
    eq(buildCabIrSyx(parseCabIrSyx(bytes)), bytes, 'replay');
  });

  // ── rename ──────────────────────────────────────────────────────────────────────────────────
  t('rename rewrites the name and leaves every other byte untouched', () => {
    const bytes = synthIr();
    const renamed = renameCabIrSyx(bytes, 'LYKOS TEST');
    eq(parseCabIrSyx(renamed).name, 'LYKOS TEST', 'renamed name');
    // only the first data frame may differ, and only inside its first 8 chunks
    const ir = parseCabIrSyx(renamed);
    const src = parseCabIrSyx(bytes);
    eq(ir.sampleSlots, src.sampleSlots, 'sample slots unchanged');
    eq(ir.endPayload, src.endPayload, 'end payload untouched (never recomputed)');
    eq(ir.frames.length, src.frames.length, 'frame count unchanged');
    eq(ir.frames[0], src.frames[0], 'start frame untouched');
    // the sample region of frame 1 and all of frames 2..8 must be identical
    const f1a = ir.frames[1]!.slice(6 + 2 + CAB_IR_NAME_CHUNKS * 5, -2);
    const f1b = src.frames[1]!.slice(6 + 2 + CAB_IR_NAME_CHUNKS * 5, -2);
    eq(f1a, f1b, 'sample bytes of the first data frame');
    for (let f = 2; f <= 8; f++) eq(ir.frames[f], src.frames[f], `data frame ${f}`);
  });

  t('rename preserves each slot flag bit', () => {
    const renamed = renameCabIrSyx(synthIr(), 'LYKOS TEST');
    const flags = parseCabIrSyx(renamed).nameSlotFlags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    eq(flags, [31], 'flag survives the rename');
  });

  t('rename pads to 32 characters and every frame still checksums', () => {
    const renamed = renameCabIrSyx(synthIr(), 'AB');
    const ir = parseCabIrSyx(renamed); // parse re-validates every checksum
    eq(ir.nameRaw.slice(0, 2), 'AB', 'name head');
    eq(ir.nameRaw.length, 32, 'padded to 32');
    ok(ir.nameRaw.slice(2).split('').every((c) => c === ' '), 'padding is spaces');
  });

  t('rename refuses a name longer than 32 characters', () => {
    let threw = '';
    try {
      renameCabIrSyx(synthIr(), 'X'.repeat(33));
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(/33 characters/.test(threw), `expected a length refusal, got: ${threw || '(no throw)'}`);
  });

  t('rename refuses non-ASCII (one 7-bit character per slot)', () => {
    let threw = '';
    try {
      renameCabIrSyx(synthIr(), 'Café');
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(/7-bit ASCII/.test(threw), `expected an ASCII refusal, got: ${threw || '(no throw)'}`);
  });

  // ── strictness: a container we do not understand must throw, not be guessed at ───────────────
  t('a bad frame checksum is refused with the frame index', () => {
    const bytes = synthIr();
    bytes[bytes.indexOf(0xf7, 0) - 1] = 0x00; // corrupt the start frame's checksum
    let threw = '';
    try {
      parseCabIrSyx(bytes);
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(/frame 0 has an invalid checksum/.test(threw), `expected a checksum refusal, got: ${threw || '(no throw)'}`);
  });

  t('a stream with bytes outside F0..F7 is refused', () => {
    let threw = '';
    try {
      parseCabIrSyx([0x00, 0xf0, 0x00, 0x01, 0x74, MODEL_FM3, CAB_IR_FN_START, 0x00, 0xf7]);
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(/outside any F0..F7 frame/.test(threw), `expected a stray-byte refusal, got: ${threw || '(no throw)'}`);
  });

  t('a preset dump is refused as a user-cab IR (wrong first function byte)', () => {
    // 0x77/0x78/0x79 is the preset envelope — the exact confusion that already happened once.
    const presetish = [...frame(0x77, [0x00, 0x00, 0x00, 0x00, 0x01]), ...frame(0x79, [0x00, 0x00, 0x00])];
    let threw = '';
    try {
      parseCabIrSyx(presetish);
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(/starts with 0x7a/.test(threw), `expected a wrong-envelope refusal, got: ${threw || '(no throw)'}`);
  });

  // ── the retarget EXPERIMENT (documented as unverified) ──────────────────────────────────────
  t('retargetCabIrStart writes the 14-bit pair and re-fixes the frame checksum', () => {
    const msb = synthIr();
    ok(retargetCabIrStart(msb, 1, 'msb'), 'msb retarget reported success');
    eq(parseCabIrSyx(msb).startPayload, [0x00, 0x01, 0x00, 0x10], 'msb encoding of slot 1');
    const lsb = synthIr();
    ok(retargetCabIrStart(lsb, 1, 'lsb'), 'lsb retarget reported success');
    eq(parseCabIrSyx(lsb).startPayload, [0x01, 0x00, 0x00, 0x10], 'lsb encoding of slot 1');
    // everything after the start frame is untouched by a retarget
    eq(parseCabIrSyx(msb).frames.slice(1), parseCabIrSyx(synthIr()).frames.slice(1), 'later frames untouched');
  });

  t('retargetCabIrStart refuses an out-of-range target', () => {
    let threw = '';
    try {
      retargetCabIrStart(synthIr(), 0x4000);
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(/out of 14-bit range/.test(threw), `expected a range refusal, got: ${threw || '(no throw)'}`);
  });

  // ── the CAPTURED destination field (editor's own upload, 2026-10-08) ─────────────────────────
  t('user slot destinations encode exactly as the capture shows', () => {
    // the capture's two uploads targeted `00 10 00 10` and `0b 10 00 10`
    eq(buildCabIrStartPayload(cabIrUserSlot(1)), [0x00, 0x10, 0x00, 0x10], 'user slot 1');
    eq(buildCabIrStartPayload(cabIrUserSlot(12)), [0x0b, 0x10, 0x00, 0x10], 'user slot 12 (the capture\'s second target)');
    eq(cabIrUserSlot(129), { index: 0, page: 0x11 }, 'user slot 129 opens the second bank');
    eq(cabIrUserSlot(512), { index: 127, page: 0x13 }, 'user slot 512 is the last of the fourth bank');
    eq(buildCabIrStartPayload(cabIrScratchpad(1)), [0x00, 0x20, 0x00, 0x10], 'scratchpad 1 encodes on page 0x20');
  });

  t('the destination reads back out of a start payload, and the export sentinel reads as null', () => {
    eq(cabIrStartDestination(buildCabIrStartPayload(cabIrUserSlot(7))), { index: 6, page: 0x10 }, 'round trip');
    eq(cabIrStartDestination([0x7f, 0x7f, 0x00, 0x10]), null, 'the export sentinel is "no destination"');
  });

  t('buildCabIrSyx with a destination rewrites ONLY the start frame', () => {
    const bytes = synthIr();
    const dest = cabIrUserSlot(12);
    const out = buildCabIrSyx(parseCabIrSyx(bytes), { dest });
    const before = parseCabIrSyx(bytes);
    const after = parseCabIrSyx(out); // parsing re-validates every checksum
    eq(after.startPayload, [0x0b, 0x10, 0x00, 0x10], 'start payload');
    eq(out.length, bytes.length, 'the stream length is unchanged');
    const changed = after.frames.map((f, i) => (f.join(',') === before.frames[i]!.join(',') ? null : i)).filter((x) => x !== null);
    eq(changed, [0], 'only the start frame changes');
  });

  t('destination helpers refuse out-of-range slots and non-7-bit bytes', () => {
    const msg = (fn: () => void) => {
      try {
        fn();
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    };
    ok(/out of range \(1..512\)/.test(msg(() => cabIrUserSlot(0))), 'user slot 0 refused');
    ok(/out of range \(1..512\)/.test(msg(() => cabIrUserSlot(513))), 'user slot 513 refused');
    ok(/out of range \(1..16\)/.test(msg(() => cabIrScratchpad(17))), 'scratchpad 17 refused');
    ok(/out of range \(0..127\)/.test(msg(() => buildCabIrStartPayload({ index: 128, page: 0x10 }))), 'index beyond a page refused');
  });

  t('interpretCabIrAcks requires EVERY expected frame, and dedupes the raw codes', () => {
    const ack = (fn: number, code: number) => [0xf0, 0x00, 0x01, 0x74, MODEL_FM3, 0x64, fn, code, fn & 0x0f, 0xf7];
    const full = [ack(0x7a, 0x00), ...Array.from({ length: 8 }, () => ack(0x7b, 0x00)), ack(0x7c, 0x00)];
    const r1 = interpretCabIrAcks(full, 8);
    eq(r1.complete, true, 'all acked → complete');
    eq([r1.start, r1.data, r1.end], [true, 8, true], 'start/data/end reported');
    eq(r1.codes.map((c) => `${c.fn}:${c.code}`), ['122:0', '123:0', '124:0'], 'distinct raw code pairs');
    // one data ack missing → NOT complete (the device acked the editor's upload frame by frame)
    const short = [ack(0x7a, 0x00), ...Array.from({ length: 7 }, () => ack(0x7b, 0x00)), ack(0x7c, 0x00)];
    eq(interpretCabIrAcks(short, 8).complete, false, 'a missing data ack is not complete');
    // no replies at all → nothing is claimed
    const none = interpretCabIrAcks([], 8);
    eq([none.complete, none.start, none.data, none.end], [false, false, 0, false], 'silence claims nothing');
  });

  if (failures.length) {
    throw new Error(`[cab-ir-syx] ${failures.length} case(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
}
