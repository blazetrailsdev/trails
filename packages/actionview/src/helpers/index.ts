export { FormBuilder } from "./form-builder.js";
export type { FormBuilderOptions } from "./form-builder.js";

export { raw, safeJoin, toSentence } from "./output-safety-helper.js";
export type { ToSentenceOptions } from "./output-safety-helper.js";

export { debug } from "./debug-helper.js";

export {
  tag,
  contentTag,
  tokenList,
  classNames,
  cdataSection,
  escapeOnce,
  buildTagValues,
  TagBuilder,
  resetTagBuilder,
} from "./tag-helper.js";

export { escapeJavascript, j, javascriptCdataSection, javascriptTag } from "./javascript-helper.js";

export {
  capture,
  contentFor,
  contentForQuestion,
  provide,
  withOutputBuffer,
} from "./capture-helper.js";
export type { CaptureHelperHost } from "./capture-helper.js";

export {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberWithDelimiter,
  numberWithPrecision,
  numberToHumanSize,
  numberToHuman,
  InvalidNumberError,
} from "./number-helper.js";
export type { NumberHelperOptions } from "./number-helper.js";

export {
  sanitize,
  sanitizeCss,
  stripTags,
  stripLinks,
  getSanitizerVendor,
  setSanitizerVendor,
  getFullSanitizer,
  setFullSanitizer,
  getLinkSanitizer,
  setLinkSanitizer,
  getSafeListSanitizer,
  setSafeListSanitizer,
  sanitizedAllowedTags,
  sanitizedAllowedAttributes,
  SanitizeHelper,
} from "./sanitize-helper.js";
export type { Sanitizer, SanitizerClass, SanitizerVendor } from "./sanitize-helper.js";

export {
  distanceOfTimeInWords,
  timeAgoInWords,
  distanceOfTimeInWordsToNow,
} from "./date-helper.js";
export type { DistanceOfTimeInput, DistanceOfTimeOptions } from "./date-helper.js";

export {
  truncate,
  pluralize,
  wordWrap,
  simpleFormat,
  highlight,
  excerpt,
  concat,
  safeConcat,
  cycle,
  currentCycle,
  resetCycle,
  Cycle,
} from "./text-helper.js";
export type {
  TruncateOptions,
  PluralizeOptions,
  WordWrapOptions,
  SimpleFormatOptions,
  HighlightOptions,
  ExcerptOptions,
  CycleOptions,
  TextHelperHost,
} from "./text-helper.js";

export {
  assignController,
  logger,
  installControllerDelegates,
  installControllerInternals,
  CONTROLLER_DELEGATES,
} from "./controller-helper.js";
export type { ControllerHelperHost } from "./controller-helper.js";

export {
  URI_REGEXP,
  assetPath,
  pathToAsset,
  ASSET_EXTENSIONS,
  computeAssetExtname,
  ASSET_PUBLIC_DIRECTORIES,
  computeAssetPath,
  publicComputeAssetPath,
  computeAssetHost,
  stylesheetPath,
  pathToStylesheet,
} from "./asset-url-helper.js";
export type {
  AssetPathOptions,
  AssetPathsConfig,
  AssetUrlRequest,
  AssetUrlHelperHost,
} from "./asset-url-helper.js";

export { AssetTagHelper, stylesheetLinkTag } from "./asset-tag-helper.js";
