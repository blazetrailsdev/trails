import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import type * as ArgumentsModule from "./arguments.js";
import type * as SerializersModule from "./serializers.js";
import type { DurationSerializer } from "./serializers/duration-serializer.js";
import type { ObjectSerializer } from "./serializers/object-serializer.js";

export type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const loadPath: Record<string, () => Promise<unknown>> = {
  "active_job/base": () => import("./base.js"),
  "active_job/arguments": () => import("./arguments.js"),
  "active_job/serializers": () => import("./serializers.js"),
  "active_job/serializers/object_serializer": () => import("./serializers/object-serializer.js"),
  "active_job/serializers/duration_serializer": () =>
    import("./serializers/duration-serializer.js"),
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
  Serializers: typeof Serializers;
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

export const QueueAdapters = { name: "ActiveJob::QueueAdapters", loadPath } as AutoloadModule;
extend(QueueAdapters, Autoload);

export const Serializers = { name: "ActiveJob::Serializers", loadPath } as AutoloadModule & {
  _additionalSerializers: Set<SerializerLike>;
  serialize: typeof SerializersModule.serialize;
  deserialize: typeof SerializersModule.deserialize;
  serializers: typeof SerializersModule.serializers;
  addSerializers: typeof SerializersModule.addSerializers;
  ObjectSerializer: typeof ObjectSerializer;
  DurationSerializer: typeof DurationSerializer;
};
extend(Serializers, Autoload);
