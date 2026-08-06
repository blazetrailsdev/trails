import { Temporal } from "@blazetrails/date";

/**
 * Serialization options threaded through `as_json` — only the subset Rails'
 * `ActiveSupport::JSON.encode(value, options)` forwards to collections. `only`
 * / `except` accept a scalar or list, mirroring Rails' `Array(attrs)` coercion.
 */
export interface EncodeOptions {
  only?: string | number | Array<string | number>;
  except?: string | number | Array<string | number>;
  escapeHtmlEntities?: boolean;
  [key: string]: unknown;
}

/** Normalized form after `Array(attrs)` coercion: `only`/`except` are always lists. */
interface NormalizedOptions {
  only?: Array<string | number>;
  except?: Array<string | number>;
  [key: string]: unknown;
}

export class JSONGemEncoder {
  readonly options: EncodeOptions;

  /**
   * Ruby applies `only`/`except` coercion inside each `as_json`; trails
   * coerces once so every recursion level sees the same list form.
   */
  private readonly normalizedOptions: NormalizedOptions;

  constructor(options?: EncodeOptions | null) {
    this.options = options ?? {};
    this.normalizedOptions = normalizeOptions(this.options);
  }

  /**
   * Encode the given object into a JSON string.
   *
   * Rails escapes more than the JSON gem natively does: U+2028 and U+2029, and
   * optionally `>`, `<`, `&`, to work around certain browser problems
   * (encoding.rb:57-69).
   *
   * Deviation: Rails' `unless options.empty?` guard (encoding.rb:53-55) is
   * dropped. It only decides whether to run `as_json(options)` *before*
   * `jsonify`, and Ruby's `jsonify` reaches `value.as_json` for every
   * non-primitive in its `else` arm anyway (encoding.rb:100). Here `jsonify` IS
   * that traversal, so gating it on a non-empty options hash would skip the
   * `asJson` calls — and the raises they exist to surface, e.g. `Type#asJson` —
   * for the common no-options encode.
   *
   * Deviation: Ruby's `@options.fetch(:escape_html_entities, ...)`
   * (encoding.rb:63) returns the *stored* value whenever the key is present —
   * including a stored nil, which `??` would replace with the default — and JS
   * has no `Hash#fetch`, so the presence check is an `in` guard and the branch
   * follows Ruby truthiness (nil and false only).
   */
  encode(value: unknown): string {
    let json = this.stringify(this.jsonify(value));

    const escapeHtmlEntities =
      "escapeHtmlEntities" in this.options
        ? this.options.escapeHtmlEntities
        : Encoding.escapeHtmlEntitiesInJson;
    if (escapeHtmlEntities != null && escapeHtmlEntities !== false) {
      json = json.replaceAll(">", "\\u003e");
      json = json.replaceAll("<", "\\u003c");
      json = json.replaceAll("&", "\\u0026");
    }
    json = json.replaceAll("\u2028", "\\u2028");
    json = json.replaceAll("\u2029", "\\u2029");
    return json;
  }

  /**
   * Convert an object into a "JSON-ready" representation composed of primitives
   * like Hash, Array, String, Symbol, Numeric, and `true`/`false`/`nil`.
   * Recursively calls `asJson` to the object to recursively build a fully
   * JSON-ready object.
   *
   * This allows developers to implement `asJson` without having to worry about
   * what base types of objects they are allowed to return or having to remember
   * to call `asJson` recursively.
   *
   * Rails' private `JSONGemEncoder#jsonify` (encoding.rb:85-102).
   *
   * Deviation: Rails dispatches on Ruby type (`String, Integer, Symbol, nil,
   * true, false` / `Numeric` / `Hash` / `Array` / else `as_json`). This body
   * keeps trails' existing branch order, because the `as_json` layer it would
   * dispatch through — `core_ext/object/json.rb` — is unported (0/6). Converging
   * the two is tracked by `converge-jsonify-branch-order-onto-rails-as-json`.
   *
   * Three branches carry behaviour the Ruby case statement gets for free:
   * `toHash` unwraps HashWithIndifferentAccess, a Hash subclass in Ruby, so its
   * contents rather than its Map-backed internals are traversed. Only true
   * Hashes (plain objects / Maps) take `only`/`except` key filtering — other
   * objects (Date, RegExp, …) carry their own JSON form and are left to
   * `toJSON`, which recursing into them as attribute bags would lose (a `Date`
   * would emit `{}`). The final branch is Rails' `Object#as_json`, which is
   * `instance_values.as_json(options)` (core_ext/object/json.rb:62-64): a
   * generic object becomes a hash of its instance variables and the traversal
   * recurses into each. That recursion is what lets a nested type instance
   * reach `Type#asJson`'s raise (value.rb:145) instead of `stringify` silently
   * dumping the type's internals.
   */
  private jsonify(value: unknown): unknown {
    if (value == null) return value;

    const asJson = (value as { asJson?: (o?: unknown) => unknown }).asJson;
    if (typeof asJson === "function") return asJson.call(value, this.normalizedOptions);

    const temporal = temporalAsJson(value);
    if (temporal !== undefined) return temporal;

    if (Array.isArray(value)) return value.map((v) => this.jsonify(v));

    if (typeof (value as { toHash?: unknown }).toHash === "function") {
      return this.jsonify((value as { toHash(): unknown }).toHash());
    }

    if (value instanceof Map || isPlainObject(value)) {
      const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
      const keep = filterHashKeys(
        entries.map(([k]) => k),
        this.normalizedOptions,
      );
      const result: Record<string, unknown> = {};
      for (const [k, v] of entries) {
        if (keep.has(k)) result[String(k)] = this.jsonify(v);
      }
      return result;
    }

    if (typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON !== "function") {
      return this.jsonify({ ...value });
    }

    return value;
  }

  /**
   * Encode a "jsonified" data structure. Rails' private
   * `JSONGemEncoder#stringify` calls
   * `JSON.generate(jsonified, quirks_mode: true, max_nesting: false)`
   * (encoding.rb:105-107); `quirks_mode` — emitting a bare scalar at the root
   * rather than raising — is `JSON.stringify`'s only behaviour, and it has no
   * nesting limit to lift. `JSON.stringify` returns `undefined` for `undefined`,
   * which has no Ruby analogue, so it becomes `null` as Ruby's `nil` would.
   */
  private stringify(jsonified: unknown): string {
    return JSON.stringify(jsonified) ?? "null";
  }
}

/**
 * Rails' `Time#as_json` / `DateTime#as_json` / `Date#as_json`
 * (core_ext/object/json.rb:200-228), dispatched over our Temporal analogues:
 * `Instant`/`ZonedDateTime` for `Time`, `PlainDateTime` for the zoneless
 * `DateTime` (whose `xmlschema` carries Ruby's default `+00:00` offset), and
 * `PlainDate` for `Date`. `xmlschema` renders a zero offset as "Z"
 * (`formatted_offset(true, 'Z')`), which the ZonedDateTime arm reproduces.
 */
function temporalAsJson(value: unknown): string | undefined {
  const digits =
    Encoding.timePrecision as Temporal.ToStringPrecisionOptions["fractionalSecondDigits"];

  if (value instanceof Temporal.Instant) {
    if (Encoding.useStandardJsonTimeFormat)
      return value.toString({ fractionalSecondDigits: digits });
    return slashFormat(value.toZonedDateTimeISO("UTC"), "+0000");
  }

  if (value instanceof Temporal.ZonedDateTime) {
    if (Encoding.useStandardJsonTimeFormat) {
      const formatted = value.toString({ fractionalSecondDigits: digits, timeZoneName: "never" });
      return value.offsetNanoseconds === 0 ? `${formatted.slice(0, -6)}Z` : formatted;
    }
    return slashFormat(value, value.offset.replaceAll(":", ""));
  }

  if (value instanceof Temporal.PlainDateTime) {
    if (Encoding.useStandardJsonTimeFormat) {
      return `${value.toString({ fractionalSecondDigits: digits })}+00:00`;
    }
    return slashFormat(value, "+0000");
  }

  if (value instanceof Temporal.PlainDate) {
    return Encoding.useStandardJsonTimeFormat
      ? value.toString()
      : `${value.year}/${pad2(value.month)}/${pad2(value.day)}`;
  }

  return undefined;
}

function slashFormat(
  value: Temporal.ZonedDateTime | Temporal.PlainDateTime,
  offset: string,
): string {
  return (
    `${value.year}/${pad2(value.month)}/${pad2(value.day)} ` +
    `${pad2(value.hour)}:${pad2(value.minute)}:${pad2(value.second)} ${offset}`
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A Hash-shaped object: a bare object literal (`Object.prototype` or null
 * prototype), not a class instance like `Date` that defines its own JSON form.
 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Mirrors `Hash#as_json`'s key filtering: `only` keeps the listed keys, `except`
 * drops them, comparing by stringified key (Rails compares the raw keys, but our
 * option lists arrive as strings/numbers, so normalize both sides).
 */
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

/**
 * Ruby `Array(x)`: nil → absent (default = all attrs), scalar → [scalar],
 * list → list. Coerced once up front so the Hash filter and every forwarded
 * `asJson(options)` (whose `only`/`except` filters assume a list) agree.
 */
function normalizeOptions(options: EncodeOptions): NormalizedOptions {
  const wrap = (v: string | number | Array<string | number> | undefined) =>
    v == null ? undefined : Array.isArray(v) ? v : [v];
  return { ...options, only: wrap(options.only), except: wrap(options.except) };
}

/**
 * Backing storage for the `Encoding` singleton accessors below. Rails' module
 * sets them at the bottom of encoding.rb (:132-135), in this order; the
 * defaults live on the declarations here so a reader before any writer still
 * sees Rails' value.
 */
let _useStandardJsonTimeFormat = true;
let _escapeHtmlEntitiesInJson = true;
let _jsonEncoder: typeof JSONGemEncoder = JSONGemEncoder;
let _timePrecision = 3;

/**
 * Rails' `ActiveSupport::JSON::Encoding` singleton accessors
 * (encoding.rb:113-130). A class with `static` accessors rather than an object
 * literal so `class << self; attr_accessor ...` maps member-for-member.
 */
export class Encoding {
  /**
   * If true, use ISO 8601 format for dates and times. Otherwise, fall back
   * to the Active Support legacy format.
   */
  static get useStandardJsonTimeFormat(): boolean {
    return _useStandardJsonTimeFormat;
  }

  static set useStandardJsonTimeFormat(value: boolean) {
    _useStandardJsonTimeFormat = value;
  }

  /**
   * If true, encode >, <, & as escaped unicode sequences (e.g. > as \u003e)
   * as a safety measure.
   */
  static get escapeHtmlEntitiesInJson(): boolean {
    return _escapeHtmlEntitiesInJson;
  }

  static set escapeHtmlEntitiesInJson(value: boolean) {
    _escapeHtmlEntitiesInJson = value;
  }

  /**
   * Sets the precision of encoded time values.
   * Defaults to 3 (equivalent to millisecond precision)
   */
  static get timePrecision(): number {
    return _timePrecision;
  }

  static set timePrecision(value: number) {
    _timePrecision = value;
  }

  /**
   * Sets the encoder used by trails to encode objects into JSON strings in
   * `ActiveSupportJSON.encode`.
   */
  static get jsonEncoder(): typeof JSONGemEncoder {
    return _jsonEncoder;
  }

  static set jsonEncoder(value: typeof JSONGemEncoder) {
    _jsonEncoder = value;
  }
}
