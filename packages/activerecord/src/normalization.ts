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

import { Model, NormalizesArgs } from "@blazetrails/activemodel";

/**
 * NormalizedValueType — decorates an underlying cast type with a normalizer.
 * When cast() is called, the value is first cast by the underlying type,
 * then the normalizer is applied.
 *
 * This is the api:compare mirror of Rails' `ActiveRecord::Normalization::NormalizedValueType`
 * and preserves its method call structure (`serialize` → `cast` + `serialize_cast_value`).
 * The SINGLE live implementation is ActiveModel's `normalizedValueType`
 * (`activemodel/src/type/normalized-value.ts`), which `Model.normalizes` wires onto
 * the attribute's cast type via `decorate_attributes` so one type governs both the
 * write and query paths; this class carries the same semantics but is not on that
 * runtime path.
 *
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType
 */
export class NormalizedValueType {
  readonly castType: { cast(value: unknown): unknown; serialize?(value: unknown): unknown };
  readonly normalizer: (value: unknown) => unknown;
  readonly normalizeNil: boolean;

  constructor(options: {
    castType: { cast(value: unknown): unknown; serialize?(value: unknown): unknown };
    normalizer: (value: unknown) => unknown;
    normalizeNil?: boolean;
  }) {
    this.castType = options.castType;
    this.normalizer = options.normalizer;
    this.normalizeNil = options.normalizeNil ?? false;
  }

  cast(value: unknown): unknown {
    const castValue = this.castType.cast(value);
    return this._normalize(castValue);
  }

  serialize(value: unknown): unknown {
    const castValue = this.cast(value);
    return this.serializeCastValue(castValue);
  }

  serializeCastValue(value: unknown): unknown {
    const ct = this.castType as {
      serializeCastValue?(v: unknown): unknown;
      serialize?(v: unknown): unknown;
    };
    if (typeof ct.serializeCastValue === "function") {
      return ct.serializeCastValue(value);
    }
    return typeof ct.serialize === "function" ? ct.serialize(value) : value;
  }

  private _normalize(value: unknown): unknown {
    if (value === null || value === undefined) {
      if (!this.normalizeNil) return value;
    }
    return this.normalizer(value);
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
