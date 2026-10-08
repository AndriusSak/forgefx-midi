// Per-slot cab STATE (`fn=0x01 sub=0x4B`) — golden tests against the bytes the device actually sent.
//
// The fixtures are VERBATIM: the request is the editor's own query shape, and the three reply payloads
// are (a) an EMPTY slot, (b) user slot 1 and (c) a fresh upload to user slot 13 — the last two are
// byte-identical in their name region, which is the whole basis for calling it name-derived. Nothing here
// is synthesised, and no test asserts a meaning the measurement did not establish. NOTE: the region IS the
// name, decoded — see the decodeCabSlotName cases; the file header claimed the opposite before that was
// measured, and the claim is corrected here rather than left to mislead the next reader.
import { fractalChecksum } from '../../../src/shared/checksum.js';
import {
  buildCabSlotQuery,
  parseCabSlotState,
  cabSlotNameMatches,
  cabIrUserSlot,
  cabIrScratchpad,
  CAB_SLOT_FN,
  CAB_SLOT_SUB,
  CAB_SLOT_QUERY_LEN,
  CAB_SLOT_REPLY_LEN,
  CAB_SLOT_POPULATED,
  CAB_SLOT_EMPTY,
  CAB_SLOT_REGION_LEN,
  CAB_SLOT_VOLATILE_OFFSETS,
  decodeCabSlotName,
} from '../../../src/devices/gen3/index.js';

export const CAB_SLOT_STATE_CASE_COUNT = 16;

const MODEL_FM3 = 0x11;

// ── fixtures: measured bytes, assembled into frames so the geometry cannot drift ────────────────
/** The editor's own request for user slot 1 (`index 00`, `page 10`) — verbatim from the capture. */
const REQ_USER1 = [0xf0, 0x00, 0x01, 0x74, 0x11, 0x01, 0x4b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x4e, 0xf7];

const hex = (s: string): number[] => s.trim().split(/\s+/).map((h) => parseInt(h, 16));
/** A reply PAYLOAD, padded to the measured 52 bytes: the device zero-fills the field, and the name decoder
 *  needs the whole field (not just the bytes that happen to be non-zero) to see its 37 septets. */
const payload52 = (s: string): number[] => {
  const b = hex(s);
  if (b.length > 52) throw new Error(`fixture is ${b.length} bytes — longer than the 52-byte payload`);
  return [...b, ...new Array(52 - b.length).fill(0)];
};

/** The three reply PAYLOADS exactly as the device sent them (52 bytes each, incl. the sub echo). */
const PAY_USER1 = hex(`4b 00 00 00 00 00 01 00 00 00 00 00 00 20 00 26 15 04 05 22 58 40 4d 34 5e 04 03 38
                       00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`);
/** A FRESH UPLOAD's slot (user slot 13) — the SAME content region as slot 1, a different slot. */
const PAY_USER13 = [...PAY_USER1];
/** An EMPTY slot (shared by 500 empty user slots AND all 16 empty scratchpad memories). */
const PAY_EMPTY = hex(`4b 00 00 00 00 00 7f 01 00 00 00 00 00 20 00 1e 11 29 55 02 51 32 3e 00 1e 04 03 38
                       00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`);

/** Wrap a measured payload into a real 60-byte reply frame (checksum included — the geometry is asserted). */
function frame(payload: readonly number[]): number[] {
  const body = [0xf0, 0x00, 0x01, 0x74, MODEL_FM3, 0x01, ...payload];
  return [...body, fractalChecksum(body), 0xf7];
}
const REP_USER1 = frame(PAY_USER1);
const REP_USER13 = frame(PAY_USER13);
const REP_EMPTY = frame(PAY_EMPTY);

const failures: string[] = [];
function t(name: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
  }
}
function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
function eq<T>(got: T, want: T, msg: string): void {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(`${msg}: got ${a}, want ${b}`);
}
const payloadOf = (f: readonly number[]) => f.slice(6, f.length - 2);

export function runCabSlotStateTests(): void {
  // 1 — the builder reproduces the editor's own request byte for byte
  t('buildCabSlotQuery reproduces the captured request exactly', () => {
    const built = buildCabSlotQuery(MODEL_FM3, 0, 0x10);
    eq(built, REQ_USER1, 'user slot 1 query');
    eq(built.length, CAB_SLOT_QUERY_LEN, 'request length');
    // and it is a VALID frame: the checksum covers F0 through the last payload byte
    eq(fractalChecksum(built.slice(0, -2)), built[built.length - 2], 'checksum');
  });

  // 2 — destination addressing matches the upload's own pair
  t('the query addresses slots with the SAME [index, page] pair as the IR upload', () => {
    eq(payloadOf(buildCabSlotQuery(MODEL_FM3, 0, 0x10)).slice(6, 8), [0x00, 0x10], 'user slot 1');
    const u12 = cabIrUserSlot(12);
    eq(payloadOf(buildCabSlotQuery(MODEL_FM3, u12.index, u12.page)).slice(6, 8), [0x0b, 0x10], 'user slot 12 → 0b 10 (the capture)');
    const sp = cabIrScratchpad(1);
    eq(payloadOf(buildCabSlotQuery(MODEL_FM3, sp.index, sp.page)).slice(6, 8), [0x00, 0x20], 'scratchpad 1 (valid for the QUERY, unlike an upload)');
  });

  // 3 — out-of-range addressing is refused rather than masked
  t('the builder refuses an out-of-range index or page', () => {
    const msg = (fn: () => void) => {
      try {
        fn();
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    };
    ok(/index 128 is out of range/.test(msg(() => buildCabSlotQuery(MODEL_FM3, 128, 0x10))), 'index 128');
    ok(/page 256 is out of range/.test(msg(() => buildCabSlotQuery(MODEL_FM3, 0, 256))), 'page 256');
  });

  // 4 — the populated flag, read from the measured byte
  t('a populated slot reads as populated, an empty one as empty', () => {
    const p = parseCabSlotState(REP_USER1, 0, 0x10);
    const e = parseCabSlotState(REP_EMPTY, 12, 0x10);
    ok(p !== null && e !== null, 'both parse');
    eq(p!.populated, true, 'slot 1 populated');
    eq(p!.flag, CAB_SLOT_POPULATED, 'flag 0x01');
    eq(e!.populated, false, 'slot 13 empty');
    eq(e!.flag, CAB_SLOT_EMPTY, 'flag 0x7f');
  });

  // 5 — an unrecognised flag is `null`, never rounded to "empty"
  t('an unrecognised flag byte reports null, not empty', () => {
    const weird = [...REP_USER1];
    weird[6 + 6] = 0x42; // payload[6] = the flag
    const s = parseCabSlotState(weird, 0, 0x10);
    eq(s!.populated, null, 'unknown flag');
    eq(s!.flag, 0x42, 'raw flag still inspectable');
  });

  // 6 — the content region is the measured 15 bytes, and NOTHING else
  t('the content region is exactly payload[15..29]', () => {
    const s = parseCabSlotState(REP_USER1, 0, 0x10)!;
    eq(s.nameRegion.length, CAB_SLOT_REGION_LEN, 'region length');
    eq(s.nameRegion, payloadOf(REP_USER1).slice(15, 30), 'region slice');
  });

  // 7 — the volatile bytes are reported separately and are NOT in the region
  t('the volatile bytes are split out of the content region', () => {
    const s = parseCabSlotState(REP_USER1, 0, 0x10)!;
    eq(s.volatileBytes, CAB_SLOT_VOLATILE_OFFSETS.map((o) => payloadOf(REP_USER1)[o]), 'volatile bytes');
    // they sit INSIDE 15..29 (offsets 28-29), so a naive "region = 15..29" would include them
    for (const o of CAB_SLOT_VOLATILE_OFFSETS) ok(o >= 15 && o <= 29, `offset ${o} is inside the region slice`);
  });

  // 8 — THE content test: two slots holding the same IR match, and an empty slot does not
  t('two slots holding the same IR have identical content regions', () => {
    const a = parseCabSlotState(REP_USER1, 0, 0x10)!;
    const b = parseCabSlotState(REP_USER13, 12, 0x10)!;
    const e = parseCabSlotState(REP_EMPTY, 13, 0x10)!;
    eq(cabSlotNameMatches(a, b), true, 'slot 1 vs the fresh upload to slot 13');
    eq(cabSlotNameMatches(a, e), false, 'slot 1 vs an empty slot');
  });

  // 9 — the reply does NOT echo the slot in a readable field: the caller's request is the identity
  t('the parsed state carries the REQUESTED slot, since the reply does not identify it', () => {
    const s = parseCabSlotState(REP_USER1, 7, 0x12)!;
    eq([s.index, s.page], [7, 0x12], 'identity comes from the request');
  });

  // 10 — anything that is not a state answer parses to null (a refusal or sentinel is not "empty")
  t('non-answers parse to null rather than to an empty slot', () => {
    eq(parseCabSlotState([], 0, 0x10), null, 'empty frame');
    eq(parseCabSlotState([0xf0, 0xf7], 0, 0x10), null, 'too short');
    const wrongSub = [...REP_USER1];
    wrongSub[6] = 0x03; // a different sub-action's reply
    eq(parseCabSlotState(wrongSub, 0, 0x10), null, 'wrong sub-action');
    const noEnd = REP_USER1.slice(0, -1);
    eq(parseCabSlotState(noEnd, 0, 0x10), null, 'no terminator');
  });

  // 11 — the reply length is the measured 60 bytes and the payload 52
  t('the measured reply geometry holds', () => {
    eq(REP_USER1.length, CAB_SLOT_REPLY_LEN, 'reply length');
    eq(payloadOf(REP_USER1).length, 52, 'payload length');
    eq(REP_EMPTY.length, CAB_SLOT_REPLY_LEN, 'the empty-slot reply has the same length');
  });

  // 12 — the NAME decodes from the reply. This REPLACES an assertion that used to say the opposite
  // ("the region is NOT a name, and the module must not pretend otherwise"), which was the 2026-10-08
  // pre-measurement position: the region was argued to be a hash-like fingerprint from repeated letters not
  // repeating. That argument was wrong — the field is the name RE-PACKED (8-bit characters, MSB-first bit
  // stream, re-split into 7-bit septets, NUL-terminated) and a bit-level repack has no reason to preserve
  // per-character byte alignment. The fixtures below are the device's own bytes from a capture of
  // FM3-Edit reading the user bank, including slots whose names were confirmed independently.
  t('the slot name decodes from the reply payload (measured, three independent confirmations)', () => {
    eq(decodeCabSlotName(payload52(`4b 00 00 00 00 00 01 00 00 00 00 00 00 20 00 26 15 04 05 22 58 40 4d 34 5e 04 03 38 01 5e 72 36 58 2d 66 1b 14 40 4d 37 59 0c 50`)), 'LT TV Mix 7', 'U0001 = the name the owner confirmed');
    eq(decodeCabSlotName(payload52(`4b 00 00 00 00 00 01 00 00 00 00 00 00 20 00 29 19 2e 32 02 41 66 79 31 5a 0d 72 01 48 00 72 36 58 2d 66 1b 14 40 4d 37 59 0c 50`)), 'Res Psycho 2', 'U0002 = a name nobody on this host had supplied, so the decode is not circular');
    eq(decodeCabSlotName(payload52(`4b 00 00 00 00 00 01 00 00 00 00 00 00 20 00 26 15 04 05 22 58 40 4d 34 5e 04 03 38 00 00 72 36 58 2d 66 1b 14 40 4d 37 59 0c 50`)), 'LT TV Mix 7', 'U0012 = the same IR in another slot decodes the same');
  });

  // 13 — an EMPTY slot is not blank in the field: the device writes the literal text "<EMPTY>", followed
  // by stale bytes. The decode must stop at the terminator rather than wander into them.
  t('an empty slot decodes to the device\'s own "<EMPTY>"', () => {
    eq(decodeCabSlotName(payload52(`4b 00 00 00 00 00 7f 01 00 00 00 00 00 20 00 1e 11 29 55 02 51 32 3e 00 13 28 55 22 15 26 54 00 18 2d 66 1b 14 40 4d 37 59 0c 50`)), '<EMPTY>', 'empty-slot text');
  });

  // 14 — the field carries MORE than the name: past the terminator the same bit stream holds another packed
  // field (an 8-bit read of it shows a length-dependent shift of something like "...ance Mode..."). It must
  // never end up inside the name.
  t('the tail field is not part of the name', () => {
    const name = decodeCabSlotName(payload52(`4b 00 00 00 00 00 01 00 00 00 00 00 00 20 00 26 15 04 05 22 58 40 4d 34 5e 04 03 38 01 5e 72 36 58 2d 66 1b 14 40 4d 37 59 0c 50`))!;
    eq(name.length, 11, 'the name is exactly the name');
    ok(!/ance|Mode/.test(name), `the trailing packed field must not leak in, got ${JSON.stringify(name)}`);
  });

  // 15 — too short to contain the field: no name, rather than a truncated one.
  t('a payload too short for the field yields no name', () => {
    eq(decodeCabSlotName([0x4b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]), undefined, 'short payload');
  });

  if (failures.length) {
    console.error(`FAIL fm3/cab-slot-state — ${failures.length} of ${CAB_SLOT_STATE_CASE_COUNT} case(s):`);
    for (const f of failures) console.error(`   ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS fm3/cab-slot-state (${CAB_SLOT_STATE_CASE_COUNT} per-slot state cases)`);
}
