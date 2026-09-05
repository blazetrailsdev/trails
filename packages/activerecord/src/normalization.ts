import { classAttribute, included, methodMissingProxy } from "@blazetrails/activesupport";
import { SerializeCastValue } from "@blazetrails/activemodel";
import type { ValueType } from "@blazetrails/activemodel";

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
        }) as unknown as ValueType,
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

export class NormalizedValueType {
  readonly castType: ValueType;
  readonly normalizer: (value: unknown) => unknown;
  readonly normalizeNil: boolean;

  constructor(options: {
    castType: ValueType;
    normalizer: (value: unknown) => unknown;
    normalizeNil: boolean;
  }) {
    this.castType = options.castType;
    this.normalizer = options.normalizer;
    this.normalizeNil = options.normalizeNil;
    return methodMissingProxy(this, {
      delegate: (target) => target.castType,
    });
  }

  cast(value: unknown): unknown {
    return normalize(this, this.castType.cast(value));
  }

  serialize(value: unknown): unknown {
    return this.serializeCastValue(this.cast(value));
  }

  serializeCastValue(value: unknown): unknown {
    return SerializeCastValue.serialize(
      this.castType as unknown as Parameters<typeof SerializeCastValue.serialize>[0],
      value,
    );
  }

  itselfIfSerializeCastValueCompatible(): ValueType {
    return this as unknown as ValueType;
  }

  equals(other: ValueType): boolean {
    return (
      this.constructor === (other as object)?.constructor &&
      this.normalizeNil === (other as unknown as NormalizedValueType).normalizeNil &&
      this.normalizer === (other as unknown as NormalizedValueType).normalizer &&
      castTypesEqual(this.castType, (other as unknown as NormalizedValueType).castType)
    );
  }
}

function castTypesEqual(a: ValueType, b: ValueType): boolean {
  const equals = (a as { equals?(other: ValueType): boolean }).equals;
  return equals ? equals.call(a, b) : a === b;
}

/** @internal */
function normalize(type: NormalizedValueType, value: unknown): unknown {
  if ((value === null || value === undefined) && !type.normalizeNil) return value;
  return type.normalizer(value);
}
