/**
 * Modern Fractal family descriptor entry point
 * (`forgefx-midi/devices/gen3`). Entry exports: `AXEFX3_DESCRIPTOR`,
 * `FM3_DESCRIPTOR`, `FM9_DESCRIPTOR`, `VP4_DESCRIPTOR` (plus the
 * `MODERN_FRACTAL_DESCRIPTORS` enumeration). VP4 keeps its
 * writes-gated behavior exactly as configured in `configs/vp4.ts`.
 *
 * Also exports the gen-3 preset codec pipeline for server-side consumers:
 * dump framing (`parsePresetDump`, `retargetPresetDumpToEditBuffer`),
 * raw-patch unpack + Huffman + CRC (`decodeRawPatch`), the structured body
 * decode (`decodeGen3Body`, `decodeGen3PresetDump`), and the FM3-verified
 * generic per-block param extraction (`readBlockParams`, blockParams.ts).
 */
export * from './device.js';

export {
  parsePresetDump,
  parsePresetBank,
  serializePresetDump,
  extractPresetName,
  retargetPresetDumpToEditBuffer,
  HEADER_LEN,
  CHUNK_LEN,
  FOOTER_LEN,
  CHUNKS_PER_PRESET,
  PRESET_DUMP_LEN,
} from './presetDump.js';
export type { ParsedPresetDump } from './presetDump.js';

export {
  decodeRawPatch,
  computeRawPatchCrc,
  computeRawPatchXor,
  crc16ccitt,
  huffmanUncompress,
  huffmanCompress,
  encode16to3,
  reencodeRawPatch,
} from './presetHuffman.js';
export type { DecodedRawPatch } from './presetHuffman.js';

export {
  decodeGen3Body,
  decodeGen3PresetDump,
  effectName,
  modelName,
  getProfile,
  MODEL_AXE_FX_III,
  MODEL_FM3,
  MODEL_FM9,
} from './presetBody.js';
export type {
  Gen3PresetBody,
  Gen3DecodedPreset,
  Gen3GridCell,
  Gen3Block,
  Gen3BlockChannel,
  Gen3Modifier,
  Gen3SceneController,
} from './presetBody.js';

export {
  effectRoster,
  blockRefForEid,
  slugForEffectId,
  blockInstances,
} from './roster.js';

export {
  readBlockParams,
  readBlockParamsForModel,
  gen3BlockParamModel,
  hasBlockParamModel,
  modelsFromBlocks,
  FM3_BLOCK_PARAM_TABLES,
  FM3_BODY_LAYOUT,
} from './blockParams.js';
export type {
  Gen3BlockParamTables,
  Gen3BodyLayout,
  DecodedBlock,
  DecodedBlockParam,
} from './blockParams.js';
export {
  findBlockHeader,
  paramByteOffset,
  writeBlockParam,
  valueToRaw,
  typeParamForFamily,
} from './blockParams.js';
export type { RawWritableParam } from './blockParams.js';

export {
  authorGen3PresetFromIR,
  authorGen3PresetFromIRFull,
  reconcileBlockAnchors,
} from './presetAuthorIr.js';
export type {
  IrAuthorParam,
  IrAuthorBlock,
  IrAuthorPreset,
  AuthoredParamRecord,
  AuthoredBlockRecord,
  AuthoredSkip,
  AuthorIrResult,
  AuthorIrFullResult,
  BlockAnchor,
} from './presetAuthorIr.js';

export {
  buildGen3Body,
  buildCatalogBlock,
  writeSceneNames,
  synthGrid,
  assignGridEffectIds,
  assignFm3GridEffectIds,
  hasSynthModel,
  defaultScaffold,
  defaultScaffoldSyx,
  FM3_BLOCK_GEOMETRY,
  FM9_BLOCK_GEOMETRY,
  AXE3_BLOCK_GEOMETRY,
} from './presetSynth.js';
export type {
  SynthPreset,
  SynthBlock,
  SynthParam,
  SynthGridCell,
  SynthPlacedBlock,
  SynthSkip,
  SynthBodyResult,
  Gen3BlockTemplate,
  CatalogBlockRecord,
} from './presetSynth.js';

export { validateGen3Preset } from './presetValidate.js';
export type { Gen3ValidationResult } from './presetValidate.js';

// User-cab IR `.syx` container (§2.5): parse / verbatim replay / rename / retarget.
// The container geometry is MEASURED from a real FM3-Edit export; the SAMPLE payload is deliberately
// not decoded and the 0x7C value is never recomputed — see the module header for the evidence and the
// list of things it does NOT claim.
export {
  parseCabIrSyx,
  buildCabIrSyx,
  renameCabIrSyx,
  retargetCabIrStart,
  buildCabIrStartPayload,
  cabIrStartDestination,
  cabIrUserSlot,
  cabIrScratchpad,
  interpretCabIrAcks,
  cabIrContentXor,
  buildBlankCabIrContainer,
  isBlankCabIr,
  CAB_IR_BLANK_FILL,
  computeCabIrClosePayload,
  CAB_IR_FN_START,
  CAB_IR_FN_DATA,
  CAB_IR_FN_END,
  CAB_IR_NAME_CHARS,
  CAB_IR_NAME_CHUNKS,
  CAB_IR_CHUNKS_PER_FRAME,
  CAB_IR_SAMPLE_SLOTS,
  CAB_IR_TARGET_UNSPECIFIED,
  CAB_IR_CLOSE_ACCEPTED,
  CAB_IR_CLOSE_MISMATCH,
  CAB_IR_PAGE_USER_BANKS,
  CAB_IR_PAGE_SCRATCHPAD,
  CAB_IR_DEST_NONE,
  CAB_IR_START_TAIL,
} from './cabIrSyx.js';
export type { CabIrSyx, CabIrDestination, CabIrUploadAcks } from './cabIrSyx.js';

// Per-slot cab STATE (`fn=0x01 sub=0x4B`) — the read-back the IR upload lacked. Measured: the reply's
// payload[6] is the populated/empty flag and payload[15..29] is a content-derived region (identical
// for slots holding the same IR). It is NOT a name oracle — see the module header.
export {
  buildCabSlotQuery,
  parseCabSlotState,
  cabSlotNameMatches,
  CAB_SLOT_FN,
  CAB_SLOT_FN_SUBACTIONS,
  CAB_SLOT_REPLY_PAYLOAD_LEN,
  CAB_SLOT_SUB,
  CAB_SLOT_QUERY_LEN,
  CAB_SLOT_REPLY_LEN,
  CAB_SLOT_FLAG_OFFSET,
  CAB_SLOT_REGION_START,
  CAB_SLOT_REGION_LEN,
  CAB_SLOT_VOLATILE_OFFSETS,
  CAB_SLOT_POPULATED,
  CAB_SLOT_EMPTY,
} from './cabSlotState.js';
export type { CabSlotState } from './cabSlotState.js';
export { FIRMWARE_FAMILY_FNS, isFirmwareFamilyFn, frameFn } from './firmwareFamily.js';
export { decodeCabSlotName, CAB_SLOT_NAME_OFFSET, CAB_SLOT_NAME_CHARS } from './cabSlotState.js';
export {
  parsePerformPage,
  patchPerformSlot,
  findPerformTables,
  readText16,
  textStringsIn,
  writeText16,
  performLabelRoundTrip,
  PERFORM_SLOTS,
  PERFORM_TABLE_BYTES,
  PERFORM_RECORD_STRIDE,
} from './performPage.js';
export type { PerformPage, PerformSlot } from './performPage.js';
export {
  parsePerPresetSwitches,
  patchPerPresetSwitch,
  findPerPresetSwitchBlock,
  ppActionName,
  PP_ACTION_CATEGORIES,
  ppTargetLabel,
  ppTargetIsFxSlot,
  ppFunctionName,
  PP_FUNCTION_NAMES,
  PP_FUNCTION_INDEX_BASE,
  PP_HOLD_ACTION_BASE,
  PP_HOLD_MEASURED_INDICES,
  ppWritable,
  PP_TARGET_ANCHORS,
  PP_MEASURED_OFFSETS,
  PP_MARKER,
  PP_MARKER_SIBLING,
  PP_ACTION_OFFSET,
  PP_TARGET_OFFSET,
  PP_SWITCH_COUNT,
  PP_REGION_BYTES,
  PP_ACTION_CODE_INDICES,
  PP_TARGET_BYTE_INDICES,
} from './perPresetSwitches.js';
export type { PerPresetSwitch, PerPresetSwitches, PpMeasuredOffsets, PpRowConfidence, PpEvidence } from './perPresetSwitches.js';

// The preset-AUTHOR path, re-exported so a consumer can rebuild a dump from a patched body without
// reaching into a deep subpath (`reencodeRawPatch` recompresses, `reencodeDumpFromRawPatch` reframes+CRCs).
export { reframeRawPatch, reencodeDumpFromRawPatch } from './presetAuthor.js';
