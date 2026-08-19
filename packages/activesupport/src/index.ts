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
import { ErrorReporter, currentErrorReporter, _setErrorReporter } from "./error-reporter.js";

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
  get errorReporter(): ErrorReporter {
    return currentErrorReporter;
  },
  set errorReporter(reporter: ErrorReporter) {
    _setErrorReporter(reporter);
  },

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
  constRegexp,
  ordinal,
  ordinalize,
  upcaseFirst,
  downcaseFirst,
  camelcase,
  titlecase,
} from "./inflector.js";

export { Inflections, Uncountables, loadDefaults, inflections } from "./inflector/inflections.js";

export {
  PARSING,
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
  deepMergeBang,
  deepDup,
  slice,
  except,
  deepTransformKeys,
  deepCamelizeKeys,
  deepUnderscoreKeys,
  extractOptionsBang,
  isExtractableOptions,
  stringifyKeys,
  deepStringifyKeys,
  symbolizeKeys,
  deepSymbolizeKeys,
  reverseMerge,
  assertValidKeys,
  withIndifferentAccess,
  deepTransformValues,
  stringifyKeysBang,
  symbolizeKeysBang,
  toOptions,
  toOptionsBang,
  deepTransformKeysBang,
  deepStringifyKeysBang,
  deepSymbolizeKeysBang,
  _deepTransformKeysInObject,
  _deepTransformKeysInObjectBang,
  withDefaults,
  reverseMergeBang,
  reverseUpdate,
  withDefaultsBang,
  exceptBang,
  nestedUnderIndifferentAccess,
  toParam,
  toQuery,
  isPlainObject,
  compact,
  // `compactBlank` is Hash#compact_blank (core_ext/enumerable.rb:222-224);
  // the barrel already exports Enumerable#compact_blank under the bare name
  // from enumerable-utils.ts, and one ESM namespace cannot hold both.
  compactBlank as compactBlankObj,
  compactBlankBang,
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
  split,
  extractBang,
  toSentence,
} from "./array-utils.js";

export {
  sum,
  indexBy,
  indexWith,
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

export { sliceBang } from "./core-ext/hash/slice.js";
export { BASE36_ALPHABET, BASE58_ALPHABET, base36, base58 } from "./core-ext/securerandom.js";
export { nilUuid, uuidFromHash, uuidV3, uuidV4, uuidV5 } from "./core-ext/digest/uuid.js";

// Note: `Hash#extract!` is intentionally kept off this flat index and reached
// through the "./core-ext/hash/slice" subpath, which mirrors its Rails require
// path (`active_support/core_ext/hash/slice`). `Hash#extract!`
// (core_ext/hash/slice.rb:24-26) and `Array#extract!` (core_ext/array/extract.rb)
// are distinct Ruby methods on distinct receivers, so they never collide there;
// in a flat ESM namespace they do, and array-utils' `extractBang` owns the
// spelling here. Same shape as the core-ext/range and core-ext/date notes above.

export { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

export { BigDecimal } from "./core-ext/big-decimal/conversions.js";

export {
  delegate,
  mattrAccessor,
  mattrReader,
  mattrWriter,
  cattrAccessor,
  cattrReader,
  cattrWriter,
  configAccessor,
  attrInternal,
  attrInternalAccessor,
  attrInternalReader,
  attrInternalWriter,
  getAttrInternalNamingFormat,
  setAttrInternalNamingFormat,
  isAnonymous,
  moduleParent,
  moduleParentName,
  moduleParents,
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

export { Deprecation, DeprecationException, DEFAULT_BEHAVIORS } from "./deprecation.js";
export { deprecator } from "./deprecator.js";
export { VERSION, gemVersion } from "./gem-version.js";
export type {
  DeprecationBehavior,
  DeprecationBehaviorCallable,
  DeprecationBehaviorInput,
} from "./deprecation.js";
export { Deprecators } from "./deprecation/deprecators.js";
export {
  DeprecationProxy,
  DeprecatedObjectProxy,
  DeprecatedInstanceVariableProxy,
  DeprecatedConstantProxy,
} from "./deprecation/proxy-wrappers.js";
export {
  assertDeprecated,
  assertNotDeprecated,
  collectDeprecations,
} from "./testing/deprecation.js";

export * from "./time-ext.js";
export * from "./core-ext/time/conversions.js";
// Two Ruby methods, one TS spelling: the class-side parser `Time.rfc3339(str)`
// (`core_ext/time/calculations.rb:69-83`) lives in `time-ext.js`, and the
// instance-side alias `Time#rfc3339` (`core_ext/time/conversions.rb:74`, an
// `alias_method` of `xmlschema`) lives in `core-ext/time/conversions.js`. In
// Ruby they never collide; in a flat ESM namespace the two star exports make
// the name ambiguous and ESM drops it silently, taking `Time.rfc3339` down
// too. The explicit re-export below pins the class-side one, and the
// instance-side alias is reached through the subpath
// `@blazetrails/activesupport/core-ext/time/conversions` -- the same shape the
// comment below documents for core-ext/range's and core-ext/date's
// conversions.
export { rfc3339 } from "./time-ext.js";
export * from "./core-ext/time/compatibility.js";
export * from "./core-ext/string/zones.js";
// MessageEncryptor/MessageVerifier use getCrypto() adapter but are kept as subpath imports:
//   import { MessageVerifier } from "@blazetrails/activesupport/message-verifier"
//   import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor"

export { Duration, seconds, minutes, hours, days, weeks, months, years } from "./duration.js";
export type { DurationParts } from "./duration.js";

export { TimeZone, ZONES_MAP, InvalidTimezoneIdentifier } from "./values/time-zone.js";
export { TimeWithZone } from "./time-with-zone.js";
export type { ChangeOptions, AdvanceOptions } from "./time-with-zone.js";
export {
  zone,
  setZone,
  zoneDefault,
  setZoneDefault,
  useZone,
  findZone,
  findZoneBang,
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
export type { NotificationSubscriber, NotificationHandle } from "./notifications.js";
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
  Matcher,
  AllMessages,
  Evented,
  Timed,
  MonotonicTimed,
  EventObject,
  Subscribers,
} from "./notifications/fanout.js";

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
export { transliterate, parameterize } from "./transliterate.js";
export { TagStack, Formatter, LocalTagStorage } from "./tagged-logging.js";
export { TaggedLogging } from "./tagged-logging.js";
export { DeepMergeable } from "./deep-mergeable.js";
export { DelegationError, Delegation } from "./delegation.js";
export { ActiveSupportJSON } from "./json.js";
export { JSON } from "./json-stdlib.js";
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
export { StringIO } from "./string-io.js";
export { EnvironmentInquirer } from "./environment-inquirer.js";
export { Reloader } from "./reloader.js";
export { getEnv } from "./environment.js";
export { ExecutionContext } from "./execution-context.js";
export {
  ExecutionWrapper,
  RunHook,
  CompleteHook,
  type ExecutionHook,
  type CompletableExecution,
} from "./execution-wrapper.js";
export { Executor } from "./executor.js";
export { objectWith } from "./core-ext/object/with.js";
export { withOptions } from "./core-ext/object/with-options.js";
export { OptionMerger } from "./option-merger.js";
export { ArrayInquirer, inquiry as arrayInquiry } from "./array-inquirer.js";
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
export { CodeGenerator, MethodSet } from "./code-generator.js";
export type { MethodSource } from "./code-generator.js";
export { methodMissingProxy } from "./method-missing-proxy.js";
export { prepend } from "./prepend.js";
export type { PrependMethod, PrependModule } from "./prepend.js";
export { ClassAttribute } from "./class-attribute.js";

export {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  unfreezeTime,
  afterTeardown,
  SimpleStubs,
} from "./testing/time-helpers.js";
export {
  MockExpectationError,
  assertCalled,
  assertCalledWith,
  assertNotCalled,
  expectCalledWith,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
  stubAnyInstance,
} from "./testing/method-call-assertions.js";
export {
  assert,
  assertNot,
  assertPredicate,
  assertNotPredicate,
  assertRespondTo,
  assertNotRespondTo,
  assertEmpty,
  assertNotEmpty,
  assertSame,
  assertNotSame,
  assertRaises,
  assertRaise,
  assertNothingRaised,
  assertDifference,
  assertNoDifference,
  assertChanges,
  assertNoChanges,
  UnexpectedError,
  UNTRACKED,
  BacktraceFilter,
  Minitest,
} from "./testing/assertions.js";
export { beforeSetup, setTaggedLogger } from "./testing/tagged-logging.js";
export { currentTime } from "./time-travel.js";
export { currentTimeInstant } from "./time-travel.js";

export { Range } from "./range-ext.js";
export { caseEquals, isInclude } from "./core-ext/range/compare-range.js";
export { overlap, overlaps } from "./core-ext/range/overlap.js";
// Note: core-ext/range's conversions and each are intentionally kept as subpath
// imports (`@blazetrails/activesupport/core-ext/range/conversions`), the way
// Rails users reach them through `require "active_support/core_ext/range/..."`.
// Re-exporting them here would collide with `time-ext.ts`'s `Date#to_fs` and the
// enumerable `each`/`step`. Mirrors the pattern used by glob, digest, etc.
//
// Same for core-ext/date's calculations
// (`@blazetrails/activesupport/core-ext/date/calculations`), the `Date` arm of
// `active_support/core_ext/date/calculations.rb`: in Ruby its `ago`/`since`/
// `beginning_of_day`/`middle_of_day`/`end_of_day`/`advance`/`change`/`current`
// are methods on `Date`, so they never collide with the `Time` arm's
// same-named methods; in a flat ESM namespace they would, and `time-ext.js`
// below owns those spellings, and for core-ext/string's conversions
// (`@blazetrails/activesupport/core-ext/string/conversions`), the `String` arm
// of `to_time`/`to_date`/`to_datetime`.
//
// core-ext/date-time's calculations
// (`@blazetrails/activesupport/core-ext/date-time/calculations`) is the same
// case one receiver over: `DateTime.current`
// (`active_support/core_ext/date_time/calculations.rb:10-12`) is
// `Time.current` plus `to_datetime`, so in Ruby the two never collide and in a
// flat ESM namespace they would.
// Its `conversions` sibling
// (`@blazetrails/activesupport/core-ext/date-time/conversions`) is the same
// case again: `DateTime#usec`/`#nsec`/`#to_i`
// (`active_support/core_ext/date_time/conversions.rb:79-96`) read the
// receiver's own offset where the `Time` arm reads an instant.

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
export { inspect, toS } from "./core-ext/object/inspect.js";
