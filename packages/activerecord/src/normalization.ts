/**
 * Attribute normalization support for ActiveRecord.
 *
 * The class methods `normalizes`, `normalizeValueFor`, and instance method
 * `normalizeAttribute` are defined on ActiveModel::Model and inherited by
 * ActiveRecord::Base. This file provides the NormalizedValueType wrapper
 * that Rails defines in ActiveRecord::Normalization, and re-exports the
 * methods from Model for api:compare discoverability.
 *
 * Mirrors: ActiveRecord::Normalization
 */

import { Model, NormalizesArgs, Type, normalizedValueType } from "@blazetrails/activemodel";

/**
 * NormalizedValueType — decorates an underlying cast type with a normalizer.
 * When cast() is called, the value is first cast by the underlying type,
 * then the normalizer is applied.
 *
 * This is the api:compare mirror of Rails' `ActiveRecord::Normalization::NormalizedValueType`.
 * The SINGLE live implementation is ActiveModel's `normalizedValueType`
 * (`activemodel/src/type/normalized-value.ts`), which `Model.normalizes` wires
 * onto the attribute's cast type via `decorate_attributes` so one type governs
 * both the write and query paths. This class delegates to it so there is no
 * second normalization implementation.
 *
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType
 */
export class NormalizedValueType {
  readonly castType: Type;
  readonly normalizer: (value: unknown) => unknown;
  readonly normalizeNil: boolean;
  private readonly _delegate: Type;

  constructor(options: {
    castType: Type;
    normalizer: (value: unknown) => unknown;
    normalizeNil?: boolean;
  }) {
    this.castType = options.castType;
    this.normalizer = options.normalizer;
    this.normalizeNil = options.normalizeNil ?? false;
    this._delegate = normalizedValueType(this.castType, this.normalizer, this.normalizeNil);
  }

  cast(value: unknown): unknown {
    return this._delegate.cast(value);
  }

  serialize(value: unknown): unknown {
    return this._delegate.serialize(value);
  }

  serializeCastValue(value: unknown): unknown {
    return (
      this._delegate as unknown as { serializeCastValue(v: unknown): unknown }
    ).serializeCastValue(value);
  }
}

// Wrapper functions that delegate to Model's normalization methods.
// These exist for api:compare discoverability — the actual implementations
// are on ActiveModel::Model, inherited by ActiveRecord::Base.

export function normalizes(modelClass: typeof Model, ...args: NormalizesArgs): void {
  return modelClass.normalizes(...args);
}

/**
 * Rails: `class_attribute :normalized_attributes, default: Set.new` — the set of
 * attribute names with a registered normalizer. Trails stores the normalizers
 * in ActiveModel's `Model._normalizations` map; expose the Rails-shaped Set
 * reader (the `=`/`?` forms map to the same accessor).
 *
 * Mirrors: ActiveRecord::Normalization#normalized_attributes
 */
export function normalizedAttributes(modelClass: typeof Model): Set<string> {
  const normalizations: Map<string, unknown> | undefined = (modelClass as any)._normalizations;
  return new Set(normalizations ? normalizations.keys() : []);
}

export function normalizeValueFor(
  modelClass: typeof Model,
  ...args: Parameters<typeof Model.normalizeValueFor>
): unknown {
  return modelClass.normalizeValueFor(...args);
}

export function normalizeAttribute(record: InstanceType<typeof Model>, name: string): void {
  return record.normalizeAttribute(name);
}

/**
 * Apply the normalizer proc to a value, skipping nil unless normalize_nil is set.
 *
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType#normalize (private).
 * The live normalization lives in ActiveModel's `normalizedValueType`; this stays
 * for api:compare discoverability and shares its nil-skip semantics.
 *
 * @internal
 */
export function normalize(normalizedType: NormalizedValueType, value: unknown): unknown {
  if ((value === null || value === undefined) && !normalizedType.normalizeNil) return value;
  return normalizedType.normalizer(value);
}

// `normalize_changed_in_place_attributes` lives on ActiveModel::Model
// (`Model.prototype.normalizeChangedInPlaceAttributes`) and is wired onto Base
// there; base.ts references that single implementation directly.
