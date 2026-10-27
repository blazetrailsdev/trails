import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./actionable-error.js";
import * as m1 from "./array-inquirer.js";
import * as m2 from "./backtrace-cleaner.js";
import * as m3 from "./broadcast-logger.js";
import * as m4 from "./cache/coder.js";
import * as m5 from "./cache/entry.js";
import * as m6 from "./cache/memory-store.js";
import * as m7 from "./cache/null-store.js";
import * as m8 from "./callbacks.js";
import * as m9 from "./concern.js";
import * as m10 from "./concurrency/load-interlock-aware-monitor.js";
import * as m11 from "./concurrency/share-lock.js";
import * as m12 from "./configurable.js";
import * as m13 from "./core-ext/enumerable.js";
import * as m14 from "./core-ext/hash/conversions.js";
import * as m15 from "./core-ext/object/json.js";
import * as m16 from "./core-ext/string/output-safety.js";
import * as m17 from "./current-attributes.js";
import * as m18 from "./delegation.js";
import * as m19 from "./dependencies/interlock.js";
import * as m20 from "./deprecation.js";
import * as m21 from "./deprecation/deprecators.js";
import * as m22 from "./deprecation/proxy-wrappers.js";
import * as m23 from "./descendants-tracker.js";
import * as m24 from "./digest.js";
import * as m25 from "./duration.js";
import * as m26 from "./duration/iso8601-parser.js";
import * as m27 from "./duration/iso8601-serializer.js";
import * as m28 from "./encrypted-file.js";
import * as m29 from "./environment-inquirer.js";
import * as m30 from "./error-reporter.js";
import * as m31 from "./execution-wrapper.js";
import * as m32 from "./executor.js";
import * as m33 from "./gzip.js";
import * as m34 from "./hash-with-indifferent-access.js";
import * as m35 from "./inflector/inflections.js";
import * as m36 from "./json/encoding.js";
import * as m37 from "./log-subscriber.js";
import * as m38 from "./logger.js";
import * as m39 from "./message-encryptor.js";
import * as m40 from "./message-verifier.js";
import * as m41 from "./messages/codec.js";
import * as m42 from "./multibyte/chars.js";
import * as m43 from "./notifications/fanout.js";
import * as m44 from "./notifications/instrumenter.js";
import * as m45 from "./number-helper/number-converter.js";
import * as m46 from "./number-helper/number-to-currency-converter.js";
import * as m47 from "./number-helper/number-to-delimited-converter.js";
import * as m48 from "./number-helper/number-to-human-converter.js";
import * as m49 from "./number-helper/number-to-human-size-converter.js";
import * as m50 from "./number-helper/number-to-percentage-converter.js";
import * as m51 from "./number-helper/number-to-phone-converter.js";
import * as m52 from "./number-helper/number-to-rounded-converter.js";
import * as m53 from "./number-helper/rounding-helper.js";
import * as m54 from "./option-merger.js";
import * as m55 from "./ordered-hash.js";
import * as m56 from "./ordered-options.js";
import * as m57 from "./parameter-filter.js";
import * as m58 from "./reloader.js";
import * as m59 from "./string-inquirer.js";
import * as m60 from "./subscriber.js";
import * as m61 from "./syntax-error-proxy.js";
import * as m62 from "./tagged-logging.js";
import * as m63 from "./testing/error-reporter-assertions.js";
import * as m64 from "./testing/time-helpers.js";
import * as m65 from "./time-with-zone.js";
import * as m66 from "./values/time-zone.js";

registerClassPaths([
  [() => m0.NonActionable, "ActiveSupport::ActionableError::NonActionable"],
  [() => m1.ArrayInquirer, "ActiveSupport::ArrayInquirer"],
  [() => m2.BacktraceCleaner, "ActiveSupport::BacktraceCleaner"],
  [() => m3.BroadcastLogger, "ActiveSupport::BroadcastLogger"],
  [() => m4.Coder, "ActiveSupport::Cache::Coder"],
  [() => m5.Entry, "ActiveSupport::Cache::Entry"],
  [() => m6.MemoryStore, "ActiveSupport::Cache::MemoryStore"],
  [() => m7.NullStore, "ActiveSupport::Cache::NullStore"],
  [() => m8.Callback, "ActiveSupport::Callbacks::Callback"],
  [() => m8.CallbackChain, "ActiveSupport::Callbacks::CallbackChain"],
  [() => m8.CallbackSequence, "ActiveSupport::Callbacks::CallbackSequence"],
  [() => m8.InstanceExec0, "ActiveSupport::Callbacks::CallTemplate::InstanceExec0"],
  [() => m8.InstanceExec1, "ActiveSupport::Callbacks::CallTemplate::InstanceExec1"],
  [() => m8.InstanceExec2, "ActiveSupport::Callbacks::CallTemplate::InstanceExec2"],
  [() => m8.MethodCall, "ActiveSupport::Callbacks::CallTemplate::MethodCall"],
  [() => m8.ObjectCall, "ActiveSupport::Callbacks::CallTemplate::ObjectCall"],
  [() => m8.ProcCall, "ActiveSupport::Callbacks::CallTemplate::ProcCall"],
  [() => m8.Value, "ActiveSupport::Callbacks::Conditionals::Value"],
  [() => m8.After, "ActiveSupport::Callbacks::Filters::After"],
  [() => m8.Around, "ActiveSupport::Callbacks::Filters::Around"],
  [() => m8.Before, "ActiveSupport::Callbacks::Filters::Before"],
  [() => m9.MultipleIncludedBlocks, "ActiveSupport::Concern::MultipleIncludedBlocks"],
  [() => m9.MultiplePrependBlocks, "ActiveSupport::Concern::MultiplePrependBlocks"],
  [() => m10.LoadInterlockAwareMonitor, "ActiveSupport::Concurrency::LoadInterlockAwareMonitor"],
  [() => m11.ShareLock, "ActiveSupport::Concurrency::ShareLock"],
  [
    () => m10.ThreadLoadInterlockAwareMonitor,
    "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor",
  ],
  [() => m12.Configuration, "ActiveSupport::Configurable::Configuration"],
  [() => m17.CurrentAttributes, "ActiveSupport::CurrentAttributes"],
  [() => m18.DelegationError, "ActiveSupport::DelegationError"],
  [() => m19.Interlock, "ActiveSupport::Dependencies::Interlock"],
  [() => m20.Deprecation, "ActiveSupport::Deprecation"],
  [() => m22.DeprecatedConstantProxy, "ActiveSupport::Deprecation::DeprecatedConstantProxy"],
  [
    () => m22.DeprecatedInstanceVariableProxy,
    "ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy",
  ],
  [() => m22.DeprecatedObjectProxy, "ActiveSupport::Deprecation::DeprecatedObjectProxy"],
  [() => m22.DeprecationProxy, "ActiveSupport::Deprecation::DeprecationProxy"],
  [() => m21.Deprecators, "ActiveSupport::Deprecation::Deprecators"],
  [() => m23.WeakSet, "ActiveSupport::DescendantsTracker::WeakSet"],
  [() => m24.Digest, "ActiveSupport::Digest"],
  [() => m25.Duration, "ActiveSupport::Duration"],
  [() => m26.ISO8601Parser, "ActiveSupport::Duration::ISO8601Parser"],
  [() => m26.ParsingError, "ActiveSupport::Duration::ISO8601Parser::ParsingError"],
  [() => m27.ISO8601Serializer, "ActiveSupport::Duration::ISO8601Serializer"],
  [() => m25.Scalar, "ActiveSupport::Duration::Scalar"],
  [() => m28.EncryptedFile, "ActiveSupport::EncryptedFile"],
  [() => m28.InvalidKeyLengthError, "ActiveSupport::EncryptedFile::InvalidKeyLengthError"],
  [() => m28.MissingContentError, "ActiveSupport::EncryptedFile::MissingContentError"],
  [() => m28.MissingKeyError, "ActiveSupport::EncryptedFile::MissingKeyError"],
  [() => m29.EnvironmentInquirer, "ActiveSupport::EnvironmentInquirer"],
  [() => m30.ErrorReporter, "ActiveSupport::ErrorReporter"],
  [() => m31.ExecutionWrapper, "ActiveSupport::ExecutionWrapper"],
  [() => m31.CompleteHook, "ActiveSupport::ExecutionWrapper::CompleteHook"],
  [() => m31.RunHook, "ActiveSupport::ExecutionWrapper::RunHook"],
  [() => m32.Executor, "ActiveSupport::Executor"],
  [() => m33.Stream, "ActiveSupport::Gzip::Stream"],
  [() => m34.HashWithIndifferentAccess, "ActiveSupport::HashWithIndifferentAccess"],
  [() => m35.Inflections, "ActiveSupport::Inflector::Inflections"],
  [() => m35.Uncountables, "ActiveSupport::Inflector::Inflections::Uncountables"],
  [() => m56.InheritableOptions, "ActiveSupport::InheritableOptions"],
  [() => m36.JSONGemEncoder, "ActiveSupport::JSON::Encoding::JSONGemEncoder"],
  [() => m38.Logger, "ActiveSupport::Logger"],
  [() => m38.SimpleFormatter, "ActiveSupport::Logger::SimpleFormatter"],
  [() => m37.LogSubscriber, "ActiveSupport::LogSubscriber"],
  [() => m39.MessageEncryptor, "ActiveSupport::MessageEncryptor"],
  [() => m39.InvalidMessage, "ActiveSupport::MessageEncryptor::InvalidMessage"],
  [() => m41.Codec, "ActiveSupport::Messages::Codec"],
  [() => m40.MessageVerifier, "ActiveSupport::MessageVerifier"],
  [() => m40.InvalidSignature, "ActiveSupport::MessageVerifier::InvalidSignature"],
  [() => m42.Chars, "ActiveSupport::Multibyte::Chars"],
  [() => m44.Event, "ActiveSupport::Notifications::Event"],
  [() => m43.Fanout, "ActiveSupport::Notifications::Fanout"],
  [() => m43.BaseGroup, "ActiveSupport::Notifications::Fanout::BaseGroup"],
  [() => m43.BaseTimeGroup, "ActiveSupport::Notifications::Fanout::BaseTimeGroup"],
  [() => m43.EventedGroup, "ActiveSupport::Notifications::Fanout::EventedGroup"],
  [() => m43.EventObjectGroup, "ActiveSupport::Notifications::Fanout::EventObjectGroup"],
  [() => m43.Handle, "ActiveSupport::Notifications::Fanout::Handle"],
  [() => m43.MonotonicTimedGroup, "ActiveSupport::Notifications::Fanout::MonotonicTimedGroup"],
  [() => m43.Evented, "ActiveSupport::Notifications::Fanout::Subscribers::Evented"],
  [() => m43.EventObject, "ActiveSupport::Notifications::Fanout::Subscribers::EventObject"],
  [() => m43.Matcher, "ActiveSupport::Notifications::Fanout::Subscribers::Matcher"],
  [
    () => m43.AllMessages,
    "ActiveSupport::Notifications::Fanout::Subscribers::Matcher::AllMessages",
  ],
  [() => m43.MonotonicTimed, "ActiveSupport::Notifications::Fanout::Subscribers::MonotonicTimed"],
  [() => m43.Timed, "ActiveSupport::Notifications::Fanout::Subscribers::Timed"],
  [() => m43.TimedGroup, "ActiveSupport::Notifications::Fanout::TimedGroup"],
  [
    () => m43.InstrumentationSubscriberError,
    "ActiveSupport::Notifications::InstrumentationSubscriberError",
  ],
  [() => m44.Instrumenter, "ActiveSupport::Notifications::Instrumenter"],
  [() => m44.LegacyHandle, "ActiveSupport::Notifications::Instrumenter::LegacyHandle"],
  [() => m44.Wrapper, "ActiveSupport::Notifications::Instrumenter::LegacyHandle::Wrapper"],
  [() => m45.NumberConverter, "ActiveSupport::NumberHelper::NumberConverter"],
  [() => m46.NumberToCurrencyConverter, "ActiveSupport::NumberHelper::NumberToCurrencyConverter"],
  [() => m47.NumberToDelimitedConverter, "ActiveSupport::NumberHelper::NumberToDelimitedConverter"],
  [() => m48.NumberToHumanConverter, "ActiveSupport::NumberHelper::NumberToHumanConverter"],
  [() => m49.NumberToHumanSizeConverter, "ActiveSupport::NumberHelper::NumberToHumanSizeConverter"],
  [
    () => m50.NumberToPercentageConverter,
    "ActiveSupport::NumberHelper::NumberToPercentageConverter",
  ],
  [() => m51.NumberToPhoneConverter, "ActiveSupport::NumberHelper::NumberToPhoneConverter"],
  [() => m52.NumberToRoundedConverter, "ActiveSupport::NumberHelper::NumberToRoundedConverter"],
  [() => m53.RoundingHelper, "ActiveSupport::NumberHelper::RoundingHelper"],
  [() => m54.OptionMerger, "ActiveSupport::OptionMerger"],
  [() => m55.OrderedHash, "ActiveSupport::OrderedHash"],
  [() => m56.OrderedOptions, "ActiveSupport::OrderedOptions"],
  [() => m57.ParameterFilter, "ActiveSupport::ParameterFilter"],
  [() => m58.Reloader, "ActiveSupport::Reloader"],
  [() => m16.SafeBuffer, "ActiveSupport::SafeBuffer"],
  [() => m16.SafeConcatError, "ActiveSupport::SafeBuffer::SafeConcatError"],
  [() => m59.StringInquirer, "ActiveSupport::StringInquirer"],
  [() => m60.Subscriber, "ActiveSupport::Subscriber"],
  [() => m61.SyntaxErrorProxy, "ActiveSupport::SyntaxErrorProxy"],
  [() => m62.TagStack, "ActiveSupport::TaggedLogging::TagStack"],
  [() => m63.Report, "ActiveSupport::Testing::ErrorReporterAssertions::ErrorCollector::Report"],
  [() => m64.SimpleStubs, "ActiveSupport::Testing::SimpleStubs"],
  [() => m65.TimeWithZone, "ActiveSupport::TimeWithZone"],
  [() => m66.TimeZone, "ActiveSupport::TimeZone"],
  [() => m14.XMLConverter, "ActiveSupport::XMLConverter"],
  [() => m14.DisallowedType, "ActiveSupport::XMLConverter::DisallowedType"],
  [() => m13.SoleItemExpectedError, "Enumerable::SoleItemExpectedError"],
  [() => m15.Generic, "URI::Generic"],
]);
