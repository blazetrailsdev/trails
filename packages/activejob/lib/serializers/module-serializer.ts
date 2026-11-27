import { constantize } from "@blazetrails/activesupport";
import { Module } from "@blazetrails/ruby-compat/include";
import { hashAref } from "@blazetrails/ruby-compat/hash";
import { rbModName } from "@blazetrails/ruby-compat/object";
import { ActiveJob, Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class ModuleSerializer extends ObjectSerializer {
  serialize(constant: object): Record<string, unknown> {
    if (rbModName(constant) == null)
      throw new ActiveJob.SerializationError("Serializing an anonymous class is not supported");
    return super.serialize({ value: rbModName(constant) });
  }

  deserialize(hash: Record<string, unknown> | Map<string, unknown>): unknown {
    return constantize(hashAref(hash, "value") as string);
  }

  /** @internal */
  protected klass(): typeof Module {
    return Module;
  }
}
Serializers.ModuleSerializer = ModuleSerializer;
