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
import * as m13 from "./concern.js";
import * as m14 from "./concurrency/load-interlock-aware-monitor.js";
import * as m15 from "./concurrency/null-lock.js";
import * as m16 from "./concurrency/share-lock.js";
import * as m17 from "./configurable.js";
import * as m18 from "./core-ext/big-decimal/conversions.js";
import * as m19 from "./core-ext/date-and-time/calculations.js";
import * as m20 from "./core-ext/enumerable.js";
import * as m21 from "./core-ext/hash/conversions.js";
import * as m22 from "./core-ext/object/json.js";
import * as m23 from "./core-ext/object/try.js";
import * as m24 from "./core-ext/string/output-safety.js";
import * as m25 from "./core-ext/tse/util.js";
import * as m26 from "./current-attributes.js";
import * as m27 from "./deep-mergeable.js";
import * as m28 from "./delegation.js";
import * as m29 from "./dependencies.js";
import * as m30 from "./dependencies/interlock.js";
import * as m31 from "./deprecation.js";
import * as m32 from "./deprecation/deprecators.js";
import * as m33 from "./deprecation/proxy-wrappers.js";
import * as m34 from "./descendants-tracker.js";
import * as m35 from "./digest.js";
import * as m36 from "./duration.js";
import * as m37 from "./duration/iso8601-parser.js";
import * as m38 from "./duration/iso8601-serializer.js";
import * as m39 from "./encrypted-file.js";
import * as m40 from "./environment-inquirer.js";
import * as m41 from "./error-reporter.js";
import * as m42 from "./execution-context.js";
import * as m43 from "./execution-wrapper.js";
import * as m44 from "./executor.js";
import * as m45 from "./gem-version.js";
import * as m46 from "./gzip.js";
import * as m47 from "./hash-with-indifferent-access.js";
import * as m48 from "./html-safe-translation.js";
import * as m49 from "./inflector/inflections.js";
import * as m50 from "./isolated-execution-state.js";
import * as m51 from "./json/encoding.js";
import * as m52 from "./log-subscriber.js";
import * as m53 from "./logger.js";
import * as m54 from "./message-encryptor.js";
import * as m55 from "./message-verifier.js";
import * as m56 from "./messages/codec.js";
import * as m57 from "./messages/metadata.js";
import * as m58 from "./messages/serializer-with-fallback.js";
import * as m59 from "./multibyte.js";
import * as m60 from "./multibyte/chars.js";
import * as m61 from "./multibyte/unicode.js";
import * as m62 from "./notifications.js";
import * as m63 from "./notifications/fanout.js";
import * as m64 from "./notifications/instrumenter.js";
import * as m65 from "./number-helper.js";
import * as m66 from "./number-helper/number-converter.js";
import * as m67 from "./number-helper/number-to-currency-converter.js";
import * as m68 from "./number-helper/number-to-delimited-converter.js";
import * as m69 from "./number-helper/number-to-human-converter.js";
import * as m70 from "./number-helper/number-to-human-size-converter.js";
import * as m71 from "./number-helper/number-to-percentage-converter.js";
import * as m72 from "./number-helper/number-to-phone-converter.js";
import * as m73 from "./number-helper/number-to-rounded-converter.js";
import * as m74 from "./number-helper/rounding-helper.js";
import * as m75 from "./option-merger.js";
import * as m76 from "./ordered-hash.js";
import * as m77 from "./ordered-options.js";
import * as m78 from "./parameter-filter.js";
import * as m79 from "./reloader.js";
import * as m80 from "./rescuable.js";
import * as m81 from "./security-utils.js";
import * as m82 from "./string-inquirer.js";
import * as m83 from "./subscriber.js";
import * as m84 from "./syntax-error-proxy.js";
import * as m85 from "./tagged-logging.js";
import * as m86 from "./testing/constant-lookup.js";
import * as m87 from "./testing/error-reporter-assertions.js";
import * as m88 from "./testing/method-call-assertions.js";
import * as m89 from "./testing/setup-and-teardown.js";
import * as m90 from "./testing/stream.js";
import * as m91 from "./testing/tagged-logging.js";
import * as m92 from "./testing/time-helpers.js";
import * as m93 from "./time-with-zone.js";
import * as m94 from "./values/time-zone.js";
import * as m95 from "./xml-mini.js";

registerClassPaths([
  [() => m0.ActionableError, "ActiveSupport::ActionableError"],
  [() => m0.NonActionable, "ActiveSupport::ActionableError::NonActionable"],
  [() => m1.ArrayInquirer, "ActiveSupport::ArrayInquirer"],
  [() => m2.BacktraceCleaner, "ActiveSupport::BacktraceCleaner"],
  [() => m3.Benchmark, "ActiveSupport::Benchmark"],
  [() => m4.Benchmarkable, "ActiveSupport::Benchmarkable"],
  [() => m18.BigDecimalWithDefaultFormat, "ActiveSupport::BigDecimalWithDefaultFormat"],
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
  [() => m13.Concern, "ActiveSupport::Concern"],
  [() => m13.MultipleIncludedBlocks, "ActiveSupport::Concern::MultipleIncludedBlocks"],
  [() => m13.MultiplePrependBlocks, "ActiveSupport::Concern::MultiplePrependBlocks"],
  [() => m14.LoadInterlockAwareMonitor, "ActiveSupport::Concurrency::LoadInterlockAwareMonitor"],
  [
    () => m14.LoadInterlockAwareMonitorMixin,
    "ActiveSupport::Concurrency::LoadInterlockAwareMonitorMixin",
  ],
  [() => m15.NullLock, "ActiveSupport::Concurrency::NullLock"],
  [() => m16.ShareLock, "ActiveSupport::Concurrency::ShareLock"],
  [
    () => m14.ThreadLoadInterlockAwareMonitor,
    "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor",
  ],
  [() => m17.Configurable, "ActiveSupport::Configurable"],
  [() => m17.Configuration, "ActiveSupport::Configurable::Configuration"],
  [() => m26.CurrentAttributes, "ActiveSupport::CurrentAttributes"],
  [() => m27.DeepMergeable, "ActiveSupport::DeepMergeable"],
  [() => m28.Delegation, "ActiveSupport::Delegation"],
  [() => m28.DelegationError, "ActiveSupport::DelegationError"],
  [() => m29.Dependencies, "ActiveSupport::Dependencies"],
  [() => m30.Interlock, "ActiveSupport::Dependencies::Interlock"],
  [() => m31.Deprecation, "ActiveSupport::Deprecation"],
  [() => m33.DeprecatedConstantProxy, "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m33.DeprecatedInstanceVariableProxy,
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m33.DeprecatedObjectProxy, "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m33.DeprecationProxy, "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m32.Deprecators, "ActiveSupport::Deprecation::Deprecators"],
  [() => m34.DescendantsTracker, "ActiveSupport::DescendantsTracker"],
  [
    () => m34.ReloadedClassesFiltering,
    "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering",
  ],
  [() => m34.WeakSet, "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m35.Digest, "ActiveSupport::Digest"],
  [() => m36.Duration, "ActiveSupport::Duration"],
  [() => m37.ISO8601Parser, "ActiveSupport::Duration::ISO8601Parser"],
  [() => m37.ParsingError, "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m38.ISO8601Serializer, "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m36.Scalar, "ActiveSupport::Duration::Scalar"],
  [() => m39.EncryptedFile, "ActiveSupport::EncryptedFile"],
  [() => m39.InvalidKeyLengthError, "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m39.MissingContentError, "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m39.MissingKeyError, "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m40.EnvironmentInquirer, "ActiveSupport::EnvironmentInquirer"],
  [() => m41.ErrorReporter, "ActiveSupport::ErrorReporter"],
  [() => m42.ExecutionContext, "ActiveSupport::ExecutionContext"],
  [() => m43.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m43.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m43.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m44.Executor, "ActiveSupport::Executor"],
  [() => m46.Gzip, "ActiveSupport::Gzip"],
  [() => m46.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m47.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m48.HtmlSafeTranslation, "ActiveSupport::HtmlSafeTranslation"],
  [() => m49.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m49.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m77.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m50.IsolatedExecutionState, "ActiveSupport::IsolatedExecutionState"],
  [() => m51.Encoding, "ActiveSupport::JSON::Encoding"],
  [() => m51.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m53.Logger, "ActiveSupport::Logger"],
  [() => m53.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m52.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m54.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m54.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m54.NullSerializer, "ActiveSupport::MessageEncryptor::NullSerializer"],
  [() => m56.Codec, "ActiveSupport::Messages::Codec"],
  [() => m57.Metadata, "ActiveSupport::Messages::Metadata"],
  [() => m58.SerializerWithFallback, "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m55.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m55.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m59.Multibyte, "ActiveSupport::Multibyte"],
  [() => m60.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m61.Unicode, "ActiveSupport::Multibyte::Unicode"],
  [() => m62.Notifications, "ActiveSupport::Notifications"],
  [() => m64.Event, "ActiveSupport::Notifications::Event"],
  [() => m63.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m63.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m63.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m63.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m63.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m63.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m63.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m63.Subscribers, "ActiveSupport::Notifications::Fanout::Subscribers"],
  [() => m63.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m63.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m63.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m63.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m63.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m63.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m63.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m63.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m64.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m64.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m64.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m65.NumberHelper, "ActiveSupport::NumberHelper"],
  [() => m66.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m67.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m68.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m69.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m70.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m71.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m72.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m73.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m74.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m75.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m76.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m77.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m78.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m79.Reloader, "ActiveSupport::Reloader"],
  [() => m80.Rescuable, "ActiveSupport::Rescuable"],
  [() => m80.ClassMethods, "ActiveSupport::Rescuable::ClassMethods"],
  [() => m24.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m24.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m81.SecurityUtils, "ActiveSupport::SecurityUtils"],
  [() => m82.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m83.Subscriber, "ActiveSupport::Subscriber"],
  [() => m84.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m85.TaggedLogging, "ActiveSupport::TaggedLogging"],
  [() => m85.Formatter, "ActiveSupport::TaggedLogging::Formatter"],
  [() => m85.LocalTagStorage, "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m85.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m86.ConstantLookup, "ActiveSupport::Testing::ConstantLookup"],
  [() => m86.ClassMethods, "ActiveSupport::Testing::ConstantLookup::ClassMethods"],
  [() => m87.ErrorReporterAssertions, "ActiveSupport::Testing::ErrorReporterAssertions"],
  [() => m87.ErrorCollector, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector"],
  [() => m87.Report, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector::Report"],
  [() => m88.MethodCallAssertions, "ActiveSupport::Testing::MethodCallAssertions"],
  [() => m89.ClassMethods, "ActiveSupport::Testing::SetupAndTeardown::ClassMethods"],
  [() => m92.SimpleStubs, "ActiveSupport::Testing::SimpleStubs"],
  [() => m90.Stream, "ActiveSupport::Testing::Stream"],
  [() => m91.TaggedLogging, "ActiveSupport::Testing::TaggedLogging"],
  [() => m92.TimeHelpers, "ActiveSupport::Testing::TimeHelpers"],
  [() => m93.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m94.TimeZone, "ActiveSupport::TimeZone"],
  [() => m22.ToJsonWithActiveSupportEncoder, "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m23.Tryable, "ActiveSupport::Tryable"],
  [() => m45.VERSION, "ActiveSupport::VERSION"],
  [() => m21.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m21.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m95.FileLike, "ActiveSupport::XmlMini::FileLike"],
  [() => m19, "DateAndTime::Calculations"],
  [() => m20.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m25.Util, "TSE::Util"],
  [() => m22.Generic, "URI::Generic"],
]);
