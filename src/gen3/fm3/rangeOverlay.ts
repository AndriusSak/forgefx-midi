// FM3 display-bounds overlay for the typecode-0x52 range class (17 rows).
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
// THE DECIDING FACT (taper-agnostic). Measured 2026-10-13 in ONE session for every
// row of the class (artifact `review-2026-10-13/probe-52-class-sweep.json`,
// instrument `ForgeFX/server/scripts/probe-52-crux.ts`):
//
//   display = 10 × norm over 15 of the 17 rows, across 10 families, ratios
//   9.991..10.01 (two decimals of device rounding).
//   WAH/3 Resonance Q displays 6.06 at norm 0.6064 — BELOW our row's own MINIMUM
//   of 20. FLANGER/26 Bass Focus displays 10.00 at norm 1.0 where our row's
//   MAXIMUM is 20000. No monotone map onto our bounds can produce either.
//   Five further rows read display 0.00 at raw 0 (REVERB/32, CHORUS/20,
//   MULTITAP/65, ROTARY/17, CABINET/33), against our rows' minima of
//   0.1 / 0.5 / 5 / 0.5 / 0.01.
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

import type { Fm3ParamRange } from './ranges.generated.js';

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
}

/** Family -> paramId -> range row, the shape of `FM3_RANGES`. */
export type Fm3RangeTable = Readonly<Record<string, Readonly<Record<number, Fm3ParamRange>>>>;

/**
 * The 17 typecode-0x52 rows whose generated display bounds are wrong. Each entry
 * carries its own measured evidence: the (unit view-0x00 display, driver norm)
 * pair read in one session on 2026-10-13, and what our generated row served at
 * that norm (`served`, the count the overlay is replacing).
 *
 * The norm is the driver's own `clamp01(raw/65534)`, computed before any range
 * lookup — a READOUT, not a decode — so `unit / norm = 10` is an instrument
 * statement, not a restatement of the table it corrects.
 */
export const FM3_RANGE_OVERLAY: readonly Fm3RangeOverlayEntry[] = [
  // CABINET/33 CABINET_DRIVE: unit 0.00 at raw 0 (norm 0) [our row's floor was 0.01, i.e. above the device's]; 2026-10-13
  { family: 'CABINET', paramId: 33, displayMin: 0, displayMax: 10 },
  // CHORUS/20 CHORUS_DRIVE: unit 0.00 at raw 0 (norm 0) [our min was 0.5]; 2026-10-13
  { family: 'CHORUS', paramId: 20, displayMin: 0, displayMax: 10 },
  // DELAY/22 DELAY_DRIVE: unit 3.71 at norm 0.3713 (10.07×norm) [our row served 185.974]; 2026-10-13
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
  // FLANGER/26 FLANGER_FOCUS (Bass Focus): unit 10.00 at norm 1.0 (owner drove the knob to MAXIMUM to settle it) [our max was 20000]; 2026-10-13
  { family: 'FLANGER', paramId: 26, displayMin: 0, displayMax: 10 },
  // FORMANT/3 FORMANT_Q: unit 3.01 at norm 0.3010 (10.00×norm) [our row served 148.372]; 2026-10-13
  { family: 'FORMANT', paramId: 3, displayMin: 0, displayMax: 10 },
  // FUZZ/6 FUZZ_SLEW (Slew Rate): unit 6.15 at norm 0.6152 (10.00×norm) [our row served 61.907]; 2026-10-13
  { family: 'FUZZ', paramId: 6, displayMin: 0, displayMax: 10 },
  // MULTITAP/65 MULTITAP_DRIVE: unit 0.00 at raw 0 (norm 0) [our min was 5]; 2026-10-13
  { family: 'MULTITAP', paramId: 65, displayMin: 0, displayMax: 10 },
  // REVERB/32 REVERB_DRIVE: unit 0.00 at raw 0 (norm 0) [our min was 0.1]; 2026-10-13
  { family: 'REVERB', paramId: 32, displayMin: 0, displayMax: 10 },
  // ROTARY/17 ROTARY_DRIVE: unit 0.00 at raw 0 (norm 0) [our min was 0.5]; 2026-10-13
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
    rows[entry.paramId] = { ...row, displayMin: entry.displayMin, displayMax: entry.displayMax };
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
    base.displayMax === entry.displayMax
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
