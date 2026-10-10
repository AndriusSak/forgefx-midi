// The PER-PRESET SWITCH block (§3.8), decoded from a preset body.
//
// WHAT THIS SUITE CAN AND CANNOT PROVE. The offsets PP#1–PP#3 sit at were each located on the real unit and
// confirmed through real captures (`ForgeFX/server/test/drivers/per-preset-switches.test.ts` and
// `scripts/check-switch-offsets.ts` walk those four captures); the slices here are hand-built mirrors of
// them, so what this suite proves is that the codec's OWN patch/parse pair agrees with the documented
// offsets, and that a row with no observed offset reads nothing. Device semantics are the other suite's job.
//
// `realSlice` is byte-identical to body[11380..11600] of the unconfigured fixture: 220 bytes, all zero
// except the marker pair at +40 (absolute 11420). `populatedSlice` mirrors the SECOND capture (B) — the
// marker at region offset 8, the three action codes at marker+4/6/8 and the three target bytes at
// marker+148/160/172.
import {
  findPerPresetSwitchBlock,
  parsePerPresetSwitches,
  patchPerPresetSwitch,
  ppActionName,
  ppTargetLabel,
  ppWritable,
  PP_MEASURED_OFFSETS,
  PP_ACTION_CODE_INDICES,
  PP_TARGET_BYTE_INDICES,
  PP_ACTION_OFFSET,
  PP_TARGET_OFFSET,
  PP_REGION_BYTES,
  PP_SWITCH_COUNT,
} from '../../../src/devices/gen3/index.js';

export const PER_PRESET_SWITCH_CASE_COUNT = 17;

/** body[11380..11600] of preset 410, verbatim: zeros with the 0x05F5/0x0001 marker at region offset 40. */
function realSlice(): Uint8Array {
  const s = new Uint8Array(220);
  s[40] = 0xf5; s[41] = 0x05;   // u16 0x05F5
  s[42] = 0x01; s[43] = 0x00;   // u16 0x0001
  return s;
}

/**
 * The marker's offset inside `populatedSlice` — every +N offset below is relative to THIS, not to 0.
 * Capture B, verbatim in the bytes that matter: the marker at region offset 8, PP#1/PP#2/PP#3 action codes
 * 0x04/0x03/0x00 at marker+4/6/8, and the target bytes 20 (Filter 4), 1 (PP#2 with Scene: Select — a scene
 * number, not an FX slot) and 0 (PP#3 unassigned) at marker+148/160/172.
 */
const POPULATED_MARKER_AT = 8;

function populatedSlice(): Uint8Array {
  const s = new Uint8Array(200);
  s[POPULATED_MARKER_AT] = 0xf5; s[POPULATED_MARKER_AT + 1] = 0x05; s[POPULATED_MARKER_AT + 2] = 0x01; s[POPULATED_MARKER_AT + 3] = 0x00; // marker (region +8)
  s[12] = 0x04;  // PP#1 action code (marker+4) — Effect: Bypass
  s[14] = 0x03;  // PP#2 action code (marker+6) — Scene: Select
  // PP#3's action code (marker+8) stays 0 — unassigned in this capture
  s[156] = 20;   // PP#1 target byte (marker+148) — index 20 = "Filter 4"
  s[168] = 1;    // PP#2 target byte (marker+160) — the value that was "unexplained" until 2026-10-09
  return s;
}

const failures: string[] = [];
function t(name: string, fn: () => void): void {
  try { fn(); } catch (e) { failures.push(`${name}: ${(e as Error).message}`); }
}
function eq<T>(got: T, want: T, msg: string): void {
  if (got !== want) throw new Error(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

export function runPerPresetSwitchTests(): void {
  failures.length = 0;

  t('the marker is FOUND, not hard-coded — the block moves between presets', () => {
    eq(findPerPresetSwitchBlock(realSlice()), 40, 'marker found at the fixture region offset');
    const shifted = new Uint8Array(240);
    shifted.set(realSlice(), 16); // the same block 16 bytes later
    eq(findPerPresetSwitchBlock(shifted), 56, 'and it is found wherever it sits');
  });

  t('an UNCONFIGURED block is reported honestly, not as twelve switches', () => {
    const page = parsePerPresetSwitches(realSlice());
    if (!page) throw new Error('the block exists (the marker is there) and must be reported');
    eq(page.at, 40, 'marker offset');
    eq(page.populated, false, 'the real region is all-zero, so it is NOT populated');
    eq(page.geometry, 'per-index-observed-offsets', 'and the decode names its own model');
    eq(page.switches.length, PP_SWITCH_COUNT, 'rows are reported for the assumed switch count');
    eq(page.switches[0]!.actionCode, 0, 'PP#1 action code is 0 (no assignment recorded)');
    eq(page.switches[0]!.targetIndex, 0, 'and its target byte is 0');
    eq(page.switches[0]!.action, 'unassigned', 'which is reported as unassigned, not guessed at');
  });

  t('a row is only as readable as its OBSERVED offsets — never read from a guessed position', () => {
    const page = parsePerPresetSwitches(populatedSlice())!;
    const pp1 = page.switches[0]!;
    eq(pp1.confidence, 'measured', 'PP#1: both offsets observed');
    eq(pp1.actionCode, 0x04, 'PP#1 action code');
    eq(pp1.targetIndex, 20, 'PP#1 target byte');
    const pp2 = page.switches[1]!;
    eq(pp2.confidence, 'measured', 'PP#2: both offsets observed since marker+160 was located');
    eq(pp2.actionCode, 0x03, 'its action code is reported');
    eq(pp2.targetIndex, 1, 'and its target byte is the OBSERVED 1 — the same byte that was reported as null while the offset was unknown');
    // The codec reports the RAW anchor for an index; that the anchor is an FX-slot name is only meaningful
    // for an effect action (the Axis view applies that rule) — here the assertion is about the decode.
    eq(pp2.targetLabel, 'Cab 1', 'with the FX-slot anchor for index 1 (applicability is the view\'s call)');
    const pp3 = page.switches[2]!;
    eq(pp3.confidence, 'measured', 'PP#3: both offsets observed (action code at marker+8, target at marker+172)');
    eq(pp3.actionCode, 0, 'it is unassigned in this capture');
    for (const s of page.switches.slice(3)) {
      eq(s.confidence, 'unknown', `PP#${s.index} has no observed offset`);
      eq(s.actionCode, null, `PP#${s.index} reports no action code`);
      eq(s.targetIndex, null, `PP#${s.index} reports no target`);
    }
  });

  t('patch → parse round trip at the DOCUMENTED offsets (self-consistency, not device semantics)', () => {
    const body = realSlice();
    if (!patchPerPresetSwitch(body, 1, { actionCode: 0x04, targetIndex: 51 })) throw new Error('patch refused');
    eq(body[40 + PP_ACTION_OFFSET], 0x04, 'the action code landed at marker+4, low byte');
    eq(body[40 + PP_ACTION_OFFSET + 1], 0x00, 'and the high byte');
    eq(body[40 + PP_TARGET_OFFSET], 51, 'and the target byte at marker+148');
    const back = parsePerPresetSwitches(body)!;
    const pp1 = back.switches[0]!;
    eq(pp1.actionCode, 0x04, 'parsed action code');
    eq(pp1.targetIndex, 51, 'parsed target index');
    eq(pp1.targetLabel, 'Reverb 1', 'and the measured anchor names it');
    eq(pp1.action, 'Effect: Bypass (inferred)', 'the action name carries its own inference tag');
    eq(back.populated, true, 'the block now reads as populated');
  });

  t('PP#2 and PP#3 target writes land at marker+160 / marker+172 and read back', () => {
    const body = realSlice();
    if (!patchPerPresetSwitch(body, 2, { actionCode: 0x04, targetIndex: 51 })) throw new Error('PP#2 patch refused');
    if (!patchPerPresetSwitch(body, 3, { actionCode: 0x04, targetIndex: 2 })) throw new Error('PP#3 patch refused');
    eq(body[40 + PP_MEASURED_OFFSETS[2]!.target!], 51, 'PP#2 target byte at marker+160');
    eq(body[40 + PP_MEASURED_OFFSETS[3]!.target!], 2, 'PP#3 target byte at marker+172');
    eq(body[40 + PP_MEASURED_OFFSETS[3]!.actionCode], 0x04, 'and PP#3 action code at marker+8');
    const page = parsePerPresetSwitches(body)!;
    eq(page.switches[1]!.targetIndex, 51, 'PP#2 reads back');
    eq(page.switches[1]!.targetLabel, 'Reverb 1', 'named');
    eq(page.switches[2]!.targetIndex, 2, 'PP#3 reads back');
    eq(page.switches[2]!.targetLabel, 'Chorus 1', 'named');
  });

  t('an unwritten field keeps its value (a target-only write leaves the action code alone)', () => {
    const body = realSlice();
    patchPerPresetSwitch(body, 1, { actionCode: 0x03 });
    patchPerPresetSwitch(body, 1, { targetIndex: 1 });
    const pp1 = parsePerPresetSwitches(body)!.switches[0]!;
    eq(pp1.actionCode, 0x03, 'the action code survived the second write');
    eq(pp1.targetIndex, 1, 'and the target landed');
  });

  t('an index past the MEASURED ones is REFUSED — its offset has never been observed', () => {
    const body = realSlice();
    const before = Uint8Array.from(body);
    eq(patchPerPresetSwitch(body, 4, { targetIndex: 51 }), false, 'PP#4 is refused');
    eq(patchPerPresetSwitch(body, 99, { targetIndex: 51 }), false, 'and so is an out-of-range index');
    eq(Array.from(body).join(','), Array.from(before).join(','), 'and NOTHING was written');
  });

  t('no marker → no block (never a synthesised one); a marker at the very end is refused too', () => {
    eq(parsePerPresetSwitches(new Uint8Array(400)), undefined, 'an empty body has no block');
    // The bound covers EVERY observed offset: the highest one measured so far must be inside the body. A
    // marker whose bytes fall off the end is not this block, and reading it would invent twelve rows.
    const tail = new Uint8Array(PP_REGION_BYTES - 1);
    tail[0] = 0xf5; tail[1] = 0x05; tail[2] = 0x01; tail[3] = 0x00; // marker at 0, region runs off the end
    eq(parsePerPresetSwitches(tail), undefined, 'a marker too close to the end is not treated as the block');
  });

  t('an UNMEASURED target index reports no name rather than a plausible one', () => {
    eq(ppTargetLabel(51), 'Reverb 1', 'a measured anchor resolves');
    eq(ppTargetLabel(0), 'Amp 1', 'including the first one');
    eq(ppTargetLabel(14), 'FB Rtn 2', 'and the one located on 2026-10-09');
    eq(ppTargetLabel(8), 'Delay 2', 'plus the later one (Delay 1 = 7 → Delay 2 = 8: instances are consecutive)');
    eq(ppTargetLabel(9), null, 'index 9 is inside the unlabelled band → null, not a guess');
    eq(ppTargetLabel(13), null, 'and so is 13 (FB Rtn 1 is a PREDICTION, not an observation)');
    eq(ppActionName(0x99), null, 'an unmeasured action code gets no function name');
    eq(ppActionName(0), 'unassigned', 'while 0 still reads as unassigned');
  });

  t('a POPULATED block (the second real capture) decodes to the config the owner actually had', () => {
    const page = parsePerPresetSwitches(populatedSlice())!;
    eq(page.at, 8, 'marker offset in the slice');
    eq(page.populated, true, 'this one IS populated');
    const pp1 = page.switches[0]!;
    eq(pp1.actionCode, 0x04, 'PP#1 action code');
    eq(pp1.targetIndex, 20, 'PP#1 target byte');
    eq(pp1.targetLabel, 'Filter 4', 'which the wire anchors independently name "Filter 4"');
    const pp2 = page.switches[1]!;
    eq(pp2.actionCode, 0x03, 'PP#2 action code (the second configured switch)');
    eq(pp2.action, 'Scene: Select (inferred)', 'named as the inferred scene action');
    eq(pp2.confidence, 'measured', 'PP#2 is now fully measured: its target byte was located at marker+160');
  });

  t('the page reports WHICH indices the evidence reaches, per field', () => {
    const page = parsePerPresetSwitches(populatedSlice())!;
    eq(page.evidence.actionCodeIndices.join(','), '1,2,3', 'the action-code offsets observed are PP#1, PP#2 and PP#3');
    eq(page.evidence.targetByteIndices.join(','), '1,2,3', 'and the located target bytes are the same three indices');
    // and the row-level view stays as conservative as the evidence: three measured, the rest not.
    eq(page.switches.filter((s) => s.confidence === 'measured').length, 3, 'three rows are marked measured');
  });

  t('the evidence LISTS are DERIVED from the offset table (no second hand-kept number)', () => {
    const actionFromTable = Object.keys(PP_MEASURED_OFFSETS).map(Number).sort((a, b) => a - b);
    const targetFromTable = Object.keys(PP_MEASURED_OFFSETS).map(Number)
      .filter((i) => PP_MEASURED_OFFSETS[i]!.target !== undefined).sort((a, b) => a - b);
    eq(PP_ACTION_CODE_INDICES.join(','), actionFromTable.join(','), 'action-code indices mirror the table');
    eq(PP_TARGET_BYTE_INDICES.join(','), targetFromTable.join(','), 'target-byte indices mirror the table');
    eq(PP_TARGET_BYTE_INDICES.join(','), '1,2,3', 'and today that is PP#1–PP#3 (indices 4+ are NOT extrapolated)');
    // The page carries the LISTS, never a count — the shape a reader can render without assuming contiguity.
    const page = parsePerPresetSwitches(populatedSlice())!;
    eq(page.evidence.actionCodeIndices.join(','), '1,2,3', 'the page carries the action-code indices');
    eq(page.evidence.targetByteIndices.join(','), '1,2,3', 'and the target-byte indices');
  });

  t('writing PP#1 leaves PP#2 untouched', () => {
    const body = populatedSlice();
    if (!patchPerPresetSwitch(body, 1, { targetIndex: 51 })) throw new Error('patch refused');
    const page = parsePerPresetSwitches(body)!;
    eq(page.switches[0]!.targetIndex, 51, 'PP#1 moved');
    eq(page.switches[1]!.actionCode, 0x03, 'PP#2 action code is intact');
    eq(page.switches[1]!.targetIndex, 1, 'and PP#2 target byte is untouched');
    // INDEX ARITHMETIC: these offsets are relative to the MARKER, which sits at slice offset 8 — not at 0.
    // The previous version read `body[PP_TARGET_OFFSET + 1]`, i.e. index 149 = marker+141, so it watched a
    // byte the refuted flat array never touched and passed whatever the write did to marker+149.
    eq(body[POPULATED_MARKER_AT + PP_TARGET_OFFSET + 1], 0, 'and the byte at marker+149 was NOT touched by the PP#1 write');
  });

  t('a NON-ZERO marker+149 survives the PP#1 write (regression guard for the refuted flat array)', () => {
    const body = populatedSlice();
    body[POPULATED_MARKER_AT + PP_TARGET_OFFSET + 1] = 0x2a; // the position a FLAT one-per-switch array would have used
    if (!patchPerPresetSwitch(body, 1, { targetIndex: 51 })) throw new Error('patch refused');
    eq(body[POPULATED_MARKER_AT + PP_TARGET_OFFSET + 1], 0x2a, 'marker+149 untouched — a flat target array is refuted');
    eq(body[POPULATED_MARKER_AT + PP_TARGET_OFFSET], 51, 'while the MEASURED PP#1 target byte did move');
  });

  t('ppWritable answers per FIELD, straight from the offset table', () => {
    eq(ppWritable(1).any, true, 'PP#1 can be written');
    eq(ppWritable(1).target, true, 'including its target byte');
    eq(ppWritable(2).any, true, 'PP#2 can have its action code written');
    eq(ppWritable(2).target, true, 'and its target byte — located at marker+160 on 2026-10-09');
    eq(ppWritable(3).any, true, 'PP#3 has an observed offset too');
    eq(ppWritable(3).target, true, 'both fields, from marker+8 and marker+172');
    eq(ppWritable(4).any, false, 'PP#4 has no observed offset at all');
    eq(ppWritable(4).target, false, 'so nothing about it may be written');
  });

  t('a patch with NO fields is refused, and a refused patch writes NOTHING', () => {
    const body = populatedSlice();
    const before = Array.from(body).join(',');
    eq(patchPerPresetSwitch(body, 1, {}), false, 'an empty patch is refused (it is a no-op, not a success)');
    // an index with no observed offset at all: refused whole, not half-applied
    eq(patchPerPresetSwitch(body, 4, { actionCode: 0x04, targetIndex: 51 }), false, 'PP#4 is refused');
    eq(Array.from(body).join(','), before, 'and NOTHING was written — no partial patch');
  });

  t('the named PP#1 offsets ARE the table (one source of truth, no stride formula left)', () => {
    eq(PP_ACTION_OFFSET, PP_MEASURED_OFFSETS[1]!.actionCode, 'PP_ACTION_OFFSET comes from the table');
    eq(PP_TARGET_OFFSET, PP_MEASURED_OFFSETS[1]!.target, 'and so does PP_TARGET_OFFSET');
    eq(PP_MEASURED_OFFSETS[2]!.target, 160, 'PP#2 target offset — MEASURED by prediction, not by stride arithmetic');
    eq(PP_MEASURED_OFFSETS[3]!.actionCode, 8, 'PP#3 action code — stride 2 held for a third slot');
    eq(PP_MEASURED_OFFSETS[3]!.target, 172, 'PP#3 target — stride 12 held for a third slot');
    eq(PP_MEASURED_OFFSETS[4], undefined, 'and PP#4 is deliberately ABSENT: a stride over three points is still a prediction');
  });

  if (failures.length) throw new Error(`per-preset switches: ${failures.length} case(s) failed\n  - ${failures.join('\n  - ')}`);
}
