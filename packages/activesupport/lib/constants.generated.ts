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
import * as m11 from "./callbacks.js";
import * as m12 from "./class-attribute.js";
import * as m13 from "./code-generator.js";
import * as m14 from "./concern.js";
import * as m15 from "./concurrency/load-interlock-aware-monitor.js";
import * as m16 from "./concurrency/null-lock.js";
import * as m17 from "./concurrency/share-lock.js";
import * as m18 from "./configurable.js";
import * as m19 from "./core-ext/big-decimal/conversions.js";
import * as m20 from "./core-ext/date-and-time/calculations.js";
import * as m21 from "./core-ext/date-and-time/compatibility.js";
import * as m22 from "./core-ext/date-and-time/zones.js";
import * as m23 from "./core-ext/enumerable.js";
import * as m24 from "./core-ext/hash/conversions.js";
import * as m25 from "./core-ext/object/json.js";
import * as m26 from "./core-ext/object/try.js";
import * as m27 from "./core-ext/string/output-safety.js";
import * as m28 from "./core-ext/tse/util.js";
import * as m29 from "./current-attributes.js";
import * as m30 from "./deep-mergeable.js";
import * as m31 from "./delegation.js";
import * as m32 from "./dependencies.js";
import * as m33 from "./dependencies/autoload.js";
import * as m34 from "./dependencies/interlock.js";
import * as m35 from "./deprecation.js";
import * as m36 from "./deprecation/behaviors.js";
import * as m37 from "./deprecation/deprecators.js";
import * as m38 from "./deprecation/disallowed.js";
import * as m39 from "./deprecation/proxy-wrappers.js";
import * as m40 from "./deprecation/reporting.js";
import * as m41 from "./descendants-tracker.js";
import * as m42 from "./duration.js";
import * as m43 from "./duration/iso8601-parser.js";
import * as m44 from "./duration/iso8601-serializer.js";
import * as m45 from "./encrypted-configuration.js";
import * as m46 from "./encrypted-file.js";
import * as m47 from "./environment-inquirer.js";
import * as m48 from "./error-reporter.js";
import * as m49 from "./execution-context.js";
import * as m50 from "./execution-wrapper.js";
import * as m51 from "./executor.js";
import * as m52 from "./file-update-checker.js";
import * as m53 from "./gem-version.js";
import * as m54 from "./gzip.js";
import * as m55 from "./hash-with-indifferent-access.js";
import * as m56 from "./html-safe-translation.js";
import * as m57 from "./inflector.js";
import * as m58 from "./inflector/inflections.js";
import * as m59 from "./isolated-execution-state.js";
import * as m60 from "./json/encoding.js";
import * as m61 from "./lazy-load-hooks.js";
import * as m62 from "./log-subscriber.js";
import * as m63 from "./logger-silence.js";
import * as m64 from "./logger-thread-safe-level.js";
import * as m65 from "./logger.js";
import * as m66 from "./message-encryptor.js";
import * as m67 from "./message-verifier.js";
import * as m68 from "./message-verifiers.js";
import * as m69 from "./messages/codec.js";
import * as m70 from "./messages/metadata.js";
import * as m71 from "./messages/rotation-coordinator.js";
import * as m72 from "./messages/serializer-with-fallback.js";
import * as m73 from "./multibyte.js";
import * as m74 from "./multibyte/chars.js";
import * as m75 from "./multibyte/unicode.js";
import * as m76 from "./notifications.js";
import * as m77 from "./notifications/fanout.js";
import * as m78 from "./notifications/instrumenter.js";
import * as m79 from "./number-helper.js";
import * as m80 from "./number-helper/number-converter.js";
import * as m81 from "./number-helper/number-to-currency-converter.js";
import * as m82 from "./number-helper/number-to-delimited-converter.js";
import * as m83 from "./number-helper/number-to-human-converter.js";
import * as m84 from "./number-helper/number-to-human-size-converter.js";
import * as m85 from "./number-helper/number-to-percentage-converter.js";
import * as m86 from "./number-helper/number-to-phone-converter.js";
import * as m87 from "./number-helper/number-to-rounded-converter.js";
import * as m88 from "./number-helper/rounding-helper.js";
import * as m89 from "./option-merger.js";
import * as m90 from "./ordered-hash.js";
import * as m91 from "./ordered-options.js";
import * as m92 from "./parameter-filter.js";
import * as m93 from "./reloader.js";
import * as m94 from "./rescuable.js";
import * as m95 from "./security-utils.js";
import * as m96 from "./string-inquirer.js";
import * as m97 from "./subscriber.js";
import * as m98 from "./syntax-error-proxy.js";
import * as m99 from "./tagged-logging.js";
import * as m100 from "./time-with-zone.js";
import * as m101 from "./values/time-zone.js";
import * as m102 from "./xml-mini.js";

defineConstants([
  [m0, "ActionableError", "ActiveSupport::ActionableError"],
  [m0, "NonActionable", "ActiveSupport::ActionableError::NonActionable"],
  [m1, "ArrayInquirer", "ActiveSupport::ArrayInquirer"],
  [m33, "Autoload", "ActiveSupport::Autoload"],
  [m2, "BacktraceCleaner", "ActiveSupport::BacktraceCleaner"],
  [m3, "Benchmark", "ActiveSupport::Benchmark"],
  [m4, "Benchmarkable", "ActiveSupport::Benchmarkable"],
  [m19, "BigDecimalWithDefaultFormat", "ActiveSupport::BigDecimalWithDefaultFormat"],
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
  [m11, "Callbacks", "ActiveSupport::Callbacks"],
  [m11, "Callback", "ActiveSupport::Callbacks::Callback"],
  [m11, "CallbackChain", "ActiveSupport::Callbacks::CallbackChain"],
  [m11, "CallbackSequence", "ActiveSupport::Callbacks::CallbackSequence"],
  [m11, "CallTemplate", "ActiveSupport::Callbacks::CallTemplate"],
  [m11, "InstanceExec0", "ActiveSupport::Callbacks::CallTemplate::InstanceExec0"],
  [m11, "InstanceExec1", "ActiveSupport::Callbacks::CallTemplate::InstanceExec1"],
  [m11, "InstanceExec2", "ActiveSupport::Callbacks::CallTemplate::InstanceExec2"],
  [m11, "MethodCall", "ActiveSupport::Callbacks::CallTemplate::MethodCall"],
  [m11, "ObjectCall", "ActiveSupport::Callbacks::CallTemplate::ObjectCall"],
  [m11, "ProcCall", "ActiveSupport::Callbacks::CallTemplate::ProcCall"],
  [m11, "ClassMethods", "ActiveSupport::Callbacks::ClassMethods"],
  [m11, "Conditionals", "ActiveSupport::Callbacks::Conditionals"],
  [m11, "Value", "ActiveSupport::Callbacks::Conditionals::Value"],
  [m11, "Filters", "ActiveSupport::Callbacks::Filters"],
  [m11, "After", "ActiveSupport::Callbacks::Filters::After"],
  [m11, "Around", "ActiveSupport::Callbacks::Filters::Around"],
  [m11, "Before", "ActiveSupport::Callbacks::Filters::Before"],
  [m11, "Environment", "ActiveSupport::Callbacks::Filters::Environment"],
  [m12, "ClassAttribute", "ActiveSupport::ClassAttribute"],
  [m13, "CodeGenerator", "ActiveSupport::CodeGenerator"],
  [m13, "MethodSet", "ActiveSupport::CodeGenerator::MethodSet"],
  [m14, "Concern", "ActiveSupport::Concern"],
  [m14, "MultipleIncludedBlocks", "ActiveSupport::Concern::MultipleIncludedBlocks"],
  [m14, "MultiplePrependBlocks", "ActiveSupport::Concern::MultiplePrependBlocks"],
  [m15, "LoadInterlockAwareMonitor", "ActiveSupport::Concurrency::LoadInterlockAwareMonitor"],
  [
    m15,
    "LoadInterlockAwareMonitorMixin",
    "ActiveSupport::Concurrency::LoadInterlockAwareMonitorMixin",
  ],
  [m16, "NullLock", "ActiveSupport::Concurrency::NullLock"],
  [m17, "ShareLock", "ActiveSupport::Concurrency::ShareLock"],
  [
    m15,
    "ThreadLoadInterlockAwareMonitor",
    "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor",
  ],
  [m18, "Configurable", "ActiveSupport::Configurable"],
  [m18, "Configurable.ClassMethods", "ActiveSupport::Configurable::ClassMethods"],
  [m18, "Configuration", "ActiveSupport::Configurable::Configuration"],
  [m29, "CurrentAttributes", "ActiveSupport::CurrentAttributes"],
  [m30, "DeepMergeable", "ActiveSupport::DeepMergeable"],
  [m31, "Delegation", "ActiveSupport::Delegation"],
  [m31, "DelegationError", "ActiveSupport::DelegationError"],
  [m32, "Dependencies", "ActiveSupport::Dependencies"],
  [m34, "Interlock", "ActiveSupport::Dependencies::Interlock"],
  [m35, "Deprecation", "ActiveSupport::Deprecation"],
  [m36, "Behavior", "ActiveSupport::Deprecation::Behavior"],
  [m39, "DeprecatedConstantProxy", "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    m39,
    "DeprecatedInstanceVariableProxy",
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [m39, "DeprecatedObjectProxy", "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [m39, "DeprecationProxy", "ActiveSupport::Deprecation::DeprecationProxy"],
  [m37, "Deprecators", "ActiveSupport::Deprecation::Deprecators"],
  [m38, "Disallowed", "ActiveSupport::Deprecation::Disallowed"],
  [m40, "Reporting", "ActiveSupport::Deprecation::Reporting"],
  [m36, "DeprecationException", "ActiveSupport::DeprecationException"],
  [m41, "DescendantsTracker", "ActiveSupport::DescendantsTracker"],
  [m41, "ReloadedClassesFiltering", "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering"],
  [m41, "WeakSet", "ActiveSupport::DescendantsTracker::WeakSet"],
  [m42, "Duration", "ActiveSupport::Duration"],
  [m43, "ISO8601Parser", "ActiveSupport::Duration::ISO8601Parser"],
  [m43, "ParsingError", "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [m44, "ISO8601Serializer", "ActiveSupport::Duration::ISO8601Serializer"],
  [m42, "Scalar", "ActiveSupport::Duration::Scalar"],
  [m45, "EncryptedConfiguration", "ActiveSupport::EncryptedConfiguration"],
  [m45, "InvalidContentError", "ActiveSupport::EncryptedConfiguration::InvalidContentError"],
  [m45, "InvalidKeyError", "ActiveSupport::EncryptedConfiguration::InvalidKeyError"],
  [m46, "EncryptedFile", "ActiveSupport::EncryptedFile"],
  [m46, "InvalidKeyLengthError", "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [m46, "MissingContentError", "ActiveSupport::EncryptedFile::MissingContentError"],
  [m46, "MissingKeyError", "ActiveSupport::EncryptedFile::MissingKeyError"],
  [m47, "EnvironmentInquirer", "ActiveSupport::EnvironmentInquirer"],
  [m48, "ErrorReporter", "ActiveSupport::ErrorReporter"],
  [m48, "ErrorReporter.UnexpectedError", "ActiveSupport::ErrorReporter::UnexpectedError"],
  [m49, "ExecutionContext", "ActiveSupport::ExecutionContext"],
  [m50, "ExecutionWrapper", "ActiveSupport::ExecutionWrapper"],
  [m50, "CompleteHook", "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [m50, "RunHook", "ActiveSupport::ExecutionWrapper::RunHook"],
  [m51, "Executor", "ActiveSupport::Executor"],
  [m52, "FileUpdateChecker", "ActiveSupport::FileUpdateChecker"],
  [m54, "Gzip", "ActiveSupport::Gzip"],
  [m54, "Stream", "ActiveSupport::Gzip::Stream"],
  [m55, "HashWithIndifferentAccess", "ActiveSupport::HashWithIndifferentAccess"],
  [m56, "HtmlSafeTranslation", "ActiveSupport::HtmlSafeTranslation"],
  [m57, null, "ActiveSupport::Inflector"],
  [m58, "Inflections", "ActiveSupport::Inflector::Inflections"],
  [m58, "Uncountables", "ActiveSupport::Inflector::Inflections::Uncountables"],
  [m91, "InheritableOptions", "ActiveSupport::InheritableOptions"],
  [m59, "IsolatedExecutionState", "ActiveSupport::IsolatedExecutionState"],
  [m60, "Encoding", "ActiveSupport::JSON::Encoding"],
  [m60, "JSONGemEncoder", "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [m61, null, "ActiveSupport::LazyLoadHooks"],
  [m65, "Logger", "ActiveSupport::Logger"],
  [m65, "SimpleFormatter", "ActiveSupport::Logger::SimpleFormatter"],
  [m63, "LoggerSilence", "ActiveSupport::LoggerSilence"],
  [m64, "LoggerThreadSafeLevel", "ActiveSupport::LoggerThreadSafeLevel"],
  [m62, "LogSubscriber", "ActiveSupport::LogSubscriber"],
  [m66, "MessageEncryptor", "ActiveSupport::MessageEncryptor"],
  [m66, "InvalidMessage", "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [m66, "NullSerializer", "ActiveSupport::MessageEncryptor::NullSerializer"],
  [m69, "Codec", "ActiveSupport::Messages::Codec"],
  [m70, "Metadata", "ActiveSupport::Messages::Metadata"],
  [m71, "RotationCoordinator", "ActiveSupport::Messages::RotationCoordinator"],
  [m72, "SerializerWithFallback", "ActiveSupport::Messages::SerializerWithFallback"],
  [m72, "AllowMarshal", "ActiveSupport::Messages::SerializerWithFallback::AllowMarshal"],
  [m72, "JsonWithFallback", "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallback"],
  [
    m72,
    "JsonWithFallbackAllowMarshal",
    "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallbackAllowMarshal",
  ],
  [
    m72,
    "MarshalWithFallback",
    "ActiveSupport::Messages::SerializerWithFallback::MarshalWithFallback",
  ],
  [
    m72,
    "MessagePackWithFallback",
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    m72,
    "MessagePackWithFallbackAllowMarshal",
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallbackAllowMarshal",
  ],
  [m67, "MessageVerifier", "ActiveSupport::MessageVerifier"],
  [m67, "InvalidSignature", "ActiveSupport::MessageVerifier::InvalidSignature"],
  [m68, "MessageVerifiers", "ActiveSupport::MessageVerifiers"],
  [m73, "Multibyte", "ActiveSupport::Multibyte"],
  [m74, "Chars", "ActiveSupport::Multibyte::Chars"],
  [m75, "Unicode", "ActiveSupport::Multibyte::Unicode"],
  [m76, "Notifications", "ActiveSupport::Notifications"],
  [m78, "Event", "ActiveSupport::Notifications::Event"],
  [m77, "Fanout", "ActiveSupport::Notifications::Fanout"],
  [m77, "BaseGroup", "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [m77, "BaseTimeGroup", "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [m77, "EventedGroup", "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [m77, "EventObjectGroup", "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [m77, "Handle", "ActiveSupport::Notifications::Fanout::Handle"],
  [m77, "MonotonicTimedGroup", "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [m77, "Subscribers", "ActiveSupport::Notifications::Fanout::Subscribers"],
  [m77, "Evented", "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [m77, "EventObject", "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [m77, "Matcher", "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [m77, "AllMessages", "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages"],
  [m77, "MonotonicTimed", "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [m77, "Timed", "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [m77, "TimedGroup", "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    m77,
    "InstrumentationSubscriberError",
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [m78, "Instrumenter", "ActiveSupport::Notifications::Instrumenter"],
  [m78, "LegacyHandle", "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [m78, "Wrapper", "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [m79, "NumberHelper", "ActiveSupport::NumberHelper"],
  [m80, "NumberConverter", "ActiveSupport::NumberHelper::NumberConverter"],
  [m81, "NumberToCurrencyConverter", "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [m82, "NumberToDelimitedConverter", "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [m83, "NumberToHumanConverter", "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [m84, "NumberToHumanSizeConverter", "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [m85, "NumberToPercentageConverter", "ActiveSupport::NumberHelper::NumberToPercentageConverter"],
  [m86, "NumberToPhoneConverter", "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [m87, "NumberToRoundedConverter", "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [m88, "RoundingHelper", "ActiveSupport::NumberHelper::RoundingHelper"],
  [m89, "OptionMerger", "ActiveSupport::OptionMerger"],
  [m90, "OrderedHash", "ActiveSupport::OrderedHash"],
  [m91, "OrderedOptions", "ActiveSupport::OrderedOptions"],
  [m92, "ParameterFilter", "ActiveSupport::ParameterFilter"],
  [m93, "Reloader", "ActiveSupport::Reloader"],
  [m94, "Rescuable", "ActiveSupport::Rescuable"],
  [m94, "ClassMethods", "ActiveSupport::Rescuable::ClassMethods"],
  [m27, "SafeBuffer", "ActiveSupport::SafeBuffer"],
  [m27, "SafeConcatError", "ActiveSupport::SafeBuffer::SafeConcatError"],
  [m95, "SecurityUtils", "ActiveSupport::SecurityUtils"],
  [m96, "StringInquirer", "ActiveSupport::StringInquirer"],
  [m97, "Subscriber", "ActiveSupport::Subscriber"],
  [m98, "SyntaxErrorProxy", "ActiveSupport::SyntaxErrorProxy"],
  [m98, "BacktraceLocation", "ActiveSupport::SyntaxErrorProxy::BacktraceLocation"],
  [m98, "BacktraceLocationProxy", "ActiveSupport::SyntaxErrorProxy::BacktraceLocationProxy"],
  [m99, "TaggedLogging", "ActiveSupport::TaggedLogging"],
  [m99, "Formatter", "ActiveSupport::TaggedLogging::Formatter"],
  [m99, "LocalTagStorage", "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [m99, "TagStack", "ActiveSupport::TaggedLogging::TagStack"],
  [m100, "TimeWithZone", "ActiveSupport::TimeWithZone"],
  [m101, "TimeZone", "ActiveSupport::TimeZone"],
  [m25, "ToJsonWithActiveSupportEncoder", "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [m26, "Tryable", "ActiveSupport::Tryable"],
  [m53, "VERSION", "ActiveSupport::VERSION"],
  [m24, "XMLConverter", "ActiveSupport::XMLConverter"],
  [m24, "DisallowedType", "ActiveSupport::XMLConverter::DisallowedType"],
  [m102, null, "ActiveSupport::XmlMini"],
  [m102, "FileLike", "ActiveSupport::XmlMini::FileLike"],
  [m20, null, "DateAndTime::Calculations"],
  [m21, null, "DateAndTime::Compatibility"],
  [m22, "Zones", "DateAndTime::Zones"],
  [m23, "SoleItemExpectedError", "Enumerable::SoleItemExpectedError"],
  [m28, "Util", "TSE::Util"],
  [m25, "Generic", "URI::Generic"],
]);
