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
// THE WHOLE BLOCK, as of the tenth capture (2026-10-11). Four arrays, all one entry per switch, and nothing
// outside them has ever been non-zero (verified with a tool across all ten captures, +0…+899 from the marker):
//
//   marker+4   + 2·(i−1)   u16  TAP ACTION CODE = the CATEGORY (all 24 measured, all 13 codes named)
//   marker+52  + 2·(i−1)   u16  TAP FUNCTION INDEX WITHIN the category (0 = its first menu entry)
//   marker+148 + 12·(i−1)  12 B the record: +0 the "which one" value, then category-dependent fields
//   marker+436 + 2·(i−1)   u16  HOLD ACTION CODE, the same code space as the TAP code
//
// and one span that is NOT decoded: `+100…+147`, 48 bytes between the function-index array and the records,
// ALL ZERO in every capture taken so far — and so is everything past the HOLD array out to marker+899. It is
// reported as unexplained rather than as "free space": the block ENDS at +483, and nothing beyond it has ever
// been non-zero.
//
// STILL OPEN (hypotheses, deliberately not fields): the sweep gave Chan Toggle ONE row `[+0=2, +2=0, +4=1]`
// and Chan Inc/Dec ONE row `[+0=0, +2=2, +8=1]`, which is not enough to decode either layout. The natural
// readings are `[block, channel A, channel B]` for a toggle and `[block, step, direction]` for an Inc/Dec —
// and whether Chan Toggle's +4 is that second channel or the 2nd-press action measured on a Chan Select row is
// exactly the same question. One edit each would settle them; until then they stay out of the model, and their
// observed bytes stay pinned in check-switch-offsets.ts.
//
// The ninth capture was a CATEGORY SWEEP — PP#14..PP#23 given distinct functions in one edit — and it produced
// two results at once:
//
// 1. **All ten unobserved action-code slots read non-zero at the predicted offsets** (30/32/…/48), so the
//    2-byte action-code array is now measured for all 24 indices.
// 2. **The action code names the CATEGORY, not the function.** The three Effect functions the owner set all
//    read 0x04 (Bypass, Chan Select and — later measurements showed — Chan Toggle and Chan Inc/Dec); Scene:
//    Select and Scene: Toggle both read 0x03; Preset: Select and Preset: Increment both read 0x02. Measured
//    codes: `0x02` Preset · `0x03` Scene · `0x04` Effect · `0x05` Utility · `0x07` Control Switch
//    (owner-confirmed) · `0x08` Looper, and the tenth capture added the other seven. The FUNCTION
//    lives inside the function-index array at marker+52 (see below), which is why this file no longer claims
//    "0x04 = Bypass". NOTE on the names: this project called Effect function 1 "Change Channel" for a week; the
//    owner read FM3-Edit's own list out on 2026-10-11 and it is **Chan Select**. The old name was never the
//    editor's word, and neither was the "Parameter" this file used for a row that was really **Chan Inc/Dec**.
//
//    **THE CODE IS THE CATEGORY'S POSITION IN FM3-EDIT'S OWN CATEGORY LIST — measured-codes-vs-list, 6 for 6.**
//    The owner photographed the editor's TAP "Category" dropdown (2026-10-09): Unassigned · Bank · Preset ·
//    Scene · Effect · Utility · Layout · Control Switch · Looper · Per-Preset · View · Setlist · Song · Song
//    Section. Counted from zero that is 0·1·2·3·4·5·6·7·8·9·10·11·12·13 — and every code this project has
//    MEASURED sits exactly on its category's position: 0x02 Preset, 0x03 Scene, 0x04 Effect, 0x05 Utility,
//    0x07 Control Switch, 0x08 Looper. It also corrected a name: the switch at PP#21 was assigned **Utility:
//    Tuner**, and its code read 0x05 — so 0x05 is the Utility CATEGORY and "Tuner" was one of its functions,
//    which is why no "Tuner" code exists in the list above.
//    ⇒ **All fourteen positions are now MEASURED, and the last seven were confirmed as predictions.** On
//    2026-10-11 a single edit set seven switches to the seven unmeasured categories and ALL SEVEN codes read
//    exactly as predicted before the dump — Bank 0x01, Layout 0x06, Per-Preset 0x09, View 0x0A, Setlist 0x0B,
//    Song 0x0C, Song Section 0x0D — with Layout (the gap inside the measured run) and Song Section (the far end)
//    both included, so a hidden category would have shifted them and did not. `PP_ACTION_CATEGORIES` therefore
//    carries all thirteen named codes; a code outside them still returns no name, never a guessed one.
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
//     ⇒ The anchor names therefore apply to an Effect: Bypass row AND to a channel row — with a naming
//     correction: the owner read FM3-Edit's Effect TAP list out on 2026-10-11 and it is **0 Bypass · 1 Chan
//     Select · 2 Chan Toggle · 3 Chan Inc/Dec**, so "Change Channel" was never the editor's word for index 1.
//     They do NOT apply to a Chan Toggle or Chan Inc/Dec row: only Chan Select's +0 has been measured, and the
//     sweep's Chan Inc/Dec row left +0 at ZERO.
//   • **record+4 on a Chan Select row is the 2nd-press action.** FM3-Edit offers Off / Smart Bypass / Previous
//     channel; the byte read 0 on the four rows set to Off and 1 on the one row set to Smart Bypass
//     (owner-confirmed on the unit). So 0 = Off and 1 = Smart Bypass are MEASURED, and 2 = Previous channel is a
//     PREDICTION that has never been observed. On the sweep's single Chan Toggle row the same byte read 1, where
//     it could equally be that function's second channel — no claim is made for Toggle rows.
//   • The LAYOUT record is **[layout number at +0, VIEW at +2]** — the owner read the row ("layout 2, and view
//     as view 1") and the bytes then read 2 and 1. Both fields are attributed by the editor's own labels.
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
// DISTINCT ascending ones" — and the capture answered REPEATS: five Chan Select rows all read 1 (where an
// allocation index predicted five different ascending values) and three Scene: Toggles all read 1. The two
// other candidates are dead: it is not the HOLD half (the three HOLDs set for that round were Looper, Utility
// and Control Switch, and these slots read 1/1/1 while the HOLD codes appeared at marker+436 — below), and the
// ascending 1,2,3,4 of the sweep was a coincidence of the functions that edit happened to choose (Scene: Toggle
// = 1, two unmeasured Effect entries = 2 and 3, Preset: Increment = 4). Within-category function changes are
// measured in BOTH directions: Scene 0 (Select) → 1 (Toggle), Effect 0 (Bypass) → 1 (Chan Select), Preset 0
// (Select) → 4 (Increment, both in one capture), Looper 0 → 4 (Undo/Erase). The Effect list itself is now known
// from the editor rather than inferred — 0 Bypass · 1 Chan Select · 2 Chan Toggle · 3 Chan Inc/Dec — which names
// the sweep's rows 17 and 18 as **Chan Toggle** and **Chan Inc/Dec**, not the "Change Channel" and "Parameter"
// this project had guessed at. The other categories' lists are only partially named (Scene: Select 0, Toggle 1 ·
// Preset: Select 0, Increment 4 · Utility: Tuner 0 · Looper: Undo/Erase 4 · Control Switch: one entry, 0 on both
// CS 1 and CS 4), so an index outside those stays a number.
//
// ⇒ THE HOLD HALF IS A SECOND 24-WIDE u16 ACTION-CODE ARRAY AT marker+436 + 2·(i−1), where 436 = 148 + 12×24 —
// i.e. immediately after the twenty-fourth 12-byte record, one u16 per switch with the same width and stride as
// the TAP array. MEASURED: the three HOLDs set for this round read back as 0x08 Looper, 0x05 Utility and 0x07
// Control Switch in row order, with every other row 0 (all other HOLDs were Unassigned). The long-standing
// prediction that a HOLD half would live at +100…+147 is REFUTED — that span stayed all zero, and those bytes
// are still unexplained. The HOLD code IS decoded now (holdActionCode / holdAction), and one flag travels with
// it: `holdMeasured` is false for the twenty-one rows nobody exercised, because their 0 is the codec's
// Unassigned convention and not an observation. The location was never a guess, and it is now a field.
//
// NO ANCHOR NAME IS HANDED OUT WHERE THE FUNCTION WAS NOT MEASURED. This paragraph used to say the name must
// be withheld from every 0x04 row because the mode was undecodable; the tenth capture SETTLED it instead of
// lifting it. `PP_TARGET_ANCHORS` was measured with Effect: Bypass, and on 2026-10-11 a Chan Select row was
// pointed at four known blocks — record+0 read their FX-slot indices every time (2, 51, 7, 28), so the table
// provably covers **Bypass (function 0) and Chan Select (function 1)**. It does NOT cover the rest: Chan
// Inc/Dec left record+0 at ZERO, Chan Toggle's +0 has never been shown to be a block, and every non-Effect
// category stores something else there. `ppTargetIsFxSlot(actionCode, functionIndex)` is that rule, computed
// once here and carried on each row as `targetIsFxSlot` so a caller cannot re-derive it differently.
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
  17: { actionCode: 36, target: 340 },   // the sweep's Chan Toggle → +0=2 and +4=1 (Chan Select since 2026-10-11 → +0=7)
  18: { actionCode: 38 },                // the sweep's Chan Inc/Dec → +0 read ZERO, values sit at +2/+8 (see the header)
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

/**
 * Marker-relative base of the per-switch FUNCTION-INDEX array: one u16 per switch, stride 2, index − 1 entries
 * in. MEASURED 2026-10-11 as the TAP's function index WITHIN its category (0 = the category's first menu entry),
 * with the reading decided by a discriminator written down before the dump: a function index predicts REPEATED
 * values when two switches share a function, an allocation index predicts distinct ascending ones — and five
 * Change Channel rows all read 1 while three Scene: Toggles all read 1 (repeats). Cross-category values therefore
 * repeat too (Scene #1 and Effect #1 both read 1): the index is per CATEGORY, not global.
 */
export const PP_FUNCTION_INDEX_BASE = 52;

/**
 * Marker-relative base of the per-switch HOLD ACTION-CODE array — `148 + 12 × PP_SWITCH_COUNT` = 436, i.e.
 * immediately after the twenty-fourth 12-byte record, one u16 per switch with the same width and stride as the
 * TAP action-code array. MEASURED 2026-10-11: three HOLDs were set (Looper, Utility, Control Switch on switches
 * 16/17/18) and the bytes read `0x08`, `0x05`, `0x07` at exactly those three slots, in row order, with all other
 * rows zero. So a HOLD definition mirrors a TAP definition, in the same code space.
 *
 * The ARRAY's location is observed; the twenty-one rows that read 0 were never exercised, so a 0 there is
 * reported as the code 0 (Unassigned — the same encoding the TAP side uses) and is FLAGGED as unexercised via
 * `holdMeasured`, rather than being presented with the same standing as the three measured ones.
 */
export const PP_HOLD_ACTION_BASE = 148 + 12 * PP_SWITCH_COUNT;

/** The switch indices whose HOLD was actually EXERCISED on the unit (the three set on 2026-10-11). */
export const PP_HOLD_MEASURED_INDICES: readonly number[] = [16, 17, 18];

/**
 * `0x09` Per-Preset's entries: "Placeholder" followed by the twenty-four per-preset switches, in the order
 * FM3-Edit lists them (owner read-out, 2026-10-12). Built rather than typed out so the list cannot disagree
 * with `PP_SWITCH_COUNT`. NOTE the shape: for this category the index is not a MODE, it is a reference to
 * another switch, which is why `PP_FUNCTION_NAMES[0x09]` reads as names of switches rather than of functions.
 */
const PP_PER_PRESET_REFERENCE_NAMES: Readonly<Record<number, string>> = Object.fromEntries([
  [0, 'Placeholder'],
  ...Array.from({ length: PP_SWITCH_COUNT }, (_, n) => [n + 1, `PP#${n + 1}`] as [number, string])
]);

/**
 * The TAP-function names, by category code then function index. SOURCE: the owner read FM3-Edit's per-preset
 * switch menus out on **2026-10-12**, in their display order, one list per category.
 *
 * THE INDEX ORDER IS NOW A MEASUREMENT, not an assumption: `ROUND 11 → R11-P0-C` set three rows to the LAST
 * entry of their lists and read the wire — Looper: Half Speed → `5` (of six), Utility: Scene Level + Save → `4`
 * (of five), Control Switch: Latching → `1` (of two). All three landed exactly (fixture
 * `preset-410-r11-p0c.bin`, pinned in `check-switch-offsets.ts`), so the editor lists its entries in index
 * order. The rows were chosen for their index being NON-ZERO and unique: a first entry would have predicted 0
 * under every candidate ordering and proved nothing.
 *
 * STILL PARTIAL, and the gap is deliberate:
 * - `0x0D` Song Section is ABSENT — the owner's read-out gives its FIELDS but not its three function names
 *   ("same as Song, except naming"), and a name nobody read is exactly what this table must not carry.
 * An index outside a category's list is a NUMBER, never a plausible name (same rule as the FX-slot anchors).
 * A category's list length is also its bound: `0x08` has six entries, so index 6+ prints as a number.
 *
 * `0x07` Control Switch DOES carry entries now: the menu's two functions are Momentary (0) and Latching (1),
 * both holding a single "Control Switch" field. The earlier note that this category is name-less was about the
 * SWITCH NUMBER (a record field, so "Control Switch 1" and "Control Switch 4" both read index 0) — both of
 * those rows were Momentary, which is index 0 under this menu, so the two readings agree rather than conflict.
 *
 * `0x09` Per-Preset is a DIFFERENT SHAPE from every other category and the table says so: its entries are
 * "Placeholder" then the twenty-four per-preset switches, i.e. for a Per-Preset row the function index is a
 * REFERENCE to another switch, not a mode. Kept as names anyway because that is what the editor shows; a
 * caller that needs the reference reads `functionIndex` and not the string.
 */
export const PP_FUNCTION_NAMES: Readonly<Record<number, Readonly<Record<number, string>>>> = {
  0x01: { 0: 'Select', 1: 'Toggle', 2: 'Inc/Dec' },
  0x02: { 0: 'Select by #', 1: 'Select in Bank', 2: 'Toggle by #', 3: 'Toggle in Bank', 4: 'Inc/Dec' },
  0x03: { 0: 'Select', 1: 'Toggle', 2: 'Inc/Dec' },
  0x04: { 0: 'Bypass', 1: 'Chan Select', 2: 'Chan Toggle', 3: 'Chan Inc/Dec' },
  0x05: { 0: 'Tuner', 1: 'Tap Tempo', 2: 'Amp Level + Save', 3: 'Reveal Hold', 4: 'Scene Level + Save' },
  0x06: { 0: 'Select', 1: 'Master Layout', 2: 'Inc/Dec' },
  0x07: { 0: 'Momentary', 1: 'Latching' },
  0x08: { 0: 'Record', 1: 'Play/Stop', 2: 'Reverse', 3: 'Once', 4: 'Undo/Erase', 5: 'Half Speed' },
  0x09: PP_PER_PRESET_REFERENCE_NAMES,
  0x0A: { 0: 'Select', 1: 'Inc/Dec' },
  0x0B: { 0: 'Select', 1: 'Toggle', 2: 'Inc/Dec' },
  0x0C: { 0: 'Select in Set', 1: 'Toggle in Set', 2: 'Inc/Dec in Set' }
};

/** The measured name of a TAP function, or null when its index (or its whole category) was never named. */
export function ppFunctionName(actionCode: number | null, functionIndex: number | null): string | null {
  if (actionCode === null || functionIndex === null) return null;
  return PP_FUNCTION_NAMES[actionCode]?.[functionIndex] ?? null;
}

/**
 * Whether the FX-slot ANCHOR table may name this row's target byte — MEASURED, not inferred.
 *
 * The anchors were originally all measured with Effect: Bypass. On 2026-10-11 a Chan Select row was pointed at a
 * known block four times (Chorus 1, Reverb 1, Delay 1, GEQ 2) and record+0 read 2, 51, 7, 28 — the FX-slot index
 * every time — so the table provably covers **Bypass (function 0) and Chan Select (function 1)**. It does NOT
 * cover the other Effect functions: Chan Inc/Dec left record+0 at zero in the sweep, and Chan Toggle's +0 has
 * never been shown to be a block. Every non-Effect category stores something else there (a scene number, a
 * preset number, a layout, a control-switch number), so the name must not appear beside them.
 */
export function ppTargetIsFxSlot(actionCode: number | null, functionIndex: number | null): boolean {
  if (actionCode !== 0x04) return false;
  return functionIndex === 0 || functionIndex === 1;
}

/**
 * Bytes from the marker that this decoder may read — one u16 past the highest offset of EVERY array it reads,
 * which as of 2026-10-11 is not only the record table: the function-index array at +52 and the HOLD action-code
 * array at +436 are both one u16 per switch. Declared AFTER those bases so the bound cannot drift from them
 * (a `const` read before its declaration would throw, and the guard that refuses a body too short to hold the
 * block is exactly where a stale bound turns into reading past the end).
 */
export const PP_REGION_BYTES = Math.max(
  ...Object.values(PP_MEASURED_OFFSETS).flatMap((o) => [o.actionCode, o.target ?? o.actionCode]),
  PP_FUNCTION_INDEX_BASE + 2 * PP_SWITCH_COUNT,
  PP_HOLD_ACTION_BASE + 2 * PP_SWITCH_COUNT
) + 2;

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
  20: 'Filter 4', 25: 'Gate 1', 27: 'GEQ 1', 28: 'GEQ 2', 29: 'In 1', 31: 'Looper', 32: 'Megatap 1',
  38: 'MultDly 1', 51: 'Reverb 1'
};

/** The name for a measured target index, or null when nobody has measured that index. */
/**
 * ALIAS CAVEAT: a raw lookup, not a verdict. It answers "what does the picker call index N" — NOT "this row's
 * byte IS that block". Ask `ppTargetIsFxSlot(actionCode, functionIndex)` for the verdict (or read the row's
 * `targetIsFxSlot`): the anchor names only apply to the two Effect functions that were measured to store a slot
 * index there.
 */
export function ppTargetLabel(index: number): string | null {
  return PP_TARGET_ANCHORS[index] ?? null;
}

/**
 * The switch-function CATEGORY a code selects — measured 2026-10-09 by giving ten switches ten different
 * functions in one edit and reading the bytes back, then completed on 2026-10-11 when the seven predicted codes
 * read exactly. The code is the FAMILY, not the function: `0x04` covers every Effect function measured so far
 * (Bypass, Chan Select, Chan Toggle, Chan Inc/Dec); `0x03` covers the scene flavours; `0x02` covers
 * Preset: Select and Preset: Increment. The FUNCTION is the array at marker+52 (see `ppFunctionName`), so a
 * caller must NOT turn a code into a function name — "Effect: Bypass" was exactly that mistake.
 *
 * `0x07` was measured on a switch whose assignment allowed "Control Switch 1 OR Layout 2"; the owner confirmed
 * it was **Control Switch**, and the tenth capture then measured **Layout = 0x06** on its own row, so the two
 * no longer share a question.
 */
export const PP_ACTION_CATEGORIES: Readonly<Record<number, string>> = {
  0x01: 'Bank',
  0x02: 'Preset',
  0x03: 'Scene',
  0x04: 'Effect',
  0x05: 'Utility',
  0x06: 'Layout',
  0x07: 'Control Switch',
  0x08: 'Looper',
  0x09: 'Per-Preset',
  0x0a: 'View',
  0x0b: 'Setlist',
  0x0c: 'Song',
  0x0d: 'Song Section'
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
  /**
   * TRUE only when the anchor table provably names this byte — the action is Effect AND the function is Bypass
   * or Chan Select (`ppTargetIsFxSlot`). A caller that prints `targetLabel` without checking this claims a name
   * nobody measured for every other category, so the rule is computed HERE and surfaced as one boolean rather
   * than left to each caller to re-derive.
   */
  targetIsFxSlot: boolean;
  /** The TAP's FUNCTION INDEX within its category (`marker+52 + 2·(index−1)`); 0 = the category's first entry. */
  functionIndex: number;
  /** `ppFunctionName` for that pair — null when the index, or the whole category, was never named. */
  functionName: string | null;
  /** HOLD action code (`marker+436 + 2·(index−1)`) — the SAME code space as `actionCode`; 0 = Unassigned. */
  holdActionCode: number;
  /** `ppActionName` of the HOLD code. */
  holdAction: string | null;
  /**
   * Whether a HOLD at this index was ever EXERCISED on the unit (16/17/18 on 2026-10-11). False means the byte
   * reads 0 and that zero was never tested — shown as Unassigned, but never with the standing of a measurement.
   */
  holdMeasured: boolean;
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
  /**
   * Indices whose HOLD was EXERCISED (a non-zero HOLD code was read there), ascending. Distinct in kind from the
   * two lists above — those name located OFFSETS, this names a tested VALUE — and kept separate so a reader can
   * tell "the array is located" from "this row was proven": a 0 in an unexercised row is Unassigned by codec
   * convention, not by observation.
   */
  holdMeasuredIndices: number[];
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
    // The function index and the HOLD code do NOT come from the TAP offset table: they are their own arrays,
    // located for every index, so they are read before (and independently of) the per-index TAP table.
    const functionIndex = u16(body, at + PP_FUNCTION_INDEX_BASE + 2 * (i - 1));
    const holdActionCode = u16(body, at + PP_HOLD_ACTION_BASE + 2 * (i - 1));
    const holdAction = ppActionName(holdActionCode);
    const holdMeasured = PP_HOLD_MEASURED_INDICES.includes(i);
    if (!off) {
      switches.push({
        index: i, actionCode: null, action: null, targetIndex: null, targetLabel: null, targetIsFxSlot: false,
        functionIndex, functionName: null, holdActionCode, holdAction, holdMeasured, confidence: 'unknown'
      });
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
      targetIsFxSlot: ppTargetIsFxSlot(actionCode, functionIndex),
      functionIndex,
      functionName: ppFunctionName(actionCode, functionIndex),
      holdActionCode,
      holdAction,
      holdMeasured,
      confidence: hasTarget ? 'measured' : 'partial'
    });
  }
  // A switch with ONLY a HOLD assigned is configured too — the TAP action code would read 0 for it.
  const populated = switches.some((s) => (s.actionCode ?? 0) !== 0 || (s.targetIndex ?? 0) !== 0 || s.holdActionCode !== 0);
  return {
    at,
    populated,
    switches,
    geometry: 'per-index-observed-offsets',
    evidence: {
      actionCodeIndices: [...PP_ACTION_CODE_INDICES],
      targetByteIndices: [...PP_TARGET_BYTE_INDICES],
      holdMeasuredIndices: [...PP_HOLD_MEASURED_INDICES]
    }
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
  next: { actionCode?: number; targetIndex?: number; holdActionCode?: number }
): boolean {
  const at = findPerPresetSwitchBlock(body);
  if (at === undefined) return false;
  if (at + PP_REGION_BYTES > body.length) return false;
  if (!Number.isInteger(index) || index < 1 || index > PP_SWITCH_COUNT) return false;
  const off = PP_MEASURED_OFFSETS[index];
  if (!off) return false; // no observed offset for this index
  if (next.actionCode === undefined && next.targetIndex === undefined && next.holdActionCode === undefined) return false;
  if (next.actionCode !== undefined && (!Number.isInteger(next.actionCode) || next.actionCode < 0 || next.actionCode > 0xffff)) return false;
  if (next.holdActionCode !== undefined && (!Number.isInteger(next.holdActionCode) || next.holdActionCode < 0 || next.holdActionCode > 0xffff)) return false;
  if (next.targetIndex !== undefined) {
    if (!Number.isInteger(next.targetIndex) || next.targetIndex < 0 || next.targetIndex > 0xff) return false;
    if (off.target === undefined) return false; // this index's target byte has never been located
  }
  const put = (o: number, v: number): void => { body[o] = v & 0xff; body[o + 1] = (v >> 8) & 0xff; };
  if (next.actionCode !== undefined) put(at + off.actionCode, next.actionCode);
  if (next.targetIndex !== undefined) body[at + off.target!] = next.targetIndex & 0xff;
  // The HOLD array's base is observed and uniform, so it needs no per-index offset check — but it is ONE
  // unexercised row away from being wrong for rows nobody has tested, which is why `holdMeasured` exists and
  // why a caller writing here should treat the read-back as the verdict (it always is).
  if (next.holdActionCode !== undefined) put(at + PP_HOLD_ACTION_BASE + 2 * (index - 1), next.holdActionCode);
  return true;
}

/**
 * True when `index` can be WRITTEN at all (an observed action-code offset), whether its target byte can, and
 * whether its HOLD code can. `hold` is true for every index because the HOLD ARRAY is located (measured at
 * three exercised rows, in row order) rather than each row's offset being located separately.
 */
export function ppWritable(index: number): { any: boolean; target: boolean; hold: boolean } {
  const off = PP_MEASURED_OFFSETS[index];
  return { any: !!off, target: !!off && off.target !== undefined, hold: !!off };
}
