import {
  NotImplementedError,
  rbModConstSet,
  rbModName,
  rbObjIsKindOf,
  update,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "../namespaces.js";
import { Serializers } from "../serializers.js";

export class ObjectSerializer {
  static instance<T extends ObjectSerializer>(this: new () => T): T {
    if (!Object.hasOwn(this, "_instance")) {
      Object.defineProperty(this, "_instance", { value: new this() });
    }
    return (this as unknown as { _instance: T })._instance;
  }

  static isSerialize(argument: unknown): boolean {
    return this.instance().isSerialize(argument);
  }

  static serialize(argument: unknown): Record<string, unknown> {
    return this.instance().serialize(argument);
  }

  static deserialize(argument: Record<string, unknown> | Map<string, unknown>): unknown {
    return this.instance().deserialize(argument);
  }

  isSerialize(argument: unknown): boolean {
    return rbObjIsKindOf(argument, this.klass());
  }

  serialize(hash: unknown): Record<string, unknown> {
    return update(
      { [ActiveJob.Arguments.OBJECT_SERIALIZER_KEY]: rbModName(this.constructor) },
      hash as Record<string, unknown>,
    );
  }

  deserialize(_json: Record<string, unknown> | Map<string, unknown>): unknown {
    throw new NotImplementedError();
  }

  /** @internal */
  protected klass(): unknown {
    throw new NotImplementedError();
  }
}
rbModConstSet(Serializers, "ObjectSerializer", ObjectSerializer);
