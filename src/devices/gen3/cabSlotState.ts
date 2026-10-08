/**
 * Per-slot cab STATE — the device's own `fn=0x01 sub=0x4B` query.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 * The IR upload (§2.5) had no independent confirmation: fw 13 REFUSES the documented gen-3 cab-name
 * read (`fn=0x12`), so "the upload was accepted" rested on the upload's own acknowledgements, and
 * nothing on the wire said the IR had actually landed. This query is the answer — FM3-Edit issues it
 * once per slot to build its cab list, and its reply carries per-slot state.
 *
 * ── Measured (FM3-Edit 1.07.16 → FM3 fw 13.0, USB capture + live confirmation) ───────────────────
 * Request (23 bytes, the editor's own shape):
 *   `F0 00 01 74 11 01 4B 00 00 00 00 00 <index> <page> 00 00 00 00 00 00 00 <cksum> F7`
 * `index` at byte 12 and `page` at byte 13 are the SAME pair the IR upload's start frame takes
 * (0x10-0x13 = the 512 user slots, 0x20 = the 16 scratchpad memories). The editor sends all 528.
 *
 * Reply (60 bytes, `fn=0x01 sub=0x4B`, payload = `frame[6:-2]`, 52 bytes):
 *   • payload[6]  = 0x01 POPULATED / 0x7F EMPTY — the flag that makes this useful;
 *   • payload[15..29] = a NAME-DERIVED region. MEASURED 2026-10-08, and the mechanism is the NAME, not
 *     the samples: three slots holding the same name with wildly different sample data (a real IR, an
 *     all-zero sample set, and a one-byte spike) share the region byte for byte, while the SAME samples
 *     under a renamed container give a DIFFERENT region. So it confirms a RENAME (the region moves) but
 *     cannot distinguish two IRs that share a name. The encoding is undecoded — it is a fingerprint, not
 *     the name itself;
 *   • every empty slot in every bank (500 user + 16 scratchpad) shares ONE payload — but that EMPTY
 *     payload is NOT stable across sessions: the same slots read `…3e 00 1e 04 03 38…` in the morning and
 *     `…3e 00 0d 26 70…` hours later. Treat the empty value as unstable and never build on its bytes;
 *   • payload[28..29] are VOLATILE — they differed between the capture and a later live read of the
 *     same slot, so they are reported separately and never treated as content;
 *   • the encoding of the region is NOT decoded. It is not a name: no 4-per-5-septet, 8-per-7 or
 *     plain-7-bit decoding at any offset yields a known name, and a rename did not change it. So this
 *     is a POPULATED/FINGERPRINT oracle, NOT a name oracle — report "populated", never "holds <name>".
 *
 * The flag reading is reported as `null` when the byte matches neither constant: an unrecognised flag
 * must never be rounded to "empty" (silence and empty are different observations on this device too).
 */

import { fractalChecksum } from '../../shared/checksum.js';

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;
const MFR = [0x00, 0x01, 0x74] as const;

/** Function byte the per-slot query rides on (the self-describe / action function). */
export const CAB_SLOT_FN = 0x01;
/** Sub-action of the cab-slot state query. */
export const CAB_SLOT_SUB = 0x4b;
/** Request length the editor sends (a useful sanity check for a captured frame). */
export const CAB_SLOT_QUERY_LEN = 23;
/** Reply length for a real state answer. */
export const CAB_SLOT_REPLY_LEN = 60;

/** Reply-payload offsets, all relative to `frame[6:-2]`. */
export const CAB_SLOT_FLAG_OFFSET = 6;
export const CAB_SLOT_REGION_START = 15;
export const CAB_SLOT_REGION_LEN = 15;
/** Payload offsets that MOVED between capture and a live read of the same slot — volatile, not content. */
export const CAB_SLOT_VOLATILE_OFFSETS: readonly number[] = [28, 29];

/** Payload[6] values measured for a populated / empty slot. */
export const CAB_SLOT_POPULATED = 0x01;
export const CAB_SLOT_EMPTY = 0x7f;

/**
 * The implemented per-slot sub-actions on `fn=0x01` — MEASURED by a bounded read-shaped sweep
 * (2026-10-08). NONE of them is a slot-data read, and none carries a readable name.
 *
 *   • `0x4B` — the slot-state query this module implements (populated flag + name-derived region);
 *   • `0x4A`, `0x4E` — answered, but the reply is IDENTICAL for every slot including empty ones, so
 *     they carry no per-slot datum (a bank-level value returned per query, or a constant). Undecoded;
 *   • `0x4C` — answered and VARIES per slot; meaning undecoded, and no readable text is in it;
 *   • `0x4D` — answered, 33 bytes, IDENTICAL across slots. Undecoded.
 *
 * Also measured: the `0x4B` payload is 52 bytes and its content EXTENDS PAST the 15-byte region (bytes
 * at offset 30+ changed between sessions). The region is what this module models; the rest is undecoded
 * device state and must not be interpreted.
 */
export const CAB_SLOT_FN_SUBACTIONS: Readonly<Record<number, string>> = {
  0x4a: 'answered; identical across slots — no per-slot datum (undecoded)',
  0x4b: 'slot state: populated flag + name-derived region (implemented here)',
  0x4c: 'answered; varies per slot (undecoded)',
  0x4d: 'answered; 33 bytes, identical across slots (undecoded)',
  0x4e: 'answered; identical across slots — no per-slot datum (undecoded)',
};

/** Payload length of a `0x4B` reply. The modelled region ends well before this. */
export const CAB_SLOT_REPLY_PAYLOAD_LEN = 52;

/**
 * Build the per-slot state query for one `[index, page]` destination.
 *
 * Byte 12/13 carry the destination so this works for a user slot (`cabIrUserSlot(n)`) or a scratchpad
 * memory (`cabIrScratchpad(n)`), and — unlike the IR upload — the scratchpad IS a valid target here:
 * the editor queries all 16 scratchpad memories, and the live unit answers them.
 */
export function buildCabSlotQuery(model: number, index: number, page: number): number[] {
  if (!Number.isInteger(index) || index < 0 || index > 0x7f) throw new Error(`cab slot index ${index} is out of range (0..127)`);
  if (!Number.isInteger(page) || page < 0 || page > 0x7f) throw new Error(`cab slot page ${page} is out of range (0..127)`);
  const body = [SYSEX_START, ...MFR, model & 0x7f, CAB_SLOT_FN, CAB_SLOT_SUB, 0x00, 0x00, 0x00, 0x00, 0x00, index, page, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  return [...body, fractalChecksum(body), SYSEX_END];
}

export interface CabSlotState {
  /** The slot this state belongs to (as requested — the reply does not echo it in a readable form). */
  index: number;
  page: number;
  /** `true` populated · `false` empty · `null` flag byte unrecognised (never rounded to empty). */
  populated: boolean | null;
  /** The raw flag byte, so a `null` reading is still inspectable. */
  flag: number;
  /** The NAME-derived region (15 bytes) — it moves with the slot's NAME, not its samples, and it is a
   *  fingerprint, not the name. Undecoded encoding; identical for two slots that share a name. */
  nameRegion: number[];
  /** The volatile bytes (payload[28..29]) — reported, never part of the region. */
  volatileBytes: number[];
  /** The whole 52-byte reply payload, verbatim. */
  raw: number[];
}

/**
 * Parse a reply to `buildCabSlotQuery`. Returns `null` for anything that is not a state answer (a
 * sentinel, a refusal, a shorter frame) — the caller must not read `null` as "empty".
 */
export function parseCabSlotState(frame: readonly number[] | Uint8Array, index: number, page: number): CabSlotState | null {
  const b = [...frame];
  if (b.length < 8) return null;
  if (b[0] !== SYSEX_START || b[b.length - 1] !== SYSEX_END) return null;
  if (b[5] !== CAB_SLOT_FN || b[6] !== CAB_SLOT_SUB) return null;
  const payload = b.slice(6, b.length - 2);
  if (payload.length < CAB_SLOT_REGION_START + CAB_SLOT_REGION_LEN) return null;
  const flag = payload[CAB_SLOT_FLAG_OFFSET]!;
  return {
    index,
    page,
    populated: flag === CAB_SLOT_POPULATED ? true : flag === CAB_SLOT_EMPTY ? false : null,
    flag,
    nameRegion: payload.slice(CAB_SLOT_REGION_START, CAB_SLOT_REGION_START + CAB_SLOT_REGION_LEN),
    volatileBytes: CAB_SLOT_VOLATILE_OFFSETS.map((o) => payload[o]!).filter((v) => v !== undefined),
    raw: payload,
  };
}

/** True when two slots' content regions match — the comparison an upload confirmation makes. */
export function cabSlotNameMatches(a: CabSlotState, b: CabSlotState): boolean {
  return a.nameRegion.length === b.nameRegion.length && a.nameRegion.every((v, i) => v === b.nameRegion[i]);
}
