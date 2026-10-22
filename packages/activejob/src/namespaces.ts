import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import type * as ArgumentsModule from "./arguments.js";
import type * as SerializersModule from "./serializers.js";
import type * as QueueAdaptersModule from "./queue-adapters.js";
import type { AbstractAdapter } from "./queue-adapters/abstract-adapter.js";
import type { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import type { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import type { TestAdapter } from "./queue-adapters/test-adapter.js";
import type { BigDecimalSerializer } from "./serializers/big-decimal-serializer.js";
import type { DurationSerializer } from "./serializers/duration-serializer.js";
import type { ModuleSerializer } from "./serializers/module-serializer.js";
import type { RangeSerializer } from "./serializers/range-serializer.js";
import type { TimeObjectSerializer } from "./serializers/time-object-serializer.js";
import type { DateTimeSerializer } from "./serializers/date-time-serializer.js";
import type { DateSerializer } from "./serializers/date-serializer.js";
import type { TimeWithZoneSerializer } from "./serializers/time-with-zone-serializer.js";
import type { TimeSerializer } from "./serializers/time-serializer.js";
import type { SymbolSerializer } from "./serializers/symbol-serializer.js";
import type { Callbacks } from "./callbacks.js";
import type { ConfiguredJob } from "./configured-job.js";
import type * as EnqueuingModule from "./enqueuing.js";
import type * as EnqueueAfterTransactionCommitModule from "./enqueue-after-transaction-commit.js";
import type * as InstrumentationModule from "./instrumentation.js";
import type { Exceptions } from "./exceptions.js";
import type { Execution } from "./execution.js";
import type { QueueName } from "./queue-name.js";
import type { QueueAdapter } from "./queue-adapter.js";
import type * as QueueAdapterModule from "./queue-adapter.js";
import type { QueuePriority } from "./queue-priority.js";
import type * as TestCaseModule from "./test-case.js";
import type * as ActiveJobModule from "./active-job.js";
import type * as TestHelperModule from "./test-helper.js";
import type { ObjectSerializer } from "./serializers/object-serializer.js";

export type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const loadPath: Record<string, () => Promise<unknown>> = {
  "active_job/base": () => import("./base.js"),
  "active_job/enqueue_after_transaction_commit": () =>
    import("./enqueue-after-transaction-commit.js"),
  "active_job/configured_job": () => import("./configured-job.js"),
  "active_job/arguments": () => import("./arguments.js"),
  "active_job/serializers": () => import("./serializers.js"),
  "active_job/queue_adapter": () => import("./queue-adapter.js"),
  "active_job/queue_adapters": () => import("./queue-adapters.js"),
  "active_job/queue_adapters/abstract_adapter": () =>
    import("./queue-adapters/abstract-adapter.js"),
  "active_job/queue_adapters/inline_adapter": () => import("./queue-adapters/inline-adapter.js"),
  "active_job/queue_adapters/test_adapter": () => import("./queue-adapters/test-adapter.js"),
  "active_job/serializers/object_serializer": () => import("./serializers/object-serializer.js"),
  "active_job/serializers/time_object_serializer": () =>
    import("./serializers/time-object-serializer.js"),
  "active_job/serializers/symbol_serializer": () => import("./serializers/symbol-serializer.js"),
  "active_job/serializers/duration_serializer": () =>
    import("./serializers/duration-serializer.js"),
  "active_job/serializers/date_time_serializer": () =>
    import("./serializers/date-time-serializer.js"),
  "active_job/serializers/date_serializer": () => import("./serializers/date-serializer.js"),
  "active_job/serializers/time_with_zone_serializer": () =>
    import("./serializers/time-with-zone-serializer.js"),
  "active_job/serializers/time_serializer": () => import("./serializers/time-serializer.js"),
  "active_job/serializers/module_serializer": () => import("./serializers/module-serializer.js"),
  "active_job/serializers/range_serializer": () => import("./serializers/range-serializer.js"),
  "active_job/serializers/big_decimal_serializer": () =>
    import("./serializers/big-decimal-serializer.js"),
  "active_job/test_case": () => import("./test-case.js"),
  "active_job/test_helper": () => import("./test-helper.js"),
};

export interface SerializerLike {
  isSerialize(argument: unknown): boolean;
  serialize(argument: unknown): unknown;
  deserialize(argument: Record<string, unknown> | Map<string, unknown>): unknown;
}

export const ActiveJob = { name: "ActiveJob", loadPath } as AutoloadModule & {
  Base: typeof Base;
  Arguments: typeof ArgumentsModule.Arguments;
  DeserializationError: typeof ArgumentsModule.DeserializationError;
  SerializationError: typeof ArgumentsModule.SerializationError;
  QueueAdapters: typeof QueueAdapters;
  QueueAdapter: typeof QueueAdapter;
  adapterName: typeof QueueAdapterModule.adapterName;
  QueueName: typeof QueueName;
  Callbacks: typeof Callbacks;
  ConfiguredJob: typeof ConfiguredJob;
  EnqueueError: typeof EnqueuingModule.EnqueueError;
  Enqueuing: typeof EnqueuingModule.Enqueuing;
  EnqueueAfterTransactionCommit: typeof EnqueueAfterTransactionCommitModule.EnqueueAfterTransactionCommit;
  performAllLater: typeof EnqueuingModule.performAllLater;
  instrumentEnqueueAll: typeof InstrumentationModule.instrumentEnqueueAll;
  Exceptions: typeof Exceptions;
  Execution: typeof Execution;
  QueuePriority: typeof QueuePriority;
  Serializers: typeof Serializers;
  TestCase: typeof TestCaseModule.TestCase;
  TestHelper: typeof TestHelperModule.TestHelper;
  verboseEnqueueLogs: typeof ActiveJobModule.verboseEnqueueLogs;
  setVerboseEnqueueLogs: typeof ActiveJobModule.setVerboseEnqueueLogs;
};
registerConstant("ActiveJob", ActiveJob);
extend(ActiveJob, Autoload);
ActiveJob.autoload("Base");
ActiveJob.autoload("QueueAdapters");
ActiveJob.autoload("Arguments");
ActiveJob.autoload("DeserializationError", "active_job/arguments");
ActiveJob.autoload("SerializationError", "active_job/arguments");
ActiveJob.autoload("EnqueueAfterTransactionCommit");
ActiveJob.eagerAutoload(() => {
  ActiveJob.autoload("Serializers");
  ActiveJob.autoload("ConfiguredJob");
});
ActiveJob.autoload("TestCase");
ActiveJob.autoload("TestHelper");

export const QueueAdapters = { name: "ActiveJob::QueueAdapters", loadPath } as AutoloadModule & {
  lookup: typeof QueueAdaptersModule.lookup;
  AbstractAdapter: typeof AbstractAdapter;
  InlineAdapter: typeof InlineAdapter;
  TestAdapter: typeof TestAdapter;
  AsyncAdapter: typeof AsyncAdapter;
};
extend(QueueAdapters, Autoload);

export const Serializers = { name: "ActiveJob::Serializers", loadPath } as AutoloadModule & {
  _additionalSerializers: Set<SerializerLike>;
  serialize: typeof SerializersModule.serialize;
  deserialize: typeof SerializersModule.deserialize;
  serializers: typeof SerializersModule.serializers;
  addSerializers: typeof SerializersModule.addSerializers;
  ObjectSerializer: typeof ObjectSerializer;
  TimeObjectSerializer: typeof TimeObjectSerializer;
  SymbolSerializer: typeof SymbolSerializer;
  DurationSerializer: typeof DurationSerializer;
  DateTimeSerializer: typeof DateTimeSerializer;
  DateSerializer: typeof DateSerializer;
  TimeWithZoneSerializer: typeof TimeWithZoneSerializer;
  TimeSerializer: typeof TimeSerializer;
  ModuleSerializer: typeof ModuleSerializer;
  RangeSerializer: typeof RangeSerializer;
  BigDecimalSerializer: typeof BigDecimalSerializer;
};
extend(Serializers, Autoload);
