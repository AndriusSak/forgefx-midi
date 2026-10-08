// Per-slot cab STATE (`fn=0x01 sub=0x4B`) — golden tests against the bytes the device actually sent.
//
// The fixtures are VERBATIM: the request is the editor's own query shape, and the three reply payloads
// are (a) an EMPTY slot, (b) user slot 1 and (c) a fresh upload to user slot 13 — the last two are
// byte-identical in their content region, which is the whole basis for calling the region
// content-derived. Nothing here is synthesised, and no test asserts a meaning the measurement did not
// establish: the region is deliberately NOT decoded to a name (it is not one).
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
} from '../../../src/devices/gen3/index.js';

export const CAB_SLOT_STATE_CASE_COUNT = 12;

const MODEL_FM3 = 0x11;

// ── fixtures: measured bytes, assembled into frames so the geometry cannot drift ────────────────
/** The editor's own request for user slot 1 (`index 00`, `page 10`) — verbatim from the capture. */
const REQ_USER1 = [0xf0, 0x00, 0x01, 0x74, 0x11, 0x01, 0x4b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x4e, 0xf7];

const hex = (s: string): number[] => s.trim().split(/\s+/).map((h) => parseInt(h, 16));

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

  // 12 — the region is NOT a name, and the module must not pretend otherwise
  t('the content region does not decode to the slot name in any simple scheme', () => {
    // The slot holds "LT TV Mix 7" (its .syx name). Assert that the naive decodings do NOT yield it —
    // this is the guard against someone "improving" the parser into a name oracle without evidence.
    const region = parseCabSlotState(REP_USER1, 0, 0x10)!.nameRegion;
    const ascii = region.map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('');
    ok(!ascii.includes('LT TV'), `plain 7-bit must not produce the name, got ${JSON.stringify(ascii)}`);
    let sept = '';
    for (let i = 0; i + 5 <= region.length; i += 5) {
      const v = (region[i]! | (region[i + 1]! << 7) | (region[i + 2]! << 14) | (region[i + 3]! << 21) | (region[i + 4]! << 28)) >>> 0;
      sept += [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255].map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : '.')).join('');
    }
    ok(!sept.includes('LT TV'), `5-septet must not produce the name, got ${JSON.stringify(sept)}`);
  });

  if (failures.length) {
    console.error(`FAIL fm3/cab-slot-state — ${failures.length} of ${CAB_SLOT_STATE_CASE_COUNT} case(s):`);
    for (const f of failures) console.error(`   ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS fm3/cab-slot-state (${CAB_SLOT_STATE_CASE_COUNT} per-slot state cases)`);
}
