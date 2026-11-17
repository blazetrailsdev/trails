import {
  Mutable,
  ValueType,
  BinaryData,
  type Attribute,
  type AttributeSet,
} from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { DelegateClass, rbEqual, rbObjInspect, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { IndifferentHashAccessor } from "../store.js";
import { EncryptedAttributeType } from "../encryption/encrypted-attribute-type.js";
import { ColumnSerializer } from "../coders/column-serializer.js";
import { JSON } from "../coders/json.js";

type Coder = Pick<ColumnSerializer, "dump" | "load"> &
  Partial<Pick<ColumnSerializer, "objectClass" | "assertValidValue">>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (activerecord/lib/active_record/type/serialized.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export class Serialized extends DelegateClass(ValueType) {
  readonly subtype: ValueType | null;
  readonly coder: Coder;

  constructor(subtype: ValueType | null, coder: Coder) {
    super(subtype);
    this.subtype = subtype;
    this.coder = coder;
  }

  accessor(): unknown {
    return IndifferentHashAccessor;
  }

  /** @inventedArm then — PERMANENT */
  deserialize(value: unknown): unknown {
    if (value instanceof Promise) return value.then((v) => this.deserialize(v));
    if (this.isDefaultValue(value)) {
      return value;
    } else {
      return this.coder.load(super.deserialize(value));
    }
  }

  /** @inventedArm then — PERMANENT */
  serialize(value: unknown): unknown {
    if (value == null) return null;
    if (!this.isDefaultValue(value)) {
      const dumped: unknown = this.coder.dump(value);
      if (dumped instanceof Promise) return dumped.then((d) => super.serialize(d));
      return super.serialize(dumped);
    }
    return null;
  }

  inspect(): string {
    return rbObjInspect(this);
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
    return rbObjRespondTo(this.coder, "objectClass") && value instanceof this.coder.objectClass!;
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

include(Serialized, Mutable);

/** @noRailsEquivalent PERMANENT */
export async function _loadSerializedAttributes(record: {
  _attributes: AttributeSet;
}): Promise<void> {
  const attributes = record._attributes;
  for (const name of attributes.keys()) {
    const attribute = attributes.getAttribute(name) as Attribute & {
      _value?: unknown;
      typeCast(value: unknown): unknown;
    };
    const type = attribute.type;
    const castType = type instanceof EncryptedAttributeType ? type.castType : type;
    if (!(castType instanceof Serialized)) continue;
    if (castType.coder instanceof ColumnSerializer || castType.coder === JSON) continue;

    let value: unknown;
    if (Object.hasOwn(attribute, "_value")) {
      value = attribute._value;
    } else {
      try {
        value = attribute.typeCast(attribute.valueBeforeTypeCast);
      } catch {
        continue;
      }
    }
    if (value instanceof Promise) attribute._value = await value;
  }
}
