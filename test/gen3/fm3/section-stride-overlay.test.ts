/**
 * FM3 fn=0x1F channel-block WIRE STRIDE overlay goldens.
 *
 * `src/gen3/fm3/sectionStrideOverlay.ts` corrects three generated family rows whose declared stride does
 * not describe the body the device sends; the evidence (the fn=0x1F head's own itemCount per family, plus
 * a marker write read back through the UNsliced body) lives beside each entry in the overlay and in
 * `ForgeFX/server/test/drivers/channel-slice-stride.test.ts`, which pins the consumer-side behaviour.
 *
 * Cases:
 *   (a) the merged table differs from the generated table on EXACTLY the three named families — a
 *       difference-SHAPE assertion (the spelled-out set, not a count), so an unexpected extra override
 *       fails rather than being absorbed.
 *   (b) each corrected row: the merged stride equals the overlay's, the measured body is exactly 4x it,
 *       AND the GENERATED stride does NOT divide that body — i.e. the generated row really is wrong for
 *       the body it is used on (otherwise the override would be unjustified).
 *   (c) every family the measurement found CORRECT is carried through untouched, and its generated stride
 *       divides its measured body — the control that this overlay is not "correct everything".
 *   (d) idempotence + retirement: re-applying to the merged table is a no-op, `...FullyRedundant` is FALSE
 *       for the generated table and TRUE for the merged one, so upstream's correction can retire this
 *       overlay by test rather than by guess.
 *   (e) a family the overlay names but the base table lacks is NOT invented, and every named family DOES
 *       exist in the generated table — a typo'd family would otherwise make an entry silently do nothing.
 */
import {
  FM3_RANGE_SECTIONS,
  FM3_SECTION_STRIDE_OVERLAY,
  applyFm3SectionStrideOverlay,
  sectionStrideEntryIsRedundant,
  sectionStrideOverlayFullyRedundant,
  type Fm3SectionTable,
} from '../../../src/gen3/fm3/index.js';
import { FM3_RANGE_SECTIONS as GENERATED } from '../../../src/gen3/fm3/ranges.generated.js';

export const SECTION_STRIDE_OVERLAY_CASE_COUNT = 5;

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[fm3/section-stride-overlay] ${msg}`);
}
function assertEqual<T>(got: T, want: T, msg: string): void {
  if (got !== want) throw new Error(`[fm3/section-stride-overlay] ${msg} — expected ${String(want)}, got ${String(got)}`);
}

/** Families whose `stride` differs between two tables (by value). */
function differingFamilies(a: Fm3SectionTable, b: Fm3SectionTable): string[] {
  const out: string[] = [];
  for (const family of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[family]) !== JSON.stringify(b[family])) out.push(family);
  }
  return out.sort();
}

/** Families the measurement found CORRECT: family -> the body size logged from the unit (2026-10-13). */
const MEASURED_CORRECT: Readonly<Record<string, number>> = {
  DISTORT: 576, REVERB: 284, COMP: 148, PHASER: 140, CABINET: 424, INPUT: 40, OUTPUT: 104,
};

export async function runSectionStrideOverlayTests(): Promise<void> {
  // ── (a) the difference is EXACTLY the overlay's key set (spelled out, so an extra override fails). ──
  {
    const want = FM3_SECTION_STRIDE_OVERLAY.map((e) => e.family).sort();
    assertEqual(want.join(','), 'CHORUS,DELAY,FUZZ', 'the overlay names the three measured-bad families');
    assertEqual(differingFamilies(GENERATED, FM3_RANGE_SECTIONS).join(','), want.join(','),
      'the merged table differs from the generated one on exactly those families');
  }

  // ── (b) each corrected row is justified by its own body: 4x the corrected stride, not divisible by
  //        the generated one. ──
  {
    for (const e of FM3_SECTION_STRIDE_OVERLAY) {
      assertEqual(FM3_RANGE_SECTIONS[e.family]?.stride, e.stride, `${e.family} carries the corrected stride`);
      assertEqual(GENERATED[e.family]?.stride, e.generatedStride, `${e.family} generated row still says ${e.generatedStride}`);
      assertEqual(e.measuredItemCount, e.stride * 4, `${e.family}: the measured body is 4x its corrected stride`);
      assert(e.measuredItemCount % e.generatedStride !== 0,
        `${e.family}: the generated stride ${e.generatedStride} must NOT divide the measured body ${e.measuredItemCount} — otherwise the override is unjustified`);
      assertEqual(FM3_RANGE_SECTIONS[e.family]?.recordCount, GENERATED[e.family]?.recordCount,
        `${e.family}: recordCount is carried through (cache-side declaration, no wire evidence to move it)`);
      assertEqual(FM3_RANGE_SECTIONS[e.family]?.sectionTag, GENERATED[e.family]?.sectionTag,
        `${e.family}: sectionTag is carried through`);
    }
  }

  // ── (c) control: the families the measurement found correct are untouched, and each divides its body. ──
  {
    for (const [family, itemCount] of Object.entries(MEASURED_CORRECT)) {
      const stride = GENERATED[family]?.stride;
      assertEqual(FM3_RANGE_SECTIONS[family]?.stride, stride, `${family} is NOT overridden (measured correct)`);
      assertEqual(itemCount % (stride ?? 0), 0, `${family}: its generated stride divides its measured body (${itemCount})`);
      assertEqual(itemCount / (stride ?? 1), 4, `${family}: the measured body is 4x its stride`);
    }
  }

  // ── (d) idempotence + the retirement signal. ──
  {
    const twice = applyFm3SectionStrideOverlay(FM3_RANGE_SECTIONS);
    assertEqual(differingFamilies(twice, FM3_RANGE_SECTIONS).length, 0, 're-applying the overlay is a no-op');
    assertEqual(sectionStrideOverlayFullyRedundant(GENERATED), false, 'the generated table is NOT yet redundant');
    assertEqual(sectionStrideOverlayFullyRedundant(FM3_RANGE_SECTIONS), true, 'the merged table IS redundant (upstream corrected => overlay deletable)');
    const fuzz = FM3_SECTION_STRIDE_OVERLAY.find((e) => e.family === 'FUZZ')!;
    assertEqual(sectionStrideEntryIsRedundant(FM3_RANGE_SECTIONS, fuzz), true, 'a corrected row reports redundant');
    assertEqual(sectionStrideEntryIsRedundant(GENERATED, fuzz), false, 'a still-wrong row reports not redundant');
  }

  // ── (e) no invention, no silent no-op. ──
  {
    for (const e of FM3_SECTION_STRIDE_OVERLAY) {
      assert(GENERATED[e.family] !== undefined,
        `${e.family} exists in the generated table (a typo would otherwise make the entry silently do nothing)`);
    }
    const trimmed: Fm3SectionTable = Object.fromEntries(
      Object.entries(GENERATED).filter(([k]) => k !== 'CHORUS')
    );
    const applied = applyFm3SectionStrideOverlay(trimmed);
    assertEqual(applied['CHORUS'], undefined, 'a family the base table lacks is not invented');
    assertEqual(applied['FUZZ']?.stride, 44, 'the other entries still apply');
    assertEqual(GENERATED['FUZZ']?.stride, 43, 'the generated table is not mutated in place');
  }
}
