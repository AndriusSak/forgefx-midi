// ────────────────────────────────────────────────────────────────────────────────────────────────
// The PER-PRESET PERFORMANCE PAGE, decoded from a preset body (§2.2).
//
// MEASURED 2026-10-08 from a fixture pair — factory preset 406 vs the owner's copy 409 with four controls
// dragged into the editor's per-preset Performance page — by diffing the DECOMPRESSED bodies (the raw dump
// diff is useless: the body is compressed, so a four-control change reshuffles 5531 packed bytes and only
// 84 decompressed ones move).
//
// LAYOUT, and how each part is evidenced:
//   • 10 × uint16 LE — the slot table of EFFECT ids, 0 = unassigned. 409: 58,70,66,66,0×6
//     (Amp 1, Delay 1, Reverb 1, Reverb 1 — exactly the four controls that were dragged in);
//   • immediately after, 10 × uint16 LE — the PARAM ids in the same slot order. 409: 7,0,13,22,0×6, and
//     DELAY_MIX=0 / REVERB_MIX=13 / REVERB_BYPASS=22 are the ids the profile gives those parameters, from a
//     completely independent source — that agreement is what makes this a measurement and not a guess;
//   • then a 32-byte-stride block of 16-BIT-CHARACTER EFFECT labels ("AMP", "DLY1", "REV", "CAB", "DRV1");
//   • then a second 32-byte-stride block of PARAM labels ("Master Volume", "Feedback", "Pre-Delay",
//     "Bypass Mode", "Tone").
// VERIFIED against a user-built fixture (preset 410): six controls — Amp master volume, Delay feedback,
// Reverb pre-delay, Reverb bypass, Cab proximity frequency, Drive tone — decode to eids 58/70/66/66/62/118
// with pids 11/10/9/22/41/2 and exactly those labels, in that order. pid 22 = REVERB_BYPASS is independently
// confirmed by the profile.
//
// TWO CAVEATS, both measured:
//   • a label longer than the 32-byte slot is TRUNCATED and runs into the next slot ("Proximity Frequ"),
//     so a long name is not recoverable from this field alone — prefer the param catalogue for display;
//   • an UNASSIGNED slot keeps STALE text from whatever occupied it before (slot 7 read "HR1"/"ate" — the
//     tails of "PHR1"/"Rate"), so a label is only meaningful when the slot's effectId is non-zero. Same
//     lesson as an empty cab slot's "<EMPTY>" field.
//
// WHY THE SEARCH IS ANCHORED ON THE TEXT: the tables alone are not a signature. "10 small u16 then 10 small
// u16" also describes the preset's GRID/BLOCK table, which sits at body offset 258 in BOTH fixtures — a scan
// anchored on the tables reports that as the page, confidently and wrongly. A ~300-byte run of 16-bit-char
// label text at the record stride is a rare shape, so the text is found FIRST and the tables are read from
// the 40 bytes immediately before it (measured: the records begin immediately after the pid table).
//
// The tables are FIXED SIZE (40 bytes), which is what makes a length-preserving write possible; the
// device-bound write itself is a separate, still-unmeasured question.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Slots on the page (the editor shows ten). */
export const PERFORM_SLOTS = 10;
/** Effect-id table, then param-id table: 10 × uint16 each. */
export const PERFORM_TABLE_BYTES = PERFORM_SLOTS * 2 * 2;
/** Per-slot label record stride, measured across two presets. */
export const PERFORM_RECORD_STRIDE = 32;

const u16 = (b: ArrayLike<number>, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);

/** Read a 16-bit-character string at `o`, stopping at a NUL. Returns '' when it does not start as text. */
export function readText16(b: ArrayLike<number>, o: number, maxChars = 16): string {
  let s = '';
  for (let i = 0; i < maxChars; i++) {
    const c = u16(b, o + i * 2);
    if (c === 0) break;
    if (c < 0x20 || c >= 0x7f) return ''; // not text (a high byte with a zero low byte is NOT a character)
    s += String.fromCharCode(c);
  }
  return s.length >= 3 ? s : '';
}

/**
 * Find the page's tables. Anchored on the LABEL TEXT, not on the tables: scans for the first offset where
 * `minRuns` 16-bit-char strings appear at the record stride, and returns the 40 bytes immediately before it.
 * Returns undefined rather than a candidate when nothing matches — a wrong answer here is worse than none.
 */
export function findPerformTables(body: ArrayLike<number>, minRuns = 4): number | undefined {
  for (let start = PERFORM_TABLE_BYTES; start + PERFORM_RECORD_STRIDE * minRuns < body.length; start += 2) {
    let runs = 0;
    for (let i = 0; i < minRuns; i++) {
      if (readText16(body, start + i * PERFORM_RECORD_STRIDE).length >= 3) runs++;
    }
    if (runs < minRuns) continue;
    // the tables sit immediately before the records; every non-zero eid must be a plausible effect id
    const at = start - PERFORM_TABLE_BYTES;
    if (at < 0) continue;
    const eids = Array.from({ length: PERFORM_SLOTS }, (_, i) => u16(body, at + i * 2));
    if (!eids.some((v) => v !== 0)) continue;
    if (!eids.every((v) => v === 0 || v < 0x1000)) continue;
    return at;
  }
  return undefined;
}

/** Every NUL-terminated 16-bit-character string inside a window — no assumption about field roles. */
export function textStringsIn(b: ArrayLike<number>, o: number, len: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < len; ) {
    let s = '';
    let j = i;
    while (j + 1 < len) { const c = u16(b, o + j); if (c === 0) break; if (c < 0x20 || c >= 0x7f) { s = ''; break; } s += String.fromCharCode(c); j += 2; }
    if (s.length >= 2) { out.push(s); i = j + 2; } else i += 2;
  }
  return out;
}

export interface PerformSlot {
  /** 1-based, as the editor numbers them. */
  slot: number;
  /** The effect id the slot points at, or 0 when unassigned. */
  effectId: number;
  /** The param id within that effect, or 0 when unassigned. */
  paramId: number;
  /** The effect label from the first label block ("AMP", "DLY1", "REV") — '' when absent or not text. */
  effectLabel: string;
  /** The parameter label from the SECOND label block ("Master Volume", "Feedback") — truncated to the
   *  32-byte slot when the name is longer, and meaning nothing when the slot is unassigned (stale text). */
  paramLabel: string;
  /** Text found in the remainder of the slot's second-block window — reported, never asserted as a role. */
  paramLabel2: string;
}

export interface PerformPage {
  /** Offset of the effect-id table in the body. */
  at: number;
  slots: PerformSlot[];
  /** How many slots are assigned. */
  assigned: number;
}

/** Parse the page from a DECOMPRESSED preset body. `undefined` when no page is found (never a guess). */
export function parsePerformPage(body: ArrayLike<number>): PerformPage | undefined {
  const at = findPerformTables(body);
  if (at === undefined) return undefined;
  const recordsAt = at + PERFORM_TABLE_BYTES;
  const paramBlockAt = recordsAt + PERFORM_SLOTS * PERFORM_RECORD_STRIDE;
  const slots: PerformSlot[] = [];
  for (let i = 0; i < PERFORM_SLOTS; i++) {
    const effectId = u16(body, at + i * 2);
    const paramId = u16(body, at + PERFORM_SLOTS * 2 + i * 2);
    const rec = recordsAt + i * PERFORM_RECORD_STRIDE;
    const pRec = paramBlockAt + i * PERFORM_RECORD_STRIDE;
    // The effect label is the first text in its own record; the param label is the first text in the
    // SECOND block's record (measured, verified against the six-control fixture). Neither is read from the
    // other's block, and neither claims a role for any further text on the same line.
    const paramStrings = textStringsIn(body, pRec, PERFORM_RECORD_STRIDE);
    slots.push({
      slot: i + 1,
      effectId,
      paramId,
      effectLabel: readText16(body, rec),
      paramLabel: paramStrings[0] ?? '',
      paramLabel2: paramStrings[1] ?? ''
    });
  }
  return { at, slots, assigned: slots.filter((s) => s.effectId !== 0).length };
}
