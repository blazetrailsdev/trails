import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./arguments.js";
import * as m1 from "./base.js";
import * as m2 from "./configured-job.js";
import * as m3 from "./enqueuing.js";
import * as m4 from "./log-subscriber.js";
import * as m5 from "./queue-adapters/abstract-adapter.js";
import * as m6 from "./queue-adapters/async-adapter.js";
import * as m7 from "./queue-adapters/inline-adapter.js";
import * as m8 from "./queue-adapters/test-adapter.js";
import * as m9 from "./serializers/big-decimal-serializer.js";
import * as m10 from "./serializers/date-serializer.js";
import * as m11 from "./serializers/date-time-serializer.js";
import * as m12 from "./serializers/duration-serializer.js";
import * as m13 from "./serializers/module-serializer.js";
import * as m14 from "./serializers/object-serializer.js";
import * as m15 from "./serializers/range-serializer.js";
import * as m16 from "./serializers/symbol-serializer.js";
import * as m17 from "./serializers/time-object-serializer.js";
import * as m18 from "./serializers/time-serializer.js";
import * as m19 from "./serializers/time-with-zone-serializer.js";

registerClassPaths([
  [() => m1.Base, "ActiveJob::Base"],
  [() => m2.ConfiguredJob, "ActiveJob::ConfiguredJob"],
  [() => m0.DeserializationError, "ActiveJob::DeserializationError"],
  [() => m3.EnqueueError, "ActiveJob::EnqueueError"],
  [() => m4.LogSubscriber, "ActiveJob::LogSubscriber"],
  [() => m5.AbstractAdapter, "ActiveJob::QueueAdapters::AbstractAdapter"],
  [() => m6.AsyncAdapter, "ActiveJob::QueueAdapters::AsyncAdapter"],
  [() => m6.JobWrapper, "ActiveJob::QueueAdapters::AsyncAdapter::JobWrapper"],
  [() => m6.Scheduler, "ActiveJob::QueueAdapters::AsyncAdapter::Scheduler"],
  [() => m7.InlineAdapter, "ActiveJob::QueueAdapters::InlineAdapter"],
  [() => m8.TestAdapter, "ActiveJob::QueueAdapters::TestAdapter"],
  [() => m0.SerializationError, "ActiveJob::SerializationError"],
  [() => m9.BigDecimalSerializer, "ActiveJob::Serializers::BigDecimalSerializer"],
  [() => m10.DateSerializer, "ActiveJob::Serializers::DateSerializer"],
  [() => m11.DateTimeSerializer, "ActiveJob::Serializers::DateTimeSerializer"],
  [() => m12.DurationSerializer, "ActiveJob::Serializers::DurationSerializer"],
  [() => m13.ModuleSerializer, "ActiveJob::Serializers::ModuleSerializer"],
  [() => m14.ObjectSerializer, "ActiveJob::Serializers::ObjectSerializer"],
  [() => m15.RangeSerializer, "ActiveJob::Serializers::RangeSerializer"],
  [() => m16.SymbolSerializer, "ActiveJob::Serializers::SymbolSerializer"],
  [() => m17.TimeObjectSerializer, "ActiveJob::Serializers::TimeObjectSerializer"],
  [() => m18.TimeSerializer, "ActiveJob::Serializers::TimeSerializer"],
  [() => m19.TimeWithZoneSerializer, "ActiveJob::Serializers::TimeWithZoneSerializer"],
]);
