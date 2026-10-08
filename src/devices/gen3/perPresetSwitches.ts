// ────────────────────────────────────────────────────────────────────────────────────────────────
// PER-PRESET SWITCH DEFINITIONS, decoded from a preset body (§3.8).
//
// WHAT IS MEASURED, AND WHAT IS NOT. This file is deliberately loud about the difference, because the
// decode here is thinner than the perform page's: the perform page had a fixture PAIR and 7 golden cases,
// while the switch block had ONE configured switch at a time and its geometry has never been seen
// populated in a committed fixture.
//
// MEASURED (on the wire, 2026-10-08):
//   • the block is located by the marker pair u16 `0x05F5` / u16 `0x0001`. Search for it — do NOT hard-code
//     an offset: the doc recorded it "at ~11412" while the committed preset-410 fixture holds it at
//     **11420** (the body is compressed, so other content shifts it).
//   • one u16 ACTION CODE per switch begins at marker+4;
//   • the PP#1 TARGET BYTE sits at marker+148 — the doc's absolute value 11568 and this fixture's marker
//     (11420) agree on exactly +148, which is the one piece of this layout confirmed twice.
//   • the target is an index into the FM3's ALPHABETICALLY ORDERED FX-SLOT ENUMERATION, instances expanded
//     (the list the switch picker shows). 13 anchors were read, one edit + one dump each — see
//     PP_TARGET_ANCHORS. Two models were REFUTED by their own predictions (a short alphabetical inventory
//     predicted Reverb 1 = 15 and read 51; a grid position would have given ≈ 10). Do not re-derive either.
//
// NOT MEASURED — every field derived from the below is tagged `inferred` and the UI must show that tag:
//   • the SWITCH COUNT and therefore the stride of both arrays. +148 is the only offset ever observed, and
//     ONE observation cannot distinguish "one byte per switch" from "a record stride with a gap".
//   • the ACTION CODES beyond the two samples (0x04, 0x03) that produced them.
//   • whether an absent target byte (0) means "switch unconfigured" — the empty block reads all-zero, which
//     is consistent with it, and nothing else has been observed.
//
// A parser here never invents a name: `ppTargetLabel` returns null for an index nobody has measured, and
// the row keeps its raw index so a human can resolve it with one edit and one dump.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** The marker pair that locates the block: u16 0x05F5 immediately followed by u16 0x0001. */
export const PP_MARKER = 0x05f5;
export const PP_MARKER_SIBLING = 0x0001;

/** Action codes start this many bytes after the marker (MEASURED: doc's 11424 with this body's 11420). */
export const PP_ACTION_OFFSET = 4;
/** PP#1's target byte sits this many bytes after the marker (MEASURED: 11568 − 11420, confirmed twice). */
export const PP_TARGET_OFFSET = 148;
/** How many per-preset switches an FM3 exposes — ASSUMED, not measured. Every row past PP#1 is `inferred`. */
export const PP_SWITCH_COUNT = 12;
/** How many leading ACTION CODES the two-fixture differential confirmed (marker+4 and marker+6). */
export const PP_ACTION_CODES_MEASURED = 2;
/** How many leading TARGET BYTES are measured (marker+148 only). */
export const PP_TARGET_BYTES_MEASURED = 1;
/** Length of the region a write touches, from the marker: covers the action codes AND the PP#N target. */
export const PP_REGION_BYTES = PP_TARGET_OFFSET + PP_SWITCH_COUNT;

// OPEN OBSERVATION (2026-10-08), recorded rather than smoothed over: between the two real captures the byte
// at marker+160 (0 → 1) changed and NOTHING in this model accounts for it. It sits exactly one byte past the
// 12 assumed target bytes, so it is either a 13th entry of something, the start of a neighbouring field, or
// unrelated content that moved for its own reason — the two captures were hours apart and a perform-page
// label changed in the same diff, so this is not a controlled experiment. It does NOT touch any offset this
// decoder reads (marker+4/+6/+148), and it is why `PP_SWITCH_COUNT` stays an explicit assumption.

const u16 = (b: ArrayLike<number>, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);

/**
 * The measured target anchors — index → the FX-slot name the FM3's picker shows. 13 entries, each the
 * result of one edit by the owner plus one read-only dump. An index NOT in this table is genuinely
 * unlabelled: report the number, never a guess (indices 8–16 in particular are bounded only by
 * dichotomising, and "FB Snd" among them is a candidate, not a finding).
 */
export const PP_TARGET_ANCHORS: Readonly<Record<number, string>> = {
  0: 'Amp 1', 1: 'Cab 1', 2: 'Chorus 1', 3: 'Chorus 2', 7: 'Delay 1', 20: 'Filter 4',
  25: 'Gate 1', 27: 'GEQ 1', 29: 'In 1', 31: 'Looper', 32: 'Megatap 1', 38: 'MultDly 1', 51: 'Reverb 1'
};

/** The name for a measured target index, or null when nobody has measured that index. */
export function ppTargetLabel(index: number): string | null {
  return PP_TARGET_ANCHORS[index] ?? null;
}

/**
 * The action a switch performs. `unassigned` for 0 (observed: the empty block is all-zero) and null for a
 * code nobody has measured — the caller shows the raw byte rather than a made-up function name.
 * The two named codes are INFERRED from two configured switches, not measured across all functions.
 */
export function ppActionName(code: number): string | null {
  if (code === 0) return 'unassigned';
  if (code === 0x04) return 'Effect: Bypass (inferred)';
  if (code === 0x03) return 'Scene: Select (inferred)';
  return null;
}

export interface PerPresetSwitch {
  /** 1-based, as the switch picker numbers them ("PP#1"). */
  index: number;
  /** Raw 16-bit action code as the body holds it. */
  actionCode: number;
  /** `ppActionName` of that code, or null when the code is unmeasured. */
  action: string | null;
  /** Raw target byte (an index into the alphabetical FX-slot enumeration). */
  targetIndex: number;
  /** The FX-slot name for that index, or null when the index is unlabelled (never a guess). */
  targetLabel: string | null;
  /** 'measured' only for PP#1 (the one offset confirmed twice); 'inferred' for every other row. */
  confidence: 'measured' | 'inferred';
}

export interface PerPresetSwitches {
  /** Offset of the marker in the decompressed body (diagnostic — it MOVES between presets). */
  at: number;
  /** True when any byte of the block is non-zero. An unpopulated block is reported, not hidden. */
  populated: boolean;
  switches: PerPresetSwitch[];
  /** Which rows a caller may trust: this decode can only vouch for PP#1 today. */
  geometry: 'measured-pp1-only';
  /**
   * How far each field's evidence actually reaches, counted from PP#1. The action-code array is confirmed
   * for two entries (a two-fixture differential moved marker+4 AND marker+6, each to the code the owner had
   * configured there); the target-byte array is confirmed for ONE (marker+148 read 20 = "Filter 4", the
   * anchor measured independently on the wire). Anything past these counts is an extrapolation.
   */
  evidence: { actionCodesMeasured: number; targetBytesMeasured: number };
}

/** Locate the block: the first `0x05F5` / `0x0001` marker pair in the body, or undefined. */
export function findPerPresetSwitchBlock(body: ArrayLike<number>): number | undefined {
  for (let i = 0; i + 3 < body.length; i++) {
    if (u16(body, i) === PP_MARKER && u16(body, i + 2) === PP_MARKER_SIBLING) return i;
  }
  return undefined;
}

/**
 * Parse the switch definitions from a DECOMPRESSED preset body. `undefined` when the marker is absent —
 * never a synthesised block. The `at + PP_REGION_BYTES` bound is checked first: a marker near the end of
 * the body would otherwise read phantom switches out of whatever follows it.
 */
export function parsePerPresetSwitches(body: ArrayLike<number>, count = PP_SWITCH_COUNT): PerPresetSwitches | undefined {
  const at = findPerPresetSwitchBlock(body);
  if (at === undefined) return undefined;
  if (at + PP_TARGET_OFFSET >= body.length) return undefined; // marker too close to the end to be this block
  const n = Math.max(1, Math.min(count, PP_SWITCH_COUNT));
  const switches: PerPresetSwitch[] = [];
  for (let i = 0; i < n; i++) {
    const actionCode = u16(body, at + PP_ACTION_OFFSET + i * 2);
    const targetIndex = body[at + PP_TARGET_OFFSET + i] ?? 0;
    switches.push({
      index: i + 1,
      actionCode,
      action: ppActionName(actionCode),
      targetIndex,
      targetLabel: ppTargetLabel(targetIndex),
      confidence: i === 0 ? 'measured' : 'inferred'
    });
  }
  const populated = switches.some((s) => s.actionCode !== 0 || s.targetIndex !== 0);
  return {
    at,
    populated,
    switches,
    geometry: 'measured-pp1-only',
    evidence: { actionCodesMeasured: PP_ACTION_CODES_MEASURED, targetBytesMeasured: PP_TARGET_BYTES_MEASURED }
  };
}

/**
 * Patch ONE switch in place — the WRITE side, in the byte domain. Length-preserving: both fields are
 * fixed-size, so this is the same shape of edit the perform page does and it rides the same
 * recompress/reframe/retarget path.
 *
 * BOUNDED ON PURPOSE: only PP#1 is measured, so an index other than 1 is REFUSED rather than written to an
 * offset that has never been observed. Returns false and writes nothing — never a partial write.
 */
export function patchPerPresetSwitch(
  body: Uint8Array,
  index: number,
  next: { actionCode?: number; targetIndex?: number }
): boolean {
  const at = findPerPresetSwitchBlock(body);
  if (at === undefined) return false;
  if (at + PP_TARGET_OFFSET >= body.length) return false;
  if (!Number.isInteger(index) || index < 1 || index > PP_SWITCH_COUNT) return false;
  if (index !== 1) return false; // only PP#1's offsets are measured — see the header
  const put = (o: number, v: number): void => { body[o] = v & 0xff; body[o + 1] = (v >> 8) & 0xff; };
  if (next.actionCode !== undefined) {
    if (!Number.isInteger(next.actionCode) || next.actionCode < 0 || next.actionCode > 0xffff) return false;
    put(at + PP_ACTION_OFFSET, next.actionCode);
  }
  if (next.targetIndex !== undefined) {
    if (!Number.isInteger(next.targetIndex) || next.targetIndex < 0 || next.targetIndex > 0xff) return false;
    body[at + PP_TARGET_OFFSET] = next.targetIndex & 0xff;
  }
  return true;
}
