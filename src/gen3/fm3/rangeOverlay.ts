// FM3 range overlay: the typecode-0x52 display-bounds class (17 rows) AND the raw-is-value rows (4 rows,
// `valueMap: 'identity'`, see the head of FM3_RANGE_OVERLAY).
//
// WHY AN OVERLAY AND NOT A GENERATOR EDIT
// ---------------------------------------
// `src/gen3/fm3/ranges.generated.ts` is GENERATED and says so in its own header
// ("the generator is maintained outside this package"). That generator does not
// exist in this repo and does not exist on this machine — no generator source
// was ever committed (`git log --all --diff-filter=A --name-only` lists only the
// generated OUTPUTS). `.claude/hooks/guard-generated.sh` blocks edits to
// `*.generated.ts` and tells you to edit the generator instead; for FM3 range
// DATA that advice cannot be followed here, which is exactly why this correction
// ships as an in-repo OVERLAY merged at the fm3 index export point rather than as
// an edit to the generated file.
//
// WHAT IS WRONG IN THE GENERATED ROWS
// -----------------------------------
// Every row of the typecode-0x52 class (unit 6.06, 4.62, 5.00, …) carries the
// device's RAW definition record as its display bounds — min/max pairs like
// 20..200, 0.5..500, 2.5..40 — but the device's own view-0x00 display string is
// LINEAR 0..10: `display = 10 × norm`, where `norm = clamp01(raw/65534)` is the
// driver's own pre-range READOUT (gen3.ts `#display` computes it BEFORE any range
// lookup, so dividing by it does not inherit the range table's error).
//
// WHAT THE ARTIFACT ACTUALLY SHOWS (taper-agnostic). Read 2026-10-13 in ONE session
// (artifact `review-2026-10-13/probe-52-class-sweep.json`, instrument
// `ForgeFX/server/scripts/probe-52-crux.ts`). `norm` is the driver's own
// `clamp01(raw/65534)` READOUT, computed before any range lookup.
//
//   TWELVE of the 17 rows were read at a NON-ZERO norm, and there
//   `display = ratio × norm` with ratio in 9.991..10.01 (two decimals of device
//   rounding) — e.g. WAH/10 Drive 4.62 @ 0.4621, DISTORT/90 5.00 @ 0.5,
//   DELAY/58 1.99 @ 0.1990. WAH/3 Resonance Q reads 6.06 @ 0.6064, BELOW our
//   row's own MINIMUM of 20; no monotone map onto our bounds can produce that.
//   THE OTHER FIVE rows were read ONLY at raw 0, where every one displays
//   `0.00`: REVERB/32, CHORUS/20, MULTITAP/65, ROTARY/17, CABINET/33 (against
//   our rows' minima of 0.1 / 0.5 / 5 / 0.5 / 0.01).
//
//   MEASURED vs INFERRED (do not overstate):
//   - raw 0 ⇒ `display 0.00` proves **min = 0** for the five rows above — it
//     proves NOTHING about the max.
//   - max = 10 is directly MEASURED for **FLANGER/26 only** (owner drove the
//     knob to MAXIMUM: display 10.00 @ norm 1.0; it also reads 0.00 @ raw 0 in
//     the earlier `probe-52-crux.json`, so it is the ONLY row read at BOTH
//     endpoints). For every other row, max = 10 is INFERRED from class
//     membership — the ratio ≈ 10 at one non-zero norm, extended to norm 1.
//   - **MULTITAP/65 (Multitap Drive, old 5..5000) and ROTARY/17 (Rotary Drive,
//     old 0.5..500) were read ONLY at raw 0**: their max of 10 is UNMEASURED and
//     inferred purely from the class.
//
// So the correct bounds are `displayMin 0, displayMax 10`, linear. This is the
// same shape the device's own records already give for the rows that display
// correctly today (WAH/4 and FUZZ/1 carry `min 0, max 1, def 10` — i.e. 0..10 at
// the row's own scale of 10). `scale` therefore stays 10 and the cache-side bounds
// become 0..1.
//
// THE NO-OP PROPERTY. The merge only overrides `displayMin`/`displayMax`; every
// other field (typecode, scale, step, kind, defaults) is carried through from the
// generated row. Merging a value that already equals the overlay's is therefore a
// no-op — so if upstream ever corrects these rows, this overlay can be deleted
// with confidence rather than by guess (see `overlayIsRedundant` /
// `overlayFullyRedundant`).
//
// EVIDENCE TIER: hardware-measured (the unit's own display strings vs the
// device's own raw bytes, same session), 2026-10-13.
/* eslint-disable */

import type { Fm3ParamRange as GeneratedFm3ParamRange } from './ranges.generated.js';

/**
 * How a float row's 14-bit raw field maps to its display value.
 *   'normalized' (default, absent) — a position over [displayMin, displayMax] (linear or log per `taper`).
 *   'identity' — the field carries the VALUE ITSELF (display == raw); the bounds are only the write range.
 * The generated interface cannot carry this (the generator is not in this repo), so the field is added
 * here, on the type every consumer imports from the fm3 index.
 */
export type Fm3ValueMap = 'normalized' | 'identity';

/** The generated row shape plus the overlay-supplied `valueMap`. A pure superset: every generated row is one. */
export type Fm3ParamRange = GeneratedFm3ParamRange & { readonly valueMap?: Fm3ValueMap };

/** One row correction: the (family, paramId) it fixes and its corrected bounds. */
export interface Fm3RangeOverlayEntry {
  /** Family key as used in `FM3_RANGES` (e.g. 'WAH'). */
  readonly family: string;
  /** paramId within the family (the `FM3_RANGES[family]` key). */
  readonly paramId: number;
  /** Corrected display minimum (device-true, front-panel units). */
  readonly displayMin: number;
  /** Corrected display maximum (device-true, front-panel units). */
  readonly displayMax: number;
  /** Set to 'identity' for a row whose raw field IS the value (see {@link Fm3ValueMap}); absent = unchanged. */
  readonly valueMap?: Fm3ValueMap;
}

/** Family -> paramId -> range row, the shape of `FM3_RANGES`. */
export type Fm3RangeTable = Readonly<Record<string, Readonly<Record<number, Fm3ParamRange>>>>;

/**
 * The 17 typecode-0x52 rows whose generated display bounds are wrong, plus the 4 raw-is-value rows. Each entry
 * carries its own measured evidence: the (unit view-0x00 display, driver norm)
 * pair read in one session on 2026-10-13, and what our generated row served at
 * that norm (`served`, the count the overlay is replacing).
 *
 * The norm is the driver's own `clamp01(raw/65534)`, computed before any range
 * lookup — a READOUT, not a decode — so `unit / norm = 10` is an instrument
 * statement, not a restatement of the table it corrects.
 */
export const FM3_RANGE_OVERLAY: readonly Fm3RangeOverlayEntry[] = [
  // ── raw-is-value rows (valueMap 'identity') — the 14-bit field carries the VALUE, not a position ─────
  // Measured 2026-10-13 (`review-2026-10-13/probe-bounds-violations.json`, ForgeFX/server/scripts/
  // probe-bounds-violations.ts): unit view-0x00 display ÷ driver norm = 65530 for all four, i.e. display
  // == raw, and the raw is inside the declared range. The bounds stay the DECLARED range (they clamp a
  // write); only the read/write mapping changes. Decision per row: all four are served as a NUMBER, not
  // an enum — Tempo is continuous, and for Stages/Bank Size the "labels" would be the integers
  // themselves; TONETYPE is discrete but NO label list exists anywhere in the repo (no AM4 enum, no
  // cache label table, no editor layout) and a bare ordinal shown as a number is the honest best until
  // the unit's labels are measured.
  // CONTROLLERS/32 Tempo: unit "120 BPM" at raw 120 (norm 0.0018311) [we served 24.414]; 2026-10-13
  { family: 'CONTROLLERS', paramId: 32, displayMin: 24, displayMax: 250, valueMap: 'identity' },
  // CONTROLLERS/36 SEQSTAGES (Stages): unit "8" at raw 8 (norm 0.00012207) [we served 2.004]; 2026-10-13
  { family: 'CONTROLLERS', paramId: 36, displayMin: 2, displayMax: 32, valueMap: 'identity' },
  // GLOBAL/67 FC_BANKSIZE (Bank Size): unit "3" at raw 3 (norm 4.5778e-05) [we served 1.001]; 2026-10-13
  { family: 'GLOBAL', paramId: 67, displayMin: 1, displayMax: 12, valueMap: 'identity' },
  // REVERB/67 TONETYPE: unit "1" at raw 1 (norm 1.5259e-05) [we served 0]; 2026-10-13
  { family: 'REVERB', paramId: 67, displayMin: 0, displayMax: 3, valueMap: 'identity' },
  // ── typecode-0x52 class: bounds → 0..10 ───────────────────────────────────────────────────────────
  // CABINET/33 CABINET_DRIVE: unit 0.00 at raw 0 (norm 0) [our row's floor was 0.01, i.e. above the device's].
  // Read only at raw 0 — min MEASURED, max 10 inferred; 2026-10-13
  { family: 'CABINET', paramId: 33, displayMin: 0, displayMax: 10 },
  // CHORUS/20 CHORUS_DRIVE: unit 0.00 at raw 0 (norm 0) [our min was 0.5]. Read only at raw 0 — min MEASURED,
  // max 10 inferred; 2026-10-13
  { family: 'CHORUS', paramId: 20, displayMin: 0, displayMax: 10 },
  // DELAY/22 DELAY_DRIVE: unit 3.71 at norm 0.3713 (9.991×norm) [our row served 185.974]; 2026-10-13
  { family: 'DELAY', paramId: 22, displayMin: 0, displayMax: 10 },
  // DELAY/58 DELAY_Q (Resonance): unit 1.99 at norm 0.1990 (10.00×norm) [our row served 41.395]; 2026-10-13
  { family: 'DELAY', paramId: 58, displayMin: 0, displayMax: 10 },
  // DISTORT/72 DISTORT_CLARITY: unit 6.51 at norm 0.6505 (10.01×norm) [our row served 6.54]; 2026-10-13
  { family: 'DISTORT', paramId: 72, displayMin: 0, displayMax: 10 },
  // DISTORT/90 DISTORT_PAHARDNESS: unit 5.00 at norm 0.5 (10.00×norm) [our row served 21.25]; 2026-10-13
  { family: 'DISTORT', paramId: 90, displayMin: 0, displayMax: 10 },
  // FILTER/25 FILTER_EVFQ: unit 5.98 at norm 0.5981 (10.00×norm) [our row served 123.639]; 2026-10-13
  { family: 'FILTER', paramId: 25, displayMin: 0, displayMax: 10 },
  // FILTER/28 FILTER_SENS: unit 5.00 at norm 0.5 (10.00×norm) [our row served 200.5]; 2026-10-13
  { family: 'FILTER', paramId: 28, displayMin: 0, displayMax: 10 },
  // FLANGER/20 OLD_FLANGER_DRIVE: unit 4.00 at norm 0.4004 (9.99×norm) [our row served 20.049]; 2026-10-13
  { family: 'FLANGER', paramId: 20, displayMin: 0, displayMax: 10 },
  // FLANGER/26 FLANGER_FOCUS (Bass Focus): the ONE row measured at BOTH endpoints — unit 0.00 at raw 0
  // (probe-52-crux.json) and 10.00 at norm 1.0 (owner drove the knob to MAXIMUM to settle it)
  // [our max was 20000]; 2026-10-13
  { family: 'FLANGER', paramId: 26, displayMin: 0, displayMax: 10 },
  // FORMANT/3 FORMANT_Q: unit 3.01 at norm 0.3010 (10.00×norm) [our row served 148.372]; 2026-10-13
  { family: 'FORMANT', paramId: 3, displayMin: 0, displayMax: 10 },
  // FUZZ/6 FUZZ_SLEW (Slew Rate): unit 6.15 at norm 0.6152 (10.00×norm) [our row served 61.907]; 2026-10-13
  { family: 'FUZZ', paramId: 6, displayMin: 0, displayMax: 10 },
  // MULTITAP/65 MULTITAP_DRIVE (Multitap Drive): unit 0.00 at raw 0 (norm 0) [our row was 5..5000]. Read ONLY
  // at raw 0 — min 0 MEASURED, max 10 UNMEASURED (INFERRED from class membership); 2026-10-13
  { family: 'MULTITAP', paramId: 65, displayMin: 0, displayMax: 10 },
  // REVERB/32 REVERB_DRIVE: unit 0.00 at raw 0 (norm 0) [our min was 0.1]. Read only at raw 0 — min MEASURED,
  // max 10 inferred; 2026-10-13
  { family: 'REVERB', paramId: 32, displayMin: 0, displayMax: 10 },
  // ROTARY/17 ROTARY_DRIVE (Rotary Drive): unit 0.00 at raw 0 (norm 0) [our row was 0.5..500]. Read ONLY at
  // raw 0 — min 0 MEASURED, max 10 UNMEASURED (INFERRED from class membership); 2026-10-13
  { family: 'ROTARY', paramId: 17, displayMin: 0, displayMax: 10 },
  // WAH/3 WAH_Q (Resonance Q): unit 6.06 at norm 0.6064 (9.99×norm) — BELOW our row's own minimum of 20 [our row served 129.15]; 2026-10-13
  { family: 'WAH', paramId: 3, displayMin: 0, displayMax: 10 },
  // WAH/10 WAH_DRIVE: unit 4.62 at norm 0.4621 (10.00×norm) [our row served 4.675]; 2026-10-13
  { family: 'WAH', paramId: 10, displayMin: 0, displayMax: 10 },
];

/**
 * Build a FRESH range table with the overlay applied — a pure function, never a
 * mutation of `base`. Only `displayMin`/`displayMax` are overridden; every other
 * field is carried through by reference/copy from the generated row, so the merge
 * is a value-level NO-OP where upstream already carries the corrected bounds.
 *
 * Rows named by the overlay that are absent from `base` are skipped (a table that
 * no longer has the row has nothing to correct).
 */
export function applyFm3RangeOverlay(base: Fm3RangeTable): Fm3RangeTable {
  const out: Record<string, Record<number, Fm3ParamRange>> = {};
  for (const [family, rows] of Object.entries(base)) out[family] = { ...rows };
  for (const entry of FM3_RANGE_OVERLAY) {
    const rows = out[entry.family];
    if (!rows) continue;
    const row = rows[entry.paramId];
    if (!row) continue;
    rows[entry.paramId] = {
      ...row,
      displayMin: entry.displayMin,
      displayMax: entry.displayMax,
      ...(entry.valueMap ? { valueMap: entry.valueMap } : {}),
    };
  }
  return out;
}

/**
 * True when `base` already carries the entry's corrected bounds, so merging it
 * would change nothing. Console-free and side-effect-free.
 */
export function overlayIsRedundant(
  entry: Fm3RangeOverlayEntry,
  base: Fm3ParamRange | undefined,
): boolean {
  return (
    base !== undefined &&
    base.displayMin === entry.displayMin &&
    base.displayMax === entry.displayMax &&
    (entry.valueMap === undefined || base.valueMap === entry.valueMap)
  );
}

/**
 * True when EVERY overlay entry is already satisfied by `base` — the table needs
 * no correction, so the overlay can be deleted. A future corrected generated
 * table turns this `true`; use it to retire this overlay with confidence rather
 * than by guess.
 */
export function overlayFullyRedundant(base: Fm3RangeTable): boolean {
  return FM3_RANGE_OVERLAY.every((entry) => overlayIsRedundant(entry, base[entry.family]?.[entry.paramId]));
}
