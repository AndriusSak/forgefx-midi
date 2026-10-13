/**
 * W5.1 red/green — gen-3 convert taper must mirror the LIVE server rule.
 *
 * The live server (ForgeFX/server/src/drivers/gen3.ts #display) decides the
 * taper from the DEVICE-TRUE range row: an explicit `range.taper` wins
 * ('log' → log10), otherwise the typecode-nibble heuristic — which counts ONLY
 * nibble 4: `(typecode >> 4) & 0xf === 4` ⇒ log10 (guarded by displayMin > 0).
 * Nibble 5 is a MEASURED FALSE POSITIVE and must NOT imply log.
 *
 * The convert resolver instead read `param.scaling === 'log10'`, which most
 * FM3 catalog rows do not carry — so `delay.locut` (typecode 0x241, nibble 4,
 * displayMin 20) rendered linear offline but log live.
 *
 * R20 additions (2026-10-13):
 *   - the resolver must consume the OVERLAY-corrected FM3 ranges, not the
 *     generated table: `wah.q` (typecode 0x52) must be 0..10, NOT the old
 *     20..200;
 *   - a nibble-5 row must report LINEAR (the false-positive fix);
 *   - an overlay 'identity' row (CONTROLLERS/Tempo) must resolve its declared
 *     bounds through the same import path.
 */
import { resolveTargetRange } from '../../src/convert/targetRanges.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`gen3-taper: ${msg}`);
}

// Hand-kept; check-case-counts.ts reports 0 (this suite uses assert(), not `it`/`{`).
export const GEN3_TAPER_CASE_COUNT = 8;

export function runGen3TaperTests(): void {
  // delay.locut: FM3 device-true typecode 0x241 → nibble 4 → log10.
  const locut = resolveTargetRange('fm3', 'delay', 'locut');
  assert(locut !== undefined, 'fm3 delay locut range missing');
  assert(
    locut!.min === 20 && locut!.max === 2000,
    `fm3 delay locut expected 20..2000, got ${JSON.stringify(locut)}`,
  );
  assert(
    locut!.log === true,
    `fm3 delay locut must report log === true (typecode 0x241 → nibble 4); got ${JSON.stringify(locut)}`,
  );

  // delay.hicut: typecode 0x240 → nibble 4 → log10.
  const hicut = resolveTargetRange('fm3', 'delay', 'hicut');
  assert(
    hicut!.log === true,
    `fm3 delay hicut must report log === true (typecode 0x240 → nibble 4); got ${JSON.stringify(hicut)}`,
  );

  // A non-log device-true range must stay linear (no false positives).
  const cabLevel = resolveTargetRange('fm3', 'cab', 'level');
  assert(
    cabLevel!.log !== true,
    `fm3 cab level (typecode 0x162 → nibble 6) must stay linear; got ${JSON.stringify(cabLevel)}`,
  );

  // The rule is not delay-specific: amp Bright Cap (typecode 0x841 → nibble 4)
  // must be log too — this param's catalog row DOES carry scaling:'log10', so a
  // genuine range-driven taper is what the test pins.
  const brightCap = resolveTargetRange('fm3', 'amp', 'brightcap');
  assert(
    brightCap !== undefined && brightCap.log === true,
    `fm3 amp brightcap (typecode 0x841 → nibble 4) must report log === true; got ${JSON.stringify(brightCap)}`,
  );

  // ── R20: the converter must see the OVERLAY bounds, not the generated table ──
  // wah.q is WAH/3 (typecode 0x52 → nibble 5). The generated row was 20..200;
  // the corrected (overlay) row is 0..10. Before the fix this returned
  // {min:20,max:200,log:true}; an incoming value of 6 clamped to 20 → norm 0.
  const wahQ = resolveTargetRange('fm3', 'wah', 'q');
  assert(
    wahQ !== undefined && wahQ.min === 0 && wahQ.max === 10,
    `fm3 wah q must resolve the overlay bounds 0..10 (not 20..200); got ${JSON.stringify(wahQ)}`,
  );
  // nibble 5 is the measured FALSE POSITIVE — it must NOT imply log. (The 0
  // displayMin alone already forces linear here, but the taper flag must be
  // absent for the right reason; the parser check below pins nibble 5 directly.)
  assert(
    wahQ!.log !== true,
    `fm3 wah q (typecode 0x52 → nibble 5) must stay LINEAR; got ${JSON.stringify(wahQ)}`,
  );

  // An overlay 'identity' row (Tempo: declared 24..250) must resolve through the
  // same corrected import — proving the resolver's source is the fm3 index export.
  const tempo = resolveTargetRange('fm3', 'controllers', 'tempo');
  assert(
    tempo !== undefined && tempo.min === 24 && tempo.max === 250,
    `fm3 controllers tempo (identity row) must resolve 24..250; got ${JSON.stringify(tempo)}`,
  );

  // ── R20: nibble 5 must NOT imply log — pinned on a row the FM3 overlay does
  // NOT touch (so this tests the nibble rule itself, independent of min=0).
  // FM9 CHORUS_DRIVE: typecode 0x52 → nibble 5, NO explicit taper, generated
  // min 0.5 (> 0). Before the nibble fix this returned log:true; the server
  // (nibble-4-only) says linear.
  const fm9ChorusDrive = resolveTargetRange('fm9', 'chorus', 'drive');
  assert(
    fm9ChorusDrive !== undefined && fm9ChorusDrive.log !== true,
    `fm9 chorus drive (typecode 0x52 → nibble 5) must stay LINEAR, not log; got ${JSON.stringify(fm9ChorusDrive)}`,
  );
}
