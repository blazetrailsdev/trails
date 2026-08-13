export { NameError } from "./core-ext/name-error.js";
export { KeyError } from "./core-ext/key-error.js";
export {
  registerFsAdapter,
  getFs,
  getPath,
  getFsAsync,
  getPathAsync,
  fsAdapterConfig,
} from "./fs-adapter.js";
export type { FsAdapter, FsStatResult, FsDirent, PathAdapter } from "./fs-adapter.js";

export { trailsRoot, setTrailsRoot } from "./trails-root.js";
// Note: glob is intentionally kept as a subpath import
// (`@blazetrails/activesupport/glob`) so browser bundles that don't need
// it don't pull tinyglobby's Node-only transitive deps. Mirrors the
// pattern used by message-verifier, digest, etc.

export {
  registerCryptoAdapter,
  getCrypto,
  getCryptoAsync,
  cryptoAdapterConfig,
  pbkdf2Async,
} from "./crypto-adapter.js";
export type {
  CryptoAdapter,
  HashAdapter,
  HmacAdapter,
  CipherAdapter,
  DecipherAdapter,
} from "./crypto-adapter.js";

export {
  registerAsyncContextAdapter,
  getAsyncContext,
  asyncContextAdapterConfig,
} from "./async-context-adapter.js";
export type { AsyncContext, AsyncContextAdapter } from "./async-context-adapter.js";

export { IsolatedExecutionState } from "./isolated-execution-state.js";

export {
  EncryptedFile,
  MissingContentError,
  MissingKeyError,
  InvalidKeyLengthError,
} from "./encrypted-file.js";
export type { EncryptedFileOptions } from "./encrypted-file.js";

export {
  registerChildProcessAdapter,
  getChildProcess,
  getChildProcessAsync,
  childProcessAdapterConfig,
} from "./child-process-adapter.js";
export type {
  ChildProcessAdapter,
  SpawnSyncOptions,
  SpawnSyncResult,
} from "./child-process-adapter.js";

export { registerOsAdapter, getOs, getOsAsync, osAdapterConfig } from "./os-adapter.js";
export type { OsAdapter } from "./os-adapter.js";

export {
  registerProcessAdapter,
  getProcessAdapter,
  processAdapterConfig,
  env,
  argv,
  stdout,
  stderr,
  stdin,
  cwd,
  chdir,
  platform,
  exit,
  setExitCode,
  onSignal,
  setEnv,
} from "./process-adapter.js";
export type { ProcessAdapter, WriteStream, ReadStream, SignalName } from "./process-adapter.js";

import { fsAdapterConfig } from "./fs-adapter.js";
import { cryptoAdapterConfig } from "./crypto-adapter.js";
import { asyncContextAdapterConfig } from "./async-context-adapter.js";
import { childProcessAdapterConfig } from "./child-process-adapter.js";
import { osAdapterConfig } from "./os-adapter.js";
import { processAdapterConfig } from "./process-adapter.js";
import { ErrorReporter } from "./error-reporter.js";

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
  /**
   * Rails: `@error_reporter = ActiveSupport::ErrorReporter.new` plus
   * `singleton_class.attr_accessor :error_reporter`
   * (activesupport/lib/active_support.rb:104-105) — always a reporter, never
   * nil, so `ActiveSupport.error_reporter.report(...)` call sites need no guard.
   */
  errorReporter: new ErrorReporter(),

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

  get asyncContextAdapter(): string | null {
    return asyncContextAdapterConfig.adapter;
  },
  set asyncContextAdapter(name: string | null) {
    asyncContextAdapterConfig.adapter = name;
  },

  get childProcessAdapter(): string | null {
    return childProcessAdapterConfig.adapter;
  },
  set childProcessAdapter(name: string | null) {
    childProcessAdapterConfig.adapter = name;
  },

  get osAdapter(): string | null {
    return osAdapterConfig.adapter;
  },
  set osAdapter(name: string | null) {
    osAdapterConfig.adapter = name;
  },

  // processAdapter is read-only — there is only one process the program
  // runs in, and the live `env`/`argv` exports require a single source
  // of truth. To switch implementations, call `registerProcessAdapter()`.
  get processAdapter(): string | null {
    return processAdapterConfig.adapter;
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
  constantize,
  safeConstantize,
  registerConstant,
  unregisterConstant,
  privateConstant,
  _resetConstants,
  foreignKey,
  humanize,
  parameterize,
  ordinal,
  ordinalize,
} from "./inflector.js";

export { Inflections, loadDefaults } from "./inflector/inflections.js";

export {
  renameKey,
  toTag,
  XmlStringBuilder,
  IndentedXmlStringBuilder,
  type RenameKeyOptions,
  type ToTagOptions,
  type XmlBuilder,
  type XmlTypeInfo,
} from "./xml-mini.js";

export {
  isBlank,
  isPresent,
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
  chomp,
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
  withIndifferentAccess,
  deepTransformValues,
  extractKeys,
  toParam,
  toQuery,
  isPlainObject,
  compact,
  compactBlankObj,
  valuesAt,
} from "./hash-utils.js";

export {
  asJson,
  ToJsonWithActiveSupportEncoder,
  type ToJsonWithActiveSupportEncoderHost,
} from "./core-ext/object/json.js";

export {
  wrap,
  kernelArray,
  inGroupsOf,
  inGroups,
  splitArray,
  extract,
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
  any,
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

export { BigDecimal } from "./core-ext/big-decimal/conversions.js";

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
  getCallbackChains,
  peekCallbackChain,
  CallbacksMixin,
  throwAbort,
  isAbortSignal,
} from "./callbacks.js";
export type {
  CallbackKind,
  CallbackCondition,
  CallbackOptions,
  DefineCallbacksOptions,
  RunCallbacksOptions,
  BeforeCallback,
  AfterCallback,
  AroundCallback,
  CallbackObject,
} from "./callbacks.js";

export { concern, includeConcern, hasConcern } from "./concern.js";
export type { ConcernDefinition, ConcernMixin } from "./concern.js";

export { classAttribute } from "./class-attribute.js";
export { onLoad, runLoadHooks, resetLoadHooks } from "./lazy-load-hooks.js";
export type { ClassAttributeOptions } from "./class-attribute.js";

export { benchmark } from "./benchmarkable.js";
export type { BenchmarkLogger, BenchmarkOptions } from "./benchmarkable.js";

export { Logger, taggedLogging, SimpleFormatter } from "./logger.js";
export { NullLogger, nullLogger } from "./null-logger.js";
export { BroadcastLogger } from "./broadcast-logger.js";
export type { LogLevel, LoggerOutput, TaggedLogger } from "./logger.js";
export { Subscriber } from "./subscriber.js";
export { LogSubscriber } from "./log-subscriber.js";

export { MemoryStore } from "./cache/memory-store.js";
export { DupCoder } from "./cache/memory-store.js";
export { NullStore } from "./cache/null-store.js";
// FileStore uses getFs()/getPath() adapters but is kept as a subpath import for tree-shaking
export type { CacheOptions, CacheStore } from "./cache/index.js";

export { Deprecation, DeprecationError, DEFAULT_BEHAVIORS, deprecator } from "./deprecation.js";
export type {
  DeprecationBehavior,
  DeprecationBehaviorCallable,
  DeprecationBehaviorInput,
} from "./deprecation.js";
export { Deprecators } from "./deprecation/deprecators.js";

export * from "./time-ext.js";
// MessageEncryptor/MessageVerifier use getCrypto() adapter but are kept as subpath imports:
//   import { MessageVerifier } from "@blazetrails/activesupport/message-verifier"
//   import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor"

export { Duration, seconds, minutes, hours, days, weeks, months, years } from "./duration.js";
export type { DurationParts } from "./duration.js";

export { TimeZone, ZONES_MAP, InvalidTimezoneIdentifier } from "./values/time-zone.js";
export { TimeWithZone } from "./time-with-zone.js";
export type { ChangeOptions, AdvanceOptions } from "./time-with-zone.js";
export {
  getZone,
  setZone,
  resetZone,
  isZoneExplicit,
  getZoneDefault,
  setZoneDefault,
  useZone,
  findZone,
  findZoneBang,
  dateInTimeZone,
  ArgumentError,
} from "./time-zone-config.js";

export { Notifications } from "./notifications.js";
export {
  Event as NotificationEvent,
  Instrumenter,
  LegacyHandle,
  Wrapper as InstrumenterWrapper,
} from "./notifications/instrumenter.js";
export type { EventPayload } from "./notifications/instrumenter.js";
export type {
  NotificationSubscriber,
  NotificationHandle,
  NotificationInstrumenter,
} from "./notifications.js";
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
  isHtmlSafe,
} from "./core-ext/string/output-safety.js";
export {
  unwrappedHtmlEscape,
  htmlEscape,
  h,
  htmlEscapeOnce,
  jsonEscape,
  xmlNameEscape,
} from "./core-ext/tse/util.js";
export { HtmlSafeTranslation } from "./html-safe-translation.js";
// KeyGenerator uses getCrypto() adapter — import from "@blazetrails/activesupport/key-generator"
export { BacktraceCleaner } from "./backtrace-cleaner.js";
export { OrderedHash } from "./ordered-hash.js";
export { ErrorReporter } from "./error-reporter.js";
export { trailsLogger, _setTrailsLogger } from "./trails-logger-slot.js";
export type {
  ErrorSeverity,
  ErrorContext,
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
export { ActiveSupportJSON } from "./json.js";
export {
  presence,
  NilClass,
  FalseClass,
  TrueClass,
  Symbol as BlankSymbol,
  String as BlankString,
  Time as BlankTime,
} from "./core-ext/object/blank.js";
export { Object as InstanceVariablesObject } from "./core-ext/object/instance-variables.js";
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
export { getEnv } from "./environment.js";
export { ExecutionContext } from "./execution-context.js";
export { objectWith } from "./core-ext/object/with.js";
export { withOptions } from "./core-ext/object/with-options.js";
export { OptionMerger } from "./option-merger.js";
export { ArrayInquirer, arrayInquiry } from "./array-inquirer.js";
export { tryCall, tryWith, tryBang } from "./try.js";
export { OrderedOptions, InheritableOptions } from "./ordered-options.js";
// Digest/SecurityUtils/ConfigurationFile use adapter pattern — kept as subpath imports:
//   import { Digest } from "@blazetrails/activesupport/digest"
//   import { SecurityUtils } from "@blazetrails/activesupport/security-utils"
//   import { ConfigurationFile } from "@blazetrails/activesupport/configuration-file"
// Thin wrapper exported from the main index for consumers that can't use subpath imports.
export { hexdigest } from "./hexdigest.js";
export { WeakSet as DescendantsTrackerWeakSet } from "./descendants-tracker.js";
export { ActionableError, NonActionable } from "./actionable-error.js";
export { NullLock } from "./concurrency/null-lock.js";
export { synchronize, Monitor, type MonitorMixin } from "./concurrency/monitor.js";
export { LoadInterlockAwareMonitor } from "./concurrency/load-interlock-aware-monitor.js";
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
export { include, extend, included, extended, Module } from "./include.js";
export type { Included, Extended } from "./include.js";
export { methodMissingProxy } from "./method-missing-proxy.js";
export { prepend } from "./prepend.js";
export type { PrependMethod, PrependModule } from "./prepend.js";
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
export { currentTimeInstant } from "./time-travel.js";

export { Range } from "./range-ext.js";
export { caseEquals, isInclude } from "./core-ext/range/compare-range.js";
export { overlap, overlaps } from "./core-ext/range/overlap.js";
// Note: core-ext/range's conversions and each are intentionally kept as subpath
// imports (`@blazetrails/activesupport/core-ext/range/conversions`), the way
// Rails users reach them through `require "active_support/core_ext/range/..."`.
// Re-exporting them here would collide with `time-ext.ts`'s `Date#to_fs` and the
// enumerable `each`/`step`. Mirrors the pattern used by glob, digest, etc.

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
export { Railtie, registerRailtie } from "./railtie.js";
