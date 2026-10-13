export { FM3_PARAMS, FM3_PARAMS_BY_FAMILY, FM3_FAMILIES } from './params.js';
// Discrete-ordinal classification overlay (param firmware symbol -> maxOrdinal),
// FM3 family-join: the enum-flow correction routed DISCRETE (sub 09 00).
export {
  FM3_FAMILY_JOIN_DISCRETE,
  FM3_FAMILY_JOIN_PROVENANCE,
  type Fm3FamilyJoinProvenance,
} from './discreteOverlay.js';
export {
  FM3_RANGE_SECTIONS,
  FM3_UNMAPPED_SECTIONS,
  type Fm3RangeFamilyMeta,
} from './ranges.generated.js';
// Display-bounds overlay for the typecode-0x52 class. The generated rows carry
// measured-wrong bounds for those 17 rows (see rangeOverlay.ts for the evidence
// and why the fix cannot ship as a generator edit). Merged ONCE, here, so every
// consumer of FM3_RANGES — ForgeFX/server/src/devices.ts, Axis, the codec — sees
// the corrected rows.
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
