import { classAttribute, included, methodMissingProxy } from "@blazetrails/activesupport";
import { SerializeCastValue } from "@blazetrails/activemodel";
import type { Type } from "@blazetrails/activemodel";

/**
 * Args accepted by `normalizes` — Ruby's `*names, with:, apply_to_nil: false`
 * (normalization.rb:88) in the trails kwargs idiom: the names, then one trailing
 * options object.
 */
export type NormalizesArgs = [
  ...names: string[],
  options: { with: (value: unknown) => unknown; applyToNil?: boolean },
];

/**
 * The class-side surface `Normalization` needs from its host.
 *
 * @internal
 */
interface NormalizationClass {
  normalizedAttributes: Set<string>;
  decorateAttributes(names: string[], decorator: (name: string, castType: Type) => Type): void;
  typeForAttribute(name: string): Type;
}

/**
 * The instance-side surface `Normalization` needs from its host.
 *
 * @internal
 */
interface NormalizationRecord {
  attributeChangedInPlace(name: string): boolean;
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

/**
 * Normalizes a specified attribute using its declared normalizations.
 *
 * Mirrors: ActiveRecord::Normalization#normalize_attribute (normalization.rb:26)
 */
export function normalizeAttribute(this: NormalizationRecord, name: string): void {
  // Treat the value as a new, unnormalized value.
  // Rails: `self[name] = self[name]`.
  this.writeAttribute(name, this.readAttribute(name));
}

export const ClassMethods = {
  /**
   * Declares a normalization for one or more attributes. The normalization is
   * applied when the attribute is assigned or updated, and the normalized value
   * will be persisted to the database. The normalization is also applied to the
   * corresponding keyword argument of query methods.
   *
   * Mirrors: ActiveRecord::Normalization::ClassMethods#normalizes (normalization.rb:88)
   *
   * @missingRailsArgs new — PERMANENT: `NormalizedValueType.new` gets every
   *   Rails kwarg with the same key and value. Rails passes the local `with`;
   *   `with` is a reserved word in JavaScript and cannot be an identifier, so
   *   the kwarg is read off the options object.
   */
  normalizes(this: NormalizationClass, ...args: NormalizesArgs): void {
    const options = args[args.length - 1] as {
      with: (value: unknown) => unknown;
      applyToNil?: boolean;
    };
    const names = args.slice(0, -1) as string[];
    const applyToNil = options.applyToNil ?? false;

    this.decorateAttributes(
      names,
      (name: string, castType: Type) =>
        new NormalizedValueType({
          castType,
          normalizer: options.with,
          normalizeNil: applyToNil,
        }) as unknown as Type,
    );

    this.normalizedAttributes = new Set([...this.normalizedAttributes, ...names]);
  },

  /**
   * Normalizes a given +value+ using normalizations declared for +name+.
   *
   * Mirrors: ActiveRecord::Normalization::ClassMethods#normalize_value_for
   * (normalization.rb:106)
   */
  normalizeValueFor(this: NormalizationClass, name: string, value: unknown): unknown {
    return this.typeForAttribute(name).cast(value);
  },
};

/**
 * Re-normalize every normalized attribute that has changed in place, so a
 * mutated value is normalized before validation and persistence.
 *
 * Mirrors: ActiveRecord::Normalization#normalize_changed_in_place_attributes
 * (normalization.rb:112, private)
 *
 * @internal
 */
export function normalizeChangedInPlaceAttributes(
  this: NormalizationRecord & { normalizeAttribute(name: string): void },
): void {
  for (const name of (this.constructor as unknown as NormalizationClass).normalizedAttributes) {
    if (this.attributeChangedInPlace(name)) this.normalizeAttribute(name);
  }
}

/**
 * Mirrors: ActiveRecord::Normalization's `included do ... end`
 * (normalization.rb:7-11) — the `class_attribute` and the `before_validation`
 * that arrive with the module itself, not with a `normalizes` declaration.
 */
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

/**
 * Decorates an underlying cast type with a normalizer. When `cast` is called,
 * the value is first cast by the underlying type, then the normalizer is
 * applied — this is the single point where normalization happens.
 *
 * `serialize` normalizes (casts then serializes) — matching Rails'
 * `serialize(value) = serialize_cast_value(cast(value))` — because a query bind
 * built from a raw value (`StatementCache` substitution binds an un-cast value
 * via `withCastValue`) reaches the database through `serialize`.
 * `serializeCastValue` does NOT re-normalize (its input is already a cast
 * value): the instance write path serializes `this.value` (already
 * cast+normalized) through the cast-value fast path, so persistence never
 * double-applies a non-idempotent normalizer (the "minimizes number of times
 * normalization is applied" contract). Every other method (deserialize,
 * isChanged, type metadata, …) delegates to the underlying type unchanged —
 * notably `deserialize` does NOT normalize, so values read from the database are
 * left as-is (Rails: normalization is applied on assignment and query, not on
 * load).
 *
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType (normalization.rb:117),
 * a `DelegateClass(ActiveModel::Type::Value)` overriding `cast`, `serialize`, and
 * `serialize_cast_value`. We model the DelegateClass with `methodMissingProxy`
 * over the instance, whose delegate is the wrapped type — so every method this
 * class does not define binds to the wrapped type, and `deserialize` (which
 * internally calls `cast`) uses that type's un-normalized cast rather than this
 * decorator's normalizing one.
 */
export class NormalizedValueType {
  readonly castType: Type;
  readonly normalizer: (value: unknown) => unknown;
  readonly normalizeNil: boolean;

  constructor(options: {
    castType: Type;
    normalizer: (value: unknown) => unknown;
    normalizeNil: boolean;
  }) {
    this.castType = options.castType;
    this.normalizer = options.normalizer;
    this.normalizeNil = options.normalizeNil;
    // Ruby's `super(cast_type)` — DelegateClass forwarding for every method
    // this class does not define.
    return methodMissingProxy(this, {
      delegate: (target) => target.castType,
    });
  }

  cast(value: unknown): unknown {
    return normalize(this, this.castType.cast(value));
  }

  serialize(value: unknown): unknown {
    // Rails: serialize_cast_value(cast(value)). Normalizes a raw value fed
    // straight to serialize (e.g. a StatementCache query bind).
    return this.serializeCastValue(this.cast(value));
  }

  /**
   * Mirrors Rails' `ActiveModel::Type::SerializeCastValue.serialize(cast_type, value)`:
   * route an already-cast value through the underlying type's cast-value fast
   * path when compatible, else its full `serialize`. Never re-normalizes.
   */
  serializeCastValue(value: unknown): unknown {
    return SerializeCastValue.serialize(
      this.castType as unknown as Parameters<typeof SerializeCastValue.serialize>[0],
      value,
    );
  }

  /**
   * Rails' NormalizedValueType `include`s SerializeCastValue and defines
   * `serialize`/`serialize_cast_value` at the same level, so it is ALWAYS
   * serialize-cast-value-compatible (independent of the wrapped type). Return
   * the decorator itself so the persisted-value path dispatches through this
   * type's non-normalizing `serializeCastValue` rather than the normalizing
   * `serialize` — otherwise a non-idempotent normalizer double-applies on save.
   */
  itselfIfSerializeCastValueCompatible(): Type {
    return this as unknown as Type;
  }
}

/**
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType#normalize
 * (normalization.rb:154, private) — `normalizer.call(value) unless value.nil? && !normalize_nil?`.
 *
 * @internal
 */
function normalize(type: NormalizedValueType, value: unknown): unknown {
  if ((value === null || value === undefined) && !type.normalizeNil) return value;
  return type.normalizer(value);
}
