import { Type } from "./value.js";

/**
 * Brand marking a Proxy produced by {@link normalizedValueType}. Symbol.for so
 * the mark is stable across duplicate module copies (the AM/AR packages may load
 * separate instances of this file).
 */
const NORMALIZED_BRAND: unique symbol = Symbol.for("@blazetrails/activemodel/NormalizedValueType");

/** Property carrying the idempotency token (see {@link normalizedValueType}). */
const NORMALIZED_TOKEN: unique symbol = Symbol.for("@blazetrails/activemodel/NormalizedValueToken");

/** True when `type` is a normalization decorator produced here. */
export function isNormalizedValueType(type: unknown): boolean {
  return (
    type != null &&
    (typeof type === "object" || typeof type === "function") &&
    (type as Record<symbol, unknown>)[NORMALIZED_BRAND] === true
  );
}

/**
 * The idempotency token a normalization decorator was built with, or undefined.
 * Callers compare it by identity to decide "already decorated by this exact
 * normalization" (skip) vs "decorated by a different/older one" (unwrap+rewrap).
 */
export function normalizedValueToken(type: unknown): unknown {
  return isNormalizedValueType(type)
    ? (type as Record<symbol, unknown>)[NORMALIZED_TOKEN]
    : undefined;
}

/**
 * Strip every normalization decorator layer off `type`, returning the innermost
 * undecorated cast type. Non-normalized types pass through unchanged.
 */
export function unwrapNormalization(type: Type): Type {
  let current: Type = type;
  while (isNormalizedValueType(current)) {
    current = (current as unknown as { castType: Type }).castType;
  }
  return current;
}

/**
 * Decorates an underlying cast type with a normalizer. When `cast` is called,
 * the value is first cast by the underlying type, then the normalizer is
 * applied — this is the single point where normalization happens.
 *
 * `serialize` normalizes (casts then serializes) — matching Rails'
 * `serialize(value) = serialize_cast_value(cast(value))` — because a query bind
 * built from a raw value (`StatementCache` substitution binds an un-cast value
 * via `withCastValue`) reaches the database through `serialize`. `serializeCastValue`
 * does NOT re-normalize (its input is already a cast value): the instance write
 * path serializes `this.value` (already cast+normalized) through the cast-value
 * fast path, so persistence never double-applies a non-idempotent normalizer
 * (the "minimizes number of times normalization is applied" contract). Every
 * other method (deserialize, isChanged, type metadata, …) delegates to the
 * underlying type unchanged — notably `deserialize` does NOT normalize, so values
 * read from the database are left as-is (Rails: normalization is applied on
 * assignment and query, not on load).
 *
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType, a
 * `DelegateClass(ActiveModel::Type::Value)` overriding `cast`, `serialize`, and
 * `serialize_cast_value`. We model the DelegateClass with a Proxy so the full
 * surface of the wrapped type is forwarded.
 *
 * @param token optional identity used by the attribute-decoration pipeline to
 *   recognize "already decorated by this normalization" during seed + pending
 *   replay, so a normalizer applies exactly once per attribute.
 */
export function normalizedValueType(
  castType: Type,
  normalizer: (value: unknown) => unknown,
  normalizeNil: boolean,
  token?: unknown,
): Type {
  const normalize = (value: unknown): unknown => {
    if ((value === null || value === undefined) && !normalizeNil) return value;
    return normalizer(value);
  };

  const cast = (value: unknown): unknown => normalize(castType.cast(value));

  // Mirrors Rails' `ActiveModel::Type::SerializeCastValue.serialize(cast_type, value)`:
  // route an already-cast value through the underlying type's cast-value fast
  // path when compatible, else its full `serialize`. Never re-normalizes.
  const serializeCastValue = (value: unknown): unknown =>
    castType.itselfIfSerializeCastValueCompatible?.()
      ? castType.serializeCastValue(value as never)
      : castType.serialize(value);

  const overrides: Record<string | symbol, unknown> = {
    cast,
    serialize(value: unknown): unknown {
      // Rails: serialize_cast_value(cast(value)). Normalizes a raw value fed
      // straight to serialize (e.g. a StatementCache query bind).
      return serializeCastValue(cast(value));
    },
    serializeCastValue,
    // Rails NormalizedValueType `include`s SerializeCastValue and defines
    // `serialize`/`serialize_cast_value` at the same level, so it is ALWAYS
    // serialize-cast-value-compatible (independent of the wrapped type). Return
    // the decorator itself so the persisted-value path dispatches through THIS
    // proxy's non-normalizing `serializeCastValue` rather than the normalizing
    // `serialize` — otherwise a non-idempotent normalizer double-applies on save.
    itselfIfSerializeCastValueCompatible(): Type {
      return proxy;
    },
    // Rails exposes cast_type / normalizer / normalize_nil as attr_readers.
    castType,
    normalizer,
    normalizeNil,
    [NORMALIZED_BRAND]: true,
    [NORMALIZED_TOKEN]: token,
  };

  const proxy = new Proxy(castType, {
    get(target, prop, receiver) {
      if (prop in overrides) return overrides[prop];
      const value = Reflect.get(target, prop, target);
      // Bind delegated methods to the underlying type so that, e.g.,
      // `deserialize` (which internally calls `this.cast`) uses the underlying
      // type's un-normalized cast rather than the proxy's normalizing one.
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as Type;
  return proxy;
}
