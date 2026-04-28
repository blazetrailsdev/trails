import { Temporal } from "@blazetrails/activesupport/temporal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

/**
 * Serialization mixin contract — provides serializable_hash.
 *
 * Mirrors: ActiveModel::Serialization
 */
export interface Serialization {
  serializableHash(options?: SerializeOptions): Record<string, unknown>;
}

/**
 * Serialization options.
 */
export interface SerializeOptions {
  only?: string[];
  except?: string[];
  methods?: string[];
  include?: Record<string, SerializeOptions> | string[] | string;
}

/**
 * Serialize a model's attributes to a plain object.
 *
 * Mirrors: ActiveModel::Serialization#serializable_hash
 */
export function serializableHash(
  record: AnyRecord,
  options: SerializeOptions = {},
): Record<string, unknown> {
  // Models can override `attributeNamesForSerialization` to scope which
  // attributes appear (Rails' private `attribute_names_for_serialization`
  // hook). When absent, fall back to the underlying attribute store.
  const attrStore = record._attributes;
  let keys: string[];
  if (
    typeof (record as { attributeNamesForSerialization?: () => string[] })
      .attributeNamesForSerialization === "function"
  ) {
    keys = (
      record as { attributeNamesForSerialization: () => string[] }
    ).attributeNamesForSerialization();
  } else if (attrStore && typeof attrStore.keys === "function" && !(attrStore instanceof Map)) {
    keys = attrStore.keys();
  } else if (attrStore instanceof Map) {
    keys = Array.from(attrStore.keys());
  } else if (record.attributes) {
    keys = Object.keys(record.attributes);
  } else {
    keys = [];
  }

  // Exclude virtual attributes (e.g., acceptance/confirmation) from serialization
  const defs = record.constructor?._attributeDefinitions as
    | Map<string, { virtual?: boolean }>
    | undefined;
  if (defs) {
    keys = keys.filter((k) => !defs.get(k)?.virtual);
  }

  if (options.only) {
    keys = keys.filter((k) => options.only!.includes(k));
  } else if (options.except) {
    keys = keys.filter((k) => !options.except!.includes(k));
  }

  // Read values only for filtered keys
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (attrStore && typeof attrStore.fetchValue === "function") {
      result[key] = attrStore.fetchValue(key);
    } else if (attrStore instanceof Map) {
      result[key] = attrStore.get(key);
    } else if (record.readAttribute) {
      result[key] = record.readAttribute(key);
    } else {
      result[key] = record.attributes?.[key];
    }
  }

  if (options.methods) {
    for (const method of options.methods) {
      if (typeof record[method] === "function") {
        result[method] = record[method]();
      } else if (method in record) {
        result[method] = record[method];
      } else {
        throw new Error(
          `undefined method '${method}' for an instance of ${record.constructor.name}`,
        );
      }
    }
  }

  // Handle include option for nested associations
  if (options.include) {
    const includes = normalizeIncludes(options.include);
    for (const [assocName, assocOpts] of Object.entries(includes)) {
      // Check for cached/preloaded associations
      const cached =
        record._preloadedAssociations?.get(assocName) ?? record._cachedAssociations?.get(assocName);
      if (cached !== undefined) {
        if (Array.isArray(cached)) {
          result[assocName] = cached.map((r: AnyRecord) => serializableHash(r, assocOpts));
        } else if (cached && typeof cached === "object" && cached._attributes) {
          result[assocName] = serializableHash(cached, assocOpts);
        } else {
          result[assocName] = cached;
        }
      }
    }
  }

  return result;
}

/**
 * Coerce a value into a JSON-safe shape, mirroring Rails'
 * `ActiveSupport::JSON.encode` → `Object#as_json` dispatch.
 *
 * Native `JSON.stringify` handles most primitives + Date
 * (`Date.prototype.toJSON()` → ISO 8601), but throws on `BigInt` and
 * emits nothing useful for non-enumerable types. Rails' encoder:
 *
 * - BigDecimal → string (to preserve precision)
 * - Time / Date / DateTime → ISO 8601 string
 * - Symbol → string (Ruby symbols are interned strings)
 *
 * We cover the JS analog:
 * - `bigint` → decimal string. Rails serializes large integers as JSON
 *   numbers because Ruby's Integer is arbitrary-precision and the JSON
 *   encoder handles them natively. JS `JSON.stringify` throws on bigint,
 *   and JS numbers lose precision above 2^53-1, so we emit a decimal
 *   string instead. Consumers that need the numeric value must parse
 *   with `BigInt(str)`.
 * - Temporal types → ISO 8601 string via `toJSON()`. Precision is
 *   native (no trailing-zero truncation for JSON consumers).
 * - Plain arrays / objects → recurse
 * - Everything else → pass through (numbers, strings, booleans, null)
 *
 * Does NOT delegate to nested `asJson()` / `toJSON()` methods. Rails'
 * `Object#as_json` dispatch is recursive from a single encoder, so
 * cycle tracking threads through every call. In our JS port
 * `Model#asJson` starts a fresh coerceForJson with new cycle state,
 * so re-entering through a Model's `asJson` would reset the guards
 * and stack-overflow on model-model cycles. Instead, Model instances
 * reach coerceForJson already pre-flattened by `serializableHash`
 * (via its include path at serialization.ts:88-104 for associations
 * and via the usual attribute read for scalars), so no delegation is
 * needed.
 *
 * Note on JS Symbols: we intentionally do NOT coerce. Ruby symbols
 * are interned-string identifiers (Rails' `:active ≈ "active"`). JS
 * `Symbol()` is a unique identity sigil — different concept. Coercing
 * would misrepresent it. `JSON.stringify` already drops symbol-valued
 * properties per spec, which correctly signals "this doesn't
 * serialize".
 */
export function coerceForJson(value: unknown): unknown {
  return _coerceForJson(value, new WeakMap(), new WeakSet());
}

/**
 * Internal recursion for `coerceForJson`. Threaded with shared cycle
 * state (`seen` for memoization, `inProgress` for self-recursion
 * detection) so the top-level entry point can keep a narrow public
 * signature.
 */
function _coerceForJson(
  value: unknown,
  seen: WeakMap<object, unknown>,
  inProgress: WeakSet<object>,
): unknown {
  // `null` is valid JSON. `undefined` is not — `JSON.stringify` silently
  // drops object properties whose value is `undefined`, so an attribute
  // that happens to be unset would just disappear from the output
  // instead of appearing as `null` (matches Ruby `nil` mapping to JSON
  // `null`). Normalize both to `null` at the top of the recursion.
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  // Note: no JS `Symbol` handling. Ruby symbols are interned-string
  // identifiers (`:active` ≈ "active"), which is why Rails
  // `Symbol#as_json` returns the name. JS `Symbol()` is a unique
  // identity sigil (well-known symbols, private keys) — coercing to
  // its description would misrepresent its role. Leave symbols alone;
  // `JSON.stringify` already drops them per spec, which correctly
  // signals "this doesn't serialize".
  if (value instanceof Date) {
    // Preserve stable ISO 8601 output for any Date values still in flight
    // during the dual-typed window (removed in PR 6). Invalid Dates must
    // coerce like Date#toJSON (returns null) so asJson stays JSON.stringify-safe.
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime ||
    value instanceof Temporal.ZonedDateTime
  ) {
    // Temporal.prototype.toJSON() emits ISO 8601 with native precision.
    return value.toJSON();
  }
  if (Array.isArray(value)) {
    // True cycle: short-circuit to null (Rails' JSON encoder raises, but
    // `null` is less hostile for accidental self-refs and JSON.stringify
    // would also fail).
    if (inProgress.has(value)) return null;
    // Previously coerced: return the same coerced result so shared
    // references preserve object identity in the output (avoids silent
    // data loss on `{ a: obj, b: obj }`-shaped hashes).
    if (seen.has(value)) return seen.get(value);
    const out: unknown[] = [];
    seen.set(value, out);
    inProgress.add(value);
    try {
      for (const entry of value) {
        out.push(_coerceForJson(entry, seen, inProgress));
      }
    } finally {
      inProgress.delete(value);
    }
    return out;
  }
  if (typeof value === "object") {
    // Only recurse into plain objects (no prototype, or
    // `Object.prototype` directly). Class instances keep an opaque
    // pass-through so their internals don't leak — e.g. a `Model`
    // reached here as a raw attribute value would expose
    // `_attributes`/`_dirty`/`errors` via `Object.entries`. For these,
    // JSON.stringify will invoke the instance's own `toJSON()` at
    // encode time, which is the right Rails-parity boundary.
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) return value;

    if (inProgress.has(value)) return null;
    if (seen.has(value)) return seen.get(value);
    const v = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    seen.set(value, out);
    inProgress.add(value);
    try {
      for (const [k, val] of Object.entries(v)) {
        // Use defineProperty so an own `__proto__` key (common on
        // JSON.parse output) is written as a data property rather than
        // invoking `Object.prototype.__proto__`'s setter and polluting
        // the output's prototype.
        Object.defineProperty(out, k, {
          value: _coerceForJson(val, seen, inProgress),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    } finally {
      inProgress.delete(value);
    }
    return out;
  }
  return value;
}

function normalizeIncludes(
  include: Record<string, SerializeOptions> | string[] | string,
): Record<string, SerializeOptions> {
  if (typeof include === "string") {
    return { [include]: {} };
  }
  if (Array.isArray(include)) {
    const result: Record<string, SerializeOptions> = {};
    for (const name of include) {
      result[name] = {};
    }
    return result;
  }
  return include;
}
