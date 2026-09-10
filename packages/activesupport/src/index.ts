export { NameError } from "./core-ext/name-error.js";
export { FileUpdateChecker } from "./file-update-checker.js";

export { trailsRoot, setTrailsRoot } from "./trails-root.js";

export { IsolatedExecutionState } from "./isolated-execution-state.js";

export {
  EncryptedFile,
  MissingContentError,
  MissingKeyError,
  InvalidKeyLengthError,
} from "./encrypted-file.js";
export type { EncryptedFileOptions } from "./encrypted-file.js";

export { Tempfile } from "./tempfile.js";
export type { TempfileBasename } from "./tempfile.js";

import {
  asyncContextAdapterConfig,
  childProcessAdapterConfig,
  cryptoAdapterConfig,
  fsAdapterConfig,
  httpAdapterConfig,
  osAdapterConfig,
  processAdapterConfig,
  zlibAdapterConfig,
} from "@blazetrails/ruby-compat";
import { ErrorReporter, currentErrorReporter, _setErrorReporter } from "./error-reporter.js";

export const ActiveSupport = {
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

  get httpAdapter(): string | null {
    return httpAdapterConfig.adapter;
  },
  set httpAdapter(name: string | null) {
    httpAdapterConfig.adapter = name;
  },

  get osAdapter(): string | null {
    return osAdapterConfig.adapter;
  },
  set osAdapter(name: string | null) {
    osAdapterConfig.adapter = name;
  },

  get zlibAdapter(): string | null {
    return zlibAdapterConfig.adapter;
  },
  set zlibAdapter(name: string | null) {
    zlibAdapterConfig.adapter = name;
  },

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
  stripHeredoc,
  at,
  first,
  last,
  from,
  to,
  indent,
} from "./string-utils.js";
export { chomp } from "@blazetrails/ruby-compat";

export {
  deepMerge,
  deepMergeBang,
  deepDup,
  slice,
  merge,
  mergeBang,
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
  compactBlank as compactBlankObj,
  compactBlankBang,
  valuesAt,
  toXml,
  fromXml,
  fromTrustedXml,
} from "./hash-utils.js";

export { XMLConverter, DisallowedType, DISALLOWED_TYPES } from "./core-ext/hash/conversions.js";

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
  min,
  selectBang,
  toSentence,
  toXml as toXmlArray,
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

export { atomicWrite } from "./core-ext/file/atomic.js";
export { sliceBang } from "./core-ext/hash/slice.js";
export { BASE36_ALPHABET, BASE58_ALPHABET, base36, base58 } from "./core-ext/securerandom.js";
export {
  nilUuid,
  OID_NAMESPACE,
  uuidFromHash,
  uuidV3,
  uuidV4,
  uuidV5,
} from "./core-ext/digest/uuid.js";

export { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

export { BigDecimal, toD } from "./core-ext/big-decimal/conversions.js";
export { toF, toI } from "./core-ext/string/conversions.js";

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
  FilterListEntry,
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
export type { Benchmarkable, BenchmarkLogger, BenchmarkOptions } from "./benchmarkable.js";

export { Logger, taggedLogging, SimpleFormatter } from "./logger.js";
export { NullLogger, nullLogger } from "./null-logger.js";
export { BroadcastLogger } from "./broadcast-logger.js";
export type { LogLevel, LoggerOutput, TaggedLogger } from "./logger.js";
export { Subscriber } from "./subscriber.js";
export { LogSubscriber } from "./log-subscriber.js";

export { MemoryStore } from "./cache/memory-store.js";
export { DupCoder } from "./cache/memory-store.js";
export { NullStore } from "./cache/null-store.js";
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
import "./core-ext/time/calculations.js";
export * from "./core-ext/time/conversions.js";
export { rfc3339 } from "./time-ext.js";
export * from "./core-ext/time/compatibility.js";
export * from "./core-ext/string/zones.js";

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

export { Benchmark } from "./benchmark.js";
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
export { BacktraceCleaner } from "./backtrace-cleaner.js";
export { OrderedHash } from "./ordered-hash.js";
export { ErrorReporter } from "./error-reporter.js";
export { trailsLogger, _setTrailsLogger } from "./trails-logger-slot.js";
export { trails, _setTrails } from "./trails-slot.js";
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
export { ActiveSupportJSON, parseJsonTimes, setParseJsonTimes } from "./json.js";
export { JSON } from "@blazetrails/ruby-compat";
export {
  presence,
  NilClass,
  FalseClass,
  TrueClass,
  Symbol as BlankSymbol,
  String as BlankString,
  Time as BlankTime,
} from "./core-ext/object/blank.js";
export { Object as ActsLikeObject } from "./core-ext/object/acts-like.js";
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
export { StringIO } from "@blazetrails/ruby-compat";
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
export { hexdigest } from "./hexdigest.js";
export { WeakSet as DescendantsTrackerWeakSet } from "./descendants-tracker.js";
export { ActionableError, NonActionable } from "./actionable-error.js";
export { NullLock } from "./concurrency/null-lock.js";
export { synchronize, Monitor, type MonitorMixin } from "./concurrency/monitor.js";
export { LoadInterlockAwareMonitor } from "./concurrency/load-interlock-aware-monitor.js";
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
export {
  include,
  extend,
  included,
  extended,
  initialize,
  initializeIncludedModules,
  isModuleIncluded,
  Module,
  defineModule,
  moduleVisibility,
  publicInstanceMethods,
} from "@blazetrails/ruby-compat/include";
export type { Included, Extended, ModuleVisibility } from "@blazetrails/ruby-compat/include";
export { CodeGenerator, MethodSet } from "./code-generator.js";
export type { MethodSource } from "./code-generator.js";
export { methodMissingProxy } from "@blazetrails/ruby-compat/method-missing-proxy";
export { prepend } from "@blazetrails/ruby-compat";
export type { PrependMethod, PrependModule } from "@blazetrails/ruby-compat";
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

export { rbEqual } from "@blazetrails/ruby-compat";
export { rbHash } from "@blazetrails/ruby-compat";
export { caseEquals, isInclude } from "./core-ext/range/compare-range.js";
export { overlap, overlaps } from "./core-ext/range/overlap.js";

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
export {
  _ActionDispatchRequest,
  _setActionDispatchRequest,
  type ActionDispatchRequestConstructor,
} from "./action-dispatch-request-slot.js";
