/**
 * ActiveSupport::JSON — thin wrapper around native JSON providing
 * encode/decode that mirrors the Rails API.
 *
 * Rails' ActiveSupport::JSON.encode uses ActiveSupport::JSON::Encoding
 * under the hood; in TypeScript we delegate to the built-in JSON global
 * since the behavior is equivalent for all standard types.
 */

/**
 * Serialization options threaded through `as_json` — only the subset Rails'
 * `ActiveSupport::JSON.encode(value, options)` forwards to collections. `only`
 * / `except` accept a scalar or list, mirroring Rails' `Array(attrs)` coercion.
 */
interface EncodeOptions {
  only?: string | number | Array<string | number>;
  except?: string | number | Array<string | number>;
  [key: string]: unknown;
}

// Normalized form after `Array(attrs)` coercion: `only`/`except` are always lists.
interface NormalizedOptions {
  only?: Array<string | number>;
  except?: Array<string | number>;
  [key: string]: unknown;
}

// Ruby `Array(x)`: nil → absent (default = all attrs), scalar → [scalar],
// list → list. Coerced once up front so the Hash filter and every forwarded
// `asJson(options)` (whose `only`/`except` filters assume a list) agree.
function normalizeOptions(options: EncodeOptions): NormalizedOptions {
  const wrap = (v: string | number | Array<string | number> | undefined) =>
    v == null ? undefined : Array.isArray(v) ? v : [v];
  return { ...options, only: wrap(options.only), except: wrap(options.except) };
}

// Rails: `ActiveSupport::JSON.encode(value, options)` calls `value.as_json(options)`.
// Arrays map each element through `as_json(options)`; Hashes filter their keys by
// `only`/`except` (mirroring `Hash#as_json`) and recurse the surviving values with
// the same options; objects responding to `as_json` (our `asJson`) delegate.
function asJsonValue(value: unknown, options: NormalizedOptions): unknown {
  if (value == null) return value;

  const asJson = (value as { asJson?: (o?: unknown) => unknown }).asJson;
  if (typeof asJson === "function") return asJson.call(value, options);

  if (Array.isArray(value)) return value.map((v) => asJsonValue(v, options));

  // Only true Hashes (plain objects / Maps) get `only`/`except` key filtering.
  // Other objects (Date, RegExp, BigNumber-likes, …) carry their own `as_json`
  // string form, so leave them for `JSON.stringify` to serialize via `toJSON`
  // rather than recursing into them as if they were attribute bags (which would
  // emit `{}` for a `Date`).
  if (value instanceof Map || isPlainObject(value)) {
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
    const keep = filterHashKeys(
      entries.map(([k]) => k),
      options,
    );
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      if (keep.has(k)) out[String(k)] = asJsonValue(v, options);
    }
    return out;
  }

  return value;
}

// A Hash-shaped object: a bare object literal (`Object.prototype` or null
// prototype), not a class instance like `Date` that defines its own JSON form.
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Mirrors `Hash#as_json`'s key filtering: `only` keeps the listed keys, `except`
// drops them, comparing by stringified key (Rails compares the raw keys, but our
// option lists arrive as strings/numbers, so normalize both sides).
function filterHashKeys(keys: unknown[], options: NormalizedOptions): Set<unknown> {
  const norm = (v: unknown) => String(v);
  if (options.only != null) {
    const only = new Set(options.only.map(norm));
    return new Set(keys.filter((k) => only.has(norm(k))));
  }
  if (options.except != null) {
    const except = new Set(options.except.map(norm));
    return new Set(keys.filter((k) => !except.has(norm(k))));
  }
  return new Set(keys);
}

export namespace ActiveSupportJSON {
  export function encode(value: unknown, options?: EncodeOptions): string {
    const resolved = options === undefined ? value : asJsonValue(value, normalizeOptions(options));
    return JSON.stringify(resolved) ?? "null";
  }

  export function decode(value: string): unknown {
    return JSON.parse(value);
  }
}
