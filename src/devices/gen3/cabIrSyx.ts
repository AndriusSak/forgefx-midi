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
 *   The 0x7A payload's first two bytes are `7F 7F` in an EXPORT (the "no destination" sentinel). They
 *   are NOT opaque: the capture above shows the editor writing a real `[index, page]` pair there, so
 *   `buildCabIrStartPayload()` builds that field from a destination and `cabIrStartDestination()` reads
 *   it back. (`retargetCabIrStart()` predates the capture and guessed MSB-first 14-bit ordering; it is
 *   kept only for the historical record — use the destination helpers.)
 *
 * ─── THE UPLOAD SEQUENCE (CAPTURED 2026-10-08, FM3-Edit 1.07.16 → FM3 fw 13.0) ──────────
 * A USBPcap capture of FM3-Edit actually loading an IR shows the editor sending EXACTLY this container —
 * and it explains the refusal above:
 *
 *   host → 0x7A payload `00 10 00 10`   device → `64 7A 00 0A`   (start)
 *   host → 0x7B payload `00 02` + 1280  device → `64 7B 00 0B`   ×8, BYTE-IDENTICAL to the .syx
 *   host → 0x7C payload `4D 12 08 5D 03` device → `64 7C 00 0C`  (close)
 *
 * So the export's frames ARE the wire frames — 0x7A/0x7B/0x7C, 1290-byte data frames, unchanged — with
 * ONE difference: **the start payload's first two bytes.** The editor sent `00 10`; the file carries
 * `7F 7F`. The capture contains two uploads whose starts were `00 10 00 10` and `0B 10 00 10`, i.e. the
 * first two bytes VARY with the destination and the last two (`00 10`) are constant. Read together with
 *   the cab-catalogue read (`fn=0x01 sub=0x4B`, issued once per slot with the same `[index, page]` pair), the pair is **[index, page]**: page `0x10`–`0x13`
 * are the 512 user banks (128 slots each) and `0x20` is the 16 scratchpad memories, so `00 10` = user
 * slot 1 and `0B 10` = user slot 12 — and `7F 7F` in the export is the "no destination" sentinel an
 * export naturally carries.
 *
 * Replaying the FILE's start frame therefore asked the unit for a destination of "none", which is what
 * drew the refusal. A faithful replay must patch the destination (see `buildCabIrStartPayload`) — or send
 * the file's frames with only that field changed.
 *
 * ─── WHAT THIS MODULE DOES NOT CLAIM ─────────────────────────────────────────────────────
 * It does not claim the unit STORES the IR when it acknowledges the frames (the acks are the wire-side
 * evidence the editor itself relies on, and nothing more), and it does not claim the sample payload is
 * understood. Every one of those is marked above rather than assumed.
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

/**
 * The close frame's (`0x7C`) reply codes — MEASURED, and they are not decoration: they decide whether
 * the unit KEPT the upload.
 *
 * Four controlled arms on fw 13.0 (2026-10-08), each uploading to an EMPTY user slot so "was it stored"
 * is observable:
 *   • verbatim container                      → close answered `0x00` → the slot became POPULATED;
 *   • name rewritten, close carried verbatim  → `0x13` → the slot STAYED EMPTY;
 *   • samples zeroed (and a one-byte spike)   → `0x13` → the slot STAYED EMPTY;
 *   • close value mutated, content unchanged  → `0x13` → the slot STAYED EMPTY.
 * So `0x00` = the container's close value MATCHES its content and the upload is stored, and `0x13` =
 * mismatch → the whole upload is DISCARDED and the destination is left untouched.
 *
 * Consequence, and the reason this constant matters: the close value is content-bound, so ANY change to
 * a container (a rename, converted samples, a zeroed "delete") needs it RECOMPUTED. Its encoding is not
 * decoded. A caller that reads only the frame acks will believe an upload the device threw away.
 */
export const CAB_IR_CLOSE_ACCEPTED = 0x00;
export const CAB_IR_CLOSE_MISMATCH = 0x13;

/**
 * A user-cab destination as the editor writes it into the 0x7A start payload: `[index, page]` (MEASURED
 * — see the module header). Pages `0x10`–`0x13` are the 512 user banks (128 slots each); page `0x20` is
 * the 16 scratchpad memories.
 */
export interface CabIrDestination {
  /** Slot index within the page (0-based in the wire field; the 1-based helpers below take care of it). */
  index: number;
  page: number;
}

export const CAB_IR_PAGE_USER_BANKS: readonly number[] = [0x10, 0x11, 0x12, 0x13];
export const CAB_IR_PAGE_SCRATCHPAD = 0x20;
/** The bytes an export carries instead of a destination. */
export const CAB_IR_DEST_NONE: Readonly<CabIrDestination> = { index: 0x7f, page: 0x7f };
/** The two constant bytes that follow the destination in every observed start frame. */
export const CAB_IR_START_TAIL: readonly number[] = [0x00, 0x10];

/** Build the 0x7A start payload for a destination: `[index, page, 0x00, 0x10]` (MEASURED shape). */
export function buildCabIrStartPayload(
  dest: CabIrDestination | null,
  tail: readonly number[] = CAB_IR_START_TAIL,
): number[] {
  const d = dest ?? CAB_IR_DEST_NONE;
  if (!Number.isInteger(d.index) || d.index < 0 || d.index > 0x7f) {
    throw new Error(`buildCabIrStartPayload: index ${d.index} out of range (0..127)`);
  }
  if (!Number.isInteger(d.page) || d.page < 0 || d.page > 0x7f) {
    throw new Error(`buildCabIrStartPayload: page ${d.page} out of range (0..127)`);
  }
  const payload = [d.index, d.page, ...tail];
  if (payload.some((b) => b < 0 || b > 0x7f)) throw new Error('buildCabIrStartPayload: payload must be 7-bit clean');
  return payload;
}

/** Read the destination back out of a 0x7A payload; `null` when the frame carries the `7F 7F` sentinel. */
export function cabIrStartDestination(startPayload: readonly number[]): CabIrDestination | null {
  if (startPayload.length < 2) return null;
  const d = { index: startPayload[0]!, page: startPayload[1]! };
  if (d.index === CAB_IR_DEST_NONE.index && d.page === CAB_IR_DEST_NONE.page) return null;
  return d;
}

/** A 1-based user-cab slot number (1..512) → its destination. */
export function cabIrUserSlot(slot: number): CabIrDestination {
  if (!Number.isInteger(slot) || slot < 1 || slot > 512) {
    throw new Error(`cabIrUserSlot: slot ${slot} out of range (1..512)`);
  }
  const zero = slot - 1;
  return { index: zero % 128, page: CAB_IR_PAGE_USER_BANKS[Math.floor(zero / 128)]! };
}

/** A 1-based scratchpad memory number (1..16) → its destination. */
export function cabIrScratchpad(n: number): CabIrDestination {
  if (!Number.isInteger(n) || n < 1 || n > 16) {
    throw new Error(`cabIrScratchpad: scratchpad ${n} out of range (1..16)`);
  }
  return { index: n - 1, page: CAB_IR_PAGE_SCRATCHPAD };
}

/**
 * What the device said back, frame by frame. Measured ack shapes (replies to the editor's own upload):
 *
 *   `F0 00 01 74 11 64 7A 00 0A F7`  → start acknowledged
 *   `F0 00 01 74 11 64 7B 00 0B F7`  → one per data frame
 *   `F0 00 01 74 11 64 7C 00 0C F7`  → close acknowledged
 *
 * The middle byte reads as a result code where `00` accompanies an accepted frame — but that label is
 * NOT established (the result-code table this codebase carries is an assumed index→code mapping, and it
 * disagrees with everything measured on this device). So this reports the raw bytes and only the
 * structural facts, and `complete` means "every expected frame was acknowledged", nothing more.
 */
export interface CabIrUploadAcks {
  /** Raw 0x64 reply frames, as received. */
  frames: readonly (readonly number[])[];
  /** True when a 0x64 echoing 0x7A arrived. */
  start: boolean;
  /** How many 0x64 replies echoed 0x7B. */
  data: number;
  /** True when a 0x64 echoing 0x7C arrived. */
  end: boolean;
  /** Data frames the stream contained — compare with `data` to see whether all were acknowledged. */
  expectedData: number;
  /** Every expected frame acknowledged. NOT a claim that the unit stored the IR. */
  complete: boolean;
  /** Distinct `[echoedFn, code]` pairs seen, for reporting. */
  codes: readonly { fn: number; code: number }[];
}

/** Classify the replies seen during an upload against the stream that was sent. */
export function interpretCabIrAcks(
  frames: readonly (readonly number[])[],
  expectedDataFrames: number,
): CabIrUploadAcks {
  const acks = frames.filter((f) => f[5] === 0x64);
  const codes: { fn: number; code: number }[] = [];
  for (const f of acks) {
    const pair = { fn: f[6] ?? -1, code: f[7] ?? -1 };
    if (!codes.some((c) => c.fn === pair.fn && c.code === pair.code)) codes.push(pair);
  }
  const start = acks.some((f) => f[6] === CAB_IR_FN_START);
  const data = acks.filter((f) => f[6] === CAB_IR_FN_DATA).length;
  const end = acks.some((f) => f[6] === CAB_IR_FN_END);
  return {
    frames: acks,
    start,
    data,
    end,
    expectedData: expectedDataFrames,
    complete: start && end && data >= expectedDataFrames,
    codes,
  };
}

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
    // The 32nd slot is a NUL terminator in every measured export (0x80 with the flag), so trim it as padding.
    name: nameRaw.replace(/[\s\u00b7]+$/, ''),
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
 * The BLANK chunk fill, and the device's DELETE.
 *
 * MEASURED 2026-10-08: a container whose entire chunk area is `0x7F` septets — Fractal's own loader
 * ships exactly this as `empty_ir.syx` — is ACCEPTED by the unit (close-ack `0x00`, because every one of
 * the 2048 words is identical so their XOR is 0 and the close is `00 00 00 00 00`), and the destination
 * slot then reads **EMPTY**, indistinguishable from a never-written slot. Verified both ways on the
 * unit with the slot-state read-back: an empty slot stayed empty, and a slot holding a real IR flipped
 * from `populated` to `empty` while its untouched neighbour still read populated.
 *
 * So this is how a user cab slot is CLEARED — there is no remove opcode involved. Note the contrast
 * with zeroed SAMPLES: an all-zero sample area keeps a real name, is stored, and reads `populated` (a
 * silent IR, not an empty slot). The blank fill is different because it is the device's own "unwritten"
 * pattern.
 */
export const CAB_IR_BLANK_FILL = 0x7f;

/** Chunk bytes per data frame on the measured gen-3 (FM3 / Axe-Fx III) geometry. */
export const CAB_IR_CHUNK_BYTES_PER_FRAME = CAB_IR_CHUNKS_PER_FRAME * 5;
/** Data frames on the measured gen-3 (FM3 / Axe-Fx III) geometry. */
export const CAB_IR_DATA_FRAMES = 8;
/** The 2-byte prefix each data frame carries on the FM3/III geometry (`00 02`). */
export const CAB_IR_DATA_PREFIX: readonly number[] = [0x00, 0x02];

/** Models whose IR-container geometry this module has MEASURED (10 frames × 256 chunks, prefix 00 02). */
export const CAB_IR_KNOWN_GEOMETRY_MODELS: readonly number[] = [0x10, 0x11];

/**
 * Build a BLANK container from scratch — the delete — for `dest`.
 *
 * Refuses a model whose geometry has not been measured: a blank container in the wrong geometry is not
 * a conservative failure, it is an unknown write to a cab slot.
 */
export function buildBlankCabIrContainer(model: number, dest: CabIrDestination): number[] {
  if (!CAB_IR_KNOWN_GEOMETRY_MODELS.includes(model)) {
    throw new Error(
      `buildBlankCabIrContainer: the IR-container geometry for model 0x${model.toString(16)} has not ` +
        `been measured (known: ${CAB_IR_KNOWN_GEOMETRY_MODELS.map((m) => `0x${m.toString(16)}`).join(', ')}). ` +
        `Sending a blank container in an unknown geometry would be an unmeasured write to a cab slot.`,
    );
  }
  const frames: number[][] = [];
  frames.push(frameWithChecksum(model, CAB_IR_FN_START, buildCabIrStartPayload(dest)));
  const chunkBytes = new Array<number>(CAB_IR_CHUNK_BYTES_PER_FRAME).fill(CAB_IR_BLANK_FILL);
  for (let f = 0; f < CAB_IR_DATA_FRAMES; f++) {
    frames.push(frameWithChecksum(model, CAB_IR_FN_DATA, [...CAB_IR_DATA_PREFIX, ...chunkBytes]));
  }
  // the close is DERIVED, not assumed: 2048 identical words XOR to 0, but compute it rather than
  // hardcode the zero, so a geometry change cannot silently leave a stale value behind
  const closePayload = computeCabIrClosePayload(frames.flat());
  frames.push(frameWithChecksum(model, CAB_IR_FN_END, closePayload));
  return frames.flat();
}

/** The Fractal manufacturer id bytes every frame carries. */
const CAB_IR_MFR: readonly number[] = [0x00, 0x01, 0x74];

/** A frame with its checksum fixed — the envelope convention, local to this module. */
function frameWithChecksum(model: number, fn: number, payload: readonly number[]): number[] {
  const body = [SYSEX_START, ...CAB_IR_MFR, model & 0x7f, fn, ...payload];
  return [...body, fractalChecksum(body), SYSEX_END];
}

/** True when every chunk byte of the container is the blank fill (i.e. this is a blank/empty IR). */
export function isBlankCabIr(bytes: readonly number[] | Uint8Array): boolean {
  const b = [...bytes];
  for (let i = 0; i + 1 < b.length; i++) {
    if (b[i] !== SYSEX_START) continue;
    const end = b.indexOf(SYSEX_END, i);
    if (end < 0) break;
    const f = b.slice(i, end + 1);
    if (f[5] === CAB_IR_FN_DATA) {
      const chunkBytes = f.slice(8, f.length - 2);
      if (!chunkBytes.every((x) => x === CAB_IR_BLANK_FILL)) return false;
    }
    i = end;
  }
  return true;
}

/**
 * The container's content checksum — the value the close frame (`0x7C`) carries.
 *
 * **MEASURED AND INDEPENDENTLY REPRODUCED (2026-10-08):** it is the XOR of every decoded 32-bit chunk
 * word of the data frames — the 8 NAME chunks INCLUDED plus the sample chunks (2048 words on both
 * measured geometries). Verified against 11 independent containers spanning four model bytes
 * (`0x03`, `0x07`, `0x10`, `0x11`) and both geometries (66-frame 32-chunk and 10-frame 256-chunk), each
 * one reproduced byte for byte by two independent implementations.
 *
 * The device VALIDATES it: a container whose close value does not match its content draws close-frame
 * ack `0x13` and is **DISCARDED** — every frame is still acknowledged and the destination slot is left
 * untouched (four controlled arms, see `CAB_IR_CLOSE_MISMATCH`). So this must be RECOMPUTED for any
 * change to the name or the samples; carrying a stale value silently no-ops the upload.
 *
 * Falsified on the way (do not re-try): a sum, CRC-32/CRC-32c, Adler-32, FNV-1a, DJB2, a length field,
 * an opaque constant, samples-only coverage, and the last byte being a separate flag — it is the top
 * septet of the same 32-bit value.
 */
export function cabIrContentXor(bytes: readonly number[] | Uint8Array): number {
  const b = [...bytes];
  const frames: number[][] = [];
  for (let i = 0; i + 1 < b.length; i++) {
    if (b[i] !== SYSEX_START) continue;
    const end = b.indexOf(SYSEX_END, i);
    if (end < 0) break;
    frames.push(b.slice(i, end + 1));
    i = end;
  }
  let xor = 0;
  for (const f of frames) {
    if (f[5] !== CAB_IR_FN_DATA) continue;
    const chunkBytes = framePayload(f).slice(2); // drop the per-geometry 2-byte prefix (00 02 / 20 00)
    for (let i = 0; i + 5 <= chunkBytes.length; i += 5) {
      const w = (chunkBytes[i]! | (chunkBytes[i + 1]! << 7) | (chunkBytes[i + 2]! << 14) | (chunkBytes[i + 3]! << 21) | (chunkBytes[i + 4]! << 28)) >>> 0;
      xor = (xor ^ w) >>> 0;
    }
  }
  return xor >>> 0;
}

/** The 5-septet close payload for a container's content — `pack5Septet32(cabIrContentXor(...))`. */
export function computeCabIrClosePayload(bytes: readonly number[] | Uint8Array): number[] {
  return pack5Septet32(cabIrContentXor(bytes));
}

/**
 * The name-slot flag pattern a NEW container is written with: bit 7 set on slot 31 only — copied from the
 * one real FM3-Edit specimen (see the module header). The flag's meaning is UNVERIFIED, so this is the
 * best-evidenced default, not a decoded rule; `buildCabIrContainerFromWords` takes an override.
 */
export const CAB_IR_DEFAULT_NAME_SLOT_FLAGS: readonly boolean[] = Array.from({ length: CAB_IR_NAME_CHARS }, (_, i) => i === CAB_IR_NAME_CHARS - 1);

/**
 * Build a COMPLETE container from scratch for `dest`: `0x7A` start, 8 × `0x7B` data (the 8 name chunks
 * then `sampleWords`), and a `0x7C` close that is COMPUTED from the content (`computeCabIrClosePayload`).
 *
 * `sampleWords` are the 2040 32-bit words that go in the sample slots, ALREADY ENCODED — this function
 * does not know (and does not claim to know) what a word means; see `cabIrConvert.ts` for the assumed
 * sample encoding. What it guarantees is TRANSPORT integrity: frame checksums valid, geometry exactly the
 * measured 8 × 256 chunks, and a close value that matches the content, so the unit's close check passes.
 * That check is a check of the bytes sent, not of what they mean — it cannot catch a wrong encoding.
 *
 * Refuses a model whose geometry has not been measured (same rule as the blank container).
 */
export function buildCabIrContainerFromWords(
  model: number,
  dest: CabIrDestination,
  name: string,
  sampleWords: readonly number[],
  opts: { nameSlotFlags?: readonly boolean[]; lastCharCode?: number } = {},
): number[] {
  if (!CAB_IR_KNOWN_GEOMETRY_MODELS.includes(model)) {
    throw new Error(
      `buildCabIrContainerFromWords: the IR-container geometry for model 0x${model.toString(16)} has not been measured ` +
        `(known: ${CAB_IR_KNOWN_GEOMETRY_MODELS.map((m) => `0x${m.toString(16)}`).join(', ')}).`,
    );
  }
  if (sampleWords.length !== CAB_IR_SAMPLE_SLOTS) {
    throw new Error(`buildCabIrContainerFromWords: need exactly ${CAB_IR_SAMPLE_SLOTS} sample words, got ${sampleWords.length}`);
  }
  const wanted = [...name];
  if (wanted.length > CAB_IR_NAME_CHARS) throw new Error(`buildCabIrContainerFromWords: name is ${wanted.length} characters — the device stores ${CAB_IR_NAME_CHARS}`);
  if (wanted.some((c) => c.charCodeAt(0) > 0x7f)) throw new Error('buildCabIrContainerFromWords: name must be 7-bit ASCII');
  const flags = opts.nameSlotFlags ?? CAB_IR_DEFAULT_NAME_SLOT_FLAGS;
  // The 32nd character slot is a TERMINATOR, not a space: every FM3-Edit export measured on 2026-10-30
  // stores 0x00 there (`0x80` with the flag bit), and the 0x20 seen in an UltraRes export appears to be a
  // format bit — building a Standard container with a space there fed the unit a payload it could not read.
  const last = opts.lastCharCode ?? 0x00;
  const slots = Array.from({ length: CAB_IR_NAME_CHARS }, (_, i) =>
    (flags[i] ? 0x80 : 0) | (((i === CAB_IR_NAME_CHARS - 1 ? last : (wanted[i] ?? ' ').charCodeAt(0)) & 0x7f)));
  const chunks: number[] = [];
  for (let c = 0; c < CAB_IR_NAME_CHUNKS; c++) {
    chunks.push(...pack5Septet32(((slots[c * 4]!) | (slots[c * 4 + 1]! << 8) | (slots[c * 4 + 2]! << 16) | (slots[c * 4 + 3]! << 24)) >>> 0));
  }
  for (const w of sampleWords) {
    if (!Number.isInteger(w) || w < 0 || w > 0xffffffff) throw new Error(`buildCabIrContainerFromWords: sample word ${w} is not a uint32`);
    chunks.push(...pack5Septet32(w));
  }
  const frames: number[][] = [frameWithChecksum(model, CAB_IR_FN_START, buildCabIrStartPayload(dest))];
  for (let f = 0; f < CAB_IR_DATA_FRAMES; f++) {
    frames.push(frameWithChecksum(model, CAB_IR_FN_DATA, [...CAB_IR_DATA_PREFIX, ...chunks.slice(f * CAB_IR_CHUNK_BYTES_PER_FRAME, (f + 1) * CAB_IR_CHUNK_BYTES_PER_FRAME)]));
  }
  frames.push(frameWithChecksum(model, CAB_IR_FN_END, computeCabIrClosePayload(frames.flat())));
  return frames.flat();
}

/** Rewrite a container's close frame to the value its content requires (and re-fix its frame checksum). */
function fixCloseFrame(frames: number[][]): void {
  const last = frames[frames.length - 1]!;
  if (last[5] !== CAB_IR_FN_END) return;
  const payload = computeCabIrClosePayload(frames.flat());
  frames[frames.length - 1] = [...last.slice(0, 6), ...payload, last[last.length - 2]!, SYSEX_END];
  fixFrameChecksum(frames[frames.length - 1]!);
}

/**
 * Re-emit the container as wire bytes.
 *
 * Default (no options): a **verbatim replay**, except that the close frame is recomputed — which is a
 * no-op for an untouched container (the rule reproduces the file's own value) and a fix for any edit.
 *
 * `name`: rewrite the 32 name slots, preserving every slot's flag bit, and recompute the close value.
 * The name's 8 chunks feed the checksum, so carrying the original close after a rename was a guaranteed
 * mismatch — which is exactly what the device answered `0x13` to, and why the rename never landed.
 *
 * `startPayload`: replace the 0x7A payload wholesale (the retarget experiment). It does not affect the
 * close value: the checksum covers the DATA frames' words only, which is why the destination field can
 * be written freely.
 */
export function buildCabIrSyx(
  ir: CabIrSyx,
  opts: { name?: string; startPayload?: readonly number[]; dest?: CabIrDestination | null; recomputeClose?: boolean } = {},
): number[] {
  const frames = ir.frames.map((f) => [...f]);

  const setStartPayload = (payload: readonly number[]): void => {
    if (payload.some((b) => b > 0x7f)) throw new Error('buildCabIrSyx: startPayload must be 7-bit clean');
    frames[0] = [...frames[0]!.slice(0, 6), ...payload, frames[0]![frames[0]!.length - 2]!, SYSEX_END];
    fixFrameChecksum(frames[0]!);
  };

  if (opts.dest !== undefined) setStartPayload(buildCabIrStartPayload(opts.dest));
  if (opts.startPayload) setStartPayload([...opts.startPayload]);

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

  // The close frame is a checksum over the data frames' words, so it must follow any edit. Recomputing
  // is a NO-OP for an untouched container (the rule reproduces the file's own value — verified), so it
  // is on by default rather than a special case; `recomputeClose: false` exists only to send a
  // deliberately stale value and MEASURE the device's response.
  if (opts.recomputeClose !== false) fixCloseFrame(frames);

  return frames.flat();
}

/** Convenience: replay bytes with a new name (flag bits preserved, close value recomputed). */
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
