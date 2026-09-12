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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (activerecord/lib/active_record/type/serialized.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export class Serialized extends ValueType {
  readonly subtype: ValueType | null;
  readonly coder: Coder;

  constructor(subtype: ValueType | null, coder: Coder) {
    super();
    this.subtype = subtype;
    this.coder = coder;
    return methodMissingProxy(this, { delegate: (self) => self.subtype });
  }

  /** @noRailsEquivalent CONVERGEABLE api-compare-nulls-a-delegateclass-superclass */
  override type(): string | undefined {
    return this.subtype!.type();
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

  override isBinary(): boolean {
    return this.subtype!.isBinary();
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
