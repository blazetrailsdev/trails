import { MutableModule, ValueType, BinaryData, type Mutable } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { methodMissingProxy, rbEqual } from "@blazetrails/ruby-compat";
import { IndifferentHashAccessor } from "../store.js";

/** @noRailsEquivalent PERMANENT */
export interface Coder {
  dump(value: unknown): string | null;
  load(value: unknown): unknown;
  objectClass?: new (...args: any[]) => any;
  assertValidValue?(value: unknown, options: { action: string }): void;
}

/** @noRailsEquivalent PERMANENT */
function delegateClass<T extends new (...args: any[]) => any>(superclass: T): T {
  const klass = class extends superclass {} as T;
  const ignores = new Set(["constructor", "toString", "inspect"]);
  for (const method of Object.getOwnPropertyNames(superclass.prototype)) {
    if (ignores.has(method) || method.startsWith("_")) continue;
    const descriptor = Object.getOwnPropertyDescriptor(superclass.prototype, method)!;
    if (descriptor.get) {
      Object.defineProperty(klass.prototype, method, {
        configurable: true,
        get(this: { __getobj__(): any }): unknown {
          return this.__getobj__()[method];
        },
      });
    } else if (typeof descriptor.value === "function") {
      Object.defineProperty(klass.prototype, method, {
        configurable: true,
        writable: true,
        value(this: { __getobj__(): any }, ...args: unknown[]): unknown {
          return this.__getobj__()[method](...args);
        },
      });
    }
  }
  return klass;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (activerecord/lib/active_record/type/serialized.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export class Serialized extends delegateClass(ValueType) {
  readonly subtype: ValueType | null;
  readonly coder: Coder;

  constructor(subtype: ValueType | null, coder: Coder) {
    super();
    this.subtype = subtype;
    this.coder = coder;
    return methodMissingProxy(this, { delegate: (self) => self.__getobj__() });
  }

  __getobj__(): ValueType {
    return this.subtype!;
  }

  accessor(): unknown {
    return IndifferentHashAccessor;
  }

  deserialize(value: unknown): unknown {
    if (this.isDefaultValue(value)) return value;
    const deserialized = this.subtype!.deserialize?.(value) ?? value;
    const forCoder =
      this.subtype!.type?.() === "binary" && deserialized instanceof Uint8Array
        ? Buffer.from(deserialized).toString("utf8")
        : deserialized;
    return this.coder.load(forCoder);
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (this.isDefaultValue(value)) return null;
    const dumped = this.coder.dump(value);
    if (this.subtype?.serialize) {
      return this.subtype.serialize(dumped);
    }
    return dumped;
  }

  override isChangedInPlace(rawOldValue: unknown, value: unknown): boolean {
    if (value === null || value === undefined) return false;
    const rawNewValue = this.encoded(value);
    const oldNil = rawOldValue === null || rawOldValue === undefined;
    const newNil = rawNewValue === null || rawNewValue === undefined;
    return (
      oldNil !== newNil || (this.subtype!.isChangedInPlace?.(rawOldValue, rawNewValue) ?? false)
    );
  }

  assertValidValue(value: unknown): void {
    if (this.coder.assertValidValue) {
      this.coder.assertValidValue(value, { action: "serialize" });
    }
  }

  override isForceEquality(value: unknown): boolean {
    return this.coder.objectClass !== undefined && value instanceof this.coder.objectClass;
  }

  override isSerialized(): boolean {
    return true;
  }

  private isDefaultValue(value: unknown): boolean {
    return rbEqual(value, this.coder.load(null));
  }

  private encoded(value: unknown): unknown {
    if (this.isDefaultValue(value)) return undefined;
    const payload = this.coder.dump(value);
    if (payload && this.subtype!.isBinary()) {
      return new BinaryData(payload);
    }
    return payload;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge carries `include ActiveModel::Type::Helpers::Mutable`'s members onto the class; it declares none of its own.
export interface Serialized extends Mutable {}

include(Serialized, MutableModule);
