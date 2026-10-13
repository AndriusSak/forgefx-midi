/**
 * OFFLINE refresh of the FM3 `preset-<n>.params.expected.json` goldens.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/capture-fm3-goldens.ts` freezes the fixtures from a RUNNING ForgeFX server with an FM3
 * attached. That path cannot be re-run here (the device is a live instrument and the serial port is
 * held). But the goldens pin the OFFLINE decoder's output (`readBlockParamsForModel`), so when the
 * decoder is deliberately corrected the fixtures must be re-emitted from the SAME offline pipeline the
 * suite uses — never hand-edited, and never re-captured from a different code path.
 *
 * This script reproduces `test/gen3/fm3/blockparams.test.ts`'s decode exactly (parsePresetDump →
 * decodeRawPatch → decodeGen3Body grid → placed effectIds → readBlockParamsForModel) and writes
 * `{ blocks }` back to each `preset-<n>.params.expected.json`. Run it with `--diff` to print a
 * per-entry change report FIRST (the golden-discipline step: every moved entry must be an
 * identity/overlay row, and the count of unrelated entries must be zero).
 *
 * Usage:
 *   tsx scripts/refresh-fm3-blockparams-goldens.ts --diff     # report changes, write nothing
 *   tsx scripts/refresh-fm3-blockparams-goldens.ts            # rewrite the goldens in place
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePresetDump } from '../src/devices/gen3/presetDump.js';
import { decodeRawPatch } from '../src/devices/gen3/presetHuffman.js';
import { decodeGen3Body } from '../src/devices/gen3/presetBody.js';
import { readBlockParamsForModel } from '../src/devices/gen3/blockParams.js';

const FM3 = 0x11;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'test', 'gen3', 'fm3', 'fixtures');
const DIFF = process.argv.includes('--diff');

function listPresetFixtures(): number[] {
  return readdirSync(FIXTURES)
    .map((f) => /^preset-(\d+)\.syx$/.exec(f)?.[1])
    .filter((n): n is string => n != null)
    .map(Number)
    .sort((a, b) => a - b);
}

interface Param {
  paramId: number;
  name: string;
  kind?: string;
  value: number | null;
  unit?: string;
  raw?: number;
}
interface Block {
  effectId: number;
  family: string;
  instance: number;
  params: Param[];
}

function decode(n: number): Block[] {
  const syx = new Uint8Array(readFileSync(join(FIXTURES, `preset-${n}.syx`)));
  const parsed = parsePresetDump(syx, 0, FM3);
  const decoded = decodeRawPatch(parsed.chunkPayloads);
  if (!decoded.crcValid) throw new Error(`preset-${n}: CRC invalid — fixture corrupt?`);
  const body3 = decodeGen3Body(decoded.body, FM3);
  const placedEids = new Set<number>(
    (body3.grid ?? []).filter((c) => !c.is_shunt && c.effect_id).map((c) => c.effect_id),
  );
  return readBlockParamsForModel(decoded.body, placedEids, FM3) as unknown as Block[];
}

function main(): void {
  let totalMoved = 0;
  const movedList: string[] = [];
  for (const n of listPresetFixtures()) {
    const blocks = decode(n);
    const next = JSON.stringify({ blocks }, null, 2) + '\n';
    const path = join(FIXTURES, `preset-${n}.params.expected.json`);
    const prevText = readFileSync(path, 'utf8');
    const prev = (JSON.parse(prevText) as { blocks: Block[] }).blocks;
    // per-entry (block.param.field) diff against the file on disk
    const prevByKey = new Map<string, Param>();
    for (const b of prev) for (const p of b.params) prevByKey.set(`${b.effectId}/${p.paramId}`, p);
    const nextByKey = new Map<string, Param>();
    for (const b of blocks) for (const p of b.params) nextByKey.set(`${b.effectId}/${p.paramId}`, p);
    const keys = new Set([...prevByKey.keys(), ...nextByKey.keys()]);
    for (const k of keys) {
      const a = prevByKey.get(k);
      const c = nextByKey.get(k);
      for (const field of ['raw', 'value', 'unit', 'kind', 'name', 'label', 'enumLabel'] as const) {
        const av = (a as unknown as Record<string, unknown>)?.[field];
        const cv = (c as unknown as Record<string, unknown>)?.[field];
        if (av !== cv) {
          totalMoved++;
          movedList.push(`preset-${n} ${k} ${field}: ${JSON.stringify(av)} -> ${JSON.stringify(cv)}`);
        }
      }
    }
    if (!DIFF && next !== prevText) writeFileSync(path, next);
    console.log(`preset-${n}: ${blocks.length} blocks`);
  }
  console.log(`\n${DIFF ? '[--diff] would change' : 'changed'} ${totalMoved} param-field entries`);
  for (const m of movedList) console.log(`  ${m}`);
}

main();
