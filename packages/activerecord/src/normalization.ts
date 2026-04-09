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

import { Model } from "@blazetrails/activemodel";

/**
 * NormalizedValueType — decorates an underlying cast type with a normalizer.
 * When cast() is called, the value is first cast by the underlying type,
 * then the normalizer is applied.
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
    const ct = this.castType as any;
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

export function normalizes(
  modelClass: typeof Model,
  ...args: Parameters<typeof Model.normalizes>
): void {
  return modelClass.normalizes(...args);
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
