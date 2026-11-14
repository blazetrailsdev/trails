import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./arguments.js";
import * as m1 from "./base.js";
import * as m2 from "./callbacks.js";
import * as m3 from "./configured-job.js";
import * as m4 from "./core.js";
import * as m5 from "./enqueuing.js";
import * as m6 from "./exceptions.js";
import * as m7 from "./execution.js";
import * as m8 from "./gem-version.js";
import * as m9 from "./instrumentation.js";
import * as m10 from "./log-subscriber.js";
import * as m11 from "./logging.js";
import * as m12 from "./queue-adapter.js";
import * as m13 from "./queue-adapters.js";
import * as m14 from "./queue-adapters/abstract-adapter.js";
import * as m15 from "./queue-adapters/async-adapter.js";
import * as m16 from "./queue-adapters/inline-adapter.js";
import * as m17 from "./queue-adapters/test-adapter.js";
import * as m18 from "./queue-name.js";
import * as m19 from "./queue-priority.js";
import * as m20 from "./serializers.js";
import * as m21 from "./serializers/big-decimal-serializer.js";
import * as m22 from "./serializers/date-serializer.js";
import * as m23 from "./serializers/date-time-serializer.js";
import * as m24 from "./serializers/duration-serializer.js";
import * as m25 from "./serializers/module-serializer.js";
import * as m26 from "./serializers/object-serializer.js";
import * as m27 from "./serializers/range-serializer.js";
import * as m28 from "./serializers/symbol-serializer.js";
import * as m29 from "./serializers/time-object-serializer.js";
import * as m30 from "./serializers/time-serializer.js";
import * as m31 from "./serializers/time-with-zone-serializer.js";
import * as m32 from "./timezones.js";
import * as m33 from "./translation.js";

defineConstants([
  [() => m0.Arguments, "ActiveJob::Arguments"],
  [() => m1.Base, "ActiveJob::Base"],
  [() => m2.Callbacks, "ActiveJob::Callbacks"],
  [() => m2.ClassMethods, "ActiveJob::Callbacks::ClassMethods"],
  [() => m3.ConfiguredJob, "ActiveJob::ConfiguredJob"],
  [() => m4.Core, "ActiveJob::Core"],
  [() => m4.ClassMethods, "ActiveJob::Core::ClassMethods"],
  [() => m0.DeserializationError, "ActiveJob::DeserializationError"],
  [() => m5.EnqueueError, "ActiveJob::EnqueueError"],
  [() => m5.Enqueuing, "ActiveJob::Enqueuing"],
  [() => m5.ClassMethods, "ActiveJob::Enqueuing::ClassMethods"],
  [() => m6.Exceptions, "ActiveJob::Exceptions"],
  [() => m6.ClassMethods, "ActiveJob::Exceptions::ClassMethods"],
  [() => m7.Execution, "ActiveJob::Execution"],
  [() => m7.ClassMethods, "ActiveJob::Execution::ClassMethods"],
  [() => m9.Instrumentation, "ActiveJob::Instrumentation"],
  [() => m11.Logging, "ActiveJob::Logging"],
  [() => m10.LogSubscriber, "ActiveJob::LogSubscriber"],
  [() => m12.QueueAdapter, "ActiveJob::QueueAdapter"],
  [() => m12.ClassMethods, "ActiveJob::QueueAdapter::ClassMethods"],
  [() => m13.QueueAdapters, "ActiveJob::QueueAdapters"],
  [() => m14.AbstractAdapter, "ActiveJob::QueueAdapters::AbstractAdapter"],
  [() => m15.AsyncAdapter, "ActiveJob::QueueAdapters::AsyncAdapter"],
  [() => m15.JobWrapper, "ActiveJob::QueueAdapters::AsyncAdapter::JobWrapper"],
  [() => m15.Scheduler, "ActiveJob::QueueAdapters::AsyncAdapter::Scheduler"],
  [() => m16.InlineAdapter, "ActiveJob::QueueAdapters::InlineAdapter"],
  [() => m17.TestAdapter, "ActiveJob::QueueAdapters::TestAdapter"],
  [() => m18.QueueName, "ActiveJob::QueueName"],
  [() => m18.ClassMethods, "ActiveJob::QueueName::ClassMethods"],
  [() => m19.QueuePriority, "ActiveJob::QueuePriority"],
  [() => m19.ClassMethods, "ActiveJob::QueuePriority::ClassMethods"],
  [() => m0.SerializationError, "ActiveJob::SerializationError"],
  [() => m20.Serializers, "ActiveJob::Serializers"],
  [() => m21.BigDecimalSerializer, "ActiveJob::Serializers::BigDecimalSerializer"],
  [() => m22.DateSerializer, "ActiveJob::Serializers::DateSerializer"],
  [() => m23.DateTimeSerializer, "ActiveJob::Serializers::DateTimeSerializer"],
  [() => m24.DurationSerializer, "ActiveJob::Serializers::DurationSerializer"],
  [() => m25.ModuleSerializer, "ActiveJob::Serializers::ModuleSerializer"],
  [() => m26.ObjectSerializer, "ActiveJob::Serializers::ObjectSerializer"],
  [() => m27.RangeSerializer, "ActiveJob::Serializers::RangeSerializer"],
  [() => m28.SymbolSerializer, "ActiveJob::Serializers::SymbolSerializer"],
  [() => m29.TimeObjectSerializer, "ActiveJob::Serializers::TimeObjectSerializer"],
  [() => m30.TimeSerializer, "ActiveJob::Serializers::TimeSerializer"],
  [() => m31.TimeWithZoneSerializer, "ActiveJob::Serializers::TimeWithZoneSerializer"],
  [() => m32.Timezones, "ActiveJob::Timezones"],
  [() => m33.Translation, "ActiveJob::Translation"],
  [() => m8.VERSION, "ActiveJob::VERSION"],
]);
