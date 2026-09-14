import { classAttribute, included, rbHash } from "@blazetrails/activesupport";
import { SerializeCastValue, ValueType } from "@blazetrails/activemodel";
import { DelegateClass, rbInspect } from "@blazetrails/ruby-compat";

export type NormalizesArgs = [
  ...names: string[],
  options: { with: (value: unknown) => unknown; applyToNil?: boolean },
];

/** @internal */
interface NormalizationClass {
  normalizedAttributes: Set<string>;
  decorateAttributes(
    names: string[],
    decorator: (name: string, castType: ValueType) => ValueType,
  ): void;
  typeForAttribute(name: string): ValueType | null;
}

/** @internal */
interface NormalizationRecord {
  attributeChangedInPlace(name: string): boolean;
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

export function normalizeAttribute(this: NormalizationRecord, name: string): void {
  this.writeAttribute(name, this.readAttribute(name));
}

export const ClassMethods = {
  /** @missingRailsArgs new — PERMANENT */
  normalizes(this: NormalizationClass, ...args: NormalizesArgs): void {
    const options = args[args.length - 1] as {
      with: (value: unknown) => unknown;
      applyToNil?: boolean;
    };
    const names = args.slice(0, -1) as string[];
    const applyToNil = options.applyToNil ?? false;

    this.decorateAttributes(
      names,
      (name: string, castType: ValueType) =>
        new NormalizedValueType({
          castType,
          normalizer: options.with,
          normalizeNil: applyToNil,
        }),
    );

    this.normalizedAttributes = new Set([...this.normalizedAttributes, ...names]);
  },

  normalizeValueFor(this: NormalizationClass, name: string, value: unknown): unknown {
    return this.typeForAttribute(name)!.cast(value);
  },
};

/** @internal */
export function normalizeChangedInPlaceAttributes(
  this: NormalizationRecord & { normalizeAttribute(name: string): void },
): void {
  for (const name of (this.constructor as unknown as NormalizationClass).normalizedAttributes) {
    if (this.attributeChangedInPlace(name)) this.normalizeAttribute(name);
  }
}

/** @noRailsEquivalent PERMANENT */
export const InstanceMethods = {
  normalizeAttribute,
  normalizeChangedInPlaceAttributes,

  [included](base: any): void {
    classAttribute.call(base, "normalizedAttributes", { default: new Set<string>() });
    base.beforeValidation((record: { normalizeChangedInPlaceAttributes(): void }) => {
      record.normalizeChangedInPlaceAttributes();
    });
  },
};

export class NormalizedValueType extends DelegateClass(ValueType) {
  readonly castType: ValueType;
  readonly normalizer: (value: unknown) => unknown;
  readonly normalizeNil: boolean;

  constructor({
    castType,
    normalizer,
    normalizeNil,
  }: {
    castType: ValueType;
    normalizer: (value: unknown) => unknown;
    normalizeNil: boolean;
  }) {
    super(castType);
    this.castType = castType;
    this.normalizer = normalizer;
    this.normalizeNil = normalizeNil;
  }

  override cast(value: unknown): unknown {
    return this.normalize(super.cast(value));
  }

  override serialize(value: unknown): unknown {
    return this.serializeCastValue(this.cast(value));
  }

  override serializeCastValue(value: unknown): unknown {
    return SerializeCastValue.serialize(
      this.castType as unknown as Parameters<typeof SerializeCastValue.serialize>[0],
      value,
    );
  }

  override itselfIfSerializeCastValueCompatible(): this | null {
    return (
      this.constructor as unknown as { serializeCastValueCompatible(): boolean }
    ).serializeCastValueCompatible()
      ? this
      : null;
  }

  equals(other: ValueType): boolean {
    return (
      this.constructor === (other as object)?.constructor &&
      this.normalizeNil === (other as unknown as NormalizedValueType).normalizeNil &&
      this.normalizer === (other as unknown as NormalizedValueType).normalizer &&
      castTypesEqual(this.castType, (other as unknown as NormalizedValueType).castType)
    );
  }

  eql(other: ValueType): boolean {
    return this.equals(other);
  }

  hash(): number {
    return rbHash([this.constructor, this.castType, this.normalizer, this.normalizeNil]);
  }

  inspect(): string {
    return `#<${this.constructor.name} castType=${rbInspect(this.castType)}, normalizer=${rbInspect(this.normalizer)}, normalizeNil=${rbInspect(this.normalizeNil)}>`;
  }

  private normalize(value: unknown): unknown {
    if ((value === null || value === undefined) && !this.normalizeNil) return value;
    return this.normalizer(value);
  }
}

function castTypesEqual(a: ValueType, b: ValueType): boolean {
  const equals = (a as { equals?(other: ValueType): boolean }).equals;
  return equals ? equals.call(a, b) : a === b;
}
