import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./arguments.js";
import * as m1 from "./base.js";
import * as m2 from "./callbacks.js";
import * as m3 from "./configured-job.js";
import * as m4 from "./enqueuing.js";
import * as m5 from "./gem-version.js";
import * as m6 from "./instrumentation.js";
import * as m7 from "./log-subscriber.js";
import * as m8 from "./logging.js";
import * as m9 from "./queue-adapters/abstract-adapter.js";
import * as m10 from "./queue-adapters/async-adapter.js";
import * as m11 from "./queue-adapters/inline-adapter.js";
import * as m12 from "./queue-adapters/test-adapter.js";
import * as m13 from "./serializers.js";
import * as m14 from "./serializers/big-decimal-serializer.js";
import * as m15 from "./serializers/date-serializer.js";
import * as m16 from "./serializers/date-time-serializer.js";
import * as m17 from "./serializers/duration-serializer.js";
import * as m18 from "./serializers/module-serializer.js";
import * as m19 from "./serializers/object-serializer.js";
import * as m20 from "./serializers/range-serializer.js";
import * as m21 from "./serializers/symbol-serializer.js";
import * as m22 from "./serializers/time-object-serializer.js";
import * as m23 from "./serializers/time-serializer.js";
import * as m24 from "./serializers/time-with-zone-serializer.js";

registerClassPaths([
  [() => m0.Arguments, "ActiveJob::Arguments"],
  [() => m1.Base, "ActiveJob::Base"],
  [() => m2.Callbacks, "ActiveJob::Callbacks"],
  [() => m3.ConfiguredJob, "ActiveJob::ConfiguredJob"],
  [() => m0.DeserializationError, "ActiveJob::DeserializationError"],
  [() => m4.EnqueueError, "ActiveJob::EnqueueError"],
  [() => m6.Instrumentation, "ActiveJob::Instrumentation"],
  [() => m8.Logging, "ActiveJob::Logging"],
  [() => m7.LogSubscriber, "ActiveJob::LogSubscriber"],
  [() => m9.AbstractAdapter, "ActiveJob::QueueAdapters::AbstractAdapter"],
  [() => m10.AsyncAdapter, "ActiveJob::QueueAdapters::AsyncAdapter"],
  [() => m10.JobWrapper, "ActiveJob::QueueAdapters::AsyncAdapter::JobWrapper"],
  [() => m10.Scheduler, "ActiveJob::QueueAdapters::AsyncAdapter::Scheduler"],
  [() => m11.InlineAdapter, "ActiveJob::QueueAdapters::InlineAdapter"],
  [() => m12.TestAdapter, "ActiveJob::QueueAdapters::TestAdapter"],
  [() => m0.SerializationError, "ActiveJob::SerializationError"],
  [() => m13.Serializers, "ActiveJob::Serializers"],
  [() => m14.BigDecimalSerializer, "ActiveJob::Serializers::BigDecimalSerializer"],
  [() => m15.DateSerializer, "ActiveJob::Serializers::DateSerializer"],
  [() => m16.DateTimeSerializer, "ActiveJob::Serializers::DateTimeSerializer"],
  [() => m17.DurationSerializer, "ActiveJob::Serializers::DurationSerializer"],
  [() => m18.ModuleSerializer, "ActiveJob::Serializers::ModuleSerializer"],
  [() => m19.ObjectSerializer, "ActiveJob::Serializers::ObjectSerializer"],
  [() => m20.RangeSerializer, "ActiveJob::Serializers::RangeSerializer"],
  [() => m21.SymbolSerializer, "ActiveJob::Serializers::SymbolSerializer"],
  [() => m22.TimeObjectSerializer, "ActiveJob::Serializers::TimeObjectSerializer"],
  [() => m23.TimeSerializer, "ActiveJob::Serializers::TimeSerializer"],
  [() => m24.TimeWithZoneSerializer, "ActiveJob::Serializers::TimeWithZoneSerializer"],
  [() => m5.VERSION, "ActiveJob::VERSION"],
]);
