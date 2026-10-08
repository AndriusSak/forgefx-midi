/**
 * FM3 wire-unit marker — guards the hand-maintained catalogue fact that the GLOBAL family's
 * continuous SET value is in DISPLAY units, not the default 0..1 normalized fraction.
 *
 * The measurement and its evidence live in `src/gen3/fm3/params.ts` (FM3_DISPLAY_UNIT_FAMILIES).
 * This suite only locks the SHAPE the server consumes + the display range the norm→display
 * conversion depends on, so a regeneration or a careless edit cannot silently widen or drop it.
 */
import {
  FM3_DISPLAY_UNIT_FAMILIES,
  fm3WireUnitsAreDisplay,
} from '../../../src/gen3/fm3/params.js';
import { FM3_RANGES } from '../../../src/gen3/fm3/ranges.generated.js';

export const FM3_WIRE_UNITS_CASE_COUNT = 3;

export function runFm3WireUnitsTests(): void {
  const fail = (msg: string): never => { throw new Error(`[fm3/wire-units] ${msg}`); };

  // 1. GLOBAL is marked exactly once; nothing else is (only GLOBAL has measured evidence).
  if (!FM3_DISPLAY_UNIT_FAMILIES.has('GLOBAL')) fail("FM3_DISPLAY_UNIT_FAMILIES must contain 'GLOBAL'");
  if (FM3_DISPLAY_UNIT_FAMILIES.size !== 1) {
    fail(`expected exactly one marked family, got ${FM3_DISPLAY_UNIT_FAMILIES.size}: ${[...FM3_DISPLAY_UNIT_FAMILIES].join(', ')}`);
  }

  // 2. The predicate is total: a marked family is true, an unknown/absent family is false (never throws).
  if (!fm3WireUnitsAreDisplay('GLOBAL')) fail("fm3WireUnitsAreDisplay('GLOBAL') must be true");
  if (fm3WireUnitsAreDisplay('CABINET')) fail("fm3WireUnitsAreDisplay('CABINET') must be false");
  if (fm3WireUnitsAreDisplay(undefined)) fail('fm3WireUnitsAreDisplay(undefined) must be false');

  // 3. The display range the norm→display conversion uses is the measured 0..100 for both
  //    measured params (raw 65534 == 100%).
  for (const pid of [7115, 7116]) {
    const r = FM3_RANGES.GLOBAL?.[pid];
    if (!r || r.kind !== 'float' || r.displayMin !== 0 || r.displayMax !== 100) {
      fail(`GLOBAL/${pid} display range must be a 0..100 float, got ${JSON.stringify(r)}`);
    }
  }
}
