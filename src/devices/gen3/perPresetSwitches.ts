// ────────────────────────────────────────────────────────────────────────────────────────────────
// PER-PRESET SWITCH DEFINITIONS, decoded from a preset body (§3.8).
//
// THE MODEL IS A TABLE, NOT A FORMULA. Every switch field this module reports sits at an offset that was
// OBSERVED on the unit; fields whose offset nobody has located are reported as null rather than read out of
// a guessed position. That is not caution for its own sake — a stride formula was believed here and then
// REFUTED (see below), so the layout is now per-index data (`PP_MEASURED_OFFSETS`) that one more edit can
// extend without touching any logic.
//
// MEASURED (on the wire, FM3 fw 13.0):
//   • the block is located by the marker pair u16 `0x05F5` / u16 `0x0001`. SEARCH for it — never hard-code an
//     offset: the doc recorded it "at ~11412" while preset 410's body holds it at **11420** (the body is
//     compressed, so other content shifts it).
//   • marker+4 + 2·(index−1) = the u16 ACTION CODE of PP#1..PP#12 (stride 2 over all TWELVE switches; each
//     moved to the code the owner configured there — 0x04 "Effect: Bypass" across the whole range).
//   • marker+148 + 12·(index−1) = the TARGET BYTE of PP#1..PP#12 (stride 12). PP#1 read 20 = "Filter 4", then
//     8 = "Delay 2"; every other index was CONFIRMED BY PREDICTION — the expected value was stated BEFORE the
//     capture was read and read back exactly (PP#2 → Reverb 1 = 51 at 160, PP#3 → Chorus 1 = 2 at 172,
//     PP#4 → Delay 2 = 8 at 184, PP#5 → Reverb 1 = 51 at 196, PP#6..PP#11 → Gate 1/GEQ 1/In 1/Looper/
//     Megatap 1/MultDly 1 = 25/27/29/31/32/38 at 208/220/232/244/256/268, PP#12 → Chorus 2 = 3 at 280).
//     An earlier unexplained 14 at marker+160 is therefore explained: it was PP#2's target with "FB Rtn 2".
//   • for an EFFECT action the target is an index into the FM3's ALPHABETICALLY ORDERED FX-SLOT ENUMERATION,
//     instances expanded — every anchor here was measured with the action set to Effect: Bypass, so the table
//     is an FX-SLOT table and naming a NON-effect action's target byte with it would be a claim nobody made
//     (capture B has PP#2 = Scene: Select with its target byte reading 1, which is a scene number far more
//     plausibly than "Cab 1"). 15 anchors, one edit + one dump each — see PP_TARGET_ANCHORS.
//
// REFUTED — do not re-derive:
//   • the target index is the eid, the block-list order, the chain order, a grid cell, or a type id;
//   • the target index is a position in a block roster (both candidate rosters in this repo reproduce 1 of 13
//     anchors, because each needs the FM3's Amp block to contribute one entry and no table here says that);
//   • **the target bytes are a flat ONE-BYTE-per-switch array.** A capture with PP#2 fully configured — its
//     action code DID move at marker+6 — left marker+149 untouched. The action codes have a 2-byte stride; the
//     TARGETS are 12 bytes apart (148/160/172), so the two fields are separate arrays with different strides.
//   • two fitted alphabetical models were killed by their own predictions (Reverb 1 predicted 15, read 51;
//     a grid position would have given ≈ 10).
//
// THE UNIT HAS **TWENTY-FOUR** PER-PRESET SWITCHES, not twelve — the owner read the count off FM3-Edit, and the
// eighth capture CONFIRMED it: PP#13 and PP#24 set to Effect: Bypass → Gate 1 / Megatap 1 read back exactly the
// predicted bytes (action codes 0x04 at marker+28 and +50; targets 25 at marker+292 and 32 at marker+424). So
// the action-code array is 24 u16 wide (marker+4..+50) and the target bytes are 24 × 12 apart
// (marker+148..+424) — one contiguous range, not two blocks of twelve, and the same two strides throughout.
//
// MEASURED: action codes for ALL 24 switches; target bytes for 20 of them.
//
// The ninth capture was a CATEGORY SWEEP — PP#14..PP#23 given distinct functions in one edit — and it produced
// two results at once:
//
// 1. **All ten unobserved action-code slots read non-zero at the predicted offsets** (30/32/…/48), so the
//    2-byte action-code array is now measured for all 24 indices.
// 2. **The action code names the CATEGORY, not the function.** Effect: Bypass, Effect: Change Channel and
//    Effect: Parameter ALL read 0x04; Scene: Select and the other scene flavour both read 0x03; Preset: Select
//    and Preset: Increment both read 0x02. Measured codes: `0x02` Preset · `0x03` Scene · `0x04` Effect ·
//    `0x05` Utility · `0x07` Control Switch (owner-confirmed) · `0x08` Looper. The MODE
//    lives inside the 12-byte record (see below), which is why this file no longer claims "0x04 = Bypass".
//
//    **THE CODE IS THE CATEGORY'S POSITION IN FM3-EDIT'S OWN CATEGORY LIST — measured-codes-vs-list, 6 for 6.**
//    The owner photographed the editor's TAP "Category" dropdown (2026-10-09): Unassigned · Bank · Preset ·
//    Scene · Effect · Utility · Layout · Control Switch · Looper · Per-Preset · View · Setlist · Song · Song
//    Section. Counted from zero that is 0·1·2·3·4·5·6·7·8·9·10·11·12·13 — and every code this project has
//    MEASURED sits exactly on its category's position: 0x02 Preset, 0x03 Scene, 0x04 Effect, 0x05 Utility,
//    0x07 Control Switch, 0x08 Looper. It also corrected a name: the switch at PP#21 was assigned **Utility:
//    Tuner**, and its code read 0x05 — so 0x05 is the Utility CATEGORY and "Tuner" was one of its functions,
//    which is why no "Tuner" code exists in the list above.
//    ⇒ **The remaining codes are PREDICTIONS, not measurements, and this file does not carry them**: Bank 0x01,
//    Layout 0x06, Per-Preset 0x09, View 0x0A, Setlist 0x0B, Song 0x0C, Song Section 0x0D. They are written down
//    as the positive control for the next capture in the hardware plan, and `PP_ACTION_CATEGORIES` stays
//    measured-only until a dump confirms them (an unmeasured code returns no name, never a guessed one).
//
// THE RECORD IS 12 BYTES WITH CATEGORY-DEPENDENT FIELDS — measured, per switch, from that same capture:
//   • record+0 carries the "which one" value for the target-selecting categories: the FX-slot index for
//     Effect: Bypass (20 = Filter 4, 51 = Reverb 1 …), the SCENE number for Scene: Select (3 and 7 on two
//     switches), the PRESET number for Preset: Select (28).
//   • Scene: TOGGLE uses +0 and +2 as its PRIMARY and SECONDARY scene — the owner confirmed the assignment
//     ("primary scene 1, secondary scene 1") and the record read +0=1, +2=1, which fits; a pair with two
//     DIFFERENT scenes is still needed to prove which of the two offsets is which (an open item, and the
//     reason this is written as "fits" rather than "confirmed").
//   • the rows that do NOT use +0 as a "which one" value, and where each of them writes instead: one Effect
//     function wrote +2=2 and +8=1 with +0 ZERO; one Preset: Increment row wrote a u16 511 at +6 (with +0=1);
//     Utility: Tuner, Looper and the Control Switch row left the WHOLE record zero. NOTE (2026-10-11): that
//     first row was labelled "Effect: Parameter" here until the owner reported that FM3-Edit's TAP menu offers
//     no Parameter function, and the marker+52 function index says the row was Effect's THIRD entry — so the
//     name was a guess and the row is now referred to by its index, not by a name nobody measured.
//   • Effect: Change Channel IS measured (2026-10-11, four rows, all values stated before the dump): its
//     record+0 IS the FX-slot index of the block it changes — Chorus 1 = 2, Reverb 1 = 51, Delay 1 = 7, and
//     GEQ 2 = 28 (a new anchor, and consistent with the measured GEQ 1 = 27: a family's instances are
//     CONSECUTIVE). Its CHANNEL number lives at record+2, zero-based letter order A=0 · B=1 · C=2 · D=3 (read
//     on three rows: B, D and B), and +0 is ONE byte (Preset: Select 100 wrote 100). An earlier reading that
//     put the channel at +4 came from a single row and is REFUTED.
//     ⇒ The anchor names therefore apply to Bypass AND Change Channel rows, which is measured; they still do
//     not apply to an Effect row whose function index (marker+52) is one of the unmeasured ones.
//   ⇒ So `targetIndex` below is the byte at record+0, and it is only the "location" for the categories that use
//     it. It is left UNLOCATED for the four rows whose +0 read zero (PP#18 Effect: Parameter, PP#21 Utility,
//     PP#22 Looper, PP#23 Control Switch): a zero is not an observation, and those rows refuse a target
//     write because that FIELD's offset was never located for them. The rule is per FIELD and keyed on the
//     observation, NOT on the category: `patchPerPresetSwitch` never looks at the code, so an index measured
//     only half-way stays half-writable even if it is later assigned a category that does use +0.
//   ⇒ Decoding the per-category record layout (+2/+4/+6/+8) is OPEN — it needs one edit per category, and the
//     owner has confirmed the assignments for 14–23 only in outline.
//
// THERE IS A **SECOND** u16 ARRAY, ONE ENTRY PER SWITCH, STARTING AT marker+52 — and here is exactly how much
// of that sentence is measured. OBSERVED: the sweep moved four bytes at marker+82/+84/+86/+90, reading 1/2/3/4
// with +88 at 0. Those are slots 16/17/18/20 of a stride-2 array. INFERRED, not observed: that the array STARTS
// at +52 (it is the next slot after the action-code array, which ends at +51) and that it is 24 entries wide.
// The slot ALIGNMENT is what was read; the start and the width are the shape those four slots fit. Recovered by
// reading the region with a tool, and the old "four unexplained bytes in the gap" report is retired by it.
//
// Its MEANING WAS DECIDED on 2026-10-11 (tenth capture): it is the TAP's FUNCTION INDEX WITHIN ITS CATEGORY,
// zero-based, where 0 is the category's first menu entry. The discriminator was written down BEFORE the dump —
// "a function index predicts REPEATED values when two switches share a function, an allocation index predicts
// DISTINCT ascending ones" — and the capture answered REPEATS: five Change Channel rows all read 1 (where an
// allocation index predicted five different ascending values) and three Scene: Toggles all read 1. The two
// other candidates are dead: it is not the HOLD half (the three HOLDs set for that round were Looper, Utility
// and Control Switch, and these slots read 1/1/1 while the HOLD codes appeared at marker+436 — below), and the
// ascending 1,2,3,4 of the sweep was a coincidence of the functions that edit happened to choose (Scene: Toggle
// = 1, two unmeasured Effect entries = 2 and 3, Preset: Increment = 4). Within-category function changes are
// measured in BOTH directions: Scene 0 (Select) → 1 (Toggle), Effect 0 (Bypass) → 1 (Change Channel), Preset 0
// (Select) → 4 (Increment, both in one capture), Looper 0 → 4 (Undo/Erase).
//
// ⇒ THE HOLD HALF IS A SECOND 24-WIDE u16 ACTION-CODE ARRAY AT marker+436 + 2·(i−1), where 436 = 148 + 12×24 —
// i.e. immediately after the twenty-fourth 12-byte record, one u16 per switch with the same width and stride as
// the TAP array. MEASURED: the three HOLDs set for this round read back as 0x08 Looper, 0x05 Utility and 0x07
// Control Switch in row order, with every other row 0 (all other HOLDs were Unassigned). The long-standing
// prediction that a HOLD half would live at +100…+147 is REFUTED — that span stayed all zero, and those bytes
// are still unexplained. Nothing is decoded into a HOLD field here yet (unwired, and an unmeasured offset must
// never be read), but the location is no longer a guess: it is an observation with a negative control beside
// it. The values are pinned as expectations in check-switch-offsets.ts so they cannot drift unnoticed.
//
// NO ANCHOR NAME IS HANDED OUT FOR AN UNVERIFIED MODE. `PP_TARGET_ANCHORS` was measured with Effect: Bypass
// selected, and the code 0x04 covers Bypass AND Change Channel AND Parameter, whose +0 means different things
// (Parameter's +0 read ZERO). The mode is inside the record and is not decoded, so `ppTargetLabel` is a raw
// lookup whose result is the byte's identity ONLY for a Bypass row: callers must not print it beside a row
// whose mode they cannot read. The round that can lift this is written down in the plan (Change Channel on a
// KNOWN block: if its +0 reads that block's slot index, the table covers the whole Effect category).
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** The marker pair that locates the block: u16 0x05F5 immediately followed by u16 0x0001. */
export const PP_MARKER = 0x05f5;
export const PP_MARKER_SIBLING = 0x0001;

/** One switch index's OBSERVED byte offsets, relative to the marker. */
export interface PpMeasuredOffsets {
  /** The u16 action code. */
  actionCode: number;
  /** The target byte — OMITTED when nobody has located it (the flat-array reading was refuted). */
  target?: number;
}

/**
 * The observed offsets, per switch index. Adding an index here is the WHOLE change needed to decode or write
 * it; nothing downstream assumes a stride. An index absent from this table is reported with null fields.
 */
export const PP_MEASURED_OFFSETS: Readonly<Record<number, PpMeasuredOffsets>> = {
  1: { actionCode: 4, target: 148 },
  2: { actionCode: 6, target: 160 },
  3: { actionCode: 8, target: 172 },
  4: { actionCode: 10, target: 184 },
  5: { actionCode: 12, target: 196 },
  6: { actionCode: 14, target: 208 },
  7: { actionCode: 16, target: 220 },
  8: { actionCode: 18, target: 232 },
  9: { actionCode: 20, target: 244 },
  10: { actionCode: 22, target: 256 },
  11: { actionCode: 24, target: 268 },
  12: { actionCode: 26, target: 280 },
  13: { actionCode: 28, target: 292 },
  14: { actionCode: 30, target: 304 },   // Scene: Select → record+0 read 3 (a SCENE number)
  15: { actionCode: 32, target: 316 },   // Scene: Select → 7, the second scene in the pair
  16: { actionCode: 34, target: 328 },   // scene flavour #2 → +0=1 and +2=1
  17: { actionCode: 36, target: 340 },   // Effect: Change Channel → +0=2 and +4=1
  18: { actionCode: 38 },                // Effect: Parameter → +0 read ZERO, values sit at +2/+8 (see the header)
  19: { actionCode: 40, target: 364 },   // Preset: Select → record+0 read 28 (a PRESET number)
  20: { actionCode: 42, target: 376 },   // Preset: Increment → +0=1 with a u16 511 at +6
  21: { actionCode: 44 },                // Utility: Tuner → the whole record read zero
  22: { actionCode: 46 },                // Looper → the whole record read zero
  23: { actionCode: 48 },                // Control Switch → the whole record read zero
  24: { actionCode: 50, target: 424 }
};

/** PP#1's offsets — kept as named constants because most call sites mean exactly PP#1. */
export const PP_ACTION_OFFSET = PP_MEASURED_OFFSETS[1]!.actionCode;
export const PP_TARGET_OFFSET = PP_MEASURED_OFFSETS[1]!.target!;

/**
 * How many per-preset switches an FM3 exposes. Was an ASSUMPTION of 12 until 2026-10-09, when FM3-Edit's list
 * (24 rows) was tested rather than believed: PP#13 and PP#24 read back the predicted bytes at marker+28/+50 and
 * marker+292/+424, so the count is **24** and the whole range shares the two strides. Every index now has an
 * OBSERVED action-code offset (the ten-function sweep located 14–23); four of them (18, 21, 22, 23) have no
 * located record+0, and their target field reports null rather than an extrapolated value.
 */
export const PP_SWITCH_COUNT = 24;

/**
 * The switch INDICES whose ACTION-CODE offset is observed, ascending — DERIVED from the offset table, so it
 * cannot drift from the model. Naming the indices (not their count) is what lets a reader state the evidence
 * without assuming the observed indices are contiguous.
 */
export const PP_ACTION_CODE_INDICES: readonly number[] = Object.entries(PP_MEASURED_OFFSETS)
  .filter(([, o]) => o.actionCode !== undefined)
  .map(([i]) => Number(i))
  .sort((a, b) => a - b);

/** The switch INDICES whose TARGET-BYTE offset is observed, ascending — DERIVED from the same table. */
export const PP_TARGET_BYTE_INDICES: readonly number[] = Object.entries(PP_MEASURED_OFFSETS)
  .filter(([, o]) => o.target !== undefined)
  .map(([i]) => Number(i))
  .sort((a, b) => a - b);

/** Bytes from the marker that this decoder may read — one u16 past the highest observed offset. */
export const PP_REGION_BYTES =
  Math.max(...Object.values(PP_MEASURED_OFFSETS).flatMap((o) => [o.actionCode, o.target ?? o.actionCode])) + 2;

const u16 = (b: ArrayLike<number>, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);

/**
 * The measured target anchors — index → the FX-slot name the FM3's picker shows. **Measured with Effect:
 * Bypass selected, and that matters**: the code 0x04 covers the whole Effect category, and `ppTargetLabel`
 * cannot see which mode a row holds, so this name is the byte's identity ONLY for a row whose mode selects an
 * FX slot. Callers must not print it beside a row whose mode they cannot read (see the "NO ANCHOR NAME IS
 * HANDED OUT FOR AN UNVERIFIED MODE" note in the header). 15 entries, each the result
 * of one edit by the owner plus one read-only dump. An index NOT in this table is genuinely unlabelled:
 * report the number, never a guess (9–13 and 15–19 remain unmeasured — "FB Snd" among them is a candidate,
 * not a finding; 14 = "FB Rtn 2" was measured 2026-10-09). `Delay 2 = 8` confirms a family's INSTANCES are
 * consecutive (7 → 8), which makes FB Rtn 1 = 13 a PREDICTION — do not add it until it is observed.
 */
export const PP_TARGET_ANCHORS: Readonly<Record<number, string>> = {
  0: 'Amp 1', 1: 'Cab 1', 2: 'Chorus 1', 3: 'Chorus 2', 7: 'Delay 1', 8: 'Delay 2', 14: 'FB Rtn 2',
  20: 'Filter 4', 25: 'Gate 1', 27: 'GEQ 1', 29: 'In 1', 31: 'Looper', 32: 'Megatap 1',
  38: 'MultDly 1', 51: 'Reverb 1'
};

/** The name for a measured target index, or null when nobody has measured that index. */
/**
 * ALIAS CAVEAT: a raw lookup, not a verdict. It answers "what does the picker call index N" — NOT "this row's
 * byte IS that block". The difference is the whole Effect category, whose three measured modes do not share the
 * meaning of record+0 (Bypass: the FX slot; Parameter: zero there). Gate the display on the mode, never on the
 * code alone.
 */
export function ppTargetLabel(index: number): string | null {
  return PP_TARGET_ANCHORS[index] ?? null;
}

/**
 * The switch-function CATEGORY a code selects — measured 2026-10-09 by giving ten switches ten different
 * functions in one edit and reading the bytes back. The code is the FAMILY, not the function: `0x04` covers
 * Effect: Bypass, Effect: Change Channel AND Effect: Parameter; `0x03` covers the scene flavours; `0x02` covers
 * Preset: Select and Preset: Increment. The mode is inside the 12-byte record (see the header), so a caller
 * must NOT turn one of these into a function name — "Effect: Bypass" was exactly that mistake.
 *
 * `0x07` was measured on a switch whose assignment allowed "Control Switch 1 OR Layout 2"; the owner has since
 * confirmed it was **Control Switch**, so Layout remains UNMEASURED — it either shares this code or has one of
 * its own, and nobody has observed which.
 */
export const PP_ACTION_CATEGORIES: Readonly<Record<number, string>> = {
  0x02: 'Preset',
  0x03: 'Scene',
  0x04: 'Effect',
  0x05: 'Utility',
  0x07: 'Control Switch',
  0x08: 'Looper'
};

/**
 * The category a code belongs to, as display text, or `unassigned` for 0 (observed: the empty block is
 * all-zero). Null for a code nobody has measured — the caller shows the raw byte rather than a made-up name.
 * The MODE (bypass vs channel vs parameter, select vs increment) is NOT in this code; it lives in the record.
 */
export function ppActionName(code: number): string | null {
  if (code === 0) return 'unassigned';
  const category = PP_ACTION_CATEGORIES[code];
  return category ? `${category} (category — the mode is in the record)` : null;
}

/** How much of a row is actually observed. Drives what a caller may show, and what it may write. */
export type PpRowConfidence = 'measured' | 'partial' | 'unknown';

export interface PerPresetSwitch {
  /** 1-based, as the switch picker numbers them ("PP#1"). */
  index: number;
  /** u16 action code — null when this index's action-code offset has not been observed. */
  actionCode: number | null;
  /** `ppActionName` of that code, or null when there is no code to name. */
  action: string | null;
  /** Target byte — null when its offset has not been observed (never read from a guessed position). */
  targetIndex: number | null;
  /**
   * The FX-SLOT name for that index, or null when unlabelled / unread. MEANINGFUL FOR AN EFFECT ACTION ONLY:
   * the anchors were all measured with Effect: Bypass selected, so a caller must not present this name for a
   * row whose action is something else (a scene action's target byte is not an FX slot). The byte itself is
   * always the observed value; the INTERPRETATION is action-dependent.
   */
  targetLabel: string | null;
  /** 'measured' = both offsets observed · 'partial' = action code only · 'unknown' = neither. */
  confidence: PpRowConfidence;
}

export interface PerPresetSwitches {
  /** Offset of the marker in the decompressed body (diagnostic — it MOVES between presets). */
  at: number;
  /** True when any OBSERVED byte of the block is non-zero. An unpopulated block is reported, not hidden. */
  populated: boolean;
  switches: PerPresetSwitch[];
  /** The model in one word: per-index observed offsets, not a stride formula. */
  geometry: 'per-index-observed-offsets';
  /**
   * WHICH switch indices each field's evidence reaches, ascending — DERIVED from the offset table, so it
   * cannot drift from the model. The indices are named explicitly rather than carried as a count: the table
   * has no stride, so two observed indices need not be adjacent, and a reader that turned a count into a
   * contiguous range ("PP#1–PP#n") would claim an index nobody measured. Anything not listed reads null.
   */
  evidence: PpEvidence;
}

/** The switch indices each field's evidence reaches — the model's evidence, in index form. */
export interface PpEvidence {
  /** Indices whose ACTION-CODE offset is observed, ascending. */
  actionCodeIndices: number[];
  /** Indices whose TARGET-BYTE offset is observed, ascending. */
  targetByteIndices: number[];
}

/** Locate the block: the first `0x05F5` / `0x0001` marker pair in the body, or undefined. */
export function findPerPresetSwitchBlock(body: ArrayLike<number>): number | undefined {
  for (let i = 0; i + 3 < body.length; i++) {
    if (u16(body, i) === PP_MARKER && u16(body, i + 2) === PP_MARKER_SIBLING) return i;
  }
  return undefined;
}

/**
 * Parse the switch definitions from a DECOMPRESSED preset body. `undefined` when the marker is absent — never
 * a synthesised block. A marker too close to the end of the body is refused too: the observed offsets would
 * run off it, and reading past the end invents rows.
 */
export function parsePerPresetSwitches(body: ArrayLike<number>, count = PP_SWITCH_COUNT): PerPresetSwitches | undefined {
  const at = findPerPresetSwitchBlock(body);
  if (at === undefined) return undefined;
  if (at + PP_REGION_BYTES > body.length) return undefined;
  const n = Math.max(1, Math.min(count, PP_SWITCH_COUNT));
  const switches: PerPresetSwitch[] = [];
  for (let i = 1; i <= n; i++) {
    const off = PP_MEASURED_OFFSETS[i];
    if (!off) {
      switches.push({ index: i, actionCode: null, action: null, targetIndex: null, targetLabel: null, confidence: 'unknown' });
      continue;
    }
    const actionCode = u16(body, at + off.actionCode);
    const hasTarget = off.target !== undefined;
    const targetIndex = hasTarget ? (body[at + off.target!] ?? 0) : null;
    switches.push({
      index: i,
      actionCode,
      action: ppActionName(actionCode),
      targetIndex,
      targetLabel: targetIndex === null ? null : ppTargetLabel(targetIndex),
      confidence: hasTarget ? 'measured' : 'partial'
    });
  }
  const populated = switches.some((s) => (s.actionCode ?? 0) !== 0 || (s.targetIndex ?? 0) !== 0);
  return {
    at,
    populated,
    switches,
    geometry: 'per-index-observed-offsets',
    evidence: { actionCodeIndices: [...PP_ACTION_CODE_INDICES], targetByteIndices: [...PP_TARGET_BYTE_INDICES] }
  };
}

/**
 * Patch ONE switch in place — the WRITE side, in the byte domain. Length-preserving: both fields are fixed
 * size, so this is the same shape of edit the perform page does and it rides the same recompress/reframe/
 * retarget path.
 *
 * BOUNDED ON PURPOSE: an index with no observed offset, or a target write at an index whose target byte has
 * never been located, is REFUSED. Everything is validated BEFORE anything is written, so a rejected call
 * cannot leave a half-applied patch. Returns false and writes nothing.
 */
export function patchPerPresetSwitch(
  body: Uint8Array,
  index: number,
  next: { actionCode?: number; targetIndex?: number }
): boolean {
  const at = findPerPresetSwitchBlock(body);
  if (at === undefined) return false;
  if (at + PP_REGION_BYTES > body.length) return false;
  if (!Number.isInteger(index) || index < 1 || index > PP_SWITCH_COUNT) return false;
  const off = PP_MEASURED_OFFSETS[index];
  if (!off) return false; // no observed offset for this index
  if (next.actionCode === undefined && next.targetIndex === undefined) return false;
  if (next.actionCode !== undefined && (!Number.isInteger(next.actionCode) || next.actionCode < 0 || next.actionCode > 0xffff)) return false;
  if (next.targetIndex !== undefined) {
    if (!Number.isInteger(next.targetIndex) || next.targetIndex < 0 || next.targetIndex > 0xff) return false;
    if (off.target === undefined) return false; // this index's target byte has never been located
  }
  const put = (o: number, v: number): void => { body[o] = v & 0xff; body[o + 1] = (v >> 8) & 0xff; };
  if (next.actionCode !== undefined) put(at + off.actionCode, next.actionCode);
  if (next.targetIndex !== undefined) body[at + off.target!] = next.targetIndex & 0xff;
  return true;
}

/** True when `index` can be WRITTEN at all (an observed action-code offset), and whether its target byte can. */
export function ppWritable(index: number): { any: boolean; target: boolean } {
  const off = PP_MEASURED_OFFSETS[index];
  return { any: !!off, target: !!off && off.target !== undefined };
}
