// ────────────────────────────────────────────────────────────────────────────────────────────────
// The GLOBAL PERFORMANCE PAGE, inside the eid-1 (GLOBAL) bulk body.
//
// MEASURED 2026-10-30 by dumping the whole fn-0x1F GLOBAL body from a live FM3 (14 880 16-bit records)
// and reading the structure where FM3-Edit's Perform view says it lives ("The 'Global Performance
// Controls' are stored in the Global Settings"). The page sits at body offset 8305 and is byte-for-byte
// the same shape as the per-preset page (see performPage.ts), only with 16-character label records
// instead of 32-byte ones:
//
//   8305  …  8314   10 × uint16  effect ids   [58,58,58,58,58,0,58,58,58,0]
//   8315  …  8324   10 × uint16  param ids    [8,9,10,22,26,0,7,11,1,0]
//   8325  …  8484   10 × 16 16-bit-char EFFECT labels  "AMP" ×8, empty ×2
//   8485  …  8644   10 × 16 16-bit-char PARAM labels   "Bass","Mid","Treble","Depth","Presence",
//                                                       "", "Input Drive","Master Vol","Level",""
//
// The decode is self-consistent on the unit's own data: the five consecutive 58s are the five "AMP"
// labels and pids 8/9/10/22/26 land exactly on Bass/Mid/Treble/Depth/Presence, 7/11/1 on Input
// Drive/Master Vol/Level. That agreement — ids from the number table, names from a separate text
// region — is what makes this a measurement rather than a plausible-looking guess.
//
// WHY THE SEARCH IS ANCHORED ON THE TEXT: "10 small u16 then 10 small u16" also describes the preset
// grid and other tables in this body, so the numbers alone are not a signature. A run of ≥4 records of
// 16-bit characters at a 16-value stride is rare; the ids are read from the 20 records immediately
// before the first label record, and the candidate is rejected unless every non-empty effect label has
// a non-zero effect id.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Controls on the page (the editor shows ten). */
export const GLOBAL_PERFORM_SLOTS = 10;
/** Characters per label record. */
export const GLOBAL_PERFORM_LABEL_CHARS = 16;
/** Two id tables: 10 × uint16 each. */
export const GLOBAL_PERFORM_TABLE_LEN = GLOBAL_PERFORM_SLOTS * 2;
/** Total records the page occupies (ids + both label blocks). */
export const GLOBAL_PERFORM_PAGE_LEN =
  GLOBAL_PERFORM_TABLE_LEN + 2 * GLOBAL_PERFORM_SLOTS * GLOBAL_PERFORM_LABEL_CHARS;

export interface GlobalPerformSlot {
  /** 0 = unassigned. */
  readonly effectId: number;
  readonly paramId: number;
  readonly effectLabel: string;
  readonly paramLabel: string;
}

export interface GlobalPerformPage {
  /** Body offset of the first id table record. */
  readonly at: number;
  readonly slots: readonly GlobalPerformSlot[];
}

const u = (v: ArrayLike<number>, i: number): number => (v[i] ?? 0) & 0xffff;

/** Read a 16-bit-character string at `i`, stopping at NUL. '' when it does not look like text. */
export function readText16v(v: ArrayLike<number>, i: number, chars = GLOBAL_PERFORM_LABEL_CHARS): string {
  let s = '';
  for (let k = 0; k < chars; k++) {
    const c = u(v, i + k);
    if (c === 0) break;
    if (c < 0x20 || c > 0x7e) return '';
    s += String.fromCharCode(c);
  }
  return s;
}

/**
 * Locate the page. Returns undefined when no candidate satisfies every check — a wrong page is worse
 * than no page (the same rule the per-preset decoder follows).
 */
export function findGlobalPerformPage(v: ArrayLike<number>): GlobalPerformPage | undefined {
  const recLen = GLOBAL_PERFORM_LABEL_CHARS;
  for (let first = 0; first + 4 * recLen < v.length; first++) {
    // cheap reject: a label record must start with a printable character
    let runs = 0;
    for (let i = 0; i < GLOBAL_PERFORM_SLOTS; i++) {
      if (readText16v(v, first + i * recLen).length >= 3) runs++;
    }
    if (runs < 3) continue;
    const at = first - GLOBAL_PERFORM_TABLE_LEN;
    if (at < 0) continue;
    const eids = Array.from({ length: GLOBAL_PERFORM_SLOTS }, (_, i) => u(v, at + i));
    const pids = Array.from({ length: GLOBAL_PERFORM_SLOTS }, (_, i) => u(v, at + GLOBAL_PERFORM_SLOTS + i));
    if (!eids.some((x) => x !== 0)) continue;
    if (!eids.every((x) => x < 0x1000) || !pids.every((x) => x < 0x1000)) continue;
    // every assigned slot must have an effect label, and every unassigned slot must not
    let consistent = true;
    for (let i = 0; i < GLOBAL_PERFORM_SLOTS; i++) {
      const hasLabel = readText16v(v, first + i * recLen).length > 0;
      if ((eids[i] !== 0) !== hasLabel) {
        consistent = false;
        break;
      }
    }
    if (!consistent) continue;
    // the param label block must begin right after the effect label block
    const paramBase = first + GLOBAL_PERFORM_SLOTS * recLen;
    const paramRuns = Array.from({ length: GLOBAL_PERFORM_SLOTS }, (_, i) =>
      readText16v(v, paramBase + i * recLen).length
    ).filter((n) => n > 0).length;
    if (paramRuns < 1) continue;

    return {
      at,
      slots: eids.map((effectId, i) => ({
        effectId,
        paramId: pids[i]!,
        effectLabel: readText16v(v, first + i * recLen),
        paramLabel: readText16v(v, paramBase + i * recLen)
      }))
    };
  }
  return undefined;
}

/**
 * Body records that carry one slot, so a writer can address them. `effectId`/`paramId` are plain
 * integers; the labels are 16-bit characters, one record each.
 */
export function globalPerformSlotRecords(
  page: GlobalPerformPage,
  slot: number
): { effectId: number; paramId: number; effectLabel: number; paramLabel: number } | undefined {
  if (!Number.isInteger(slot) || slot < 0 || slot >= GLOBAL_PERFORM_SLOTS) return undefined;
  const recLen = GLOBAL_PERFORM_LABEL_CHARS;
  const labels = page.at + GLOBAL_PERFORM_TABLE_LEN;
  return {
    effectId: page.at + slot,
    paramId: page.at + GLOBAL_PERFORM_SLOTS + slot,
    effectLabel: labels + slot * recLen,
    paramLabel: labels + GLOBAL_PERFORM_SLOTS * recLen + slot * recLen
  };
}

/** 16-bit-character records for a label, space-padded and NUL-terminated (measured FM3-Edit shape). */
export function encodeLabel16(label: string, chars = GLOBAL_PERFORM_LABEL_CHARS): number[] {
  const clean = [...label].slice(0, chars);
  const out: number[] = [];
  for (let i = 0; i < chars; i++) {
    const ch = clean[i];
    out.push(ch === undefined ? 0 : ch.charCodeAt(0) & 0xffff);
  }
  // the unit's own records are NUL-terminated: "AMP" is 41 4D 50 00 00 …
  let end = out.length;
  while (end > 0 && out[end - 1] === 0) end--;
  return out.map((c, i) => (i < end ? c : 0));
}
