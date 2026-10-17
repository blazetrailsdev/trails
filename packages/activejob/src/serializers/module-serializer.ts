import { constantize } from "@blazetrails/activesupport";
import { rtest, rbModName, Module, registerConstant } from "@blazetrails/ruby-compat";
import { SerializationError } from "../arguments.js";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class ModuleSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  serialize(constant: any): any {
    if (!rtest(rbModName(constant))) {
      throw new SerializationError("Serializing an anonymous class is not supported");
    }
    return super.serialize({ ["value"]: rbModName(constant) });
  }

  deserialize(hash: any): any {
    return constantize(hash["value"]);
  }

  /** @internal */
  protected klass(): any {
    return Module;
  }
}
registerConstant("ActiveJob::Serializers::ModuleSerializer", ModuleSerializer);
