import { constantize } from "@blazetrails/activesupport";
import { Module, hashAref, rbModName } from "@blazetrails/ruby-compat";
import { ActiveJob, Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class ModuleSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::ModuleSerializer";
  }

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
