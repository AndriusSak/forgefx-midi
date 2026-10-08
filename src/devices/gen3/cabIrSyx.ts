/**
 * FM3 user-cab IR `.syx` container — MEASURED, not inferred (§2.5 user-cab IR upload).
 *
 * ─── EVIDENCE (one real specimen, 2026-10-08) ────────────────────────────────────────────
 * A genuine FM3-Edit export of a user cab (slot U1.001, `U1.001_LT_TV_Mix_7.syx`), 10,345 bytes,
 * model byte 0x11, **all 10 frame checksums valid** under the gen-3 XOR-7F rule (F0 through the
 * last payload byte):
 *
 *   1 × fn=0x7A  len 12    payload `7F 7F 00 10`            start
 *   8 × fn=0x7B  len 1290  payload `00 02` + 1280 bytes     data
 *   1 × fn=0x7C  len 13    payload `4D 12 08 5D 03`         end
 *
 *   A DATA frame's payload is a 2-byte prefix (the same `00 02` on all 8 frames of this specimen)
 *   followed by **256 five-byte chunks**. Each chunk packs a 32-bit value as 5 LSB-first septets
 *   (`unpack5Septet32`) — the same primitive the gen-3 SET path uses for its value32 field, and the
 *   same "four text characters or one 32-bit sample per 5-byte chunk" unit the Fractal wiki
 *   documents for the Axe-Fx II IR download.
 *
 *   **Chunks 0..7 of the first data frame are the NAME**: 32 characters, 4 per chunk, LSB-first —
 *   decoded verbatim as `"LT TV Mix 7"` + 21 spaces. Bit 7 of each character slot is a flag whose
 *   meaning is UNVERIFIED (the specimen's 32nd slot carries 0xA0, i.e. flag set). Renaming therefore
 *   rewrites only the low 7 bits of each slot and PRESERVES each slot's flag bit.
 *
 *   **Chunks 8.. are 2040 sample slots** — the geometry closes exactly: 8 name chunks + 2040 = 2048
 *   = 8 frames × 256. **The sample encoding is NOT decoded.** The 32-bit words do not read as
 *   plausible PCM or float32 under any alignment tried (32-bit windows at bit offsets 0..3 inside
 *   each 35-bit chunk, both septet orders, all byte orders). The payload is carried VERBATIM and no
 *   claim is made about it.
 *
 * ─── ⚠ MEASURED NEGATIVE (2026-10-08, FM3 fw 13): THE DEVICE REFUSES THIS REPLAY ─────────
 * Sending the container back to the unit — frames verbatim, paced — drew a `0x64` MULTIPURPOSE
 * refusal for **every one of the 10 frames**:
 *
 *   `F0 00 01 74 11 64 7A 16 .. F7`   fn=0x7A → result 0x16
 *   8 × `F0 00 01 74 11 64 7B 10 .. F7`   fn=0x7B → result **0x10 (MIDI_ERROR_BAD_MSG_LENGTH)**
 *   `F0 00 01 74 11 64 7C .. F7`   fn=0x7C → refused
 *
 * So **the export container is NOT accepted as-is by the unit**, and the gen-2 IR-download opcode
 * family (0x7A/0x7B/0x7C, documented for the Axe-Fx II) is **not what the FM3 listens for** —
 * `0x10` on the data frames says the unit was measuring them against a different length, i.e. its
 * IR-data opcode (whatever it is) is not 0x7B-with-1282-bytes. Two consequences this module and its
 * callers must respect:
 *
 *   1. **Do not describe a replay as "what Fractal's tools send".** It was a reasonable reading of the
 *      file, and the measurement refuted it. What the file IS: a faithful archive of the IR that
 *      FM3-Edit *exported*. What FM3-Edit *transmits* to load an IR is still uncaptured.
 *   2. **Fail closed.** `buildCabIrSyx` still produces a faithful replay/rename/retarget — that is the
 *      instrument the next round needs — but the DRIVER refuses to send it unless a caller explicitly
 *      opts into an unverified path (see `uploadCabIr` in ForgeFX). The measured refusal is the reason,
 *      not a guess.
 *
 * The closing evidence is a CAPTURE of FM3-Edit (or Fractal-Bot) actually loading an IR onto the unit:
 * the real opcodes and the real frame lengths are in that stream and nowhere else. Nothing in this
 * module should be re-derived from the gen-2 wiki page again.
 *
 *   The 0x7C payload is a 5-septet 32-bit value (`0x3BA2094D` here) that NO candidate algorithm
 *   reproduced: XOR32/SUM32 of the sample words, XOR8/SUM8 over the unpacked quads and over the raw
 *   septets, CRC32 of both views, and a rolling `(acc<<1)^byte` over both. It is carried VERBATIM,
 *   documented as unverified, and NEVER recomputed — a name-only edit leaves it untouched, and the
 *   device is the judge of whether that is enough.
 *
 *   The 0x7A payload's first two bytes are `7F 7F` — the same 14-bit "no explicit target" sentinel
 *   the preset-dump header uses for the edit buffer. Whether a concrete user-cab slot belongs there,
 *   and in which septet order, is **UNVERIFIED**: one specimen cannot separate the orders because
 *   0x3FFF is symmetric. `retargetCabIrStart()` exists for that experiment and defaults to the
 *   sibling preset-dump convention (MSB-first). **The default upload path replays the file
 *   verbatim** — it does not retarget.
 *
 * ─── WHAT THIS MODULE DOES NOT CLAIM ─────────────────────────────────────────────────────
 * It does not claim the FM3 ACCEPTS these frames (that is the load test's job, on hardware), it does
 * not claim the sample payload is understood, and it does not claim the 0x7A target encoding. Every
 * one of those is marked above rather than assumed.
 */
import { fractalChecksum } from '../../shared/checksum.js';
import { pack5Septet32, unpack5Septet32 } from '../../gen3/axe-fx-iii/setParam.js';

export const CAB_IR_FN_START = 0x7a;
export const CAB_IR_FN_DATA = 0x7b;
export const CAB_IR_FN_END = 0x7c;

/** 32 name characters, four per 5-byte chunk, in the first 8 chunks of the first data frame. */
export const CAB_IR_NAME_CHARS = 32;
export const CAB_IR_NAME_CHUNKS = 8;
/** 256 chunks per data frame (measured: 1280 payload bytes after the 2-byte frame prefix). */
export const CAB_IR_CHUNKS_PER_FRAME = 256;
/** Sample slots per IR = all chunks minus the name chunks (2048 − 8). Measured, and it closes exactly. */
export const CAB_IR_SAMPLE_SLOTS = 2040;
/** The 14-bit "no explicit target" sentinel seen in the specimen's start payload. */
export const CAB_IR_TARGET_UNSPECIFIED = 0x3fff;

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;

export interface CabIrSyx {
  /** SysEx model byte carried by every frame (0x11 = FM3 on the specimen). */
  readonly modelId: number;
  /** The name with trailing spaces trimmed (what the device shows). */
  readonly name: string;
  /** Exactly 32 characters as stored, padding included. */
  readonly nameRaw: string;
  /** Per-character-slot flag bit (bit 7). Meaning UNVERIFIED — preserved on rename. */
  readonly nameSlotFlags: readonly boolean[];
  /** The 0x7A payload verbatim (target sentinel + 2 bytes of unverified meaning). */
  readonly startPayload: readonly number[];
  /** The 0x7C payload verbatim (the unverified 5-septet value). Never recomputed. */
  readonly endPayload: readonly number[];
  /** Every frame verbatim, in order — the bytes that go on the wire. */
  readonly frames: readonly (readonly number[])[];
  /** The data frames' 2-byte prefixes (verbatim). */
  readonly dataPrefixes: readonly (readonly number[])[];
  /** Sample slots carried (2040 for the measured FM3 geometry). */
  readonly sampleSlots: number;
}

/** Split a byte stream into complete `F0 … F7` frames; throws on stray bytes or an unterminated frame. */
function splitFrames(bytes: readonly number[]): number[][] {
  const frames: number[][] = [];
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] !== SYSEX_START) {
      throw new Error(`parseCabIrSyx: byte ${i} (0x${bytes[i]!.toString(16)}) is outside any F0..F7 frame`);
    }
    const end = bytes.indexOf(SYSEX_END, i);
    if (end < 0) throw new Error(`parseCabIrSyx: unterminated frame starting at byte ${i}`);
    frames.push(bytes.slice(i, end + 1));
    i = end + 1;
  }
  return frames;
}

/** The payload of a frame: everything between the function byte and the trailing checksum+F7. */
function framePayload(frame: readonly number[]): number[] {
  return frame.slice(6, frame.length - 2);
}

/** Verify the gen-3 XOR-7F checksum (covers F0 through the last payload byte). */
function frameChecksumOk(frame: readonly number[]): boolean {
  const tabulated = frame[frame.length - 2]!;
  return tabulated === fractalChecksum(frame.slice(0, frame.length - 2));
}

/** Recompute a frame's checksum byte in place (after its payload changed). */
function fixFrameChecksum(frame: number[]): void {
  frame[frame.length - 2] = fractalChecksum(frame.slice(0, frame.length - 2));
}

/**
 * Parse a user-cab IR `.syx` container. STRICT: every frame must be well formed with a valid
 * checksum, the frame order must be `1 × 0x7A, N × 0x7B, 1 × 0x7C`, all frames must carry the same
 * model byte, and every data frame must carry a whole number of 5-byte chunks with the same
 * geometry. A container that fails any of these is not something to guess about — it throws with the
 * reason, so a caller can report it rather than push half-understood bytes at a device.
 */
export function parseCabIrSyx(input: readonly number[] | Uint8Array): CabIrSyx {
  const bytes = Array.from(input);
  if (!bytes.length) throw new Error('parseCabIrSyx: empty input');
  const frames = splitFrames(bytes);

  const bad = frames.findIndex((f) => !frameChecksumOk(f));
  if (bad >= 0) throw new Error(`parseCabIrSyx: frame ${bad} has an invalid checksum (expected 0x${fractalChecksum(frames[bad]!.slice(0, -2)).toString(16)})`);

  const models = [...new Set(frames.map((f) => f[4]))];
  if (models.length !== 1 || models[0] === undefined) {
    throw new Error(`parseCabIrSyx: frames carry ${models.length} different model bytes (${models.map((m) => `0x${m?.toString(16)}`).join(', ')})`);
  }
  const modelId = models[0]!;

  const fns = frames.map((f) => f[5]);
  if (fns[0] !== CAB_IR_FN_START) {
    throw new Error(`parseCabIrSyx: first frame is fn=0x${fns[0]?.toString(16)} — a user-cab IR starts with 0x${CAB_IR_FN_START.toString(16)}`);
  }
  if (fns[fns.length - 1] !== CAB_IR_FN_END) {
    throw new Error(`parseCabIrSyx: last frame is fn=0x${fns[fns.length - 1]?.toString(16)} — a user-cab IR ends with 0x${CAB_IR_FN_END.toString(16)}`);
  }
  const dataFrames = frames.slice(1, -1);
  if (!dataFrames.length) throw new Error('parseCabIrSyx: no data frames (0x7B) between the start and end frames');
  const wrongFn = dataFrames.findIndex((f) => f[5] !== CAB_IR_FN_DATA);
  if (wrongFn >= 0) {
    throw new Error(`parseCabIrSyx: frame ${wrongFn + 1} is fn=0x${dataFrames[wrongFn]![5]?.toString(16)} — expected only data frames (0x7B) between start and end`);
  }

  // chunk geometry: 2-byte prefix + N × 5-byte chunks, identical on every data frame
  const prefixes: number[][] = [];
  const chunkLists: number[][] = [];
  for (const [k, f] of dataFrames.entries()) {
    const p = framePayload(f);
    if (p.length < 7) throw new Error(`parseCabIrSyx: data frame ${k} payload is ${p.length} bytes — too short for a prefix plus a chunk`);
    const body = p.slice(2);
    if (body.length % 5 !== 0) {
      throw new Error(`parseCabIrSyx: data frame ${k} body is ${body.length} bytes — not a whole number of 5-byte chunks`);
    }
    const chunks: number[] = [];
    for (let i = 0; i < body.length; i += 5) chunks.push(unpack5Septet32(body[i]!, body[i + 1]!, body[i + 2]!, body[i + 3]!, body[i + 4]!));
    prefixes.push(p.slice(0, 2));
    chunkLists.push(chunks);
  }
  const sizes = [...new Set(chunkLists.map((c) => c.length))];
  if (sizes.length !== 1) {
    throw new Error(`parseCabIrSyx: data frames carry different chunk counts (${sizes.join(', ')}) — a torn container`);
  }
  // the NAME occupies the first 8 chunks of the FIRST data frame; every other chunk in the container
  // is a sample slot — so the sample count is the TOTAL across frames, not one frame's count.
  const totalChunks = chunkLists.reduce((n, c) => n + c.length, 0);
  if (totalChunks < CAB_IR_NAME_CHUNKS) {
    throw new Error(`parseCabIrSyx: only ${totalChunks} chunks — fewer than the ${CAB_IR_NAME_CHUNKS} the name occupies`);
  }

  // name: 8 chunks × 4 characters, LSB-first, flag = bit 7 of each slot
  const nameWords = chunkLists[0]!.slice(0, CAB_IR_NAME_CHUNKS);
  const chars: number[] = [];
  const flags: boolean[] = [];
  for (const w of nameWords) {
    for (const shift of [0, 8, 16, 24]) {
      const b = (w >>> shift) & 0xff;
      chars.push(b & 0x7f);
      flags.push((b & 0x80) !== 0);
    }
  }
  const nameRaw = chars.map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : '\u00b7')).join('');

  return {
    modelId,
    name: nameRaw.replace(/\s+$/, ''),
    nameRaw,
    nameSlotFlags: flags,
    startPayload: framePayload(frames[0]!),
    endPayload: framePayload(frames[frames.length - 1]!),
    frames,
    dataPrefixes: prefixes,
    sampleSlots: totalChunks - CAB_IR_NAME_CHUNKS,
  };
}

/**
 * Re-emit the container as wire bytes.
 *
 * Default (no options): **byte-identical replay** — the frames go back out exactly as they came in,
 * checksums included, because the sample payload and the 0x7C value are unverified and must not be
 * touched.
 *
 * `name`: rewrite the 32 name slots, preserving every slot's flag bit, and re-fix the affected
 * frame checksums. The 0x7C value is left verbatim — whether it covers the name is UNVERIFIED, and
 * the device's answer on the load test is what settles it.
 *
 * `startPayload`: replace the 0x7A payload wholesale (the retarget experiment).
 */
export function buildCabIrSyx(
  ir: CabIrSyx,
  opts: { name?: string; startPayload?: readonly number[] } = {},
): number[] {
  const frames = ir.frames.map((f) => [...f]);

  if (opts.startPayload) {
    const payload = [...opts.startPayload];
    if (payload.some((b) => b > 0x7f)) throw new Error('buildCabIrSyx: startPayload must be 7-bit clean');
    frames[0] = [...frames[0]!.slice(0, 6), ...payload, frames[0]![frames[0]!.length - 2]!, SYSEX_END];
    fixFrameChecksum(frames[0]!);
  }

  if (opts.name !== undefined) {
    const wanted = [...opts.name];
    if (wanted.length > CAB_IR_NAME_CHARS) {
      throw new Error(`buildCabIrSyx: name is ${wanted.length} characters — the device stores ${CAB_IR_NAME_CHARS}`);
    }
    if (wanted.some((c) => c.charCodeAt(0) > 0x7f)) {
      throw new Error('buildCabIrSyx: name must be 7-bit ASCII (the container stores one 7-bit character per slot)');
    }
    // low 7 bits = the new name (space padded); bit 7 = the source slot's own flag, preserved
    const slots = Array.from({ length: CAB_IR_NAME_CHARS }, (_, i) => {
      const ch = (wanted[i] ?? ' ').charCodeAt(0) & 0x7f;
      return (ir.nameSlotFlags[i] ? 0x80 : 0x00) | ch;
    });
    // first data frame: 2-byte prefix, then 8 name chunks, then the untouched sample chunks
    const first = frames[1]!;
    const payload = framePayload(first);
    const body = payload.slice(2);
    const rewritten: number[] = [...payload.slice(0, 2)];
    for (let c = 0; c < CAB_IR_NAME_CHUNKS; c++) {
      const w = ((slots[c * 4]!) | (slots[c * 4 + 1]! << 8) | (slots[c * 4 + 2]! << 16) | (slots[c * 4 + 3]! << 24)) >>> 0;
      rewritten.push(...pack5Septet32(w));
    }
    rewritten.push(...body.slice(CAB_IR_NAME_CHUNKS * 5));
    frames[1] = [...first.slice(0, 6), ...rewritten, first[first.length - 2]!, SYSEX_END];
    fixFrameChecksum(frames[1]!);
  }

  return frames.flat();
}

/** Convenience: replay bytes with a new name (flag bits preserved). */
export function renameCabIrSyx(bytes: readonly number[] | Uint8Array, name: string): number[] {
  return buildCabIrSyx(parseCabIrSyx(bytes), { name });
}

/**
 * Retarget the 0x7A start frame to a concrete 14-bit slot number, fixing the frame checksum.
 *
 * ⚠️ UNVERIFIED — the only specimen carries `7F 7F` (the "no explicit target" sentinel), which
 * cannot distinguish MSB-first from LSB-first. `order` defaults to `'msb'`, matching the sibling
 * preset-dump header (`retargetPresetDumpToEditBuffer`). Use this to RUN THE EXPERIMENT, not because
 * the encoding is known. The tail of the payload (bytes 2..3 of the specimen: `00 10`) is preserved.
 */
export function retargetCabIrStart(
  bytes: number[],
  target: number,
  order: 'msb' | 'lsb' = 'msb',
): boolean {
  if (!Number.isInteger(target) || target < 0 || target > 0x3fff) {
    throw new Error(`retargetCabIrStart: target ${target} out of 14-bit range`);
  }
  for (let i = 0; i + 6 < bytes.length; i++) {
    if (bytes[i] !== SYSEX_START || bytes[i + 1] !== 0x00 || bytes[i + 2] !== 0x01 || bytes[i + 3] !== 0x74) continue;
    if (bytes[i + 5] !== CAB_IR_FN_START) continue;
    const hi = (target >> 7) & 0x7f;
    const lo = target & 0x7f;
    bytes[i + 6] = order === 'msb' ? hi : lo;
    bytes[i + 7] = order === 'msb' ? lo : hi;
    const end = bytes.indexOf(SYSEX_END, i);
    if (end > i + 1) bytes[end - 1] = fractalChecksum(bytes.slice(i, end - 1));
    return true;
  }
  return false;
}
