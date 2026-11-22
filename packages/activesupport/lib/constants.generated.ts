import { defineConstants } from "@blazetrails/ruby-compat";
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
import * as m41 from "./deprecation/proxy-wrappers.js";
import * as m42 from "./deprecation/reporting.js";
import * as m43 from "./descendants-tracker.js";
import * as m44 from "./duration.js";
import * as m45 from "./duration/iso8601-parser.js";
import * as m46 from "./duration/iso8601-serializer.js";
import * as m47 from "./encrypted-configuration.js";
import * as m48 from "./encrypted-file.js";
import * as m49 from "./environment-inquirer.js";
import * as m50 from "./error-reporter.js";
import * as m51 from "./execution-context.js";
import * as m52 from "./execution-wrapper.js";
import * as m53 from "./executor.js";
import * as m54 from "./file-update-checker.js";
import * as m55 from "./gem-version.js";
import * as m56 from "./gzip.js";
import * as m57 from "./hash-with-indifferent-access.js";
import * as m58 from "./html-safe-translation.js";
import * as m59 from "./inflector.js";
import * as m60 from "./inflector/inflections.js";
import * as m61 from "./isolated-execution-state.js";
import * as m62 from "./json/encoding.js";
import * as m63 from "./lazy-load-hooks.js";
import * as m64 from "./log-subscriber.js";
import * as m65 from "./logger-silence.js";
import * as m66 from "./logger-thread-safe-level.js";
import * as m67 from "./logger.js";
import * as m68 from "./message-encryptor.js";
import * as m69 from "./message-verifier.js";
import * as m70 from "./message-verifiers.js";
import * as m71 from "./messages/codec.js";
import * as m72 from "./messages/metadata.js";
import * as m73 from "./messages/rotation-coordinator.js";
import * as m74 from "./messages/serializer-with-fallback.js";
import * as m75 from "./multibyte.js";
import * as m76 from "./multibyte/chars.js";
import * as m77 from "./multibyte/unicode.js";
import * as m78 from "./notifications.js";
import * as m79 from "./notifications/fanout.js";
import * as m80 from "./notifications/instrumenter.js";
import * as m81 from "./number-helper.js";
import * as m82 from "./number-helper/number-converter.js";
import * as m83 from "./number-helper/number-to-currency-converter.js";
import * as m84 from "./number-helper/number-to-delimited-converter.js";
import * as m85 from "./number-helper/number-to-human-converter.js";
import * as m86 from "./number-helper/number-to-human-size-converter.js";
import * as m87 from "./number-helper/number-to-percentage-converter.js";
import * as m88 from "./number-helper/number-to-phone-converter.js";
import * as m89 from "./number-helper/number-to-rounded-converter.js";
import * as m90 from "./number-helper/rounding-helper.js";
import * as m91 from "./option-merger.js";
import * as m92 from "./ordered-hash.js";
import * as m93 from "./ordered-options.js";
import * as m94 from "./parameter-filter.js";
import * as m95 from "./reloader.js";
import * as m96 from "./rescuable.js";
import * as m97 from "./security-utils.js";
import * as m98 from "./string-inquirer.js";
import * as m99 from "./subscriber.js";
import * as m100 from "./syntax-error-proxy.js";
import * as m101 from "./tagged-logging.js";
import * as m102 from "./time-with-zone.js";
import * as m103 from "./values/time-zone.js";
import * as m104 from "./xml-mini.js";

defineConstants([
  [m0, "ActionableError", "ActiveSupport::ActionableError"],
  [m0, "NonActionable", "ActiveSupport::ActionableError::NonActionable"],
  [m1, "ArrayInquirer", "ActiveSupport::ArrayInquirer"],
  [m35, "Autoload", "ActiveSupport::Autoload"],
  [m2, "BacktraceCleaner", "ActiveSupport::BacktraceCleaner"],
  [m3, "Benchmark", "ActiveSupport::Benchmark"],
  [m4, "Benchmarkable", "ActiveSupport::Benchmarkable"],
  [m21, "BigDecimalWithDefaultFormat", "ActiveSupport::BigDecimalWithDefaultFormat"],
  [m5, "BroadcastLogger", "ActiveSupport::BroadcastLogger"],
  [m6, "Coder", "ActiveSupport::Cache::Coder"],
  [m7, "Entry", "ActiveSupport::Cache::Entry"],
  [m8, "MemoryStore", "ActiveSupport::Cache::MemoryStore"],
  [m8, "DupCoder", "ActiveSupport::Cache::MemoryStore::DupCoder"],
  [m9, "NullStore", "ActiveSupport::Cache::NullStore"],
  [m10, "SerializerWithFallback", "ActiveSupport::Cache::SerializerWithFallback"],
  [
    m10,
    "Marshal70WithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::Marshal70WithFallback",
  ],
  [
    m10,
    "Marshal71WithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::Marshal71WithFallback",
  ],
  [
    m10,
    "MessagePackWithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    m10,
    "PassthroughWithFallback",
    "ActiveSupport::Cache::SerializerWithFallback::PassthroughWithFallback",
  ],
  [m12, "LocalCache", "ActiveSupport::Cache::Strategy::LocalCache"],
  [m12, "LocalCacheRegistry", "ActiveSupport::Cache::Strategy::LocalCache::LocalCacheRegistry"],
  [m12, "LocalStore", "ActiveSupport::Cache::Strategy::LocalCache::LocalStore"],
  [m11, "Middleware", "ActiveSupport::Cache::Strategy::LocalCache::Middleware"],
  [m13, "Callbacks", "ActiveSupport::Callbacks"],
  [m13, "Callback", "ActiveSupport::Callbacks::Callback"],
  [m13, "CallbackChain", "ActiveSupport::Callbacks::CallbackChain"],
  [m13, "CallbackSequence", "ActiveSupport::Callbacks::CallbackSequence"],
  [m13, "CallTemplate", "ActiveSupport::Callbacks::CallTemplate"],
  [m13, "InstanceExec0", "ActiveSupport::Callbacks::CallTemplate::InstanceExec0"],
  [m13, "InstanceExec1", "ActiveSupport::Callbacks::CallTemplate::InstanceExec1"],
  [m13, "InstanceExec2", "ActiveSupport::Callbacks::CallTemplate::InstanceExec2"],
  [m13, "MethodCall", "ActiveSupport::Callbacks::CallTemplate::MethodCall"],
  [m13, "ObjectCall", "ActiveSupport::Callbacks::CallTemplate::ObjectCall"],
  [m13, "ProcCall", "ActiveSupport::Callbacks::CallTemplate::ProcCall"],
  [m13, "ClassMethods", "ActiveSupport::Callbacks::ClassMethods"],
  [m13, "Conditionals", "ActiveSupport::Callbacks::Conditionals"],
  [m13, "Value", "ActiveSupport::Callbacks::Conditionals::Value"],
  [m13, "Filters", "ActiveSupport::Callbacks::Filters"],
  [m13, "After", "ActiveSupport::Callbacks::Filters::After"],
  [m13, "Around", "ActiveSupport::Callbacks::Filters::Around"],
  [m13, "Before", "ActiveSupport::Callbacks::Filters::Before"],
  [m13, "Environment", "ActiveSupport::Callbacks::Filters::Environment"],
  [m14, "ClassAttribute", "ActiveSupport::ClassAttribute"],
  [m15, "CodeGenerator", "ActiveSupport::CodeGenerator"],
  [m15, "MethodSet", "ActiveSupport::CodeGenerator::MethodSet"],
  [m16, "Concern", "ActiveSupport::Concern"],
  [m16, "MultipleIncludedBlocks", "ActiveSupport::Concern::MultipleIncludedBlocks"],
  [m16, "MultiplePrependBlocks", "ActiveSupport::Concern::MultiplePrependBlocks"],
  [m17, "LoadInterlockAwareMonitor", "ActiveSupport::Concurrency::LoadInterlockAwareMonitor"],
  [
    m17,
    "LoadInterlockAwareMonitorMixin",
    "ActiveSupport::Concurrency::LoadInterlockAwareMonitorMixin",
  ],
  [m18, "NullLock", "ActiveSupport::Concurrency::NullLock"],
  [m19, "ShareLock", "ActiveSupport::Concurrency::ShareLock"],
  [
    m17,
    "ThreadLoadInterlockAwareMonitor",
    "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor",
  ],
  [m20, "Configurable", "ActiveSupport::Configurable"],
  [m20, "Configurable.ClassMethods", "ActiveSupport::Configurable::ClassMethods"],
  [m20, "Configuration", "ActiveSupport::Configurable::Configuration"],
  [m27, "Enumerable", "ActiveSupport::CoreExt::Object::Json::Enumerable"],
  [m31, "CurrentAttributes", "ActiveSupport::CurrentAttributes"],
  [m32, "DeepMergeable", "ActiveSupport::DeepMergeable"],
  [m33, "Delegation", "ActiveSupport::Delegation"],
  [m33, "DelegationError", "ActiveSupport::DelegationError"],
  [m34, "Dependencies", "ActiveSupport::Dependencies"],
  [m36, "Interlock", "ActiveSupport::Dependencies::Interlock"],
  [m37, "Deprecation", "ActiveSupport::Deprecation"],
  [m38, "Behavior", "ActiveSupport::Deprecation::Behavior"],
  [m41, "DeprecatedConstantProxy", "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    m41,
    "DeprecatedInstanceVariableProxy",
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [m41, "DeprecatedObjectProxy", "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [m41, "DeprecationProxy", "ActiveSupport::Deprecation::DeprecationProxy"],
  [m39, "Deprecators", "ActiveSupport::Deprecation::Deprecators"],
  [m40, "Disallowed", "ActiveSupport::Deprecation::Disallowed"],
  [m42, "Reporting", "ActiveSupport::Deprecation::Reporting"],
  [m38, "DeprecationException", "ActiveSupport::DeprecationException"],
  [m43, "DescendantsTracker", "ActiveSupport::DescendantsTracker"],
  [m43, "ReloadedClassesFiltering", "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering"],
  [m43, "WeakSet", "ActiveSupport::DescendantsTracker::WeakSet"],
  [m44, "Duration", "ActiveSupport::Duration"],
  [m45, "ISO8601Parser", "ActiveSupport::Duration::ISO8601Parser"],
  [m45, "ParsingError", "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [m46, "ISO8601Serializer", "ActiveSupport::Duration::ISO8601Serializer"],
  [m44, "Scalar", "ActiveSupport::Duration::Scalar"],
  [m47, "EncryptedConfiguration", "ActiveSupport::EncryptedConfiguration"],
  [m47, "InvalidContentError", "ActiveSupport::EncryptedConfiguration::InvalidContentError"],
  [m47, "InvalidKeyError", "ActiveSupport::EncryptedConfiguration::InvalidKeyError"],
  [m48, "EncryptedFile", "ActiveSupport::EncryptedFile"],
  [m48, "InvalidKeyLengthError", "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [m48, "MissingContentError", "ActiveSupport::EncryptedFile::MissingContentError"],
  [m48, "MissingKeyError", "ActiveSupport::EncryptedFile::MissingKeyError"],
  [m49, "EnvironmentInquirer", "ActiveSupport::EnvironmentInquirer"],
  [m50, "ErrorReporter", "ActiveSupport::ErrorReporter"],
  [m50, "ErrorReporter.UnexpectedError", "ActiveSupport::ErrorReporter::UnexpectedError"],
  [m51, "ExecutionContext", "ActiveSupport::ExecutionContext"],
  [m52, "ExecutionWrapper", "ActiveSupport::ExecutionWrapper"],
  [m52, "CompleteHook", "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [m52, "RunHook", "ActiveSupport::ExecutionWrapper::RunHook"],
  [m53, "Executor", "ActiveSupport::Executor"],
  [m54, "FileUpdateChecker", "ActiveSupport::FileUpdateChecker"],
  [m56, "Gzip", "ActiveSupport::Gzip"],
  [m56, "Stream", "ActiveSupport::Gzip::Stream"],
  [m57, "HashWithIndifferentAccess", "ActiveSupport::HashWithIndifferentAccess"],
  [m58, "HtmlSafeTranslation", "ActiveSupport::HtmlSafeTranslation"],
  [m59, null, "ActiveSupport::Inflector"],
  [m60, "Inflections", "ActiveSupport::Inflector::Inflections"],
  [m60, "Uncountables", "ActiveSupport::Inflector::Inflections::Uncountables"],
  [m93, "InheritableOptions", "ActiveSupport::InheritableOptions"],
  [m61, "IsolatedExecutionState", "ActiveSupport::IsolatedExecutionState"],
  [m62, "Encoding", "ActiveSupport::JSON::Encoding"],
  [m62, "JSONGemEncoder", "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [m63, null, "ActiveSupport::LazyLoadHooks"],
  [m67, "Logger", "ActiveSupport::Logger"],
  [m67, "SimpleFormatter", "ActiveSupport::Logger::SimpleFormatter"],
  [m65, "LoggerSilence", "ActiveSupport::LoggerSilence"],
  [m66, "LoggerThreadSafeLevel", "ActiveSupport::LoggerThreadSafeLevel"],
  [m64, "LogSubscriber", "ActiveSupport::LogSubscriber"],
  [m68, "MessageEncryptor", "ActiveSupport::MessageEncryptor"],
  [m68, "InvalidMessage", "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [m68, "NullSerializer", "ActiveSupport::MessageEncryptor::NullSerializer"],
  [m71, "Codec", "ActiveSupport::Messages::Codec"],
  [m72, "Metadata", "ActiveSupport::Messages::Metadata"],
  [m73, "RotationCoordinator", "ActiveSupport::Messages::RotationCoordinator"],
  [m74, "SerializerWithFallback", "ActiveSupport::Messages::SerializerWithFallback"],
  [m74, "AllowMarshal", "ActiveSupport::Messages::SerializerWithFallback::AllowMarshal"],
  [m74, "JsonWithFallback", "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallback"],
  [
    m74,
    "JsonWithFallbackAllowMarshal",
    "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallbackAllowMarshal",
  ],
  [
    m74,
    "MarshalWithFallback",
    "ActiveSupport::Messages::SerializerWithFallback::MarshalWithFallback",
  ],
  [
    m74,
    "MessagePackWithFallback",
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    m74,
    "MessagePackWithFallbackAllowMarshal",
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallbackAllowMarshal",
  ],
  [m69, "MessageVerifier", "ActiveSupport::MessageVerifier"],
  [m69, "InvalidSignature", "ActiveSupport::MessageVerifier::InvalidSignature"],
  [m70, "MessageVerifiers", "ActiveSupport::MessageVerifiers"],
  [m75, "Multibyte", "ActiveSupport::Multibyte"],
  [m76, "Chars", "ActiveSupport::Multibyte::Chars"],
  [m77, "Unicode", "ActiveSupport::Multibyte::Unicode"],
  [m78, "Notifications", "ActiveSupport::Notifications"],
  [m80, "Event", "ActiveSupport::Notifications::Event"],
  [m79, "Fanout", "ActiveSupport::Notifications::Fanout"],
  [m79, "BaseGroup", "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [m79, "BaseTimeGroup", "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [m79, "EventedGroup", "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [m79, "EventObjectGroup", "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [m79, "Handle", "ActiveSupport::Notifications::Fanout::Handle"],
  [m79, "MonotonicTimedGroup", "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [m79, "Subscribers", "ActiveSupport::Notifications::Fanout::Subscribers"],
  [m79, "Evented", "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [m79, "EventObject", "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [m79, "Matcher", "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [m79, "AllMessages", "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages"],
  [m79, "MonotonicTimed", "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [m79, "Timed", "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [m79, "TimedGroup", "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    m79,
    "InstrumentationSubscriberError",
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [m80, "Instrumenter", "ActiveSupport::Notifications::Instrumenter"],
  [m80, "LegacyHandle", "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [m80, "Wrapper", "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [m81, "NumberHelper", "ActiveSupport::NumberHelper"],
  [m82, "NumberConverter", "ActiveSupport::NumberHelper::NumberConverter"],
  [m83, "NumberToCurrencyConverter", "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [m84, "NumberToDelimitedConverter", "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [m85, "NumberToHumanConverter", "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [m86, "NumberToHumanSizeConverter", "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [m87, "NumberToPercentageConverter", "ActiveSupport::NumberHelper::NumberToPercentageConverter"],
  [m88, "NumberToPhoneConverter", "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [m89, "NumberToRoundedConverter", "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [m90, "RoundingHelper", "ActiveSupport::NumberHelper::RoundingHelper"],
  [m91, "OptionMerger", "ActiveSupport::OptionMerger"],
  [m92, "OrderedHash", "ActiveSupport::OrderedHash"],
  [m93, "OrderedOptions", "ActiveSupport::OrderedOptions"],
  [m94, "ParameterFilter", "ActiveSupport::ParameterFilter"],
  [m95, "Reloader", "ActiveSupport::Reloader"],
  [m96, "Rescuable", "ActiveSupport::Rescuable"],
  [m96, "ClassMethods", "ActiveSupport::Rescuable::ClassMethods"],
  [m29, "SafeBuffer", "ActiveSupport::SafeBuffer"],
  [m29, "SafeConcatError", "ActiveSupport::SafeBuffer::SafeConcatError"],
  [m97, "SecurityUtils", "ActiveSupport::SecurityUtils"],
  [m98, "StringInquirer", "ActiveSupport::StringInquirer"],
  [m99, "Subscriber", "ActiveSupport::Subscriber"],
  [m100, "SyntaxErrorProxy", "ActiveSupport::SyntaxErrorProxy"],
  [m100, "BacktraceLocation", "ActiveSupport::SyntaxErrorProxy::BacktraceLocation"],
  [m100, "BacktraceLocationProxy", "ActiveSupport::SyntaxErrorProxy::BacktraceLocationProxy"],
  [m101, "TaggedLogging", "ActiveSupport::TaggedLogging"],
  [m101, "Formatter", "ActiveSupport::TaggedLogging::Formatter"],
  [m101, "LocalTagStorage", "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [m101, "TagStack", "ActiveSupport::TaggedLogging::TagStack"],
  [m102, "TimeWithZone", "ActiveSupport::TimeWithZone"],
  [m103, "TimeZone", "ActiveSupport::TimeZone"],
  [m27, "ToJsonWithActiveSupportEncoder", "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [m28, "Tryable", "ActiveSupport::Tryable"],
  [m55, "VERSION", "ActiveSupport::VERSION"],
  [m26, "XMLConverter", "ActiveSupport::XMLConverter"],
  [m26, "DisallowedType", "ActiveSupport::XMLConverter::DisallowedType"],
  [m104, null, "ActiveSupport::XmlMini"],
  [m104, "FileLike", "ActiveSupport::XmlMini::FileLike"],
  [m22, null, "DateAndTime::Calculations"],
  [m23, null, "DateAndTime::Compatibility"],
  [m24, "Zones", "DateAndTime::Zones"],
  [m25, "SoleItemExpectedError", "Enumerable::SoleItemExpectedError"],
  [m30, "Util", "TSE::Util"],
  [m27, "Generic", "URI::Generic"],
]);
