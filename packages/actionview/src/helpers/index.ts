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

export { htmlEscape, h, htmlEscapeOnce, jsonEscape } from "./ejs-util.js";

export { escapeJavascript, j, javascriptCdataSection, javascriptTag } from "./javascript-helper.js";

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
} from "./sanitize-helper.js";
export type { Sanitizer, SanitizerClass, SanitizerVendor } from "./sanitize-helper.js";

export {
  distanceOfTimeInWords,
  timeAgoInWords,
  distanceOfTimeInWordsToNow,
} from "./date-helper.js";
export type { DistanceOfTimeInput, DistanceOfTimeOptions } from "./date-helper.js";

export { truncate, pluralize, wordWrap, simpleFormat, highlight, excerpt } from "./text-helper.js";
export type {
  TruncateOptions,
  PluralizeOptions,
  WordWrapOptions,
  SimpleFormatOptions,
  HighlightOptions,
  ExcerptOptions,
} from "./text-helper.js";
