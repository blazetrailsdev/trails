import { registerClassPaths } from "@blazetrails/ruby-compat";
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
import * as m21 from "./core-ext/enumerable.js";
import * as m22 from "./core-ext/hash/conversions.js";
import * as m23 from "./core-ext/object/json.js";
import * as m24 from "./core-ext/object/try.js";
import * as m25 from "./core-ext/string/output-safety.js";
import * as m26 from "./core-ext/tse/util.js";
import * as m27 from "./current-attributes.js";
import * as m28 from "./deep-mergeable.js";
import * as m29 from "./delegation.js";
import * as m30 from "./dependencies.js";
import * as m31 from "./dependencies/interlock.js";
import * as m32 from "./deprecation.js";
import * as m33 from "./deprecation/deprecators.js";
import * as m34 from "./deprecation/proxy-wrappers.js";
import * as m35 from "./descendants-tracker.js";
import * as m36 from "./digest.js";
import * as m37 from "./duration.js";
import * as m38 from "./duration/iso8601-parser.js";
import * as m39 from "./duration/iso8601-serializer.js";
import * as m40 from "./encrypted-configuration.js";
import * as m41 from "./encrypted-file.js";
import * as m42 from "./environment-inquirer.js";
import * as m43 from "./error-reporter.js";
import * as m44 from "./execution-context.js";
import * as m45 from "./execution-wrapper.js";
import * as m46 from "./executor.js";
import * as m47 from "./file-update-checker.js";
import * as m48 from "./gem-version.js";
import * as m49 from "./gzip.js";
import * as m50 from "./hash-with-indifferent-access.js";
import * as m51 from "./html-safe-translation.js";
import * as m52 from "./inflector/inflections.js";
import * as m53 from "./isolated-execution-state.js";
import * as m54 from "./json/encoding.js";
import * as m55 from "./log-subscriber.js";
import * as m56 from "./logger.js";
import * as m57 from "./message-encryptor.js";
import * as m58 from "./message-verifier.js";
import * as m59 from "./message-verifiers.js";
import * as m60 from "./messages/codec.js";
import * as m61 from "./messages/metadata.js";
import * as m62 from "./messages/rotation-coordinator.js";
import * as m63 from "./messages/serializer-with-fallback.js";
import * as m64 from "./multibyte.js";
import * as m65 from "./multibyte/chars.js";
import * as m66 from "./multibyte/unicode.js";
import * as m67 from "./notifications.js";
import * as m68 from "./notifications/fanout.js";
import * as m69 from "./notifications/instrumenter.js";
import * as m70 from "./number-helper.js";
import * as m71 from "./number-helper/number-converter.js";
import * as m72 from "./number-helper/number-to-currency-converter.js";
import * as m73 from "./number-helper/number-to-delimited-converter.js";
import * as m74 from "./number-helper/number-to-human-converter.js";
import * as m75 from "./number-helper/number-to-human-size-converter.js";
import * as m76 from "./number-helper/number-to-percentage-converter.js";
import * as m77 from "./number-helper/number-to-phone-converter.js";
import * as m78 from "./number-helper/number-to-rounded-converter.js";
import * as m79 from "./number-helper/rounding-helper.js";
import * as m80 from "./option-merger.js";
import * as m81 from "./ordered-hash.js";
import * as m82 from "./ordered-options.js";
import * as m83 from "./parameter-filter.js";
import * as m84 from "./reloader.js";
import * as m85 from "./rescuable.js";
import * as m86 from "./security-utils.js";
import * as m87 from "./string-inquirer.js";
import * as m88 from "./subscriber.js";
import * as m89 from "./syntax-error-proxy.js";
import * as m90 from "./tagged-logging.js";
import * as m91 from "./testing/constant-lookup.js";
import * as m92 from "./testing/error-reporter-assertions.js";
import * as m93 from "./testing/isolation.js";
import * as m94 from "./testing/method-call-assertions.js";
import * as m95 from "./testing/setup-and-teardown.js";
import * as m96 from "./testing/stream.js";
import * as m97 from "./testing/tagged-logging.js";
import * as m98 from "./testing/time-helpers.js";
import * as m99 from "./time-with-zone.js";
import * as m100 from "./values/time-zone.js";
import * as m101 from "./xml-mini.js";

registerClassPaths([
  [() => m0.ActionableError, "ActiveSupport::ActionableError"],
  [() => m0.NonActionable, "ActiveSupport::ActionableError::NonActionable"],
  [() => m1.ArrayInquirer, "ActiveSupport::ArrayInquirer"],
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
  [() => m18.Configuration, "ActiveSupport::Configurable::Configuration"],
  [() => m27.CurrentAttributes, "ActiveSupport::CurrentAttributes"],
  [() => m28.DeepMergeable, "ActiveSupport::DeepMergeable"],
  [() => m29.Delegation, "ActiveSupport::Delegation"],
  [() => m29.DelegationError, "ActiveSupport::DelegationError"],
  [() => m30.Dependencies, "ActiveSupport::Dependencies"],
  [() => m31.Interlock, "ActiveSupport::Dependencies::Interlock"],
  [() => m32.Deprecation, "ActiveSupport::Deprecation"],
  [() => m34.DeprecatedConstantProxy, "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m34.DeprecatedInstanceVariableProxy,
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m34.DeprecatedObjectProxy, "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m34.DeprecationProxy, "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m33.Deprecators, "ActiveSupport::Deprecation::Deprecators"],
  [() => m35.DescendantsTracker, "ActiveSupport::DescendantsTracker"],
  [
    () => m35.ReloadedClassesFiltering,
    "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering",
  ],
  [() => m35.WeakSet, "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m36.Digest, "ActiveSupport::Digest"],
  [() => m37.Duration, "ActiveSupport::Duration"],
  [() => m38.ISO8601Parser, "ActiveSupport::Duration::ISO8601Parser"],
  [() => m38.ParsingError, "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m39.ISO8601Serializer, "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m37.Scalar, "ActiveSupport::Duration::Scalar"],
  [() => m40.EncryptedConfiguration, "ActiveSupport::EncryptedConfiguration"],
  [() => m40.InvalidContentError, "ActiveSupport::EncryptedConfiguration::InvalidContentError"],
  [() => m40.InvalidKeyError, "ActiveSupport::EncryptedConfiguration::InvalidKeyError"],
  [() => m41.EncryptedFile, "ActiveSupport::EncryptedFile"],
  [() => m41.InvalidKeyLengthError, "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m41.MissingContentError, "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m41.MissingKeyError, "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m42.EnvironmentInquirer, "ActiveSupport::EnvironmentInquirer"],
  [() => m43.ErrorReporter, "ActiveSupport::ErrorReporter"],
  [() => m44.ExecutionContext, "ActiveSupport::ExecutionContext"],
  [() => m45.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m45.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m45.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m46.Executor, "ActiveSupport::Executor"],
  [() => m47.FileUpdateChecker, "ActiveSupport::FileUpdateChecker"],
  [() => m49.Gzip, "ActiveSupport::Gzip"],
  [() => m49.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m50.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m51.HtmlSafeTranslation, "ActiveSupport::HtmlSafeTranslation"],
  [() => m52.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m52.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m82.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m53.IsolatedExecutionState, "ActiveSupport::IsolatedExecutionState"],
  [() => m54.Encoding, "ActiveSupport::JSON::Encoding"],
  [() => m54.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m56.Logger, "ActiveSupport::Logger"],
  [() => m56.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m55.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m57.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m57.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m57.NullSerializer, "ActiveSupport::MessageEncryptor::NullSerializer"],
  [() => m60.Codec, "ActiveSupport::Messages::Codec"],
  [() => m61.Metadata, "ActiveSupport::Messages::Metadata"],
  [() => m62.RotationCoordinator, "ActiveSupport::Messages::RotationCoordinator"],
  [() => m63.SerializerWithFallback, "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m58.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m58.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m59.MessageVerifiers, "ActiveSupport::MessageVerifiers"],
  [() => m64.Multibyte, "ActiveSupport::Multibyte"],
  [() => m65.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m66.Unicode, "ActiveSupport::Multibyte::Unicode"],
  [() => m67.Notifications, "ActiveSupport::Notifications"],
  [() => m69.Event, "ActiveSupport::Notifications::Event"],
  [() => m68.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m68.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m68.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m68.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m68.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m68.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m68.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m68.Subscribers, "ActiveSupport::Notifications::Fanout::Subscribers"],
  [() => m68.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m68.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m68.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m68.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m68.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m68.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m68.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m68.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m69.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m69.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m69.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m70.NumberHelper, "ActiveSupport::NumberHelper"],
  [() => m71.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m72.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m73.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m74.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m75.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m76.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m77.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m78.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m79.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m80.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m81.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m82.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m83.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m84.Reloader, "ActiveSupport::Reloader"],
  [() => m85.Rescuable, "ActiveSupport::Rescuable"],
  [() => m85.ClassMethods, "ActiveSupport::Rescuable::ClassMethods"],
  [() => m25.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m25.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m86.SecurityUtils, "ActiveSupport::SecurityUtils"],
  [() => m87.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m88.Subscriber, "ActiveSupport::Subscriber"],
  [() => m89.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m90.TaggedLogging, "ActiveSupport::TaggedLogging"],
  [() => m90.Formatter, "ActiveSupport::TaggedLogging::Formatter"],
  [() => m90.LocalTagStorage, "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m90.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m91.ConstantLookup, "ActiveSupport::Testing::ConstantLookup"],
  [() => m91.ClassMethods, "ActiveSupport::Testing::ConstantLookup::ClassMethods"],
  [() => m92.ErrorReporterAssertions, "ActiveSupport::Testing::ErrorReporterAssertions"],
  [() => m92.ErrorCollector, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector"],
  [() => m92.Report, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector::Report"],
  [() => m93.Isolation, "ActiveSupport::Testing::Isolation"],
  [() => m93.Subprocess, "ActiveSupport::Testing::Isolation::Subprocess"],
  [() => m94.MethodCallAssertions, "ActiveSupport::Testing::MethodCallAssertions"],
  [() => m95.ClassMethods, "ActiveSupport::Testing::SetupAndTeardown::ClassMethods"],
  [() => m98.SimpleStubs, "ActiveSupport::Testing::SimpleStubs"],
  [() => m96.Stream, "ActiveSupport::Testing::Stream"],
  [() => m97.TaggedLogging, "ActiveSupport::Testing::TaggedLogging"],
  [() => m98.TimeHelpers, "ActiveSupport::Testing::TimeHelpers"],
  [() => m99.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m100.TimeZone, "ActiveSupport::TimeZone"],
  [() => m23.ToJsonWithActiveSupportEncoder, "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m24.Tryable, "ActiveSupport::Tryable"],
  [() => m48.VERSION, "ActiveSupport::VERSION"],
  [() => m22.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m22.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m101.FileLike, "ActiveSupport::XmlMini::FileLike"],
  [() => m20, "DateAndTime::Calculations"],
  [() => m21.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m26.Util, "TSE::Util"],
  [() => m23.Generic, "URI::Generic"],
]);
