import { rbModName, NotImplementedError, registerConstant } from "@blazetrails/ruby-compat";
import { OBJECT_SERIALIZER_KEY } from "../arguments.js";
import { rbIsA } from "../codegen-runtime.js";

export class ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  static instance(this: any): any {
    if (!Object.hasOwn(this, "_instance")) {
      Object.defineProperty(this, "_instance", { value: new this() });
    }
    return this._instance;
  }

  isSerialize(argument: any): any {
    return rbIsA(argument, this.klass());
  }

  serialize(hash: any): any {
    return Object.assign(
      { [OBJECT_SERIALIZER_KEY]: rbModName(this.constructor as typeof ObjectSerializer) },
      hash,
    );
  }

  deserialize(json: any): any {
    throw new NotImplementedError();
  }

  /** @internal */
  protected klass(): any {
    throw new NotImplementedError();
  }

  static isSerialize(...args: any[]): any {
    return this.instance().isSerialize(...args);
  }

  static serialize(...args: any[]): any {
    return this.instance().serialize(...args);
  }

  static deserialize(...args: any[]): any {
    return this.instance().deserialize(...args);
  }
}
registerConstant("ActiveJob::Serializers::ObjectSerializer", ObjectSerializer);
