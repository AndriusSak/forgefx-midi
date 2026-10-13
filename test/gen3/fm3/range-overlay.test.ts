/**
 * FM3 typecode-0x52 display-bounds overlay goldens.
 *
 * `src/gen3/fm3/rangeOverlay.ts` corrects the display bounds of the 17 generated
 * rows in the typecode-0x52 class, merged at the fm3 index export point. The
 * evidence (device view-0x00 display vs the driver's own pre-range norm, one
 * session, 2026-10-13) lives beside each entry in the overlay.
 *
 * Cases:
 *   (a) the merged table differs from the generated table on EXACTLY the 17
 *       (family, paramId) pairs the overlay names — a difference-SHAPE assertion
 *       (the spelled-out set, not a count), so an unexpected extra row fails.
 *   (b) the class is DERIVED, not listed twice: the typecode-0x52/no-taper rows
 *       in the merged table are exactly the overlay's key set.
 *   (c) the WAH/3 row, served through the shared `wireToDisplay`, reproduces the
 *       UNIT's own numbers (6.06 at norm 0.6064; 10.00 at raw 65534) — the
 *       instrument's values, not a round-trip of our table.
 *   (d) `overlayIsRedundant` / `overlayFullyRedundant` report a row (and table)
 *       already carrying 0..10 as redundant, so a future corrected table can
 *       retire the overlay by test rather than by guess.
 */
import {
  FM3_RANGES,
  FM3_RANGE_OVERLAY,
  overlayIsRedundant,
  overlayFullyRedundant,
  type Fm3ParamRange,
} from '../../../src/gen3/fm3/index.js';
import { FM3_RANGES as FM3_RANGES_GENERATED } from '../../../src/gen3/fm3/ranges.generated.js';
import { wireToDisplay, displayToWire } from '../../../src/shared/index.js';

type Table = Readonly<Record<string, Readonly<Record<number, Fm3ParamRange>>>>;

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[fm3/range-overlay] ${msg}`);
}

/** Rows where two tables disagree anywhere (by value). */
function differingRows(a: Table, b: Table): string[] {
  const out: string[] = [];
  const families = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const family of families) {
    const pids = new Set([
      ...Object.keys(a[family] ?? {}),
      ...Object.keys(b[family] ?? {}),
    ]);
    for (const pid of pids) {
      const ra = a[family]?.[Number(pid)];
      const rb = b[family]?.[Number(pid)];
      if (JSON.stringify(ra) !== JSON.stringify(rb)) out.push(`${family}/${pid}`);
    }
  }
  return out.sort();
}

const cases: Array<{ name: string; run: () => void }> = [];

// (a) difference shape is exactly the overlay's set.
cases.push({
  name: 'merged-vs-generated difference set is exactly the overlay rows (17 bounds + 4 raw-is-value)',
  run: () => {
    const expected = FM3_RANGE_OVERLAY.map((e) => `${e.family}/${e.paramId}`).sort();
    assert(expected.length === 21, `overlay must carry 17 bounds rows + 4 raw-is-value rows, has ${expected.length}`);
    const actual = differingRows(FM3_RANGES, FM3_RANGES_GENERATED);
    assert(
      actual.length === expected.length && actual.every((k, i) => k === expected[i]),
      `merged table differs from generated on [${actual.join(', ')}], expected exactly ` +
        `[${expected.join(', ')}]`,
    );
    // Every corrected row reads 0..10 — and the generated one did not.
    for (const entry of FM3_RANGE_OVERLAY.filter((e) => !e.valueMap)) {
      const merged = FM3_RANGES[entry.family]?.[entry.paramId];
      assert(merged !== undefined, `${entry.family}/${entry.paramId}: missing from merged table`);
      assert(
        merged.displayMin === 0 && merged.displayMax === 10,
        `${entry.family}/${entry.paramId}: merged bounds ${merged.displayMin}..${merged.displayMax}, expected 0..10`,
      );
      const gen = FM3_RANGES_GENERATED[entry.family]?.[entry.paramId];
      assert(
        gen !== undefined && !(gen.displayMin === 0 && gen.displayMax === 10),
        `${entry.family}/${entry.paramId}: generated row already 0..10 — overlay no longer needed here`,
      );
    }
  },
});

// (b) the class is derived, not listed twice.
cases.push({
  name: 'typecode-0x52/no-taper set equals the overlay key set',
  run: () => {
    const derived: string[] = [];
    for (const [family, rows] of Object.entries(FM3_RANGES)) {
      for (const [pid, r] of Object.entries(rows)) {
        if (r.typecode === 0x52 && !r.taper) derived.push(`${family}/${pid}`);
      }
    }
    derived.sort();
    const overlayKeys = FM3_RANGE_OVERLAY.filter((e) => !e.valueMap).map((e) => `${e.family}/${e.paramId}`).sort();
    assert(
      derived.length === overlayKeys.length && derived.every((k, i) => k === overlayKeys[i]),
      `derived typecode-0x52/no-taper class [${derived.join(', ')}] != overlay keys ` +
        `[${overlayKeys.join(', ')}]`,
    );
  },
});

// (c) WAH/3 reproduces the UNIT's numbers through the shared display resolver.
cases.push({
  name: 'WAH/3 serves the instrument values 6.06 (norm 0.6064) and 10.00 (raw 65534)',
  run: () => {
    const row = FM3_RANGES.WAH?.[3];
    assert(row !== undefined, 'WAH/3 (Resonance Q) must exist in the merged table');
    const opts = {
      displayMin: row!.displayMin,
      displayMax: row!.displayMax,
      displayScale: 'linear' as const,
    };
    // The unit read 6.06 at norm 0.6064. Reconstruct the raw the driver would
    // have divided: norm = raw / 65534 (gen3.ts `#display`), rounded to a byte.
    const raw = Math.round(0.6064 * 65534);
    const norm = raw / 65534;
    assert(
      Math.abs(norm - 0.6064) <= 1e-4,
      `WAH/3 probe raw ${raw} gives norm ${norm}, expected ~0.6064`,
    );
    const served = wireToDisplay(raw, opts);
    assert(
      Math.abs(served - 6.06) <= 0.005,
      `WAH/3 at norm ${norm.toFixed(6)}: wireToDisplay gave ${served.toFixed(4)}, expected the unit's 6.06 (±0.005)`,
    );
    const maxServed = wireToDisplay(65534, opts);
    assert(
      Math.abs(maxServed - 10.0) <= 0.005,
      `WAH/3 at raw 65534: wireToDisplay gave ${maxServed.toFixed(4)}, expected the unit's 10.00 (±0.005)`,
    );
  },
});

// (d) the redundancy predicate: a corrected row/table is reported redundant.
cases.push({
  name: 'overlayIsRedundant/overlayFullyRedundant report a 0..10 table as redundant',
  run: () => {
    const entry = FM3_RANGE_OVERLAY.find((e) => e.family === 'WAH' && e.paramId === 3);
    assert(entry !== undefined, 'overlay must name WAH/3');
    assert(
      overlayIsRedundant(entry!, FM3_RANGES.WAH?.[3]) === true,
      'WAH/3 in the merged table carries 0..10 and must be reported redundant',
    );
    assert(
      overlayIsRedundant(entry!, FM3_RANGES_GENERATED.WAH?.[3]) === false,
      'WAH/3 in the generated table does NOT carry 0..10 and must NOT be redundant',
    );
    assert(
      overlayFullyRedundant(FM3_RANGES) === true,
      'the merged table satisfies every overlay entry — must be fully redundant',
    );
    assert(
      overlayFullyRedundant(FM3_RANGES_GENERATED) === false,
      'the generated table does not satisfy the overlay — must NOT be fully redundant',
    );
  },
});

// (e) the four raw-is-value rows: marked 'identity', bounds UNCHANGED, each reproduces the unit's readout.
// Evidence (2026-10-13, probe-bounds-violations.json).
const RAW_VALUE_ROWS: Array<[string, number, number, number, number, number]> = [
  // family, pid, raw, unit display, declared min, declared max
  ['CONTROLLERS', 32, 120, 120, 24, 250],
  ['CONTROLLERS', 36, 8, 8, 2, 32],
  ['GLOBAL', 67, 3, 3, 1, 12],
  ['REVERB', 67, 1, 1, 0, 3],
];
cases.push({
  name: 'the four raw-is-value rows are identity-mapped, keep their declared bounds, and read the unit values',
  run: () => {
    const marked = FM3_RANGE_OVERLAY.filter((e) => e.valueMap === 'identity')
      .map((e) => `${e.family}/${e.paramId}`).sort();
    const want = RAW_VALUE_ROWS.map(([f, p]) => `${f}/${p}`).sort();
    assert(JSON.stringify(marked) === JSON.stringify(want), `identity-marked rows [${marked}] != measured [${want}]`);
    // And NO other merged row carries a valueMap.
    for (const [family, rows] of Object.entries(FM3_RANGES)) {
      for (const [pid, r] of Object.entries(rows)) {
        if (r.valueMap && !want.includes(`${family}/${pid}`)) throw new Error(`unmeasured row ${family}/${pid} carries valueMap`);
      }
    }
    for (const [family, pid, raw, display, min, max] of RAW_VALUE_ROWS) {
      const row = FM3_RANGES[family]?.[pid];
      assert(row !== undefined && row.valueMap === 'identity', `${family}/${pid}: merged row must be identity`);
      assert(row!.displayMin === min && row!.displayMax === max, `${family}/${pid}: declared bounds must be unchanged`);
      const gen = FM3_RANGES_GENERATED[family]?.[pid] as Fm3ParamRange;
      assert(gen.valueMap === undefined && gen.displayMin === min && gen.displayMax === max, `${family}/${pid}: generated row untouched`);
      const opts = { displayMin: row!.displayMin, displayMax: row!.displayMax, displayScale: 'identity' as const };
      assert(wireToDisplay(raw, opts) === display, `${family}/${pid}: raw ${raw} must read the unit's ${display}`);
      assert(displayToWire(display, opts) === raw, `${family}/${pid}: ${display} must write back raw ${raw}`);
      // The defect, pinned: the normalised reading of that raw is NOT the unit's number.
      const old = wireToDisplay(raw, { displayMin: min, displayMax: max });
      assert(Math.abs(old - display) > 0.5, `${family}/${pid}: normalised reading ${old} unexpectedly equals the unit's ${display}`);
    }
    // redundancy predicate sees valueMap: a base lacking it is NOT redundant for an identity entry.
    const e = FM3_RANGE_OVERLAY.find((x) => x.family === 'CONTROLLERS' && x.paramId === 32)!;
    assert(!overlayIsRedundant(e, FM3_RANGES_GENERATED.CONTROLLERS?.[32]), 'generated Tempo (no valueMap) must not be redundant');
    assert(overlayIsRedundant(e, FM3_RANGES.CONTROLLERS?.[32]), 'merged Tempo must be redundant');
  },
});

// (f) the write-validation marker: the four identity rows' READS are all measured, but only Tempo's WRITE
// was exercised on the unit — so exactly one carries `writeValidated`, and the other three must NOT read as
// validated. This keeps "we measured the read" from being mistaken for "we validated the write".
cases.push({
  name: 'only Tempo is writeValidated; the other three identity rows are NOT marked validated',
  run: () => {
    const identity = FM3_RANGE_OVERLAY.filter((e) => e.valueMap === 'identity').map((e) => `${e.family}/${e.paramId}`);
    assert(identity.length === 4, `expected 4 identity rows, got ${identity.length}: [${identity.join(', ')}]`);
    const validated = FM3_RANGE_OVERLAY.filter((e) => e.writeValidated === true).map((e) => `${e.family}/${e.paramId}`);
    assert(
      JSON.stringify(validated) === JSON.stringify(['CONTROLLERS/32']),
      `exactly CONTROLLERS/32 (Tempo) must carry writeValidated; got [${validated.join(', ')}]`,
    );
    // Spell out the three that must NOT be marked, so a later "all four validated" claim fails here.
    for (const key of ['CONTROLLERS/36', 'GLOBAL/67', 'REVERB/67']) {
      const [fam, pid] = key.split('/');
      const entry = FM3_RANGE_OVERLAY.find((e) => e.family === fam && e.paramId === Number(pid));
      assert(entry !== undefined && entry.valueMap === 'identity', `${key} must still be an identity row`);
      assert(entry!.writeValidated !== true, `${key}'s write is NOT hardware-validated — must not be marked`);
    }
    // The marker is carried into the merged table (so a runtime reader sees it, not just the overlay).
    assert(FM3_RANGES.CONTROLLERS?.[32]?.writeValidated === true, 'merged Tempo row must carry writeValidated');
    assert(FM3_RANGES.CONTROLLERS?.[36]?.writeValidated !== true, 'merged Stages row must NOT carry writeValidated');
    assert(FM3_RANGES.GLOBAL?.[67]?.writeValidated !== true, 'merged Bank Size row must NOT carry writeValidated');
    assert(FM3_RANGES.REVERB?.[67]?.writeValidated !== true, 'merged TONETYPE row must NOT carry writeValidated');
    // Retiring the overlay must not silently drop the marker: a base with the mapping but no marker is not
    // redundant for the Tempo entry.
    const tempo = FM3_RANGE_OVERLAY.find((e) => e.family === 'CONTROLLERS' && e.paramId === 32)!;
    const withMapNoMarker: Fm3ParamRange = { ...(FM3_RANGES.CONTROLLERS![32]!), writeValidated: undefined } as Fm3ParamRange;
    delete (withMapNoMarker as { writeValidated?: boolean }).writeValidated;
    assert(
      overlayIsRedundant(tempo, withMapNoMarker) === false,
      'a base carrying valueMap but not writeValidated is NOT redundant for the Tempo entry',
    );
  },
});

export const RANGE_OVERLAY_CASE_COUNT = cases.length;

export function runRangeOverlayTests(): void {
  for (const c of cases) {
    try {
      c.run();
    } catch (err) {
      throw new Error(`case '${c.name}': ${(err as Error).message}`);
    }
  }
}
