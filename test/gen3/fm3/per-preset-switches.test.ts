// The PER-PRESET SWITCH block (§3.8), decoded from a preset body.
//
// WHAT THIS SUITE CAN AND CANNOT PROVE. The block's geometry was never captured populated: the committed
// preset-410 fixture holds the marker at body offset **11420** with the whole region after it ZERO, so the
// one thing the real bytes show is an UNCONFIGURED block. Everything else here is a round trip through our
// own patch/parse pair — which proves the two agree on the documented offsets, and proves NOTHING about how
// the unit interprets them. Those are different claims and the names below keep them apart.
//
// The slice below is byte-identical to body[11380..11600] of that fixture: 220 bytes, all zero except the
// marker pair at +40 (absolute 11420). It is written out rather than padded so the marker's position in the
// region is visible at a glance.
import {
  findPerPresetSwitchBlock,
  parsePerPresetSwitches,
  patchPerPresetSwitch,
  ppActionName,
  ppTargetLabel,
  ppWritable,
  PP_MEASURED_OFFSETS,
  PP_ACTION_OFFSET,
  PP_TARGET_OFFSET,
  PP_SWITCH_COUNT,
} from '../../../src/devices/gen3/index.js';

export const PER_PRESET_SWITCH_CASE_COUNT = 14;

/** body[11380..11600] of preset 410, verbatim: zeros with the 0x05F5/0x0001 marker at region offset 40. */
function realSlice(): Uint8Array {
  const s = new Uint8Array(220);
  s[40] = 0xf5; s[41] = 0x05;   // u16 0x05F5
  s[42] = 0x01; s[43] = 0x00;   // u16 0x0001
  return s;
}

/**
 * body[11412..11588] of the SAME preset captured LATER, with PP#1 (Effect: Bypass → Filter 4) and PP#2
 * (Scene: Select) configured — verbatim: the marker at region offset 8 and exactly four non-zero bytes
 * (marker+4 = 4, marker+6 = 3, marker+148 = 20, marker+160 = 1). Those four offsets are precisely the ones
 * a two-fixture differential moved, which is the evidence behind `evidence.actionCodesMeasured = 2`.
 */
function populatedSlice(): Uint8Array {
  const s = new Uint8Array(176);
  s[8] = 0xf5; s[9] = 0x05; s[10] = 0x01; s[11] = 0x00; // marker (region +8)
  s[12] = 0x04;  // PP#1 action code — Effect: Bypass
  s[14] = 0x03;  // PP#2 action code — Scene: Select
  s[156] = 20;   // PP#1 target byte — index 20 = "Filter 4"
  s[168] = 1;    // the byte the model does NOT explain (region +168) — kept so the slice stays verbatim
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
    eq(page.switches[0]!.confidence, 'measured', 'PP#1: both offsets observed');
    eq(page.switches[1]!.confidence, 'partial', 'PP#2: action code observed, target byte NOT located');
    eq(page.switches[1]!.actionCode, 0x03, 'so its action code is reported');
    eq(page.switches[1]!.targetIndex, null, 'and its target byte is NULL, not a value read from marker+149');
    eq(page.switches[1]!.targetLabel, null, 'with no label either');
    for (const s of page.switches.slice(2)) {
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

  t('an unwritten field keeps its value (a target-only write leaves the action code alone)', () => {
    const body = realSlice();
    patchPerPresetSwitch(body, 1, { actionCode: 0x03 });
    patchPerPresetSwitch(body, 1, { targetIndex: 1 });
    const pp1 = parsePerPresetSwitches(body)!.switches[0]!;
    eq(pp1.actionCode, 0x03, 'the action code survived the second write');
    eq(pp1.targetIndex, 1, 'and the target landed');
  });

  t('an index past PP#1 is REFUSED — its offset has never been observed', () => {
    const body = realSlice();
    const before = Uint8Array.from(body);
    eq(patchPerPresetSwitch(body, 2, { targetIndex: 51 }), false, 'PP#2 is refused');
    eq(patchPerPresetSwitch(body, 99, { targetIndex: 51 }), false, 'and so is an out-of-range index');
    eq(Array.from(body).join(','), Array.from(before).join(','), 'and NOTHING was written');
  });

  t('no marker → no block (never a synthesised one); a marker at the very end is refused too', () => {
    eq(parsePerPresetSwitches(new Uint8Array(400)), undefined, 'an empty body has no block');
    // the bound is the one MEASURED field: PP#1's target byte must be inside the body. A marker whose
    // target byte falls off the end is not this block, and reading it would invent twelve rows.
    const tail = new Uint8Array(PP_TARGET_OFFSET);
    tail[0] = 0xf5; tail[1] = 0x05; tail[2] = 0x01; tail[3] = 0x00; // marker at 0, target byte past the end
    eq(parsePerPresetSwitches(tail), undefined, 'a marker too close to the end is not treated as the block');
  });

  t('an UNMEASURED target index reports no name rather than a plausible one', () => {
    eq(ppTargetLabel(51), 'Reverb 1', 'a measured anchor resolves');
    eq(ppTargetLabel(0), 'Amp 1', 'including the first one');
    eq(ppTargetLabel(8), 'Delay 2', 'and the later one (Delay 1 = 7 → Delay 2 = 8: instances are consecutive)');
    eq(ppTargetLabel(9), null, 'index 9 is inside the unlabelled band → null, not a guess');
    eq(ppTargetLabel(50), null, 'and so is any other unmeasured index');
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
    eq(pp2.confidence, 'partial', 'PP#2 has an observed action code but no located target byte');
  });

  t('the page reports HOW FAR the evidence goes, per field', () => {
    const page = parsePerPresetSwitches(populatedSlice())!;
    eq(page.evidence.actionCodesMeasured, 2, 'two action codes were confirmed by the two-fixture differential');
    eq(page.evidence.targetBytesMeasured, 1, 'but only ONE target byte ever has been');
    // and the row-level view stays as conservative as the evidence: PP#1 measured, the rest not.
    eq(page.switches.filter((s) => s.confidence === 'measured').length, 1, 'only PP#1 is marked measured');
  });

  t('writing PP#1 leaves PP#2 untouched', () => {
    const body = populatedSlice();
    if (!patchPerPresetSwitch(body, 1, { targetIndex: 51 })) throw new Error('patch refused');
    const page = parsePerPresetSwitches(body)!;
    eq(page.switches[0]!.targetIndex, 51, 'PP#1 moved');
    eq(page.switches[1]!.actionCode, 0x03, 'PP#2 action code is intact');
    // PP#2's target byte is UNLOCATED, so there is nothing to check — and nothing was written for it.
    eq(page.switches[1]!.targetIndex, null, 'PP#2 still reports no target (its offset is unknown)');
    eq(body[PP_TARGET_OFFSET + 1], 0, 'and the byte at marker+149 was NOT touched by the PP#1 write');
  });

  t('ppWritable answers per FIELD, straight from the offset table', () => {
    eq(ppWritable(1).any, true, 'PP#1 can be written');
    eq(ppWritable(1).target, true, 'including its target byte');
    eq(ppWritable(2).any, true, 'PP#2 can have its ACTION CODE written (that offset is observed)');
    eq(ppWritable(2).target, false, 'but NOT its target byte — that offset has never been located');
    eq(ppWritable(3).any, false, 'PP#3 has no observed offset at all');
    eq(ppWritable(3).target, false, 'so nothing about it may be written');
  });

  t('a patch with NO fields is refused, and a refused patch writes NOTHING', () => {
    const body = populatedSlice();
    const before = Array.from(body).join(',');
    eq(patchPerPresetSwitch(body, 1, {}), false, 'an empty patch is refused (it is a no-op, not a success)');
    // an index whose target offset is unlocated, asked for a TARGET write: refused whole, not half-applied
    eq(patchPerPresetSwitch(body, 2, { actionCode: 0x04, targetIndex: 51 }), false, 'PP#2 + target is refused');
    eq(Array.from(body).join(','), before, 'and NOTHING was written — no partial patch');
  });

  t('the named PP#1 offsets ARE the table (one source of truth, no stride formula left)', () => {
    eq(PP_ACTION_OFFSET, PP_MEASURED_OFFSETS[1]!.actionCode, 'PP_ACTION_OFFSET comes from the table');
    eq(PP_TARGET_OFFSET, PP_MEASURED_OFFSETS[1]!.target, 'and so does PP_TARGET_OFFSET');
    eq(PP_MEASURED_OFFSETS[2]!.target, undefined, 'PP#2 deliberately has NO target offset (refuted stride)');
  });

  if (failures.length) throw new Error(`per-preset switches: ${failures.length} case(s) failed\n  - ${failures.join('\n  - ')}`);
}
