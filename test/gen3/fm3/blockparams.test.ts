/**
 * FM3 generic block-param extraction — live-hardware goldens.
 *
 * Fixtures under fixtures/ were captured from a REAL FM3 through the
 * pre-migration ForgeFX server (migration Phase 0): `preset-<n>.syx` is the
 * raw 0x77/0x78/0x79 dump, `preset-<n>.params.expected.json` is the exact
 * decode its live-validated implementation produced. This suite re-decodes
 * every dump through the package pipeline (parsePresetDump → decodeRawPatch →
 * decodeGen3Body grid → readBlockParams) and requires field-exact equality —
 * it validates BOTH the upstreamed extraction logic and the package grid
 * decode's placed-block set against the live implementation.
 *
 * GOLDEN REFRESH 2026-10-13 — valueMap 'identity' in the OFFLINE decoder (defect A)
 * --------------------------------------------------------------------------------
 * The goldens were re-emitted OFFLINE (never hand-edited) by
 * `scripts/refresh-fm3-blockparams-goldens.ts`, which runs the SAME pipeline this suite
 * runs. The offline decoder used to map EVERY float row as a normalized position over
 * [displayMin, displayMax], ignoring the range overlay's `valueMap` — so the DUMP decode
 * (`readBlockParams`, the server's `#decodeBlocks` path) carried the defect the LIVE path
 * had already fixed in `e9fa1a6`. `decodeOne` now reads an `identity` row (display == raw)
 * the way the live server's `#display` does, keyed off the row so no (family, paramId) is
 * special-cased.
 *
 * Changed golden entries — ALL ten on the SAME identity row, REVERB/67 REVERB_TONETYPE
 * (placed at effectId 66), and NOTHING else (byte-identical elsewhere; the set was diffed
 * with `git diff --numstat`, 10 added / 10 removed, and position-aligned per param):
 *   - value: 0.00004577776421399579 -> 1   (preset-5, preset-67 — the two fixtures whose
 *     raw is 1; the other six hold raw 0, where identity and normalized already agree).
 *     WHY 1 IS RIGHT: the unit's OWN display string (self-describe view 0x00) for this row
 *     read a bare `1` at raw 1 — `ForgeFX/server/scripts/probe-formatted-value.ts
 *     --eid 66 --pids 67,68,69,70,71`, 2026-10-13. The old value was raw/65534 of a 0..3
 *     span, i.e. the normalized reading of a field that carries the value itself.
 *   - unit: "db" -> "numeric" (all ten fixtures; REVERB/67 is placed everywhere).
 *     WHY 'numeric' IS RIGHT: the same probe shows the row displays a BARE number with NO
 *     unit — the old `db` (its own comment said "inferred from AM4") made the UI render
 *     "1 dB" for a unitless tone-type selector.
 * `REVERB_PREDLYTAP` (paramId 68) is NOT touched: its unit/name/id were left as-is (a name
 * change needs the owner's hardware and a name oracle — see the PID-68 note in params.ts).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePresetDump } from '../../../src/devices/gen3/presetDump.js';
import { decodeRawPatch } from '../../../src/devices/gen3/presetHuffman.js';
import { decodeGen3Body } from '../../../src/devices/gen3/presetBody.js';
import {
  readBlockParamsForModel,
  gen3BlockParamModel,
  hasBlockParamModel,
  modelsFromBlocks,
} from '../../../src/devices/gen3/blockParams.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FM3 = 0x11;

function listPresetFixtures(): number[] {
  return readdirSync(FIXTURES)
    .map((f) => /^preset-(\d+)\.syx$/.exec(f)?.[1])
    .filter((n): n is string => n != null)
    .map(Number)
    .sort((a, b) => a - b);
}

export const FM3_BLOCKPARAMS_CASE_COUNT = listPresetFixtures().length;

/** Deep equality with a path-reporting error, JSON-normalized (undefined keys drop). */
function assertDeepEqual(actual: unknown, expected: unknown, path: string): void {
  const a = JSON.parse(JSON.stringify(actual ?? null));
  const e = JSON.parse(JSON.stringify(expected ?? null));
  diff(a, e, path);
}
function diff(a: unknown, e: unknown, path: string): void {
  if (Array.isArray(e)) {
    if (!Array.isArray(a)) throw new Error(`${path}: expected array, got ${typeof a}`);
    if (a.length !== e.length) throw new Error(`${path}: length ${a.length} !== expected ${e.length}`);
    for (let i = 0; i < e.length; i++) diff(a[i], e[i], `${path}[${i}]`);
    return;
  }
  if (e !== null && typeof e === 'object') {
    if (a === null || typeof a !== 'object') throw new Error(`${path}: expected object, got ${JSON.stringify(a)}`);
    const ak = Object.keys(a as object).sort();
    const ek = Object.keys(e as object).sort();
    if (ak.join(',') !== ek.join(',')) {
      throw new Error(`${path}: keys [${ak.join(',')}] !== expected [${ek.join(',')}]`);
    }
    for (const k of ek) diff((a as Record<string, unknown>)[k], (e as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  if (a !== e) throw new Error(`${path}: ${JSON.stringify(a)} !== expected ${JSON.stringify(e)}`);
}

export function runFm3BlockParamsTests(): void {
  // model gating: FM3 verified; VP4 refused (no calibration ground truth).
  // III/FM9 gating moved to modern-family/blockparams-cross.test.ts, which
  // owns their single-preset calibration goldens.
  if (!hasBlockParamModel(FM3)) throw new Error('[fm3/blockparams] FM3 (0x11) must be a verified model');
  gen3BlockParamModel(FM3);
  for (const other of [0x14]) {
    if (hasBlockParamModel(other)) throw new Error(`[fm3/blockparams] model 0x${other.toString(16)} must NOT be verified yet`);
    let threw = false;
    try { gen3BlockParamModel(other); } catch { threw = true; }
    if (!threw) throw new Error(`[fm3/blockparams] gen3BlockParamModel(0x${other.toString(16)}) must throw`);
  }

  const slots = listPresetFixtures();
  if (slots.length === 0) throw new Error('[fm3/blockparams] no preset fixtures found');

  for (const n of slots) {
    const syx = new Uint8Array(readFileSync(join(FIXTURES, `preset-${n}.syx`)));
    const expected = JSON.parse(readFileSync(join(FIXTURES, `preset-${n}.params.expected.json`), 'utf8')) as {
      blocks: { effectId: number }[];
    };

    const parsed = parsePresetDump(syx, 0, FM3);
    const decoded = decodeRawPatch(parsed.chunkPayloads);
    if (!decoded.crcValid) throw new Error(`[fm3/blockparams] preset-${n}: CRC invalid — fixture corrupt?`);

    const body3 = decodeGen3Body(decoded.body, FM3);
    const placedEids = new Set<number>(
      (body3.grid ?? []).filter((c) => !c.is_shunt && c.effect_id).map((c) => c.effect_id),
    );

    const blocks = readBlockParamsForModel(decoded.body, placedEids, FM3);
    assertDeepEqual(blocks, expected.blocks, `preset-${n}.blocks`);

    // Identity mapping (range overlay `valueMap:'identity'`): the offline decoder must read the 14-bit
    // field AS the value — `display == raw` — exactly as the live server's `#display` does behind
    // `rangeIsIdentity`, never a normalized position over [displayMin, displayMax]. Keyed off the RANGE
    // TABLE, so it covers every identity row the fixture happens to place and cannot be satisfied by
    // special-casing one (the live path's defect A: the DUMP decode ignored the map the LIVE decode used).
    const { tables } = gen3BlockParamModel(FM3);
    for (const blk of blocks as { family: string; params: { paramId: number; name: string; value: number | null; raw: number }[] }[]) {
      for (const p of blk.params) {
        if (tables.ranges[blk.family]?.[p.paramId]?.valueMap === 'identity' && p.value !== p.raw) {
          throw new Error(
            `[fm3/blockparams] preset-${n}: identity-mapped row ${blk.family}/${p.paramId} (${p.name}) ` +
              `decoded value ${p.value} !== raw ${p.raw} — the offline decoder ignored valueMap 'identity'`,
          );
        }
      }
    }

    // models projection sanity: every rostered type name in the projection is non-#ordinal
    const models = modelsFromBlocks(blocks);
    for (const [slug, names] of Object.entries(models)) {
      for (const name of names) {
        if (name.startsWith('#')) throw new Error(`[fm3/blockparams] preset-${n}: models.${slug} leaked ordinal ${name}`);
      }
    }
  }
}
