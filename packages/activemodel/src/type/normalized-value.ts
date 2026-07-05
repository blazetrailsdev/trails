import { Type } from "./value.js";

/**
 * Decorates an underlying cast type with a normalizer. When `cast` is called,
 * the value is first cast by the underlying type, then the normalizer is
 * applied — this is the single point where normalization happens. Because
 * trails always feeds an already-cast value into `serialize`
 * (`Attribute#serialize(value)` where `value = type.cast(raw)`), `serialize`
 * and `serializeCastValue` delegate straight to the underlying type WITHOUT
 * re-normalizing; re-normalizing there would double-apply a non-idempotent
 * normalizer on every save/query round-trip. Every other method (deserialize,
 * isChanged, type metadata, …) delegates to the underlying type unchanged —
 * notably `deserialize` does NOT normalize, so values read from the database
 * are left as-is (Rails: normalization is applied on assignment and query, not
 * on load).
 *
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType, which is a
 * `DelegateClass(ActiveModel::Type::Value)` overriding `cast`, `serialize`, and
 * `serialize_cast_value`. We model the DelegateClass with a Proxy so the full
 * surface of the wrapped type is forwarded, and normalize only in `cast`
 * (relying on cast-value memoization to bound applications to one per write).
 */
export function normalizedValueType(
  castType: Type,
  normalizer: (value: unknown) => unknown,
  normalizeNil: boolean,
): Type {
  const normalize = (value: unknown): unknown => {
    if ((value === null || value === undefined) && !normalizeNil) return value;
    return normalizer(value);
  };

  const cast = (value: unknown): unknown => normalize(castType.cast(value));

  const overrides: Record<string | symbol, unknown> = {
    cast,
    serialize(value: unknown): unknown {
      // Rails: serialize_cast_value(cast(value)). Normalize on serialize too so
      // any query path that serializes a raw value (prepared-statement binds,
      // `type_cast_for_database`) still normalizes it. Safe against double-apply
      // because this wrapper is used only by the query-side type caster, never
      // on the write path — and the query-time normalizers are idempotent.
      return castType.serialize(cast(value));
    },
    serializeCastValue(value: unknown): unknown {
      return castType.serializeCastValue(value as never);
    },
    // Rails exposes cast_type / normalizer / normalize_nil as attr_readers.
    castType,
    normalizer,
    normalizeNil,
  };

  return new Proxy(castType, {
    get(target, prop, receiver) {
      if (prop in overrides) return overrides[prop];
      const value = Reflect.get(target, prop, target);
      // Bind delegated methods to the underlying type so that, e.g.,
      // `deserialize` (which internally calls `this.cast`) uses the underlying
      // type's un-normalized cast rather than the proxy's normalizing one.
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as Type;
}
