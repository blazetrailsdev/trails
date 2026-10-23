import { constantize } from "@blazetrails/activesupport";
import { hashAref, Module, registerConstant } from "@blazetrails/ruby-compat";
import { SerializationError } from "../arguments.js";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class ModuleSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::ModuleSerializer";
  }

  serialize(constant: object): Record<string, unknown> {
    if (
      !((Object.hasOwn(constant, "toString") ? String(constant) : constant.name || null) != null)
    ) {
      throw new SerializationError("Serializing an anonymous class is not supported");
    }
    return super.serialize({
      value: Object.hasOwn(constant, "toString") ? String(constant) : constant.name || null,
    });
  }

  deserialize(hash: Map<unknown, unknown>) {
    return constantize(hashAref(hash, "value") as string);
  }

  /** @internal */
  protected klass(): typeof Module {
    return Module;
  }
}
registerConstant("ActiveJob::Serializers::ModuleSerializer", ModuleSerializer);
