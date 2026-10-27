import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./actionable-error.js";
import * as m1 from "./array-inquirer.js";
import * as m2 from "./backtrace-cleaner.js";
import * as m3 from "./benchmarkable.js";
import * as m4 from "./broadcast-logger.js";
import * as m5 from "./cache/coder.js";
import * as m6 from "./cache/entry.js";
import * as m7 from "./cache/memory-store.js";
import * as m8 from "./cache/null-store.js";
import * as m9 from "./callbacks.js";
import * as m10 from "./concern.js";
import * as m11 from "./concurrency/load-interlock-aware-monitor.js";
import * as m12 from "./concurrency/null-lock.js";
import * as m13 from "./concurrency/share-lock.js";
import * as m14 from "./configurable.js";
import * as m15 from "./core-ext/big-decimal/conversions.js";
import * as m16 from "./core-ext/enumerable.js";
import * as m17 from "./core-ext/hash/conversions.js";
import * as m18 from "./core-ext/object/json.js";
import * as m19 from "./core-ext/object/try.js";
import * as m20 from "./core-ext/string/output-safety.js";
import * as m21 from "./core-ext/tse/util.js";
import * as m22 from "./current-attributes.js";
import * as m23 from "./deep-mergeable.js";
import * as m24 from "./delegation.js";
import * as m25 from "./dependencies.js";
import * as m26 from "./dependencies/interlock.js";
import * as m27 from "./deprecation.js";
import * as m28 from "./deprecation/deprecators.js";
import * as m29 from "./deprecation/proxy-wrappers.js";
import * as m30 from "./descendants-tracker.js";
import * as m31 from "./digest.js";
import * as m32 from "./duration.js";
import * as m33 from "./duration/iso8601-parser.js";
import * as m34 from "./duration/iso8601-serializer.js";
import * as m35 from "./encrypted-file.js";
import * as m36 from "./environment-inquirer.js";
import * as m37 from "./error-reporter.js";
import * as m38 from "./execution-context.js";
import * as m39 from "./execution-wrapper.js";
import * as m40 from "./executor.js";
import * as m41 from "./gem-version.js";
import * as m42 from "./gzip.js";
import * as m43 from "./hash-with-indifferent-access.js";
import * as m44 from "./html-safe-translation.js";
import * as m45 from "./inflector/inflections.js";
import * as m46 from "./isolated-execution-state.js";
import * as m47 from "./json/encoding.js";
import * as m48 from "./log-subscriber.js";
import * as m49 from "./logger.js";
import * as m50 from "./message-encryptor.js";
import * as m51 from "./message-verifier.js";
import * as m52 from "./messages/codec.js";
import * as m53 from "./messages/serializer-with-fallback.js";
import * as m54 from "./multibyte/chars.js";
import * as m55 from "./notifications/fanout.js";
import * as m56 from "./notifications/instrumenter.js";
import * as m57 from "./number-helper/number-converter.js";
import * as m58 from "./number-helper/number-to-currency-converter.js";
import * as m59 from "./number-helper/number-to-delimited-converter.js";
import * as m60 from "./number-helper/number-to-human-converter.js";
import * as m61 from "./number-helper/number-to-human-size-converter.js";
import * as m62 from "./number-helper/number-to-percentage-converter.js";
import * as m63 from "./number-helper/number-to-phone-converter.js";
import * as m64 from "./number-helper/number-to-rounded-converter.js";
import * as m65 from "./number-helper/rounding-helper.js";
import * as m66 from "./option-merger.js";
import * as m67 from "./ordered-hash.js";
import * as m68 from "./ordered-options.js";
import * as m69 from "./parameter-filter.js";
import * as m70 from "./reloader.js";
import * as m71 from "./rescuable.js";
import * as m72 from "./string-inquirer.js";
import * as m73 from "./subscriber.js";
import * as m74 from "./syntax-error-proxy.js";
import * as m75 from "./tagged-logging.js";
import * as m76 from "./testing/constant-lookup.js";
import * as m77 from "./testing/error-reporter-assertions.js";
import * as m78 from "./testing/method-call-assertions.js";
import * as m79 from "./testing/setup-and-teardown.js";
import * as m80 from "./testing/stream.js";
import * as m81 from "./testing/tagged-logging.js";
import * as m82 from "./testing/time-helpers.js";
import * as m83 from "./time-with-zone.js";
import * as m84 from "./values/time-zone.js";
import * as m85 from "./xml-mini.js";

registerClassPaths([
  [() => m0.NonActionable, "ActiveSupport::ActionableError::NonActionable"],
  [() => m1.ArrayInquirer, "ActiveSupport::ArrayInquirer"],
  [() => m2.BacktraceCleaner, "ActiveSupport::BacktraceCleaner"],
  [() => m3.Benchmarkable, "ActiveSupport::Benchmarkable"],
  [() => m15.BigDecimalWithDefaultFormat, "ActiveSupport::BigDecimalWithDefaultFormat"],
  [() => m4.BroadcastLogger, "ActiveSupport::BroadcastLogger"],
  [() => m5.Coder, "ActiveSupport::Cache::Coder"],
  [() => m6.Entry, "ActiveSupport::Cache::Entry"],
  [() => m7.MemoryStore, "ActiveSupport::Cache::MemoryStore"],
  [() => m8.NullStore, "ActiveSupport::Cache::NullStore"],
  [() => m9.Callbacks, "ActiveSupport::Callbacks"],
  [() => m9.Callback, "ActiveSupport::Callbacks::Callback"],
  [() => m9.CallbackChain, "ActiveSupport::Callbacks::CallbackChain"],
  [() => m9.CallbackSequence, "ActiveSupport::Callbacks::CallbackSequence"],
  [() => m9.InstanceExec0, "ActiveSupport::Callbacks::CallTemplate::InstanceExec0"],
  [() => m9.InstanceExec1, "ActiveSupport::Callbacks::CallTemplate::InstanceExec1"],
  [() => m9.InstanceExec2, "ActiveSupport::Callbacks::CallTemplate::InstanceExec2"],
  [() => m9.MethodCall, "ActiveSupport::Callbacks::CallTemplate::MethodCall"],
  [() => m9.ObjectCall, "ActiveSupport::Callbacks::CallTemplate::ObjectCall"],
  [() => m9.ProcCall, "ActiveSupport::Callbacks::CallTemplate::ProcCall"],
  [() => m9.ClassMethods, "ActiveSupport::Callbacks::ClassMethods"],
  [() => m9.Value, "ActiveSupport::Callbacks::Conditionals::Value"],
  [() => m9.After, "ActiveSupport::Callbacks::Filters::After"],
  [() => m9.Around, "ActiveSupport::Callbacks::Filters::Around"],
  [() => m9.Before, "ActiveSupport::Callbacks::Filters::Before"],
  [() => m10.Concern, "ActiveSupport::Concern"],
  [() => m10.MultipleIncludedBlocks, "ActiveSupport::Concern::MultipleIncludedBlocks"],
  [() => m10.MultiplePrependBlocks, "ActiveSupport::Concern::MultiplePrependBlocks"],
  [() => m11.LoadInterlockAwareMonitor, "ActiveSupport::Concurrency::LoadInterlockAwareMonitor"],
  [
    () => m11.LoadInterlockAwareMonitorMixin,
    "ActiveSupport::Concurrency::LoadInterlockAwareMonitorMixin",
  ],
  [() => m12.NullLock, "ActiveSupport::Concurrency::NullLock"],
  [() => m13.ShareLock, "ActiveSupport::Concurrency::ShareLock"],
  [
    () => m11.ThreadLoadInterlockAwareMonitor,
    "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor",
  ],
  [() => m14.Configuration, "ActiveSupport::Configurable::Configuration"],
  [() => m22.CurrentAttributes, "ActiveSupport::CurrentAttributes"],
  [() => m23.DeepMergeable, "ActiveSupport::DeepMergeable"],
  [() => m24.DelegationError, "ActiveSupport::DelegationError"],
  [() => m25.Dependencies, "ActiveSupport::Dependencies"],
  [() => m26.Interlock, "ActiveSupport::Dependencies::Interlock"],
  [() => m27.Deprecation, "ActiveSupport::Deprecation"],
  [() => m29.DeprecatedConstantProxy, "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m29.DeprecatedInstanceVariableProxy,
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m29.DeprecatedObjectProxy, "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m29.DeprecationProxy, "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m28.Deprecators, "ActiveSupport::Deprecation::Deprecators"],
  [() => m30.DescendantsTracker, "ActiveSupport::DescendantsTracker"],
  [
    () => m30.ReloadedClassesFiltering,
    "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering",
  ],
  [() => m30.WeakSet, "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m31.Digest, "ActiveSupport::Digest"],
  [() => m32.Duration, "ActiveSupport::Duration"],
  [() => m33.ISO8601Parser, "ActiveSupport::Duration::ISO8601Parser"],
  [() => m33.ParsingError, "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m34.ISO8601Serializer, "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m32.Scalar, "ActiveSupport::Duration::Scalar"],
  [() => m35.EncryptedFile, "ActiveSupport::EncryptedFile"],
  [() => m35.InvalidKeyLengthError, "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m35.MissingContentError, "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m35.MissingKeyError, "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m36.EnvironmentInquirer, "ActiveSupport::EnvironmentInquirer"],
  [() => m37.ErrorReporter, "ActiveSupport::ErrorReporter"],
  [() => m38.ExecutionContext, "ActiveSupport::ExecutionContext"],
  [() => m39.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m39.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m39.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m40.Executor, "ActiveSupport::Executor"],
  [() => m42.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m43.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m44.HtmlSafeTranslation, "ActiveSupport::HtmlSafeTranslation"],
  [() => m45.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m45.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m68.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m46.IsolatedExecutionState, "ActiveSupport::IsolatedExecutionState"],
  [() => m47.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m49.Logger, "ActiveSupport::Logger"],
  [() => m49.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m48.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m50.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m50.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m52.Codec, "ActiveSupport::Messages::Codec"],
  [() => m53.SerializerWithFallback, "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m51.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m51.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m54.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m56.Event, "ActiveSupport::Notifications::Event"],
  [() => m55.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m55.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m55.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m55.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m55.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m55.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m55.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m55.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m55.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m55.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m55.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m55.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m55.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m55.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m55.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m56.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m56.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m56.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m57.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m58.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m59.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m60.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m61.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m62.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m63.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m64.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m65.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m66.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m67.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m68.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m69.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m70.Reloader, "ActiveSupport::Reloader"],
  [() => m71.Rescuable, "ActiveSupport::Rescuable"],
  [() => m71.ClassMethods, "ActiveSupport::Rescuable::ClassMethods"],
  [() => m20.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m20.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m72.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m73.Subscriber, "ActiveSupport::Subscriber"],
  [() => m74.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m75.TaggedLogging, "ActiveSupport::TaggedLogging"],
  [() => m75.Formatter, "ActiveSupport::TaggedLogging::Formatter"],
  [() => m75.LocalTagStorage, "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m75.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m76.ConstantLookup, "ActiveSupport::Testing::ConstantLookup"],
  [() => m76.ClassMethods, "ActiveSupport::Testing::ConstantLookup::ClassMethods"],
  [() => m77.ErrorReporterAssertions, "ActiveSupport::Testing::ErrorReporterAssertions"],
  [() => m77.ErrorCollector, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector"],
  [() => m77.Report, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector::Report"],
  [() => m78.MethodCallAssertions, "ActiveSupport::Testing::MethodCallAssertions"],
  [() => m79.ClassMethods, "ActiveSupport::Testing::SetupAndTeardown::ClassMethods"],
  [() => m82.SimpleStubs, "ActiveSupport::Testing::SimpleStubs"],
  [() => m80.Stream, "ActiveSupport::Testing::Stream"],
  [() => m81.TaggedLogging, "ActiveSupport::Testing::TaggedLogging"],
  [() => m82.TimeHelpers, "ActiveSupport::Testing::TimeHelpers"],
  [() => m83.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m84.TimeZone, "ActiveSupport::TimeZone"],
  [() => m18.ToJsonWithActiveSupportEncoder, "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m19.Tryable, "ActiveSupport::Tryable"],
  [() => m41.VERSION, "ActiveSupport::VERSION"],
  [() => m17.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m17.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m85.FileLike, "ActiveSupport::XmlMini::FileLike"],
  [() => m16.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m21.Util, "TSE::Util"],
  [() => m18.Generic, "URI::Generic"],
]);
