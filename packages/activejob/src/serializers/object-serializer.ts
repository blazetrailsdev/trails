import { rbObjIsKindOf, NotImplementedError, registerConstant } from "@blazetrails/ruby-compat";

export class ObjectSerializer {
  declare static _instance: unknown;

  static toString(): string {
    return "ActiveJob::Serializers::ObjectSerializer";
  }

  static instance(this: typeof ObjectSerializer): ObjectSerializer {
    if (!Object.hasOwn(this, "_instance")) {
      Object.defineProperty(this, "_instance", { value: new this() });
    }
    return this._instance;
  }

  isSerialize(argument: unknown): boolean {
    return rbObjIsKindOf(argument, this.klass());
  }

  serialize(hash: unknown): Record<string, unknown> {
    return Object.assign(
      {
        ["_aj_serialized"]: ((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(
          this.constructor as typeof ObjectSerializer,
        ),
      },
      hash instanceof Map ? Object.fromEntries(hash) : hash,
    );
  }

  deserialize(_json: Map<unknown, unknown>) {
    throw new NotImplementedError();
  }

  /** @internal */
  protected klass() {
    throw new NotImplementedError();
  }

  static isSerialize(argument: unknown): boolean {
    return this.instance().isSerialize(argument);
  }

  static serialize(hash: unknown): Record<string, unknown> {
    return this.instance().serialize(hash);
  }

  static deserialize(json: unknown) {
    return this.instance().deserialize(json as Map<unknown, unknown>);
  }
}
registerConstant("ActiveJob::Serializers::ObjectSerializer", ObjectSerializer);
