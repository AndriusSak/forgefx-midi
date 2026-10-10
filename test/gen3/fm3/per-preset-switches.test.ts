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
// marker at region offset 8, the five action codes at marker+4/6/8/10/12 and the five target bytes at
// marker+148/160/172/184/196. It leaves PP#3–PP#5 reading 0, which is exactly what capture B holds.
import {
  findPerPresetSwitchBlock,
  parsePerPresetSwitches,
  patchPerPresetSwitch,
  ppActionName,
  ppTargetLabel,
  ppWritable,
  PP_MEASURED_OFFSETS,
  PP_ACTION_CATEGORIES,
  PP_ACTION_CODE_INDICES,
  PP_TARGET_BYTE_INDICES,
  PP_ACTION_OFFSET,
  PP_TARGET_OFFSET,
  PP_REGION_BYTES,
  PP_SWITCH_COUNT,
} from '../../../src/devices/gen3/index.js';

export const PER_PRESET_SWITCH_CASE_COUNT = 19;

/**
 * body[11380..11600] of preset 410 — the marker pair at region offset 40 (absolute 11420) and zeros
 * everywhere else — followed by the zeros the REAL body holds past that window: the decoder's region now
 * reaches marker+198 (the last measured target byte at 196), so a slice that stopped at 220 would be refused
 * by the parser's "the observed offsets must fit inside the body" guard. The body itself is 14,476 bytes.
 */
function realSlice(): Uint8Array {
  const s = new Uint8Array(40 + PP_REGION_BYTES + 8);
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
  // 8 (marker) + PP_REGION_BYTES (426, one u16 past the highest measured offset — PP#24's target at 424) with
  // a little room, so the parser's "the observed offsets must fit inside the body" guard does not refuse the
  // fixture itself. This is the guard doing its job: every enlargement of the offset table shrinks what counts
  // as a valid slice, and a fixture that stops being valid reads as a decode regression.
  const s = new Uint8Array(480);
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
    const shifted = new Uint8Array(realSlice().length + 32);
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
    const body = populatedSlice();
    body[POPULATED_MARKER_AT + 38] = 0x04; // PP#18's action code (its record+0 stays 0 — see the case below)
    const page = parsePerPresetSwitches(body)!;
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
    eq(page.switches[3]!.confidence, 'measured', 'PP#4 too — marker+10 and marker+184');
    eq(page.switches[4]!.confidence, 'measured', 'and PP#5 — marker+12 and marker+196');
    eq(page.switches[10]!.confidence, 'measured', 'the table reaches PP#11 (marker+24 / marker+268)');
    eq(page.switches[11]!.confidence, 'measured', 'and PP#12 (marker+26 / marker+280)');
    eq(page.switches[12]!.confidence, 'measured', 'PP#13 as well (marker+28 / marker+292)');
    eq(page.switches[13]!.confidence, 'measured', 'PP#14 too — the category sweep located 14–23');
    eq(page.switches[17]!.confidence, 'partial', 'but PP#18 (Effect: Parameter) has only its ACTION CODE located: record+0 read 0 there');
    eq(page.switches[17]!.actionCode, 0x04, 'so it reports its code');
    eq(page.switches[17]!.targetIndex, null, 'and no target at all — never a value read out of a guessing position');
    eq(page.switches[23]!.confidence, 'measured', 'PP#24 is measured (marker+50 / marker+424)');
    eq(page.switches.length, PP_SWITCH_COUNT, 'twenty-four rows, one per switch the unit exposes');
    eq(page.switches.filter((s) => s.confidence === 'unknown').length, 0, 'no row is unread any more: all 24 have an observed action-code offset');
    eq(page.switches.filter((s) => s.confidence === 'partial').length, 4, 'four rows are partial: 18, 21, 22, 23 (their categories do not write record+0)');
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
    eq(pp1.action, 'Effect (category — the mode is in the record)', 'the code names the CATEGORY: bypass, change-channel and parameter all read 0x04');
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
    eq(patchPerPresetSwitch(body, 25, { targetIndex: 51 }), false, 'PP#25 is refused — past the switch count (24)');
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
    eq(pp2.action, 'Scene (category — the mode is in the record)', '0x03 is the Scene FAMILY, not "Scene: Select"');
    eq(pp2.confidence, 'measured', 'PP#2 is now fully measured: its target byte was located at marker+160');
  });

  t('the page reports WHICH indices the evidence reaches, per field', () => {
    const page = parsePerPresetSwitches(populatedSlice())!;
    eq(page.evidence.actionCodeIndices.length, 24, 'every switch has an observed action-code offset');
    eq(page.evidence.targetByteIndices.join(','), '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,24',
      'and the located record+0 bytes are NOT a contiguous set: 18, 21, 22 and 23 read zero there');
    eq(page.switches.filter((s) => s.confidence === 'measured').length, 20, 'twenty rows measured');
    eq(page.switches.filter((s) => s.confidence === 'partial').length, 4, 'four partial — that is what a per-FIELD bound looks like when it is real');
  });

  t('the evidence LISTS are DERIVED from the offset table (no second hand-kept number)', () => {
    const actionFromTable = Object.keys(PP_MEASURED_OFFSETS).map(Number).sort((a, b) => a - b);
    const targetFromTable = Object.keys(PP_MEASURED_OFFSETS).map(Number)
      .filter((i) => PP_MEASURED_OFFSETS[i]!.target !== undefined).sort((a, b) => a - b);
    eq(PP_ACTION_CODE_INDICES.join(','), actionFromTable.join(','), 'action-code indices mirror the table');
    eq(PP_TARGET_BYTE_INDICES.join(','), targetFromTable.join(','), 'target-byte indices mirror the table');
    eq(PP_TARGET_BYTE_INDICES.join(','), '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,24', 'and that is exactly the set whose offset was OBSERVED — 18, 21, 22, 23 read zero there');
    // The page carries the LISTS, never a count — the shape a reader can render without assuming contiguity.
    // This is exactly the case that rule was written for: 20 measured, 4 partial, and no range or count can
    // express that.
    const page = parsePerPresetSwitches(populatedSlice())!;
    eq(page.evidence.actionCodeIndices.length, 24, 'the page carries all 24 action-code indices');
    eq(page.evidence.targetByteIndices.join(','), '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,24', 'and the target-byte indices');
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
    eq(ppWritable(4).target, true, 'PP#4 as well — marker+10 and marker+184');
    eq(ppWritable(5).target, true, 'and PP#5 — marker+12 and marker+196');
    eq(ppWritable(11).target, true, 'PP#11 — marker+24 and marker+268');
    eq(ppWritable(12).any, true, 'PP#12 — marker+26 and marker+280');
    eq(ppWritable(12).target, true, 'on both fields');
    eq(ppWritable(13).target, true, 'PP#13 too — the unit has more than twelve, and it is measured');
    eq(ppWritable(14).target, true, 'PP#14 as well: the sweep located marker+30 / marker+304');
    eq(ppWritable(18).any, true, 'PP#18 has an observed ACTION CODE (marker+38)…');
    eq(ppWritable(18).target, false, '…but no located record+0, so a target write is refused — the bound is per FIELD');
    eq(ppWritable(24).target, true, 'PP#24 (the last one) is measured and writable');
    eq(ppWritable(25).any, false, 'while PP#25 does not exist on this device');
  });

  t('a patch with NO fields is refused, and a refused patch writes NOTHING', () => {
    const body = populatedSlice();
    const before = Array.from(body).join(',');
    eq(patchPerPresetSwitch(body, 1, {}), false, 'an empty patch is refused (it is a no-op, not a success)');
    // an index with no observed offset at all: refused whole, not half-applied
    eq(patchPerPresetSwitch(body, 25, { actionCode: 0x04, targetIndex: 51 }), false, 'PP#25 is refused');
    eq(Array.from(body).join(','), before, 'and NOTHING was written — no partial patch');
  });

  t('the action code names the CATEGORY, not the function (measured over ten functions in one edit)', () => {
    // The ninth capture gave PP#14..PP#23 ten different functions in one edit. Reading all 24 action codes back:
    // Effect: Bypass, Effect: Change Channel AND Effect: Parameter all read 0x04; the scene flavours read 0x03;
    // Preset: Select and Preset: Increment read 0x02. So a code is a FAMILY — and the old label "Effect: Bypass
    // (inferred)" was a function name the code never carried. The MODE lives in the record (not decoded yet).
    eq(PP_ACTION_CATEGORIES[0x02], 'Preset', '0x02 is the Preset family');
    eq(PP_ACTION_CATEGORIES[0x03], 'Scene', '0x03 the Scene family');
    eq(PP_ACTION_CATEGORIES[0x04], 'Effect', '0x04 the Effect family — bypass, channel and parameter share it');
    eq(PP_ACTION_CATEGORIES[0x05], 'Tuner', '0x05 was assigned Tuner');
    eq(PP_ACTION_CATEGORIES[0x08], 'Looper', '0x08 was assigned Looper');
    eq(ppActionName(0x04), 'Effect (category — the mode is in the record)', 'and the display name says so rather than inventing a function');
    eq(ppActionName(0x02), 'Preset (category — the mode is in the record)', 'likewise for Preset');
    eq(ppActionName(0x07), 'Control Switch / Layout (unconfirmed which) (category — the mode is in the record)',
      '0x07 is measured as ONE category whose assignment the owner confirmed only as "Control Switch OR Layout" — the uncertainty is in the NAME, not hidden');
    eq(ppActionName(0x42), null, 'an unmeasured code still gets no name at all');
    eq(ppActionName(0), 'unassigned', 'and 0 still reads as unassigned');
  });

  t('a category that does not write record+0 leaves that field UNLOCATED — the bound is per FIELD', () => {
    // PP#18 (Effect: Parameter), PP#21 (Tuner), PP#22 (Looper) and PP#23 (Control Switch/Layout) left the first
    // byte of their 12-byte record at zero; PP#18 put its values at +2 and +8 instead. A zero is not an
    // observation, so the codec keeps reporting their code and REFUSES a target write, rather than offering a
    // field their category does not use. PP#14's record+0 DID hold a value (3 = a scene number, not an FX slot).
    const body = populatedSlice();
    body[POPULATED_MARKER_AT + 30] = 0x03;   // PP#14 action code — Scene
    body[POPULATED_MARKER_AT + 304] = 3;     // PP#14 record+0 — the SCENE number
    body[POPULATED_MARKER_AT + 38] = 0x04;   // PP#18 action code — Effect
    // PP#18's record+0 stays 0; its real values would sit at +2/+8, which this codec does not read.
    const page = parsePerPresetSwitches(body)!;
    eq(page.switches[13]!.actionCode, 0x03, 'PP#14 code');
    eq(page.switches[13]!.targetIndex, 3, 'PP#14 record+0 = 3');
    eq(page.switches[13]!.targetLabel, 'Chorus 2', 'and the anchor table names index 3 — CORRECTLY for an Effect action, and misleading for this Scene one, which is why the view withholds the name');
    eq(page.switches[17]!.actionCode, 0x04, 'PP#18 code');
    eq(page.switches[17]!.targetIndex, null, 'but no record+0 value is claimed for it');
    eq(patchPerPresetSwitch(body, 18, { targetIndex: 3 }), false, 'so a target write there is refused');
    eq(patchPerPresetSwitch(body, 18, { actionCode: 0x05 }), true, 'while its action code can be written');
    eq(patchPerPresetSwitch(body, 14, { targetIndex: 7 }), true, 'and PP#14 takes both fields');
  });

  t('the named PP#1 offsets ARE the table (one source of truth, no stride formula left)', () => {
    eq(PP_ACTION_OFFSET, PP_MEASURED_OFFSETS[1]!.actionCode, 'PP_ACTION_OFFSET comes from the table');
    eq(PP_TARGET_OFFSET, PP_MEASURED_OFFSETS[1]!.target, 'and so does PP_TARGET_OFFSET');
    eq(PP_MEASURED_OFFSETS[2]!.target, 160, 'PP#2 target offset — MEASURED by prediction, not by stride arithmetic');
    eq(PP_MEASURED_OFFSETS[3]!.actionCode, 8, 'PP#3 action code — stride 2 held for a third slot');
    eq(PP_MEASURED_OFFSETS[3]!.target, 172, 'PP#3 target — stride 12 held for a third slot');
    eq(PP_MEASURED_OFFSETS[4]!.target, 184, 'PP#4 target — 148 + 12×4, PREDICTED then read');
    eq(PP_MEASURED_OFFSETS[5]!.actionCode, 12, 'PP#5 action code — 4 + 2×4');
    eq(PP_MEASURED_OFFSETS[5]!.target, 196, 'PP#5 target — 148 + 12×5');
    eq(PP_MEASURED_OFFSETS[6]!.target, 208, 'PP#6 target — read in the seventh capture, predicted first');
    eq(PP_MEASURED_OFFSETS[11]!.actionCode, 24, 'PP#11 action code — 4 + 2×10');
    eq(PP_MEASURED_OFFSETS[11]!.target, 268, 'PP#11 target — 148 + 12×10');
    eq(PP_MEASURED_OFFSETS[12]!.actionCode, 26, 'PP#12 action code — 4 + 2×11');
    eq(PP_MEASURED_OFFSETS[12]!.target, 280, 'and PP#12 target — 148 + 12×11');
    eq(PP_MEASURED_OFFSETS[13]!.actionCode, 28, 'PP#13 action code — the stride continues past twelve');
    eq(PP_MEASURED_OFFSETS[13]!.target, 292, 'and PP#13 target — 148 + 12×12');
    eq(PP_MEASURED_OFFSETS[24]!.actionCode, 50, 'PP#24 action code — 4 + 2×23: the range really is 24 wide');
    eq(PP_MEASURED_OFFSETS[24]!.target, 424, 'and PP#24 target — 148 + 12×23');
    eq(PP_MEASURED_OFFSETS[14]!.actionCode, 30, 'PP#14 action code — the sweep measured 14–23 too');
    eq(PP_MEASURED_OFFSETS[14]!.target, 304, 'and PP#14 record+0 — the SCENE number lives there for a Scene action');
    eq(PP_MEASURED_OFFSETS[18]!.actionCode, 38, 'PP#18 action code is observed…');
    eq(PP_MEASURED_OFFSETS[18]!.target, undefined, '…while its record+0 is NOT: the field read zero, and a zero is not an observation');
    eq(Object.keys(PP_MEASURED_OFFSETS).length, 24, 'so all 24 switches are in the table');
    eq(Object.keys(PP_MEASURED_OFFSETS).filter((k) => PP_MEASURED_OFFSETS[Number(k)]!.target === undefined).length, 4,
      'with exactly four of them missing a located record+0 (18, 21, 22, 23 — the categories that do not write it)');
  });

  if (failures.length) throw new Error(`per-preset switches: ${failures.length} case(s) failed\n  - ${failures.join('\n  - ')}`);
}
