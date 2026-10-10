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
// MEASURED for ALL TWELVE indices, both fields. The seventh capture set PP#6..PP#12 to seven DISTINCT anchors
// and every predicted value was read back: action codes 0x04 at marker+14/16/18/20/22/24/26 (the whole range
// filled — marker+26 DID move to 0x04, which is what the executable check caught when a hand-read of the same
// window called it zero) and targets 25/27/29/31/32/38 at marker+208..268 plus PP#12's 3 = "Chorus 2" at
// marker+280. That also turns the assumed switch COUNT into a measurement.
//
// A stride is still not a reading: an entry appears here only after an observed capture, and this file must
// keep reading that way. If the unit exposes MORE than twelve per-preset switches (FM3-Edit's own list is the
// authority — the owner reports 24 rows), the next ones would sit at marker+28, +30, … for the action codes and
// marker+292, +304, … for the targets, with the same rule: set one to a known anchor, read the byte, add it.
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
  12: { actionCode: 26, target: 280 }
};

/** PP#1's offsets — kept as named constants because most call sites mean exactly PP#1. */
export const PP_ACTION_OFFSET = PP_MEASURED_OFFSETS[1]!.actionCode;
export const PP_TARGET_OFFSET = PP_MEASURED_OFFSETS[1]!.target!;

/**
 * How many per-preset switches an FM3 exposes. Was an ASSUMPTION until 2026-10-09; now EVIDENCED — the seventh
 * capture's PP#12 target byte at marker+280 AND its action code at marker+26 both read the values the model
 * predicted, so twelve entries are real and all twelve are in the offset table.
 */
export const PP_SWITCH_COUNT = 12;

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
 * The measured target anchors — index → the FX-slot name the FM3's picker shows. 15 entries, each the result
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
export function ppTargetLabel(index: number): string | null {
  return PP_TARGET_ANCHORS[index] ?? null;
}

/**
 * The action a switch performs. `unassigned` for 0 (observed: the empty block is all-zero) and null for a
 * code nobody has measured — the caller shows the raw byte rather than a made-up function name. The two
 * named codes are INFERRED from two configured switches, not measured across all functions.
 */
export function ppActionName(code: number): string | null {
  if (code === 0) return 'unassigned';
  if (code === 0x04) return 'Effect: Bypass (inferred)';
  if (code === 0x03) return 'Scene: Select (inferred)';
  return null;
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
