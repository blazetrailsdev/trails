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
import * as m21 from "./core-ext/date-and-time/zones.js";
import * as m22 from "./core-ext/enumerable.js";
import * as m23 from "./core-ext/hash/conversions.js";
import * as m24 from "./core-ext/object/json.js";
import * as m25 from "./core-ext/object/try.js";
import * as m26 from "./core-ext/string/output-safety.js";
import * as m27 from "./core-ext/tse/util.js";
import * as m28 from "./current-attributes.js";
import * as m29 from "./deep-mergeable.js";
import * as m30 from "./delegation.js";
import * as m31 from "./dependencies.js";
import * as m32 from "./dependencies/interlock.js";
import * as m33 from "./deprecation.js";
import * as m34 from "./deprecation/deprecators.js";
import * as m35 from "./deprecation/proxy-wrappers.js";
import * as m36 from "./descendants-tracker.js";
import * as m37 from "./digest.js";
import * as m38 from "./duration.js";
import * as m39 from "./duration/iso8601-parser.js";
import * as m40 from "./duration/iso8601-serializer.js";
import * as m41 from "./encrypted-configuration.js";
import * as m42 from "./encrypted-file.js";
import * as m43 from "./environment-inquirer.js";
import * as m44 from "./error-reporter.js";
import * as m45 from "./execution-context.js";
import * as m46 from "./execution-wrapper.js";
import * as m47 from "./executor.js";
import * as m48 from "./executor/test-helper.js";
import * as m49 from "./file-update-checker.js";
import * as m50 from "./gem-version.js";
import * as m51 from "./gzip.js";
import * as m52 from "./hash-with-indifferent-access.js";
import * as m53 from "./html-safe-translation.js";
import * as m54 from "./inflector/inflections.js";
import * as m55 from "./isolated-execution-state.js";
import * as m56 from "./json/encoding.js";
import * as m57 from "./log-subscriber.js";
import * as m58 from "./logger-thread-safe-level.js";
import * as m59 from "./logger.js";
import * as m60 from "./message-encryptor.js";
import * as m61 from "./message-verifier.js";
import * as m62 from "./message-verifiers.js";
import * as m63 from "./messages/codec.js";
import * as m64 from "./messages/metadata.js";
import * as m65 from "./messages/rotation-coordinator.js";
import * as m66 from "./messages/serializer-with-fallback.js";
import * as m67 from "./multibyte.js";
import * as m68 from "./multibyte/chars.js";
import * as m69 from "./multibyte/unicode.js";
import * as m70 from "./notifications.js";
import * as m71 from "./notifications/fanout.js";
import * as m72 from "./notifications/instrumenter.js";
import * as m73 from "./number-helper.js";
import * as m74 from "./number-helper/number-converter.js";
import * as m75 from "./number-helper/number-to-currency-converter.js";
import * as m76 from "./number-helper/number-to-delimited-converter.js";
import * as m77 from "./number-helper/number-to-human-converter.js";
import * as m78 from "./number-helper/number-to-human-size-converter.js";
import * as m79 from "./number-helper/number-to-percentage-converter.js";
import * as m80 from "./number-helper/number-to-phone-converter.js";
import * as m81 from "./number-helper/number-to-rounded-converter.js";
import * as m82 from "./number-helper/rounding-helper.js";
import * as m83 from "./option-merger.js";
import * as m84 from "./ordered-hash.js";
import * as m85 from "./ordered-options.js";
import * as m86 from "./parameter-filter.js";
import * as m87 from "./reloader.js";
import * as m88 from "./rescuable.js";
import * as m89 from "./security-utils.js";
import * as m90 from "./string-inquirer.js";
import * as m91 from "./subscriber.js";
import * as m92 from "./syntax-error-proxy.js";
import * as m93 from "./tagged-logging.js";
import * as m94 from "./time-with-zone.js";
import * as m95 from "./values/time-zone.js";
import * as m96 from "./xml-mini.js";

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
  [() => m28.CurrentAttributes, "ActiveSupport::CurrentAttributes"],
  [() => m29.DeepMergeable, "ActiveSupport::DeepMergeable"],
  [() => m30.Delegation, "ActiveSupport::Delegation"],
  [() => m30.DelegationError, "ActiveSupport::DelegationError"],
  [() => m31.Dependencies, "ActiveSupport::Dependencies"],
  [() => m32.Interlock, "ActiveSupport::Dependencies::Interlock"],
  [() => m33.Deprecation, "ActiveSupport::Deprecation"],
  [() => m35.DeprecatedConstantProxy, "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m35.DeprecatedInstanceVariableProxy,
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m35.DeprecatedObjectProxy, "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m35.DeprecationProxy, "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m34.Deprecators, "ActiveSupport::Deprecation::Deprecators"],
  [() => m36.DescendantsTracker, "ActiveSupport::DescendantsTracker"],
  [
    () => m36.ReloadedClassesFiltering,
    "ActiveSupport::DescendantsTracker::ReloadedClassesFiltering",
  ],
  [() => m36.WeakSet, "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m37.Digest, "ActiveSupport::Digest"],
  [() => m38.Duration, "ActiveSupport::Duration"],
  [() => m39.ISO8601Parser, "ActiveSupport::Duration::ISO8601Parser"],
  [() => m39.ParsingError, "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m40.ISO8601Serializer, "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m38.Scalar, "ActiveSupport::Duration::Scalar"],
  [() => m41.EncryptedConfiguration, "ActiveSupport::EncryptedConfiguration"],
  [() => m41.InvalidContentError, "ActiveSupport::EncryptedConfiguration::InvalidContentError"],
  [() => m41.InvalidKeyError, "ActiveSupport::EncryptedConfiguration::InvalidKeyError"],
  [() => m42.EncryptedFile, "ActiveSupport::EncryptedFile"],
  [() => m42.InvalidKeyLengthError, "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m42.MissingContentError, "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m42.MissingKeyError, "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m43.EnvironmentInquirer, "ActiveSupport::EnvironmentInquirer"],
  [() => m44.ErrorReporter, "ActiveSupport::ErrorReporter"],
  [() => m44.ErrorReporter.UnexpectedError, "ActiveSupport::ErrorReporter::UnexpectedError"],
  [() => m45.ExecutionContext, "ActiveSupport::ExecutionContext"],
  [() => m46.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m46.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m46.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m47.Executor, "ActiveSupport::Executor"],
  [() => m48.TestHelper, "ActiveSupport::Executor::TestHelper"],
  [() => m49.FileUpdateChecker, "ActiveSupport::FileUpdateChecker"],
  [() => m51.Gzip, "ActiveSupport::Gzip"],
  [() => m51.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m52.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m53.HtmlSafeTranslation, "ActiveSupport::HtmlSafeTranslation"],
  [() => m54.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m54.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m85.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m55.IsolatedExecutionState, "ActiveSupport::IsolatedExecutionState"],
  [() => m56.Encoding, "ActiveSupport::JSON::Encoding"],
  [() => m56.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m59.Logger, "ActiveSupport::Logger"],
  [() => m59.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m58.LoggerThreadSafeLevel, "ActiveSupport::LoggerThreadSafeLevel"],
  [() => m57.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m60.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m60.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m60.NullSerializer, "ActiveSupport::MessageEncryptor::NullSerializer"],
  [() => m63.Codec, "ActiveSupport::Messages::Codec"],
  [() => m64.Metadata, "ActiveSupport::Messages::Metadata"],
  [() => m65.RotationCoordinator, "ActiveSupport::Messages::RotationCoordinator"],
  [() => m66.SerializerWithFallback, "ActiveSupport::Messages::SerializerWithFallback"],
  [() => m66.AllowMarshal, "ActiveSupport::Messages::SerializerWithFallback::AllowMarshal"],
  [() => m66.JsonWithFallback, "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallback"],
  [
    () => m66.JsonWithFallbackAllowMarshal,
    "ActiveSupport::Messages::SerializerWithFallback::JsonWithFallbackAllowMarshal",
  ],
  [
    () => m66.MarshalWithFallback,
    "ActiveSupport::Messages::SerializerWithFallback::MarshalWithFallback",
  ],
  [
    () => m66.MessagePackWithFallback,
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallback",
  ],
  [
    () => m66.MessagePackWithFallbackAllowMarshal,
    "ActiveSupport::Messages::SerializerWithFallback::MessagePackWithFallbackAllowMarshal",
  ],
  [() => m61.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m61.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m62.MessageVerifiers, "ActiveSupport::MessageVerifiers"],
  [() => m67.Multibyte, "ActiveSupport::Multibyte"],
  [() => m68.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m69.Unicode, "ActiveSupport::Multibyte::Unicode"],
  [() => m70.Notifications, "ActiveSupport::Notifications"],
  [() => m72.Event, "ActiveSupport::Notifications::Event"],
  [() => m71.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m71.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m71.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m71.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m71.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m71.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m71.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m71.Subscribers, "ActiveSupport::Notifications::Fanout::Subscribers"],
  [() => m71.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m71.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m71.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m71.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m71.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m71.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m71.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m71.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m72.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m72.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m72.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m73.NumberHelper, "ActiveSupport::NumberHelper"],
  [() => m74.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m75.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m76.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m77.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m78.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m79.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m80.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m81.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m82.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m83.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m84.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m85.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m86.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m87.Reloader, "ActiveSupport::Reloader"],
  [() => m88.Rescuable, "ActiveSupport::Rescuable"],
  [() => m88.ClassMethods, "ActiveSupport::Rescuable::ClassMethods"],
  [() => m26.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m26.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m89.SecurityUtils, "ActiveSupport::SecurityUtils"],
  [() => m90.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m91.Subscriber, "ActiveSupport::Subscriber"],
  [() => m92.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m93.TaggedLogging, "ActiveSupport::TaggedLogging"],
  [() => m93.Formatter, "ActiveSupport::TaggedLogging::Formatter"],
  [() => m93.LocalTagStorage, "ActiveSupport::TaggedLogging::LocalTagStorage"],
  [() => m93.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m94.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m95.TimeZone, "ActiveSupport::TimeZone"],
  [() => m24.ToJsonWithActiveSupportEncoder, "ActiveSupport::ToJsonWithActiveSupportEncoder"],
  [() => m25.Tryable, "ActiveSupport::Tryable"],
  [() => m50.VERSION, "ActiveSupport::VERSION"],
  [() => m23.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m23.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m96, "ActiveSupport::XmlMini"],
  [() => m96.FileLike, "ActiveSupport::XmlMini::FileLike"],
  [() => m20, "DateAndTime::Calculations"],
  [() => m21.Zones, "DateAndTime::Zones"],
  [() => m22.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m27.Util, "TSE::Util"],
  [() => m24.Generic, "URI::Generic"],
]);
