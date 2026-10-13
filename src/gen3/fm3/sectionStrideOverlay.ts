// FM3 fn=0x1F CHANNEL-BLOCK WIRE STRIDE overlay (3 families).
//
// WHY AN OVERLAY AND NOT A GENERATOR EDIT
// ---------------------------------------
// Same reason as `rangeOverlay.ts` beside it: `src/gen3/fm3/ranges.generated.ts` is GENERATED ("the
// generator is maintained outside this package"), that generator exists nowhere on this machine, and
// `.claude/hooks/guard-generated.sh` blocks edits to `*.generated.ts`. So the correction ships as an
// in-repo overlay merged at the fm3 index export point, exactly like the range-bounds overlay.
//
// WHAT IS WRONG IN THE GENERATED ROWS
// -----------------------------------
// `stride` is documented in the generated header as "the fn=0x1F channel-block WIRE stride". For three
// families it does not describe the body the device actually sends, and every consumer that slices a
// bulk read by it (`ForgeFX/server/src/drivers/gen3.ts` `#channelSlice`, `index = channel*stride + paramId`)
// therefore reads a window shifted by the remainder — times the channel index. Channel A is unaffected
// (base 0), so the defect is invisible until a block is switched off channel A.
//
// THE MEASUREMENT (owner's FM3 fw 13.0, 2026-10-13, preset 408)
// -------------------------------------------------------------
// Two independent witnesses, one session, neither of them a second decoder of this table:
//
//  1. The fn=0x1F HEAD states `itemCount` itself. Logged per family (`#channelSlice`, ENV-gated):
//
//       family   itemCount   /4   generated stride   verdict
//       FUZZ        176       44        43            WRONG (off by 1)
//       CHORUS      128       32        29            WRONG (off by 3)
//       DELAY       356       89        88            WRONG (off by 1)
//       DISTORT     576      144       144            correct
//       REVERB      284       71        71            correct
//       COMP        148       37        37            correct
//       PHASER      140       35        35            correct
//       CABINET     424      106       106            correct
//       INPUT        40       10        10            correct
//       OUTPUT      104       26        26            correct
//
//     The gen-3 body is channel-blocked with 4 channels for every audio family here, and every one of
//     those bodies is exactly 4x its true stride — which is why `/4` recovers it.
//
//  2. A marker write through the public API, read back through the UNsliced body
//     (`GET /preset/blocks/:eid/raw`, `index = channel*stride + i`, `i = 0` holding the TYPE).
//     Drive `pid 2 = 0.9` on channel B: the value landed at raw index 46 (`= 44 + 2`) while the served
//     readout reported it under `pid 3` (`= 46 - 43`). Markers on channels A/B/C/D landed at raw
//     2 / 46 / 90 / 134, i.e. a constant width of exactly 44 — not 43.
//
// WHY `stride` ONLY, NOT `recordCount`
// ------------------------------------
// `recordCount` is a CACHE-side declaration (the raw source section count, including special table
// records — see the generated header); it is carried through the server's `rangeSections` type and never
// read for behaviour (only `.stride` is). This overlay has wire-body evidence for the stride and none
// for the declared cache count, so it corrects the stride and carries `recordCount` through untouched
// rather than inventing a consistent-looking row.
//
// NO-OP PROPERTY
// --------------
// The merge only overrides `stride`; every other field is carried through from the generated row, and an
// entry whose generated stride already equals the overlay's is a no-op. If upstream ever corrects these
// rows this overlay can be deleted by test rather than by guess
// (`sectionStrideOverlayFullyRedundant`), the same contract `rangeOverlay.ts` provides.
import type { Fm3RangeFamilyMeta } from './ranges.generated.js';

/** Section metadata as the generated table declares it (stride + recordCount, both read-only). */
export type Fm3SectionTable = Readonly<Record<string, Fm3RangeFamilyMeta>>;

/** One family whose generated wire stride does not describe the body the device sends. */
export interface Fm3SectionStrideOverlayEntry {
  /** Family key as used in `FM3_RANGE_SECTIONS` (e.g. 'FUZZ' — the family the DRIVE block resolves to). */
  readonly family: string;
  /** The corrected fn=0x1F channel-block wire stride, measured from the body's own itemCount. */
  readonly stride: number;
  /** The generated (pre-overlay) stride, kept so a reader can see the delta without opening the table. */
  readonly generatedStride: number;
  /** The measured body size this entry was derived from (4x the corrected stride). */
  readonly measuredItemCount: number;
  /** Which block the family serves, so a reader lands on the right block from the family name alone. */
  readonly serves: string;
}

/**
 * The three measured-bad rows. Every other FM3 family either divides its body evenly (verified for
 * DISTORT, REVERB, COMP, PHASER, CABINET, INPUT, OUTPUT above) or has not been observed on a body yet —
 * which is why this list names three members rather than asserting the whole table.
 */
export const FM3_SECTION_STRIDE_OVERLAY: readonly Fm3SectionStrideOverlayEntry[] = [
  { family: 'FUZZ', stride: 44, generatedStride: 43, measuredItemCount: 176, serves: 'Drive (eid 118)' },
  { family: 'CHORUS', stride: 32, generatedStride: 29, measuredItemCount: 128, serves: 'Chorus (eid 78)' },
  { family: 'DELAY', stride: 89, generatedStride: 88, measuredItemCount: 356, serves: 'Delay (eid 70)' },
];

/** True when `base`'s row for `entry` already carries the corrected stride (so the merge is a no-op). */
export function sectionStrideEntryIsRedundant(base: Fm3SectionTable, entry: Fm3SectionStrideOverlayEntry): boolean {
  return base[entry.family]?.stride === entry.stride;
}

/** True when EVERY entry is redundant — i.e. the upstream table has been corrected and this overlay can go. */
export function sectionStrideOverlayFullyRedundant(base: Fm3SectionTable): boolean {
  return FM3_SECTION_STRIDE_OVERLAY.every((e) => sectionStrideEntryIsRedundant(base, e));
}

/**
 * Apply the stride overlay. A fresh object built by a pure function — never a mutation of the generated
 * table — so `ranges.generated.ts` stays untouched and the merge is a no-op where upstream is correct.
 * A family the overlay names but the base table does not carry is left absent (never invented): the
 * generated table is the authority on WHICH families exist.
 */
export function applyFm3SectionStrideOverlay(base: Fm3SectionTable): Fm3SectionTable {
  const out: Record<string, Fm3RangeFamilyMeta> = {};
  for (const [family, meta] of Object.entries(base)) out[family] = meta;
  for (const entry of FM3_SECTION_STRIDE_OVERLAY) {
    const row = out[entry.family];
    if (!row || row.stride === entry.stride) continue;
    out[entry.family] = { ...row, stride: entry.stride };
  }
  return out;
}
