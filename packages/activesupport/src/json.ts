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

  // HashWithIndifferentAccess is a Hash subclass in Ruby, so it takes the
  // Hash#as_json path; unwrap via toHash() so its contents — not its
  // Map-backed internals — are traversed.
  if (typeof (value as { toHash?: unknown }).toHash === "function") {
    return asJsonValue((value as { toHash(): unknown }).toHash(), options);
  }

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

  // Rails' `Object#as_json` is `instance_values.as_json(options)` — a generic
  // object becomes a hash of its instance variables and the traversal recurses
  // into each of them (core_ext/object/json.rb:62-64). Objects carrying their
  // own `toJSON` (Date, …) keep their native JSON form, as above. This
  // recursion is what lets a nested type instance hit `Type#asJson`'s raise
  // (value.rb:145) — e.g. an encryption AdditionalValue's `type` reaching a
  // serialized coder's dump — instead of stringify silently dumping the
  // type's internals.
  if (typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON !== "function") {
    return asJsonValue({ ...value }, options);
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

// String-aware comment removal: quoted spans (and their backslash escapes) are
// copied verbatim so a `//` or `/*` inside a JSON string survives.
function stripJsonComments(value: string): string {
  let out = "";
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === '"') {
      const start = index++;
      while (index < value.length && value[index] !== '"') {
        index += value[index] === "\\" ? 2 : 1;
      }
      out += value.slice(start, ++index);
    } else if (char === "/" && value[index + 1] === "*") {
      const end = value.indexOf("*/", index + 2);
      index = end === -1 ? value.length : end + 2;
    } else if (char === "/" && value[index + 1] === "/") {
      const end = value.indexOf("\n", index + 2);
      index = end === -1 ? value.length : end;
    } else {
      out += char;
      index++;
    }
  }
  return out;
}

export namespace ActiveSupportJSON {
  // Rails: `ActiveSupport::JSON.encode` runs the `as_json` traversal
  // unconditionally, options or not (encoding.rb:22-25) — the options-only
  // shortcut would skip `asJson` raises (e.g. Type#asJson) on nested objects.
  export function encode(value: unknown, options?: EncodeOptions): string {
    const resolved = asJsonValue(value, normalizeOptions(options ?? {}));
    return JSON.stringify(resolved) ?? "null";
  }

  export function decode(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch (error) {
      // Ruby's JSON parser — what `ActiveSupport::JSON.decode` delegates to —
      // skips `/* … */` and `// …` comments anywhere whitespace is allowed;
      // `JSON.parse` rejects them. Only retry on a parse failure so valid
      // documents (where a `//` may only appear inside a string) are untouched.
      if (!(error instanceof SyntaxError)) throw error;
      return JSON.parse(stripJsonComments(value));
    }
  }
}
