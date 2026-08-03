export { Config } from "./config.js";
export type { ExceptionHandlerLike, MissingInterpolationArgumentHandler } from "./config.js";
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
  availableLocales,
  availableLocalesInitialized,
  backend,
  config,
  defaultLocale,
  defaultSeparator,
  eagerLoadBang,
  enforceAvailableLocales,
  enforceAvailableLocalesBang,
  exceptionHandler,
  exists,
  interpolationKeys,
  l,
  loadPath,
  locale,
  localeAvailable,
  localize,
  normalizeKeys,
  reloadBang,
  reserveKey,
  reservedKeysPattern,
  setConfig,
  setAvailableLocales,
  setBackend,
  setDefaultLocale,
  setDefaultSeparator,
  setEnforceAvailableLocales,
  setExceptionHandler,
  setLoadPath,
  setLocale,
  t,
  tBang,
  translate,
  translateBang,
  transliterate,
  withLocale,
} from "./i18n.js";
export type { Locale, TranslateKey, TranslationKey } from "./i18n.js";
export { Base, registerFileReader, preloadTranslationFiles } from "./backend/base.js";
export type { FileReader, TranslateOptions } from "./backend/base.js";
export { Simple } from "./backend/simple.js";
export { Fallbacks, fallbacks, setFallbacks, resetFallbacks } from "./backend/fallbacks.js";
export type { FallbacksLike, FallbacksMethods } from "./backend/fallbacks.js";
// `I18n::Locale::Fallbacks` and `I18n::Backend::Fallbacks` are two classes of
// the same name; this barrel is flat, and the `Locale` namespace spelling is
// taken by the `Locale` type above, so the locale one is qualified here. Both
// keep the gem's name in their own file.
export { Fallbacks as LocaleFallbacks, Tag } from "./locale.js";
export type { FallbackMappings } from "./locale.js";
export { ThrownException, catchException, throwException } from "./throw-catch.js";
export { deepMerge, deepMergeBang, deepSymbolizeKeys, except } from "./utils.js";
export type { TranslationData } from "./utils.js";
