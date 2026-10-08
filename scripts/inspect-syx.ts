// ────────────────────────────────────────────────────────────────────────────────────────────────
// inspect-syx — frame-level inspector for ANY Fractal .syx container (preset, IR, bank, system).
//
// WHAT IT IS: a MEASURING instrument, not a decoder. It splits the byte stream into complete
// `F0 … F7` frames, validates each checksum (XOR-7F over F0 through the last payload byte — the
// convention verified on the FM3 2026-10-08 and in the wiki's worked example
// `F0 00 01 74 08 14 00 00 19 F7`), and reports the structure it OBSERVES: frame count, the function
// byte histogram, per-function lengths, model byte, and printable-ASCII runs (name candidates).
//
// It deliberately makes NO claim about what a 0x7A / 0x7B payload MEANS. That is the point: a file is
// evidence, and this prints the evidence — the meaning gets written down only once it is measured.
//
// USAGE
//   npx tsx scripts/inspect-syx.ts <file.syx> [--strings <minlen>] [--frames <n>] [--dump <fnHex>]
// ────────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fractalChecksum } from '../src/shared/checksum.js';

const FRACTAL_MFR = [0x00, 0x01, 0x74];

interface SyxFrame {
  index: number;
  offset: number;
  bytes: number[];
  fn: number;
  payload: number[];
  tabulatedChecksum: number;
  computedChecksum: number;
  checksumOk: boolean;
}

function splitFrames(buf: Buffer): { frames: SyxFrame[]; stray: { offset: number; byte: number }[] } {
  const frames: SyxFrame[] = [];
  const stray: { offset: number; byte: number }[] = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] !== 0xf0) {
      stray.push({ offset: i, byte: buf[i]! });
      i++;
      continue;
    }
    const end = buf.indexOf(0xf7, i);
    if (end < 0) {
      stray.push({ offset: i, byte: 0xf0 });
      break;
    }
    const bytes = Array.from(buf.subarray(i, end + 1));
    const payload = bytes.slice(6, bytes.length - 2);
    const tabulated = bytes[bytes.length - 2]!;
    const computed = fractalChecksum(bytes.slice(0, bytes.length - 2));
    frames.push({
      index: frames.length,
      offset: i,
      bytes,
      fn: bytes[5] ?? -1,
      payload,
      tabulatedChecksum: tabulated,
      computedChecksum: computed,
      checksumOk: tabulated === computed,
    });
    i = end + 1;
  }
  return { frames, stray };
}

/** Runs of printable ASCII (>= min) inside a byte slice, with the payload offset where each starts. */
function asciiRuns(bytes: readonly number[], min: number, baseOffset: number): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  let run: string[] = [];
  let start = 0;
  const flush = () => {
    if (run.length >= min) out.push({ at: baseOffset + start, text: run.join('') });
    run = [];
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b >= 0x20 && b < 0x7f) {
      if (run.length === 0) start = i;
      run.push(String.fromCharCode(b));
    } else {
      flush();
    }
  }
  flush();
  return out;
}

const hex = (b: readonly number[], max = 32) =>
  b.slice(0, max).map((x) => x.toString(16).padStart(2, '0')).join(' ') + (b.length > max ? ` … (${b.length} bytes)` : '');

export function main(argv: string[]): number {
  const path = argv.find((a) => !a.startsWith('--'));
  if (!path) {
    console.log('usage: npx tsx scripts/inspect-syx.ts <file.syx> [--strings <minlen>] [--frames <n>] [--dump <fnHex>]');
    return 1;
  }
  const minStrings = Number(argv[argv.indexOf('--strings') + 1]) || 6;
  const showFrames = Number(argv[argv.indexOf('--frames') + 1]) || 6;
  const dumpFnArg = argv.indexOf('--dump') >= 0 ? argv[argv.indexOf('--dump') + 1] : undefined;

  const buf = readFileSync(path);
  console.log(`file: ${path}`);
  console.log(`size: ${buf.length} bytes`);
  const { frames, stray } = splitFrames(buf);

  if (stray.length) {
    const head = stray.slice(0, 8).map((s) => `@${s.offset}=0x${s.byte.toString(16)}`).join(' ');
    console.log(`⚠ ${stray.length} byte(s) OUTSIDE any F0..F7 frame (first: ${head})${stray.length > 8 ? ' …' : ''}`);
  }
  console.log(`frames: ${frames.length}`);
  const badCs = frames.filter((f) => !f.checksumOk);
  console.log(`checksums: ${frames.length - badCs.length}/${frames.length} valid (XOR-7F over F0..last payload byte)`);
  if (badCs.length) {
    for (const f of badCs.slice(0, 6)) {
      console.log(`  ✗ frame ${f.index} (fn 0x${f.fn.toString(16)}): tabulated 0x${f.tabulatedChecksum.toString(16)} ≠ computed 0x${f.computedChecksum.toString(16)}`);
    }
  }

  const models = [...new Set(frames.map((f) => f.bytes[4]))];
  console.log(`model byte(s): ${models.map((m) => `0x${m?.toString(16)}`).join(', ')}`);

  const byFn = new Map<number, SyxFrame[]>();
  for (const f of frames) {
    if (!byFn.has(f.fn)) byFn.set(f.fn, []);
    byFn.get(f.fn)!.push(f);
  }
  console.log('function bytes:');
  for (const [fn, group] of [...byFn.entries()].sort((a, b) => a[0] - b[0])) {
    const lens = [...new Set(group.map((f) => f.bytes.length))].sort((a, b) => a - b);
    const payloadLens = [...new Set(group.map((f) => f.payload.length))].sort((a, b) => a - b);
    console.log(
      `  0x${fn.toString(16).padStart(2, '0')}: ${group.length} frame(s), total len ${lens.join('/')}, payload len ${payloadLens.join('/')}`,
    );
  }

  console.log(`\nfirst ${Math.min(showFrames, frames.length)} frame(s):`);
  for (const f of frames.slice(0, showFrames)) {
    console.log(`  #${f.index} @${f.offset} fn=0x${f.fn.toString(16)} len=${f.bytes.length}  ${hex(f.bytes)}`);
  }

  console.log(`\nprintable ASCII runs (>= ${minStrings} chars):`);
  let shown = 0;
  for (const f of frames) {
    const runs = asciiRuns(f.payload, minStrings, 6);
    for (const r of runs) {
      console.log(`  fn=0x${f.fn.toString(16)} payload@${r.at}: ${JSON.stringify(r.text)}`);
      if (++shown >= 40) break;
    }
    if (shown >= 40) break;
  }
  if (!shown) console.log('  (none)');

  if (dumpFnArg != null) {
    const fn = Number(dumpFnArg.startsWith('0x') ? dumpFnArg : `0x${dumpFnArg}`);
    const target = byFn.get(fn) ?? [];
    console.log(`\nfull dump of fn=0x${fn.toString(16)} (${target.length} frame(s)):`);
    for (const f of target.slice(0, 3)) {
      console.log(`  #${f.index}: ${f.bytes.map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  process.exit(main(process.argv.slice(2)));
}
