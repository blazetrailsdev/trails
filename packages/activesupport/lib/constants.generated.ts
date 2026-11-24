import { defineConstants } from "@blazetrails/ruby-compat/classpath";
import * as m0 from "./actionable-error.js";
import * as m1 from "./array-inquirer.js";
import * as m2 from "./backtrace-cleaner.js";
import * as m3 from "./benchmark.js";
import * as m4 from "./benchmarkable.js";
import * as m5 from "./broadcast-logger.js";
import * as m6 from "./cache/coder.js";
import * as m7 from "./cache/entry.js";
import * as m8 from "./cache/memory-store.js";
import * as m9 from "./cache/null-store.js";
import * as m10 from "./cache/serializer-with-fallback.js";
import * as m11 from "./cache/strategy/local-cache-middleware.js";
import * as m12 from "./cache/strategy/local-cache.js";
import * as m13 from "./callbacks.js";
import * as m14 from "./class-attribute.js";
import * as m15 from "./code-generator.js";
import * as m16 from "./concern.js";
import * as m17 from "./concurrency/load-interlock-aware-monitor.js";
import * as m18 from "./concurrency/null-lock.js";
import * as m19 from "./concurrency/share-lock.js";
import * as m20 from "./configurable.js";
import * as m21 from "./core-ext/big-decimal/conversions.js";
import * as m22 from "./core-ext/date-and-time/calculations.js";
import * as m23 from "./core-ext/date-and-time/compatibility.js";
import * as m24 from "./core-ext/date-and-time/zones.js";
import * as m25 from "./core-ext/enumerable.js";
import * as m26 from "./core-ext/hash/conversions.js";
import * as m27 from "./core-ext/object/json.js";
import * as m28 from "./core-ext/object/try.js";
import * as m29 from "./core-ext/string/output-safety.js";
import * as m30 from "./core-ext/tse/util.js";
import * as m31 from "./current-attributes.js";
import * as m32 from "./deep-mergeable.js";
import * as m33 from "./delegation.js";
import * as m34 from "./dependencies.js";
import * as m35 from "./dependencies/autoload.js";
import * as m36 from "./dependencies/interlock.js";
import * as m37 from "./deprecation.js";
import * as m38 from "./deprecation/behaviors.js";
import * as m39 from "./deprecation/deprecators.js";
import * as m40 from "./deprecation/disallowed.js";
import * as m41 from "./deprecation/method-wrappers.js";
import * as m42 from "./deprecation/proxy-wrappers.js";
import * as m43 from "./deprecation/reporting.js";
import * as m44 from "./descendants-tracker.js";
import * as m45 from "./duration.js";
import * as m46 from "./duration/iso8601-parser.js";
import * as m47 from "./duration/iso8601-serializer.js";
import * as m48 from "./encrypted-configuration.js";
import * as m49 from "./encrypted-file.js";
import * as m50 from "./environment-inquirer.js";
import * as m51 from "./error-reporter.js";
import * as m52 from "./execution-context.js";
import * as m53 from "./execution-wrapper.js";
import * as m54 from "./executor.js";
import * as m55 from "./file-update-checker.js";
import * as m56 from "./gem-version.js";
import * as m57 from "./gzip.js";
import * as m58 from "./hash-with-indifferent-access.js";
import * as m59 from "./html-safe-translation.js";
import * as m60 from "./inflector.js";
import * as m61 from "./inflector/inflections.js";
import * as m62 from "./isolated-execution-state.js";
import * as m63 from "./json/encoding.js";
import * as m64 from "./lazy-load-hooks.js";
import * as m65 from "./log-subscriber.js";
import * as m66 from "./logger-silence.js";
import * as m67 from "./logger-thread-safe-level.js";
import * as m68 from "./logger.js";
import * as m69 from "./message-encryptor.js";
import * as m70 from "./message-verifier.js";
import * as m71 from "./message-verifiers.js";
import * as m72 from "./messages/codec.js";
import * as m73 from "./messages/metadata.js";
import * as m74 from "./messages/rotation-coordinator.js";
import * as m75 from "./messages/serializer-with-fallback.js";
import * as m76 from "./multibyte.js";
import * as m77 from "./multibyte/chars.js";
import * as m78 from "./multibyte/unicode.js";
import * as m79 from "./notifications.js";
import * as m80 from "./notifications/fanout.js";
import * as m81 from "./notifications/instrumenter.js";
import * as m82 from "./number-helper.js";
import * as m83 from "./number-helper/number-converter.js";
import * as m84 from "./number-helper/number-to-currency-converter.js";
import * as m85 from "./number-helper/number-to-delimited-converter.js";
import * as m86 from "./number-helper/number-to-human-converter.js";
import * as m87 from "./number-helper/number-to-human-size-converter.js";
import * as m88 from "./number-helper/number-to-percentage-converter.js";
import * as m89 from "./number-helper/number-to-phone-converter.js";
import * as m90 from "./number-helper/number-to-rounded-converter.js";
import * as m91 from "./number-helper/rounding-helper.js";
import * as m92 from "./option-merger.js";
import * as m93 from "./ordered-hash.js";
import * as m94 from "./ordered-options.js";
import * as m95 from "./parameter-filter.js";
import * as m96 from "./reloader.js";
import * as m97 from "./rescuable.js";
import * as m98 from "./security-utils.js";
import * as m99 from "./string-inquirer.js";
import * as m100 from "./subscriber.js";
import * as m101 from "./syntax-error-proxy.js";
import * as m102 from "./tagged-logging.js";
import * as m103 from "./time-with-zone.js";
import * as m104 from "./values/time-zone.js";
import * as m105 from "./xml-mini.js";

defineConstants([
  [() => m0, "ActionableError", "ActiveSupport::ActionableError"],
  [() => m0, "NonActionable", "ActiveSupport::ActionableError::NonActionable"],
  [() => m1, "ArrayInquirer", "ActiveSupport::ArrayInquirer"],
  [() => m35, "Autoload", "ActiveSupport::Autoload"],
  [() => m2, "BacktraceCleaner", "ActiveSupport::BacktraceCleaner"],
  [() => m3, "Benchmark", "ActiveSupport::Benchmark"],
  [() => m4, "Benchmarkable", "ActiveSupport::Benchmarkable"],
  [() => m21, "BigDecimalWithDefaultFormat", "ActiveSupport::BigDecimalWithDefaultFormat"],
  [() => m5, "BroadcastLogger", "ActiveSupport::BroadcastLogger"],
  [() => m6, "Coder", "ActiveSupport::Cache::Coder"],
  [() => m7, "Entry", "ActiveSupport::Cache::Entry"],
  [() => m8, "MemoryStore", "ActiveSupport::Cache::MemoryStore"],
  [() => m8, "DupCoder", "ActiveSupport::Cache::MemoryStore::DupCoder"],
  [() => m9, "NullStore", "ActiveSupport::Cache::NullStore"],
  [() => m10, "SerializerWithFallback", "ActiveSupport::Cache::SerializerWithFallback"],
  [
    () => m10,
    "Marshal70WithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::Marshal70WithFallback",
  ],
  [
    () => m10,
    "Marshal71WithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::Marshal71WithFallback",
  ],
  [
    () => m10,
    "MessagePackWithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    () => m10,
    "PassthroughWithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::PassthroughWithFallback",
  ],
  [() => m12, "LocalCache", "ActiveSupport::Cache::Strategy::LocalCache"],
  [
    () => m12,
    "LocalCacheRegistry",
    "ActiveSupport::Cache::Strategy::LocalCache::LocalCacheRegistry",
  ],
  [() => m12, "LocalStore", "ActiveSupport::Cache::Strategy::LocalCache::LocalStore"],
  [() => m11, "Middleware", "ActiveSupport::Cache::Strategy::LocalCache::Middleware"],
  [() => m13, "Callbacks", "ActiveSupport::Callbacks"],
  [() => m13, "Callback", "ActiveSupport::Callbacks::Callback"],
  [() => m13, "CallbackChain", "ActiveSupport::Callbacks::CallbackChain"],
  [() => m13, "CallbackSequence", "ActiveSupport::Callbacks::CallbackSequence"],
  [() => m13, "CallTemplate", "ActiveSupport::Callbacks::CallTemplate"],
  [() => m13, "InstanceExec0", "ActiveSupport::Callbacks::CallTemplate::InstanceExec0"],
  [() => m13, "InstanceExec1", "ActiveSupport::Callbacks::CallTemplate::InstanceExec1"],
  [() => m13, "InstanceExec2", "ActiveSupport::Callbacks::CallTemplate::InstanceExec2"],
  [() => m13, "MethodCall", "ActiveSupport::Callbacks::CallTemplate::MethodCall"],
  [() => m13, "ObjectCall", "ActiveSupport::Callbacks::CallTemplate::ObjectCall"],
  [() => m13, "ProcCall", "ActiveSupport::Callbacks::CallTemplate::ProcCall"],
  [() => m13, "ClassMethods", "ActiveSupport::Callbacks::ClassMethods"],
  [() => m13, "Conditionals", "ActiveSupport::Callbacks::Conditionals"],
  [() => m13, "Value", "ActiveSupport::Callbacks::Conditionals::Value"],
  [() => m13, "Filters", "ActiveSupport::Callbacks::Filters"],
  [() => m13, "After", "ActiveSupport::Callbacks::Filters::After"],
  [() => m13, "Around", "ActiveSupport::Callbacks::Filters::Around"],
  [() => m13, "Before", "ActiveSupport::Callbacks::Filters::Before"],
  [() => m13, "Environment", "ActiveSupport::Callbacks::Filters::Environment"],
  [() => m14, "ClassAttribute", "ActiveSupport::ClassAttribute"],
  [() => m15, "CodeGenerator", "ActiveSupport::CodeGenerator"],
  [() => m15, "MethodSet", "ActiveSupport::CodeGenerator::MethodSet"],
  [() => m16, "Concern", "ActiveSupport::Concern"],
  [() => m16, "MultipleIncludedBlocks", "ActiveSupport::Concern::MultipleIncludedBlocks"],
  [() => m16, "MultiplePrependBlocks", "ActiveSupport::Concern::MultiplePrependBlocks"],
  [() => m17, "LoadInterlockAwareMonitor", "ActiveSupport::Concurrency::LoadInterlockAwareMonitor"],
  [
    () => m17,
    "LoadInterlockAwareMonitorMixin",
    "ActiveSupport::Concurrency::LoadInterlockAwareMonitorMixin",
  ],
  [() => m18, "NullLock", "ActiveSupport::Concurrency::NullLock"],
  [() => m19, "ShareLock", "ActiveSupport::Concurrency::ShareLock"],
  [
    () => m17,
    "ThreadLoadInterlockAwareMonitor",
    "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor",
  ],
  [() => m20, "Configurable", "ActiveSupport::Configurable"],
  [() => m20, "Configurable.ClassMethods", "ActiveSupport::Configurable::ClassMethods"],
  [() => m20, "Configuration", "ActiveSupport::Configurable::Configuration"],
  [() => m31, "CurrentAttributes", "ActiveSupport::CurrentAttributes"],
  [() => m32, "DeepMergeable", "ActiveSupport::DeepMergeable"],
  [() => m33, "Delegation", "ActiveSupport::Delegation"],
  [() => m33, "DelegationError", "ActiveSupport::DelegationError"],
  [() => m34, "Dependencies", "ActiveSupport::Dependencies"],
  [() => m36, "Interlock", "ActiveSupport::Dependencies::Interlock"],
  [() => m37, "Deprecation", "ActiveSupport::Deprecation"],
  [() => m38, "Behavior", "ActiveSupport::Deprecation::Behavior"],
  [() => m42, "DeprecatedConstantProxy", "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m42,
    "DeprecatedInstanceVariableProxy",
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m42, "DeprecatedObjectProxy", "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m42, "DeprecationProxy", "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m39, "Deprecators", "ActiveSupport::Deprecation::Deprecators"],
  [() => m40, "Disallowed", "ActiveSupport::Deprecation::Disallowed"],
  [() => m41, "MethodWrapper", "ActiveSupport::Deprecation::MethodWrapper"],
  [() => m43, "Reporting", "ActiveSupport::Deprecation::Reporting"],
  [() => m38, "DeprecationException", "ActiveSupport::DeprecationException"],
  [() => m44, "DescendantsTracker", "ActiveSupport::DescendantsTracker"],
  [
    () => m44,
    "ReloadedClassesFiltering",
    "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering",
  ],
  [() => m44, "WeakSet", "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m45, "Duration", "ActiveSupport::Duration"],
  [() => m46, "ISO8601Parser", "ActiveSupport::Duration::ISO8601Parser"],
  [() => m46, "ParsingError", "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m47, "ISO8601Serializer", "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m45, "Scalar", "ActiveSupport::Duration::Scalar"],
  [() => m48, "EncryptedConfiguration", "ActiveSupport::EncryptedConfiguration"],
  [() => m48, "InvalidContentError", "ActiveSupport::EncryptedConfiguration::InvalidContentError"],
  [() => m48, "InvalidKeyError", "ActiveSupport::EncryptedConfiguration::InvalidKeyError"],
  [() => m49, "EncryptedFile", "ActiveSupport::EncryptedFile"],
  [() => m49, "InvalidKeyLengthError", "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m49, "MissingContentError", "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m49, "MissingKeyError", "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m50, "EnvironmentInquirer", "ActiveSupport::EnvironmentInquirer"],
  [() => m51, "ErrorReporter", "ActiveSupport::ErrorReporter"],
  [() => m51, "ErrorReporter.UnexpectedError", "ActiveSupport::ErrorReporter::UnexpectedError"],
  [() => m52, "ExecutionContext", "ActiveSupport::ExecutionContext"],
  [() => m53, "ExecutionWrapper", "ActiveSupport::ExecutionWrapper"],
  [() => m53, "CompleteHook", "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m53, "RunHook", "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m54, "Executor", "ActiveSupport::Executor"],
  [() => m55, "FileUpdateChecker", "ActiveSupport::FileUpdateChecker"],
  [() => m57, "Gzip", "ActiveSupport::Gzip"],
  [() => m57, "Stream", "ActiveSupport::Gzip::Stream"],
  [() => m58, "HashWithIndifferentAccess", "ActiveSupport::HashWithIndifferentAccess"],
  [() => m59, "HtmlSafeTranslation", "ActiveSupport::HtmlSafeTranslation"],
  [() => m60, null, "ActiveSupport::Inflector"],
  [() => m61, "Inflections", "ActiveSupport::Inflector::Inflections"],
  [() => m61, "Uncountables", "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m94, "InheritableOptions", "ActiveSupport::InheritableOptions"],
  [() => m62, "IsolatedExecutionState", "ActiveSupport::IsolatedExecutionState"],
  [() => m63, "Encoding", "ActiveSupport::JSON::Encoding"],
  [() => m63, "JSONGemEncoder", "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m64, null, "ActiveSupport::LazyLoadHooks"],
  [() => m68, "Logger", "ActiveSupport::Logger"],
  [() => m68, "SimpleFormatter", "ActiveSupport::Logger::SimpleFormatter"],
  [() => m66, "LoggerSilence", "ActiveSupport::LoggerSilence"],
  [() => m67, "LoggerThreadSafeLevel", "ActiveSupport::LoggerThreadSafeLevel"],
  [() => m65, "LogSubscriber", "ActiveSupport::LogSubscriber"],
  [() => m69, "MessageEncryptor", "ActiveSupport::MessageEncryptor"],
  [() => m69, "InvalidMessage", "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m69, "NullSerializer", "ActiveSupport::MessageEncryptor::NullSerializer"],
  [() => m72, "Codec", "ActiveSupport::Messages::Codec"],
  [() => m73, "Metadata", "ActiveSupport::Messages::Metadata"],
  [() => m74, "RotationCoordinator", "ActiveSupport::Messages::RotationCoordinator"],
  [() => m75, "SerializerWithFallback", "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m75, "AllowMarshal", "ActiveSupport::Messages::SerializerWithFallback::AllowMarshal"],
  [
    () => m75,
    "JsonWithFallback",
    "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallback",
  ],
  [
    () => m75,
    "JsonWithFallbackAllowMarshal",
    "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallbackAllowMarshal",
  ],
  [
    () => m75,
    "MarshalWithFallback",
    "ActiveSupport::Messages::SerializerWithFallback::MarshalWithFallback",
  ],
  [
    () => m75,
    "MessagePackWithFallback",
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    () => m75,
    "MessagePackWithFallbackAllowMarshal",
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallbackAllowMarshal",
  ],
  [() => m70, "MessageVerifier", "ActiveSupport::MessageVerifier"],
  [() => m70, "InvalidSignature", "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m71, "MessageVerifiers", "ActiveSupport::MessageVerifiers"],
  [() => m76, "Multibyte", "ActiveSupport::Multibyte"],
  [() => m77, "Chars", "ActiveSupport::Multibyte::Chars"],
  [() => m78, "Unicode", "ActiveSupport::Multibyte::Unicode"],
  [() => m79, "Notifications", "ActiveSupport::Notifications"],
  [() => m81, "Event", "ActiveSupport::Notifications::Event"],
  [() => m80, "Fanout", "ActiveSupport::Notifications::Fanout"],
  [() => m80, "BaseGroup", "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m80, "BaseTimeGroup", "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m80, "EventedGroup", "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m80, "EventObjectGroup", "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m80, "Handle", "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m80, "MonotonicTimedGroup", "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m80, "Subscribers", "ActiveSupport::Notifications::Fanout::Subscribers"],
  [() => m80, "Evented", "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m80, "EventObject", "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m80, "Matcher", "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m80,
    "AllMessages",
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [
    () => m80,
    "MonotonicTimed",
    "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed",
  ],
  [() => m80, "Timed", "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m80, "TimedGroup", "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m80,
    "InstrumentationSubscriberError",
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m81, "Instrumenter", "ActiveSupport::Notifications::Instrumenter"],
  [() => m81, "LegacyHandle", "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m81, "Wrapper", "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m82, "NumberHelper", "ActiveSupport::NumberHelper"],
  [() => m83, "NumberConverter", "ActiveSupport::NumberHelper::NumberConverter"],
  [
    () => m84,
    "NumberToCurrencyConverter",
    "ActiveSupport::NumberHelper::NumberToCurrencyConverter",
  ],
  [
    () => m85,
    "NumberToDelimitedConverter",
    "ActiveSupport::NumberHelper::NumberToDelimitedConverter",
  ],
  [() => m86, "NumberToHumanConverter", "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [
    () => m87,
    "NumberToHumanSizeConverter",
    "ActiveSupport::NumberHelper::NumberToHumanSizeConverter",
  ],
  [
    () => m88,
    "NumberToPercentageConverter",
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m89, "NumberToPhoneConverter", "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m90, "NumberToRoundedConverter", "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m91, "RoundingHelper", "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m92, "OptionMerger", "ActiveSupport::OptionMerger"],
  [() => m93, "OrderedHash", "ActiveSupport::OrderedHash"],
  [() => m94, "OrderedOptions", "ActiveSupport::OrderedOptions"],
  [() => m95, "ParameterFilter", "ActiveSupport::ParameterFilter"],
  [() => m96, "Reloader", "ActiveSupport::Reloader"],
  [() => m97, "Rescuable", "ActiveSupport::Rescuable"],
  [() => m97, "ClassMethods", "ActiveSupport::Rescuable::ClassMethods"],
  [() => m29, "SafeBuffer", "ActiveSupport::SafeBuffer"],
  [() => m29, "SafeConcatError", "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m98, "SecurityUtils", "ActiveSupport::SecurityUtils"],
  [() => m99, "StringInquirer", "ActiveSupport::StringInquirer"],
  [() => m100, "Subscriber", "ActiveSupport::Subscriber"],
  [() => m101, "SyntaxErrorProxy", "ActiveSupport::SyntaxErrorProxy"],
  [() => m101, "BacktraceLocation", "ActiveSupport::SyntaxErrorProxy::BacktraceLocation"],
  [() => m101, "BacktraceLocationProxy", "ActiveSupport::SyntaxErrorProxy::BacktraceLocationProxy"],
  [() => m102, "TaggedLogging", "ActiveSupport::TaggedLogging"],
  [() => m102, "Formatter", "ActiveSupport::TaggedLogging::Formatter"],
  [() => m102, "LocalTagStorage", "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m102, "TagStack", "ActiveSupport::TaggedLogging::TagStack"],
  [() => m103, "TimeWithZone", "ActiveSupport::TimeWithZone"],
  [() => m104, "TimeZone", "ActiveSupport::TimeZone"],
  [() => m27, "ToJsonWithActiveSupportEncoder", "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m28, "Tryable", "ActiveSupport::Tryable"],
  [() => m56, "VERSION", "ActiveSupport::VERSION"],
  [() => m26, "XMLConverter", "ActiveSupport::XMLConverter"],
  [() => m26, "DisallowedType", "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m105, null, "ActiveSupport::XmlMini"],
  [() => m105, "FileLike", "ActiveSupport::XmlMini::FileLike"],
  [() => m22, null, "DateAndTime::Calculations"],
  [() => m23, null, "DateAndTime::Compatibility"],
  [() => m24, "Zones", "DateAndTime::Zones"],
  [() => m25, "SoleItemExpectedError", "Enumerable::SoleItemExpectedError"],
  [() => m30, "Util", "TSE::Util"],
  [() => m27, "Generic", "URI::Generic"],
]);
