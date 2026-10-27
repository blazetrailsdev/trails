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
import * as m19 from "./core-ext/enumerable.js";
import * as m20 from "./core-ext/hash/conversions.js";
import * as m21 from "./core-ext/object/json.js";
import * as m22 from "./core-ext/object/try.js";
import * as m23 from "./core-ext/string/output-safety.js";
import * as m24 from "./core-ext/tse/util.js";
import * as m25 from "./current-attributes.js";
import * as m26 from "./deep-mergeable.js";
import * as m27 from "./delegation.js";
import * as m28 from "./dependencies.js";
import * as m29 from "./dependencies/interlock.js";
import * as m30 from "./deprecation.js";
import * as m31 from "./deprecation/deprecators.js";
import * as m32 from "./deprecation/proxy-wrappers.js";
import * as m33 from "./descendants-tracker.js";
import * as m34 from "./digest.js";
import * as m35 from "./duration.js";
import * as m36 from "./duration/iso8601-parser.js";
import * as m37 from "./duration/iso8601-serializer.js";
import * as m38 from "./encrypted-file.js";
import * as m39 from "./environment-inquirer.js";
import * as m40 from "./error-reporter.js";
import * as m41 from "./execution-context.js";
import * as m42 from "./execution-wrapper.js";
import * as m43 from "./executor.js";
import * as m44 from "./gem-version.js";
import * as m45 from "./gzip.js";
import * as m46 from "./hash-with-indifferent-access.js";
import * as m47 from "./html-safe-translation.js";
import * as m48 from "./inflector/inflections.js";
import * as m49 from "./isolated-execution-state.js";
import * as m50 from "./json/encoding.js";
import * as m51 from "./log-subscriber.js";
import * as m52 from "./logger.js";
import * as m53 from "./message-encryptor.js";
import * as m54 from "./message-verifier.js";
import * as m55 from "./messages/codec.js";
import * as m56 from "./messages/metadata.js";
import * as m57 from "./messages/serializer-with-fallback.js";
import * as m58 from "./multibyte.js";
import * as m59 from "./multibyte/chars.js";
import * as m60 from "./multibyte/unicode.js";
import * as m61 from "./notifications.js";
import * as m62 from "./notifications/fanout.js";
import * as m63 from "./notifications/instrumenter.js";
import * as m64 from "./number-helper.js";
import * as m65 from "./number-helper/number-converter.js";
import * as m66 from "./number-helper/number-to-currency-converter.js";
import * as m67 from "./number-helper/number-to-delimited-converter.js";
import * as m68 from "./number-helper/number-to-human-converter.js";
import * as m69 from "./number-helper/number-to-human-size-converter.js";
import * as m70 from "./number-helper/number-to-percentage-converter.js";
import * as m71 from "./number-helper/number-to-phone-converter.js";
import * as m72 from "./number-helper/number-to-rounded-converter.js";
import * as m73 from "./number-helper/rounding-helper.js";
import * as m74 from "./option-merger.js";
import * as m75 from "./ordered-hash.js";
import * as m76 from "./ordered-options.js";
import * as m77 from "./parameter-filter.js";
import * as m78 from "./reloader.js";
import * as m79 from "./rescuable.js";
import * as m80 from "./security-utils.js";
import * as m81 from "./string-inquirer.js";
import * as m82 from "./subscriber.js";
import * as m83 from "./syntax-error-proxy.js";
import * as m84 from "./tagged-logging.js";
import * as m85 from "./testing/constant-lookup.js";
import * as m86 from "./testing/error-reporter-assertions.js";
import * as m87 from "./testing/method-call-assertions.js";
import * as m88 from "./testing/setup-and-teardown.js";
import * as m89 from "./testing/stream.js";
import * as m90 from "./testing/tagged-logging.js";
import * as m91 from "./testing/time-helpers.js";
import * as m92 from "./time-with-zone.js";
import * as m93 from "./values/time-zone.js";
import * as m94 from "./xml-mini.js";

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
  [() => m25.CurrentAttributes, "ActiveSupport::CurrentAttributes"],
  [() => m26.DeepMergeable, "ActiveSupport::DeepMergeable"],
  [() => m27.Delegation, "ActiveSupport::Delegation"],
  [() => m27.DelegationError, "ActiveSupport::DelegationError"],
  [() => m28.Dependencies, "ActiveSupport::Dependencies"],
  [() => m29.Interlock, "ActiveSupport::Dependencies::Interlock"],
  [() => m30.Deprecation, "ActiveSupport::Deprecation"],
  [() => m32.DeprecatedConstantProxy, "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m32.DeprecatedInstanceVariableProxy,
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m32.DeprecatedObjectProxy, "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m32.DeprecationProxy, "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m31.Deprecators, "ActiveSupport::Deprecation::Deprecators"],
  [() => m33.DescendantsTracker, "ActiveSupport::DescendantsTracker"],
  [
    () => m33.ReloadedClassesFiltering,
    "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering",
  ],
  [() => m33.WeakSet, "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m34.Digest, "ActiveSupport::Digest"],
  [() => m35.Duration, "ActiveSupport::Duration"],
  [() => m36.ISO8601Parser, "ActiveSupport::Duration::ISO8601Parser"],
  [() => m36.ParsingError, "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m37.ISO8601Serializer, "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m35.Scalar, "ActiveSupport::Duration::Scalar"],
  [() => m38.EncryptedFile, "ActiveSupport::EncryptedFile"],
  [() => m38.InvalidKeyLengthError, "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m38.MissingContentError, "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m38.MissingKeyError, "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m39.EnvironmentInquirer, "ActiveSupport::EnvironmentInquirer"],
  [() => m40.ErrorReporter, "ActiveSupport::ErrorReporter"],
  [() => m41.ExecutionContext, "ActiveSupport::ExecutionContext"],
  [() => m42.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m42.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m42.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m43.Executor, "ActiveSupport::Executor"],
  [() => m45.Gzip, "ActiveSupport::Gzip"],
  [() => m45.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m46.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m47.HtmlSafeTranslation, "ActiveSupport::HtmlSafeTranslation"],
  [() => m48.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m48.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m76.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m49.IsolatedExecutionState, "ActiveSupport::IsolatedExecutionState"],
  [() => m50.Encoding, "ActiveSupport::JSON::Encoding"],
  [() => m50.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m52.Logger, "ActiveSupport::Logger"],
  [() => m52.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m51.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m53.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m53.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m53.NullSerializer, "ActiveSupport::MessageEncryptor::NullSerializer"],
  [() => m55.Codec, "ActiveSupport::Messages::Codec"],
  [() => m56.Metadata, "ActiveSupport::Messages::Metadata"],
  [() => m57.SerializerWithFallback, "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m54.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m54.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m58.Multibyte, "ActiveSupport::Multibyte"],
  [() => m59.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m60.Unicode, "ActiveSupport::Multibyte::Unicode"],
  [() => m61.Notifications, "ActiveSupport::Notifications"],
  [() => m63.Event, "ActiveSupport::Notifications::Event"],
  [() => m62.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m62.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m62.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m62.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m62.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m62.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m62.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m62.Subscribers, "ActiveSupport::Notifications::Fanout::Subscribers"],
  [() => m62.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m62.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m62.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m62.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m62.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m62.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m62.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m62.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m63.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m63.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m63.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m64.NumberHelper, "ActiveSupport::NumberHelper"],
  [() => m65.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m66.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m67.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m68.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m69.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m70.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m71.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m72.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m73.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m74.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m75.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m76.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m77.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m78.Reloader, "ActiveSupport::Reloader"],
  [() => m79.Rescuable, "ActiveSupport::Rescuable"],
  [() => m79.ClassMethods, "ActiveSupport::Rescuable::ClassMethods"],
  [() => m23.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m23.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m80.SecurityUtils, "ActiveSupport::SecurityUtils"],
  [() => m81.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m82.Subscriber, "ActiveSupport::Subscriber"],
  [() => m83.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m84.TaggedLogging, "ActiveSupport::TaggedLogging"],
  [() => m84.Formatter, "ActiveSupport::TaggedLogging::Formatter"],
  [() => m84.LocalTagStorage, "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m84.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m85.ConstantLookup, "ActiveSupport::Testing::ConstantLookup"],
  [() => m85.ClassMethods, "ActiveSupport::Testing::ConstantLookup::ClassMethods"],
  [() => m86.ErrorReporterAssertions, "ActiveSupport::Testing::ErrorReporterAssertions"],
  [() => m86.ErrorCollector, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector"],
  [() => m86.Report, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector::Report"],
  [() => m87.MethodCallAssertions, "ActiveSupport::Testing::MethodCallAssertions"],
  [() => m88.ClassMethods, "ActiveSupport::Testing::SetupAndTeardown::ClassMethods"],
  [() => m91.SimpleStubs, "ActiveSupport::Testing::SimpleStubs"],
  [() => m89.Stream, "ActiveSupport::Testing::Stream"],
  [() => m90.TaggedLogging, "ActiveSupport::Testing::TaggedLogging"],
  [() => m91.TimeHelpers, "ActiveSupport::Testing::TimeHelpers"],
  [() => m92.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m93.TimeZone, "ActiveSupport::TimeZone"],
  [() => m21.ToJsonWithActiveSupportEncoder, "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m22.Tryable, "ActiveSupport::Tryable"],
  [() => m44.VERSION, "ActiveSupport::VERSION"],
  [() => m20.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m20.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m94.FileLike, "ActiveSupport::XmlMini::FileLike"],
  [() => m19.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m24.Util, "TSE::Util"],
  [() => m21.Generic, "URI::Generic"],
]);
