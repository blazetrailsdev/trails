export { Config, registerDefaultBackend } from "./config.js";
export type {
  Backend,
  ExceptionHandlerLike,
  MissingInterpolationArgumentHandler,
} from "./config.js";
export {
  ArgumentError,
  Disabled,
  ExceptionHandler,
  InvalidLocale,
  InvalidLocaleData,
  InvalidPluralizationData,
  MissingInterpolationArgument,
  MissingTranslation,
  MissingTranslationData,
  ReservedInterpolationKey,
  UnknownFileType,
} from "./exceptions.js";
export type { MissingTranslationOptions } from "./exceptions.js";
export {
  DEFAULT_INTERPOLATION_PATTERNS,
  interpolate,
  interpolateHash,
} from "./interpolate/ruby.js";
export {
  EMPTY_HASH,
  RESERVED_KEYS,
  availableLocalesInitialized,
  config,
  enforceAvailableLocales,
  localeAvailable,
  normalizeKeys,
  reserveKey,
  reservedKeysPattern,
} from "./i18n.js";
export type { Locale, TranslationKey } from "./i18n.js";
export { Base } from "./backend/base.js";
export type { TranslateOptions } from "./backend/base.js";
export { Simple } from "./backend/simple.js";
export { ThrownException, catchException, throwException } from "./throw-catch.js";
export { deepMerge, deepMergeBang, deepSymbolizeKeys, except } from "./utils.js";
export type { TranslationData } from "./utils.js";
