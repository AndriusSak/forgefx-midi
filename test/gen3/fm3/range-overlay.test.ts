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
import { wireToDisplay } from '../../../src/shared/index.js';

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
  name: 'merged-vs-generated difference set is exactly the 17 overlay rows',
  run: () => {
    const expected = FM3_RANGE_OVERLAY.map((e) => `${e.family}/${e.paramId}`).sort();
    const actual = differingRows(FM3_RANGES, FM3_RANGES_GENERATED);
    assert(
      actual.length === expected.length && actual.every((k, i) => k === expected[i]),
      `merged table differs from generated on [${actual.join(', ')}], expected exactly ` +
        `[${expected.join(', ')}]`,
    );
    // Every corrected row reads 0..10 — and the generated one did not.
    for (const entry of FM3_RANGE_OVERLAY) {
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
    const overlayKeys = FM3_RANGE_OVERLAY.map((e) => `${e.family}/${e.paramId}`).sort();
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
