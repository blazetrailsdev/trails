export { Config, registerDefaultBackend } from "./config.js";
export type {
  Backend,
  ExceptionHandlerLike,
  MissingInterpolationArgumentHandler,
} from "./config.js";
export * from "./exceptions.js";
export { DEFAULT_INTERPOLATION_PATTERNS } from "./interpolate/ruby.js";
export {
  EMPTY_HASH,
  availableLocalesInitialized,
  config,
  enforceAvailableLocales,
  localeAvailable,
  normalizeKeys,
} from "./i18n.js";
export type { Locale, TranslationKey } from "./i18n.js";
