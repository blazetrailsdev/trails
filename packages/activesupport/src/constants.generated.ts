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
import * as m47 from "./executor/test-helper.js";
import * as m48 from "./file-update-checker.js";
import * as m49 from "./gem-version.js";
import * as m50 from "./gzip.js";
import * as m51 from "./hash-with-indifferent-access.js";
import * as m52 from "./html-safe-translation.js";
import * as m53 from "./inflector/inflections.js";
import * as m54 from "./isolated-execution-state.js";
import * as m55 from "./json/encoding.js";
import * as m56 from "./log-subscriber.js";
import * as m57 from "./logger.js";
import * as m58 from "./message-encryptor.js";
import * as m59 from "./message-verifier.js";
import * as m60 from "./message-verifiers.js";
import * as m61 from "./messages/codec.js";
import * as m62 from "./messages/metadata.js";
import * as m63 from "./messages/rotation-coordinator.js";
import * as m64 from "./messages/serializer-with-fallback.js";
import * as m65 from "./multibyte.js";
import * as m66 from "./multibyte/chars.js";
import * as m67 from "./multibyte/unicode.js";
import * as m68 from "./notifications.js";
import * as m69 from "./notifications/fanout.js";
import * as m70 from "./notifications/instrumenter.js";
import * as m71 from "./number-helper.js";
import * as m72 from "./number-helper/number-converter.js";
import * as m73 from "./number-helper/number-to-currency-converter.js";
import * as m74 from "./number-helper/number-to-delimited-converter.js";
import * as m75 from "./number-helper/number-to-human-converter.js";
import * as m76 from "./number-helper/number-to-human-size-converter.js";
import * as m77 from "./number-helper/number-to-percentage-converter.js";
import * as m78 from "./number-helper/number-to-phone-converter.js";
import * as m79 from "./number-helper/number-to-rounded-converter.js";
import * as m80 from "./number-helper/rounding-helper.js";
import * as m81 from "./option-merger.js";
import * as m82 from "./ordered-hash.js";
import * as m83 from "./ordered-options.js";
import * as m84 from "./parameter-filter.js";
import * as m85 from "./reloader.js";
import * as m86 from "./rescuable.js";
import * as m87 from "./security-utils.js";
import * as m88 from "./string-inquirer.js";
import * as m89 from "./subscriber.js";
import * as m90 from "./syntax-error-proxy.js";
import * as m91 from "./tagged-logging.js";
import * as m92 from "./testing/constant-lookup.js";
import * as m93 from "./testing/error-reporter-assertions.js";
import * as m94 from "./testing/isolation.js";
import * as m95 from "./testing/method-call-assertions.js";
import * as m96 from "./testing/setup-and-teardown.js";
import * as m97 from "./testing/stream.js";
import * as m98 from "./testing/tagged-logging.js";
import * as m99 from "./testing/time-helpers.js";
import * as m100 from "./time-with-zone.js";
import * as m101 from "./values/time-zone.js";
import * as m102 from "./xml-mini.js";

defineConstants([
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
  [() => m43.ErrorReporter.UnexpectedError, "ActiveSupport::ErrorReporter::UnexpectedError"],
  [() => m44.ExecutionContext, "ActiveSupport::ExecutionContext"],
  [() => m45.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m45.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m45.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m46.Executor, "ActiveSupport::Executor"],
  [() => m47.TestHelper, "ActiveSupport::Executor::TestHelper"],
  [() => m48.FileUpdateChecker, "ActiveSupport::FileUpdateChecker"],
  [() => m50.Gzip, "ActiveSupport::Gzip"],
  [() => m50.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m51.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m52.HtmlSafeTranslation, "ActiveSupport::HtmlSafeTranslation"],
  [() => m53.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m53.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m83.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m54.IsolatedExecutionState, "ActiveSupport::IsolatedExecutionState"],
  [() => m55.Encoding, "ActiveSupport::JSON::Encoding"],
  [() => m55.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m57.Logger, "ActiveSupport::Logger"],
  [() => m57.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m56.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m58.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m58.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m58.NullSerializer, "ActiveSupport::MessageEncryptor::NullSerializer"],
  [() => m61.Codec, "ActiveSupport::Messages::Codec"],
  [() => m62.Metadata, "ActiveSupport::Messages::Metadata"],
  [() => m63.RotationCoordinator, "ActiveSupport::Messages::RotationCoordinator"],
  [() => m64.SerializerWithFallback, "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m59.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m59.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m60.MessageVerifiers, "ActiveSupport::MessageVerifiers"],
  [() => m65.Multibyte, "ActiveSupport::Multibyte"],
  [() => m66.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m67.Unicode, "ActiveSupport::Multibyte::Unicode"],
  [() => m68.Notifications, "ActiveSupport::Notifications"],
  [() => m70.Event, "ActiveSupport::Notifications::Event"],
  [() => m69.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m69.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m69.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m69.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m69.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m69.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m69.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m69.Subscribers, "ActiveSupport::Notifications::Fanout::Subscribers"],
  [() => m69.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m69.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m69.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m69.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m69.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m69.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m69.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m69.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m70.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m70.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m70.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m71.NumberHelper, "ActiveSupport::NumberHelper"],
  [() => m72.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m73.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m74.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m75.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m76.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m77.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m78.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m79.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m80.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m81.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m82.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m83.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m84.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m85.Reloader, "ActiveSupport::Reloader"],
  [() => m86.Rescuable, "ActiveSupport::Rescuable"],
  [() => m86.ClassMethods, "ActiveSupport::Rescuable::ClassMethods"],
  [() => m25.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m25.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m87.SecurityUtils, "ActiveSupport::SecurityUtils"],
  [() => m88.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m89.Subscriber, "ActiveSupport::Subscriber"],
  [() => m90.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m91.TaggedLogging, "ActiveSupport::TaggedLogging"],
  [() => m91.Formatter, "ActiveSupport::TaggedLogging::Formatter"],
  [() => m91.LocalTagStorage, "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m91.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m92.ConstantLookup, "ActiveSupport::Testing::ConstantLookup"],
  [() => m92.ClassMethods, "ActiveSupport::Testing::ConstantLookup::ClassMethods"],
  [() => m93.ErrorReporterAssertions, "ActiveSupport::Testing::ErrorReporterAssertions"],
  [() => m93.ErrorCollector, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector"],
  [() => m93.Report, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector::Report"],
  [() => m94.Isolation, "ActiveSupport::Testing::Isolation"],
  [() => m94.Subprocess, "ActiveSupport::Testing::Isolation::Subprocess"],
  [() => m94.SubprocessCrashed, "ActiveSupport::Testing::Isolation::SubprocessCrashed"],
  [() => m95.MethodCallAssertions, "ActiveSupport::Testing::MethodCallAssertions"],
  [() => m96, "ActiveSupport::Testing::SetupAndTeardown"],
  [() => m96.ClassMethods, "ActiveSupport::Testing::SetupAndTeardown::ClassMethods"],
  [() => m99.SimpleStubs, "ActiveSupport::Testing::SimpleStubs"],
  [() => m97.Stream, "ActiveSupport::Testing::Stream"],
  [() => m98.TaggedLogging, "ActiveSupport::Testing::TaggedLogging"],
  [() => m99.TimeHelpers, "ActiveSupport::Testing::TimeHelpers"],
  [() => m100.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m101.TimeZone, "ActiveSupport::TimeZone"],
  [() => m23.ToJsonWithActiveSupportEncoder, "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m24.Tryable, "ActiveSupport::Tryable"],
  [() => m49.VERSION, "ActiveSupport::VERSION"],
  [() => m22.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m22.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m102, "ActiveSupport::XmlMini"],
  [() => m102.FileLike, "ActiveSupport::XmlMini::FileLike"],
  [() => m20, "DateAndTime::Calculations"],
  [() => m21.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m26.Util, "TSE::Util"],
  [() => m23.Generic, "URI::Generic"],
]);
