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
 *     under a renamed container give a DIFFERENT region. The region IS the start of the slot's NAME, packed
 *     (see below) — decode it with `decodeCabSlotName` rather than treating it as a fingerprint;
 *   • an EMPTY slot's name field is not blank and not a shared constant: the device puts the literal text
 *     "<EMPTY>" there, followed by STALE bytes that vary between slots and sessions (measured). So an empty
 *     slot's field must never be compared or built on — the flag byte is the reliable signal;
 *   • payload[28..29] are VOLATILE — they differed between the capture and a later live read of the
 *     same slot, so they are reported separately and never treated as content;
 *   • the region IS the name, DECODED (measured 2026-10-08, after this file first claimed the opposite): the
 *     field holds the slot's name re-packed for the wire — 8-bit characters, MSB-first bit stream, re-split
 *     into 7-bit septets, NUL-terminated — and `decodeCabSlotName` recovers it exactly. The earlier claim
 *     ("the encoding is not decoded, it is a fingerprint, not the name") was reasoned from repeated letters
 *     not repeating in the region; that reasoning ignored that a BIT-LEVEL repack destroys per-character byte
 *     alignment, so repeats need not survive. Corrected rather than deleted: the mistake is instructive.
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
/**
 * The per-slot NAME, decoded from the `0x4B` reply — MEASURED 2026-10-08, and it closes the question the
 * whole §2.5c line was about.
 *
 * The reply's payload carries the slot's name in the same 32-character field the `.syx` container uses, but
 * REPACKED for the wire: each character is taken as an 8-bit value, the characters are concatenated
 * **MSB-first** into one bit stream, and the stream is re-split into **7-bit groups** (SysEx payload bytes
 * must be ≤ 0x7F). 32 characters × 8 bits = 256 bits → 37 septets, which is exactly the payload from
 * `CAB_SLOT_NAME_OFFSET` to its end (52 − 15 = 37) — the geometry closes, which is how it was confirmed.
 *
 * VERIFIED against two independently known names written over the wire:
 *   "LT TV Mix 7"    → 26 15 04 05 22 58 40 4d 34 5e 04 03 38 …
 *   "LYKOS-NAMETEST" → 26 16 29 34 7a 4c 5a 4e 20 53 28 55 22 15 26 54 …
 * Both decode back exactly. An EMPTY slot is not blank either: the device puts the literal text
 * "<EMPTY>" in the field (measured), followed by stale fragments — so a name is only meaningful when the
 * slot's flag says populated. NOTE what this invalidates: an earlier claim in this repo said the region was a
 * "hash-like fingerprint" that could never carry a name, argued from repeated letters not repeating in the
 * region. That reasoning was WRONG — a bit-level repacking destroys per-character byte alignment, so
 * repeated letters need not repeat, and the region is the name itself.
 */
export const CAB_SLOT_NAME_OFFSET = 15;
/** Characters in the packed name (the same 32 the container's name field holds). */
export const CAB_SLOT_NAME_CHARS = 32;

/** Unpack `CAB_SLOT_NAME_CHARS` characters from 7-bit septets (MSB-first bit stream → 8-bit characters). */
export function decodeCabSlotName(payload: readonly number[]): string | undefined {
  const septets = payload.slice(CAB_SLOT_NAME_OFFSET);
  if (septets.length * 7 < CAB_SLOT_NAME_CHARS * 8) return undefined;
  const bits: number[] = [];
  for (const s of septets) for (let i = 6; i >= 0; i--) bits.push((s >> i) & 1);
  const raw: number[] = [];
  for (let c = 0; c < CAB_SLOT_NAME_CHARS; c++) {
    let v = 0;
    for (let k = 0; k < 8; k++) v = (v << 1) | bits[c * 8 + k]!;
    // Stop at the terminator BEFORE mapping anything: the field is name + NUL + another packed field, and a
    // "map non-printables to a dot" pass would erase the terminator and let the second field through.
    if (v < 0x20 || v >= 0x7f) break;
    raw.push(v);
  }
  const out = String.fromCharCode(...raw);
  // The name is NUL-TERMINATED inside the field: the byte right after the last name character decodes to a
  // non-printable, and BEYOND it the same bit stream carries OTHER packed data (which is why an 8-bit read
  // of the whole 32 characters shows a length-dependent shift of something like "…ance Mode…"). Stop at the
  // terminator; anything past it is a different field and is NOT part of the name.
  return out.replace(/\s+$/, '');
}

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
  /** The first 15 bytes of the packed name field — the decoded name's first ~13 characters' worth. Kept
   *  because existing callers compare it; `name` is the readable form and is what a UI should show. */
  nameRegion: number[];
  /** The slot's NAME, decoded from the reply (see `decodeCabSlotName`). For an EMPTY slot this is the
   *  device's own literal "<EMPTY>". `undefined` only when the payload is too short to hold the field. */
  name: string | undefined;
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
    name: decodeCabSlotName(payload),
    volatileBytes: CAB_SLOT_VOLATILE_OFFSETS.map((o) => payload[o]!).filter((v) => v !== undefined),
    raw: payload,
  };
}

/** True when two slots' content regions match — the comparison an upload confirmation makes. */
export function cabSlotNameMatches(a: CabSlotState, b: CabSlotState): boolean {
  return a.nameRegion.length === b.nameRegion.length && a.nameRegion.every((v, i) => v === b.nameRegion[i]);
}
