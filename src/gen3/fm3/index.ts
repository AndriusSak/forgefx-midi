export { FM3_PARAMS, FM3_PARAMS_BY_FAMILY, FM3_FAMILIES } from './params.js';
// Discrete-ordinal classification overlay (param firmware symbol -> maxOrdinal),
// FM3 family-join: the enum-flow correction routed DISCRETE (sub 09 00).
export {
  FM3_FAMILY_JOIN_DISCRETE,
  FM3_FAMILY_JOIN_PROVENANCE,
  type Fm3FamilyJoinProvenance,
} from './discreteOverlay.js';
// fn=0x1F channel-block WIRE STRIDE overlay: three generated families (FUZZ, CHORUS, DELAY) declare a
// stride that does not describe the body the device sends, which shifts every channel but A when a
// consumer slices a bulk read by it. Corrected with the device's own itemCount + marker-write evidence
// (see sectionStrideOverlay.ts), merged ONCE here so every consumer of `FM3_RANGE_SECTIONS` from THIS
// module — the server's `#channelSlice` is the one that matters today — sees the corrected rows.
// The invariant mirrors FM3_RANGES: import `FM3_RANGE_SECTIONS` from here, never from
// `ranges.generated.js`; the generated file is the PRE-overlay table.
export { FM3_UNMAPPED_SECTIONS, type Fm3RangeFamilyMeta } from './ranges.generated.js';
import { FM3_RANGE_SECTIONS as FM3_RANGE_SECTIONS_GENERATED } from './ranges.generated.js';
import { applyFm3SectionStrideOverlay } from './sectionStrideOverlay.js';
export {
  FM3_SECTION_STRIDE_OVERLAY,
  applyFm3SectionStrideOverlay,
  sectionStrideEntryIsRedundant,
  sectionStrideOverlayFullyRedundant,
  type Fm3SectionStrideOverlayEntry,
  type Fm3SectionTable,
} from './sectionStrideOverlay.js';

/** The device-true FM3 fn=0x1F channel-block strides, with the measured overlay applied. */
export const FM3_RANGE_SECTIONS = applyFm3SectionStrideOverlay(FM3_RANGE_SECTIONS_GENERATED);
// Display-bounds overlay for the typecode-0x52 class. The generated rows carry
// measured-wrong bounds for those 17 rows (see rangeOverlay.ts for the evidence
// and why the fix cannot ship as a generator edit). Merged ONCE, here, so every
// consumer that imports `FM3_RANGES` from THIS module — the server
// (ForgeFX/server/src/devices.ts imports it from `forgefx-midi/gen3/fm3`), Axis,
// the codec, and the IR converter (src/convert/targetRanges.ts) — sees the
// corrected rows.
//
// FIXED CLAIM (2026-10-13): "every consumer sees the corrected rows" was FALSE
// while src/convert/targetRanges.ts imported `FM3_RANGES` straight from
// `./ranges.generated.js`, which BYPASSES this merge. That import is now this
// index's export, so the corrected table is the only one the converter can see.
// The invariant to preserve: import `FM3_RANGES` from here, never from
// `ranges.generated.js` — the generated file is the PRE-overlay table.
import { FM3_RANGES as FM3_RANGES_GENERATED } from './ranges.generated.js';
import { applyFm3RangeOverlay } from './rangeOverlay.js';
export {
  FM3_RANGE_OVERLAY,
  applyFm3RangeOverlay,
  overlayIsRedundant,
  overlayFullyRedundant,
  type Fm3RangeOverlayEntry,
  type Fm3ParamRange,
  type Fm3ValueMap,
  type Fm3RangeTable,
} from './rangeOverlay.js';

/**
 * The device-true FM3 display ranges, with the typecode-0x52 overlay applied.
 * A fresh object built by a pure function — never a mutation of the generated
 * table — so `ranges.generated.ts` stays untouched and the merge is a no-op
 * where upstream is already correct.
 */
export const FM3_RANGES = applyFm3RangeOverlay(FM3_RANGES_GENERATED);
export { FM3_ROSTERS, type Fm3TypeModel } from './rosters.generated.js';
export { FM3_ENUM_OVERRIDES } from './enumOverrides.js';
export { FM3_CAB_IRS } from './cabIrs.generated.js';
export {
  FM3_EFFECT_ID_TABLE,
  FM3_EFFECT_IDS,
  FM3_FAMILY_BY_EFFECT_ID,
  fm3EffectId,
  type Fm3EffectIdEntry,
  type Fm3EffectAddressing,
} from './effectIds.js';
export { FM3_LAYOUTS } from './layouts.generated.js';
export {
  normalizeWidget,
  EDITOR_WIDGET_KINDS,
  type DeviceEditorLayouts,
  type EditorBlockLayout,
  type EditorLayoutVariant,
  type EditorLayoutPage,
  type EditorLayoutRow,
  type EditorLayoutControl,
  type EditorControlPlacement,
  type EditorCrossBlockRef,
  type EditorWidgetKind,
  type EditorFwRange,
} from '../../editorLayouts.js';
export {
  FM3_FC_EFFECT_ID,
  FM3_FC_SWITCHES,
  FM3_FC_VIEWS,
  FM3_FC_LAYOUTS,
  FM3_FC_CONFIGS_PER_LAYOUT,
  FM3_FC_CONFIGS,
  FM3_FC_LABEL_LEN,
  FM3_FC_PARAMS_WIDTH,
  FM3_FC_FIELDS,
  FM3_FC_CATEGORIES,
  FM3_FC_COLORS,
  FM3_FC_LABEL_MODES,
  fm3FcConfigIndex,
  fm3FcParamId,
  fm3FcDecodeLabel,
  fm3FcEncodeLabel,
  type Fm3FcField,
  type Fm3FcFieldDef,
} from './footController.js';
export {
  FM3_MOD_EFFECT_ID,
  FM3_MOD_SLOT_COUNT,
  FM3_MOD_SOURCE_PEDAL1,
  FM3_MOD_SOURCES,
  FM3_MOD_FIELDS,
  fm3ModSlotEid,
  fm3ModParamId,
  fm3ModBindFrames,
  type Fm3ModField,
  type Fm3ModFieldDef,
} from './modifiers.js';
export {
  FM3_FC_FUNCTIONS,
  FM3_FC_CHANNELS,
  fm3FcFunctions,
  type Fm3FcSlotType,
  type Fm3FcSlot,
  type Fm3FcFunctionDef,
} from './fcFunctions.js';
export {
  FM3_MONITOR_PARAMS,
  fm3MonitorParamsFor,
  fm3MonitorDb,
  type Fm3MeterRole,
  type Fm3MonitorParamDef,
} from './meters.js';
export { FM3_HELP_OVERRIDES } from './help.js';
export {
  GEN3_HELP,
  GEN3_COMMON_PARAM_HELP,
  blockHelpFor,
} from '../help.js';
export {
  resolveHelp,
  type BlockHelp,
  type ParamHelp,
  type BlockHelpEntry,
  type HelpCatalog,
  type BlockHelpOverride,
  type HelpOverrides,
} from '../helpTypes.js';
