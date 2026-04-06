export {
  registerFsAdapter,
  getFs,
  getPath,
  getFsAsync,
  getPathAsync,
  fsAdapterConfig,
} from "./fs-adapter.js";
export type { FsAdapter, PathAdapter } from "./fs-adapter.js";

export { registerCryptoAdapter, getCrypto, cryptoAdapterConfig } from "./crypto-adapter.js";
export type {
  CryptoAdapter,
  HashAdapter,
  HmacAdapter,
  CipherAdapter,
  DecipherAdapter,
} from "./crypto-adapter.js";

import { fsAdapterConfig } from "./fs-adapter.js";
import { cryptoAdapterConfig } from "./crypto-adapter.js";

/**
 * ActiveSupport configuration — mirrors Rails' ActiveSupport module.
 *
 * In Node, "node" adapters auto-register at module load. The adapter
 * property is null by default (meaning "use auto-detected default").
 * Set explicitly to override:
 *
 *   // Browser:
 *   registerFsAdapter("vfs", vfsImpl, pathImpl);
 *   ActiveSupport.fsAdapter = "vfs";
 *
 *   registerCryptoAdapter("webcrypto", webCryptoImpl);
 *   ActiveSupport.cryptoAdapter = "webcrypto";
 */
export const ActiveSupport = {
  get fsAdapter(): string | null {
    return fsAdapterConfig.adapter;
  },
  set fsAdapter(name: string | null) {
    fsAdapterConfig.adapter = name;
  },

  get cryptoAdapter(): string | null {
    return cryptoAdapterConfig.adapter;
  },
  set cryptoAdapter(name: string | null) {
    cryptoAdapterConfig.adapter = name;
  },
};

export {
  pluralize,
  singularize,
  camelize,
  underscore,
  titleize,
  tableize,
  classify,
  dasherize,
  demodulize,
  deconstantize,
  foreignKey,
  humanize,
  parameterize,
  ordinal,
  ordinalize,
} from "./inflector.js";

export { Inflections, loadDefaults } from "./inflector/inflections.js";

export {
  isBlank,
  isPresent,
  presence,
  squish,
  truncate,
  truncateWords,
  truncateBytes,
  remove,
  ord,
  stripHeredoc,
  downcaseFirst,
  upcaseFirst,
  at,
  first,
  last,
  from,
  to,
  indent,
} from "./string-utils.js";

export {
  deepMerge,
  deepMergeInPlace,
  deepDup,
  slice,
  except,
  deepTransformKeys,
  deepCamelizeKeys,
  deepUnderscoreKeys,
  extractOptions,
  stringifyKeys,
  deepStringifyKeys,
  symbolizeKeys,
  deepSymbolizeKeys,
  reverseMerge,
  assertValidKeys,
  deepTransformValues,
  extractKeys,
  toParam,
  toQuery,
  compact,
  compactBlankObj,
} from "./hash-utils.js";

export {
  wrap,
  inGroupsOf,
  inGroups,
  splitArray,
  extract,
  arrayFrom,
  arrayTo,
  toSentence,
} from "./array-utils.js";

export {
  sum,
  indexBy,
  groupBy,
  pluck,
  maximum,
  minimum,
  inBatchesOf,
  compactBlank,
  many,
  tally,
  filterMap,
  excluding,
  including,
  minBy,
  maxBy,
  eachCons,
  eachSlice,
  inOrderOf,
  exclude,
  without,
  pick,
  sole,
  isIn,
  presenceIn,
} from "./enumerable-utils.js";

export { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

export {
  delegate,
  mattrAccessor,
  cattrAccessor,
  configAccessor,
  attrInternal,
  attrInternalReader,
  attrInternalWriter,
  getAttrInternalNamingFormat,
  setAttrInternalNamingFormat,
  isAnonymous,
  moduleParentName,
  suppress,
  registerSubclass,
  subclasses,
  descendants,
  rescueFrom,
  handleRescue,
} from "./module-ext.js";
export type { MattrOptions } from "./module-ext.js";

export {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
  CallbacksMixin,
} from "./callbacks.js";
export type {
  CallbackKind,
  CallbackCondition,
  CallbackOptions,
  DefineCallbacksOptions,
  BeforeCallback,
  AfterCallback,
  AroundCallback,
} from "./callbacks.js";

export { concern, includeConcern, hasConcern } from "./concern.js";
export type { ConcernDefinition, ConcernMixin } from "./concern.js";

export { classAttribute } from "./class-attribute.js";
export { onLoad, runLoadHooks, resetLoadHooks } from "./lazy-load-hooks.js";
export type { ClassAttributeOptions } from "./class-attribute.js";

export { Logger, taggedLogging, SimpleFormatter } from "./logger.js";
export { BroadcastLogger } from "./broadcast-logger.js";
export type { LogLevel, LoggerOutput, TaggedLogger } from "./logger.js";

export { MemoryStore } from "./cache/memory-store.js";
export { DupCoder } from "./cache/memory-store.js";
export { NullStore } from "./cache/null-store.js";
// FileStore requires node:fs — import from "@blazetrails/activesupport/cache/file-store"
export type { CacheOptions, CacheStore } from "./cache/index.js";

export { Deprecation, DeprecationError, deprecator } from "./deprecation.js";
export type { DeprecationBehavior } from "./deprecation.js";

export * from "./time-ext.js";
// MessageEncryptor/MessageVerifier require node:crypto — use subpath imports:
//   import { MessageVerifier } from "@blazetrails/activesupport/message-verifier"
//   import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor"

export { Duration, seconds, minutes, hours, days, weeks, months, years } from "./duration.js";
export type { DurationParts } from "./duration.js";

export { TimeZone, ZONES_MAP } from "./values/time-zone.js";
export { TimeWithZone } from "./time-with-zone.js";
export type { ChangeOptions, AdvanceOptions } from "./time-with-zone.js";

export { Notifications } from "./notifications.js";
export {
  Event as NotificationEvent,
  Instrumenter,
  LegacyHandle,
  Wrapper as InstrumenterWrapper,
} from "./notifications/instrumenter.js";
export type { EventPayload } from "./notifications/instrumenter.js";
export type { NotificationSubscriber } from "./notifications.js";
export {
  Fanout,
  InstrumentationSubscriberError,
  BaseGroup,
  BaseTimeGroup,
  MonotonicTimedGroup,
  TimedGroup,
  EventedGroup,
  EventObjectGroup,
  Handle,
  AllMessages,
  Evented,
  Timed,
  MonotonicTimed,
  EventObject,
  Subscribers,
} from "./notifications/fanout.js";
export type { Matcher } from "./notifications/fanout.js";

export { ParameterFilter } from "./parameter-filter.js";
export {
  SafeBuffer,
  SafeConcatError,
  htmlSafe,
  htmlEscape,
  htmlEscapeOnce,
  xmlNameEscape,
  isHtmlSafe,
} from "./core-ext/string/output-safety.js";
// KeyGenerator requires node:crypto — import from "@blazetrails/activesupport/key-generator"
export { BacktraceCleaner } from "./backtrace-cleaner.js";
export { OrderedHash } from "./ordered-hash.js";
export { ErrorReporter } from "./error-reporter.js";
export type {
  ErrorSeverity,
  ErrorContext,
  ReportedError,
  ErrorSubscriber,
  HandleOptions,
  RecordOptions,
} from "./error-reporter.js";
export type { ParameterFilterOptions } from "./parameter-filter.js";
export { transliterate } from "./transliterate.js";
export { TagStack, Formatter, LocalTagStorage } from "./tagged-logging.js";
export { TaggedLogging } from "./tagged-logging.js";
export { DeepMergeable } from "./deep-mergeable.js";
export { DelegationError, Delegation } from "./delegation.js";
export {
  NilClass,
  FalseClass,
  TrueClass,
  Symbol as BlankSymbol,
  String as BlankString,
  Time as BlankTime,
} from "./core-ext/object/blank.js";
export { Delegator, Tryable } from "./core-ext/object/try.js";
export {
  isDuplicable,
  Method as DuplicableMethod,
  UnboundMethod as DuplicableUnboundMethod,
  Singleton as DuplicableSingleton,
} from "./core-ext/object/duplicable.js";
export { CurrentAttributes } from "./current-attributes.js";
export { StringInquirer, inquiry } from "./string-inquirer.js";
export { EnvironmentInquirer } from "./environment-inquirer.js";
export { ExecutionContext } from "./execution-context.js";
export { objectWith } from "./core-ext/object/with.js";
export { ArrayInquirer, arrayInquiry } from "./array-inquirer.js";
export { tryCall, tryWith, tryBang } from "./try.js";
export { OrderedOptions, InheritableOptions } from "./ordered-options.js";
// Digest/SecurityUtils/ConfigurationFile require node:crypto/node:fs — use subpath imports:
//   import { Digest } from "@blazetrails/activesupport/digest"
//   import { SecurityUtils } from "@blazetrails/activesupport/security-utils"
//   import { ConfigurationFile } from "@blazetrails/activesupport/configuration-file"
export { WeakSet as DescendantsTrackerWeakSet } from "./descendants-tracker.js";
export { ActionableError, NonActionable } from "./actionable-error.js";
export { NullLock } from "./concurrency/null-lock.js";
// Gzip requires node:zlib — import from "@blazetrails/activesupport/gzip"
export { DescendantsTracker } from "./descendants-tracker.js";
export { Configurable, Configuration } from "./configurable.js";
export {
  Callback,
  CallbackChain,
  CallbackSequence,
  Callbacks,
  Filters,
  Conditionals,
  CallTemplate,
  Before,
  After,
  Around,
  Value,
  MethodCall,
  ObjectCall,
  InstanceExec0,
  InstanceExec1,
  InstanceExec2,
  ProcCall,
} from "./callbacks.js";
export type { ClassMethods } from "./callbacks.js";
export { Concern, MultipleIncludedBlocks, MultiplePrependBlocks } from "./concern.js";
export { include } from "./include.js";
export type { Included } from "./include.js";
export { ClassAttribute } from "./class-attribute.js";

export {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  currentTime,
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "./testing-helpers.js";
export type { AssertCalledOptions, CallRecord } from "./testing-helpers.js";

export {
  makeRange,
  overlap,
  overlaps,
  rangeIncludesValue,
  rangeIncludesRange,
  cover,
  rangeToFs,
  rangeStep,
  rangeEach,
} from "./range-ext.js";
export type { Range as RangeExt } from "./range-ext.js";

export { I18n } from "./i18n.js";
export { Scalar } from "./duration.js";
export { NumberHelper } from "./number-helper.js";
export { NumberConverter } from "./number-helper/number-converter.js";
export { NumberToPhoneConverter } from "./number-helper/number-to-phone-converter.js";
export { NumberToCurrencyConverter } from "./number-helper/number-to-currency-converter.js";
export { NumberToDelimitedConverter } from "./number-helper/number-to-delimited-converter.js";
export { NumberToRoundedConverter } from "./number-helper/number-to-rounded-converter.js";
export { NumberToPercentageConverter } from "./number-helper/number-to-percentage-converter.js";
export { NumberToHumanConverter } from "./number-helper/number-to-human-converter.js";
export { NumberToHumanSizeConverter } from "./number-helper/number-to-human-size-converter.js";
export { RoundingHelper } from "./number-helper/rounding-helper.js";
