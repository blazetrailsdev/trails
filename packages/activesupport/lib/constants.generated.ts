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
import * as m36 from "./deprecation/deprecators.js";
import * as m37 from "./deprecation/proxy-wrappers.js";
import * as m38 from "./descendants-tracker.js";
import * as m39 from "./digest.js";
import * as m40 from "./duration.js";
import * as m41 from "./duration/iso8601-parser.js";
import * as m42 from "./duration/iso8601-serializer.js";
import * as m43 from "./encrypted-configuration.js";
import * as m44 from "./encrypted-file.js";
import * as m45 from "./environment-inquirer.js";
import * as m46 from "./error-reporter.js";
import * as m47 from "./execution-context.js";
import * as m48 from "./execution-wrapper.js";
import * as m49 from "./executor.js";
import * as m50 from "./file-update-checker.js";
import * as m51 from "./gem-version.js";
import * as m52 from "./gzip.js";
import * as m53 from "./hash-with-indifferent-access.js";
import * as m54 from "./html-safe-translation.js";
import * as m55 from "./inflector/inflections.js";
import * as m56 from "./isolated-execution-state.js";
import * as m57 from "./json/encoding.js";
import * as m58 from "./lazy-load-hooks.js";
import * as m59 from "./log-subscriber.js";
import * as m60 from "./logger-thread-safe-level.js";
import * as m61 from "./logger.js";
import * as m62 from "./message-encryptor.js";
import * as m63 from "./message-verifier.js";
import * as m64 from "./message-verifiers.js";
import * as m65 from "./messages/codec.js";
import * as m66 from "./messages/metadata.js";
import * as m67 from "./messages/rotation-coordinator.js";
import * as m68 from "./messages/serializer-with-fallback.js";
import * as m69 from "./multibyte.js";
import * as m70 from "./multibyte/chars.js";
import * as m71 from "./multibyte/unicode.js";
import * as m72 from "./notifications.js";
import * as m73 from "./notifications/fanout.js";
import * as m74 from "./notifications/instrumenter.js";
import * as m75 from "./number-helper.js";
import * as m76 from "./number-helper/number-converter.js";
import * as m77 from "./number-helper/number-to-currency-converter.js";
import * as m78 from "./number-helper/number-to-delimited-converter.js";
import * as m79 from "./number-helper/number-to-human-converter.js";
import * as m80 from "./number-helper/number-to-human-size-converter.js";
import * as m81 from "./number-helper/number-to-percentage-converter.js";
import * as m82 from "./number-helper/number-to-phone-converter.js";
import * as m83 from "./number-helper/number-to-rounded-converter.js";
import * as m84 from "./number-helper/rounding-helper.js";
import * as m85 from "./option-merger.js";
import * as m86 from "./ordered-hash.js";
import * as m87 from "./ordered-options.js";
import * as m88 from "./parameter-filter.js";
import * as m89 from "./reloader.js";
import * as m90 from "./rescuable.js";
import * as m91 from "./security-utils.js";
import * as m92 from "./string-inquirer.js";
import * as m93 from "./subscriber.js";
import * as m94 from "./syntax-error-proxy.js";
import * as m95 from "./tagged-logging.js";
import * as m96 from "./time-with-zone.js";
import * as m97 from "./values/time-zone.js";
import * as m98 from "./xml-mini.js";

defineConstants([
  [() => m0.ActionableError, "ActiveSupport::ActionableError"],
  [() => m0.NonActionable, "ActiveSupport::ActionableError::NonActionable"],
  [() => m1.ArrayInquirer, "ActiveSupport::ArrayInquirer"],
  [() => m33.Autoload, "ActiveSupport::Autoload"],
  [() => m2.BacktraceCleaner, "ActiveSupport::BacktraceCleaner"],
  [() => m3.Benchmark, "ActiveSupport::Benchmark"],
  [() => m4.Benchmarkable, "ActiveSupport::Benchmarkable"],
  [() => m19.BigDecimalWithDefaultFormat, "ActiveSupport::BigDecimalWithDefaultFormat"],
  [() => m5.BroadcastLogger, "ActiveSupport::BroadcastLogger"],
  [() => m6.Coder, "ActiveSupport::Cache::Coder"],
  [() => m7.Entry, "ActiveSupport::Cache::Entry"],
  [() => m8.MemoryStore, "ActiveSupport::Cache::MemoryStore"],
  [() => m8.DupCoder, "ActiveSupport::Cache::MemoryStore::DupCoder"],
  [() => m9.NullStore, "ActiveSupport::Cache::NullStore"],
  [() => m10.SerializerWithFallback, "ActiveSupport::Cache::SerializerWithFallback"],
  [
    () => m10.Marshal70WithFallback,
    "ActiveSupport::Cache::SerializerWithFallback::Marshal70WithFallback",
  ],
  [
    () => m10.Marshal71WithFallback,
    "ActiveSupport::Cache::SerializerWithFallback::Marshal71WithFallback",
  ],
  [
    () => m10.MessagePackWithFallback,
    "ActiveSupport::Cache::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    () => m10.PassthroughWithFallback,
    "ActiveSupport::Cache::SerializerWithFallback::PassthroughWithFallback",
  ],
  [() => m11.Callbacks, "ActiveSupport::Callbacks"],
  [() => m11.Callback, "ActiveSupport::Callbacks::Callback"],
  [() => m11.CallbackChain, "ActiveSupport::Callbacks::CallbackChain"],
  [() => m11.CallbackSequence, "ActiveSupport::Callbacks::CallbackSequence"],
  [() => m11.CallTemplate, "ActiveSupport::Callbacks::CallTemplate"],
  [() => m11.InstanceExec0, "ActiveSupport::Callbacks::CallTemplate::InstanceExec0"],
  [() => m11.InstanceExec1, "ActiveSupport::Callbacks::CallTemplate::InstanceExec1"],
  [() => m11.InstanceExec2, "ActiveSupport::Callbacks::CallTemplate::InstanceExec2"],
  [() => m11.MethodCall, "ActiveSupport::Callbacks::CallTemplate::MethodCall"],
  [() => m11.ObjectCall, "ActiveSupport::Callbacks::CallTemplate::ObjectCall"],
  [() => m11.ProcCall, "ActiveSupport::Callbacks::CallTemplate::ProcCall"],
  [() => m11.ClassMethods, "ActiveSupport::Callbacks::ClassMethods"],
  [() => m11.Conditionals, "ActiveSupport::Callbacks::Conditionals"],
  [() => m11.Value, "ActiveSupport::Callbacks::Conditionals::Value"],
  [() => m11.Filters, "ActiveSupport::Callbacks::Filters"],
  [() => m11.After, "ActiveSupport::Callbacks::Filters::After"],
  [() => m11.Around, "ActiveSupport::Callbacks::Filters::Around"],
  [() => m11.Before, "ActiveSupport::Callbacks::Filters::Before"],
  [() => m11.Environment, "ActiveSupport::Callbacks::Filters::Environment"],
  [() => m12.ClassAttribute, "ActiveSupport::ClassAttribute"],
  [() => m13.CodeGenerator, "ActiveSupport::CodeGenerator"],
  [() => m13.MethodSet, "ActiveSupport::CodeGenerator::MethodSet"],
  [() => m14.Concern, "ActiveSupport::Concern"],
  [() => m14.MultipleIncludedBlocks, "ActiveSupport::Concern::MultipleIncludedBlocks"],
  [() => m14.MultiplePrependBlocks, "ActiveSupport::Concern::MultiplePrependBlocks"],
  [() => m15.LoadInterlockAwareMonitor, "ActiveSupport::Concurrency::LoadInterlockAwareMonitor"],
  [
    () => m15.LoadInterlockAwareMonitorMixin,
    "ActiveSupport::Concurrency::LoadInterlockAwareMonitorMixin",
  ],
  [() => m16.NullLock, "ActiveSupport::Concurrency::NullLock"],
  [() => m17.ShareLock, "ActiveSupport::Concurrency::ShareLock"],
  [
    () => m15.ThreadLoadInterlockAwareMonitor,
    "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor",
  ],
  [() => m18.Configurable, "ActiveSupport::Configurable"],
  [() => m18.Configurable.ClassMethods, "ActiveSupport::Configurable::ClassMethods"],
  [() => m18.Configuration, "ActiveSupport::Configurable::Configuration"],
  [() => m29.CurrentAttributes, "ActiveSupport::CurrentAttributes"],
  [() => m30.DeepMergeable, "ActiveSupport::DeepMergeable"],
  [() => m31.Delegation, "ActiveSupport::Delegation"],
  [() => m31.DelegationError, "ActiveSupport::DelegationError"],
  [() => m32.Dependencies, "ActiveSupport::Dependencies"],
  [() => m34.Interlock, "ActiveSupport::Dependencies::Interlock"],
  [() => m35.Deprecation, "ActiveSupport::Deprecation"],
  [() => m37.DeprecatedConstantProxy, "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m37.DeprecatedInstanceVariableProxy,
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m37.DeprecatedObjectProxy, "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m37.DeprecationProxy, "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m36.Deprecators, "ActiveSupport::Deprecation::Deprecators"],
  [() => m38.DescendantsTracker, "ActiveSupport::DescendantsTracker"],
  [
    () => m38.ReloadedClassesFiltering,
    "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering",
  ],
  [() => m38.WeakSet, "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m39.Digest, "ActiveSupport::Digest"],
  [() => m40.Duration, "ActiveSupport::Duration"],
  [() => m41.ISO8601Parser, "ActiveSupport::Duration::ISO8601Parser"],
  [() => m41.ParsingError, "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m42.ISO8601Serializer, "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m40.Scalar, "ActiveSupport::Duration::Scalar"],
  [() => m43.EncryptedConfiguration, "ActiveSupport::EncryptedConfiguration"],
  [() => m43.InvalidContentError, "ActiveSupport::EncryptedConfiguration::InvalidContentError"],
  [() => m43.InvalidKeyError, "ActiveSupport::EncryptedConfiguration::InvalidKeyError"],
  [() => m44.EncryptedFile, "ActiveSupport::EncryptedFile"],
  [() => m44.InvalidKeyLengthError, "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m44.MissingContentError, "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m44.MissingKeyError, "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m45.EnvironmentInquirer, "ActiveSupport::EnvironmentInquirer"],
  [() => m46.ErrorReporter, "ActiveSupport::ErrorReporter"],
  [() => m46.ErrorReporter.UnexpectedError, "ActiveSupport::ErrorReporter::UnexpectedError"],
  [() => m47.ExecutionContext, "ActiveSupport::ExecutionContext"],
  [() => m48.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m48.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m48.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m49.Executor, "ActiveSupport::Executor"],
  [() => m50.FileUpdateChecker, "ActiveSupport::FileUpdateChecker"],
  [() => m52.Gzip, "ActiveSupport::Gzip"],
  [() => m52.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m53.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m54.HtmlSafeTranslation, "ActiveSupport::HtmlSafeTranslation"],
  [() => m55.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m55.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m87.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m56.IsolatedExecutionState, "ActiveSupport::IsolatedExecutionState"],
  [() => m57.Encoding, "ActiveSupport::JSON::Encoding"],
  [() => m57.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m58, "ActiveSupport::LazyLoadHooks"],
  [() => m61.Logger, "ActiveSupport::Logger"],
  [() => m61.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m60.LoggerThreadSafeLevel, "ActiveSupport::LoggerThreadSafeLevel"],
  [() => m59.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m62.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m62.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m62.NullSerializer, "ActiveSupport::MessageEncryptor::NullSerializer"],
  [() => m65.Codec, "ActiveSupport::Messages::Codec"],
  [() => m66.Metadata, "ActiveSupport::Messages::Metadata"],
  [() => m67.RotationCoordinator, "ActiveSupport::Messages::RotationCoordinator"],
  [() => m68.SerializerWithFallback, "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m68.AllowMarshal, "ActiveSupport::Messages::SerializerWithFallback::AllowMarshal"],
  [() => m68.JsonWithFallback, "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallback"],
  [
    () => m68.JsonWithFallbackAllowMarshal,
    "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallbackAllowMarshal",
  ],
  [
    () => m68.MarshalWithFallback,
    "ActiveSupport::Messages::SerializerWithFallback::MarshalWithFallback",
  ],
  [
    () => m68.MessagePackWithFallback,
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    () => m68.MessagePackWithFallbackAllowMarshal,
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallbackAllowMarshal",
  ],
  [() => m63.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m63.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m64.MessageVerifiers, "ActiveSupport::MessageVerifiers"],
  [() => m69.Multibyte, "ActiveSupport::Multibyte"],
  [() => m70.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m71.Unicode, "ActiveSupport::Multibyte::Unicode"],
  [() => m72.Notifications, "ActiveSupport::Notifications"],
  [() => m74.Event, "ActiveSupport::Notifications::Event"],
  [() => m73.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m73.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m73.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m73.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m73.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m73.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m73.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m73.Subscribers, "ActiveSupport::Notifications::Fanout::Subscribers"],
  [() => m73.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m73.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m73.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m73.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m73.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m73.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m73.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m73.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m74.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m74.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m74.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m75.NumberHelper, "ActiveSupport::NumberHelper"],
  [() => m76.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m77.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m78.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m79.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m80.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m81.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m82.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m83.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m84.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m85.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m86.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m87.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m88.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m89.Reloader, "ActiveSupport::Reloader"],
  [() => m90.Rescuable, "ActiveSupport::Rescuable"],
  [() => m90.ClassMethods, "ActiveSupport::Rescuable::ClassMethods"],
  [() => m27.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m27.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m91.SecurityUtils, "ActiveSupport::SecurityUtils"],
  [() => m92.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m93.Subscriber, "ActiveSupport::Subscriber"],
  [() => m94.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m95.TaggedLogging, "ActiveSupport::TaggedLogging"],
  [() => m95.Formatter, "ActiveSupport::TaggedLogging::Formatter"],
  [() => m95.LocalTagStorage, "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m95.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m96.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m97.TimeZone, "ActiveSupport::TimeZone"],
  [() => m25.ToJsonWithActiveSupportEncoder, "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m26.Tryable, "ActiveSupport::Tryable"],
  [() => m51.VERSION, "ActiveSupport::VERSION"],
  [() => m24.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m24.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m98, "ActiveSupport::XmlMini"],
  [() => m98.FileLike, "ActiveSupport::XmlMini::FileLike"],
  [() => m20, "DateAndTime::Calculations"],
  [() => m21, "DateAndTime::Compatibility"],
  [() => m22.Zones, "DateAndTime::Zones"],
  [() => m23.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m28.Util, "TSE::Util"],
  [() => m25.Generic, "URI::Generic"],
]);
