import { asJson, Float, isPlainObject } from "../core-ext/object/json.js";
import { isEmpty } from "../ruby-empty.js";

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

export class JSONGemEncoder {
  readonly options: EncodeOptions;

  constructor(options?: EncodeOptions | null) {
    this.options = options ?? {};
  }

  /**
   * Encode the given object into a JSON string.
   *
   * Rails escapes more than the JSON gem natively does: U+2028 and U+2029, and
   * optionally `>`, `<`, `&`, to work around certain browser problems
   * (encoding.rb:60-70).
   *
   * Deviation: Ruby's `@options.fetch(:escape_html_entities, ...)`
   * (encoding.rb:63) returns the *stored* value whenever the key is present —
   * including a stored nil, which `??` would replace with the default — and JS
   * has no `Hash#fetch`, so the presence check is an `in` guard and the branch
   * follows Ruby truthiness (nil and false only).
   *
   * @missingRailsCall fetch — PERMANENT: Ruby Hash#fetch has no JS call analogue; encode
   *   reproduces its stored-value-wins semantics with an `in` guard rather than
   *   `??`.
   */
  encode(value: unknown): string {
    if (!isEmpty(this.options)) {
      value = asJson(value, this.options);
    }
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
   * Note: the `options` hash passed to `toJSON` is only passed to `asJson`, not
   * any of this method's recursive `asJson` calls.
   *
   * Rails' private `JSONGemEncoder#jsonify` (encoding.rb:88-104). JS has a
   * single numeric type, so Ruby's `Integer`-in-the-first-arm / `Float`-in-the
   * -`Numeric`-arm split collapses onto `Float#as_json`, whose finite values
   * are returned unchanged; a `bigint` takes the `Integer` arm.
   */
  private jsonify(value: unknown): unknown {
    if (
      typeof value === "string" ||
      typeof value === "bigint" ||
      value == null ||
      value === true ||
      value === false
    ) {
      return value;
    } else if (typeof value === "number") {
      return Float.asJson(value);
    } else if (value instanceof Map || isPlainObject(value as object)) {
      const result: Record<string, unknown> = {};
      const entries = value instanceof Map ? value.entries() : Object.entries(value as object);
      for (const [k, v] of entries) {
        result[String(k)] = this.jsonify(v);
      }
      return result;
    } else if (Array.isArray(value)) {
      return value.map((v) => this.jsonify(v));
    } else {
      return this.jsonify(asJson(value));
    }
  }

  /**
   * Encode a "jsonified" data structure. Rails' private
   * `JSONGemEncoder#stringify` calls
   * `JSON.generate(jsonified, quirks_mode: true, max_nesting: false)`
   * (encoding.rb:108-111); `quirks_mode` — emitting a bare scalar at the root
   * rather than raising — is `JSON.stringify`'s only behaviour, and it has no
   * nesting limit to lift. `JSON.stringify` returns `undefined` for `undefined`,
   * which has no Ruby analogue, so it becomes `null` as Ruby's `nil` would.
   *
   * @missingRailsCall generate — PERMANENT: ::JSON.generate is the Ruby JSON gem entry
   *   point; JSON.stringify is its only JS analogue and already implements
   *   quirks_mode with no nesting limit.
   */
  private stringify(jsonified: unknown): string {
    return JSON.stringify(jsonified) ?? "null";
  }
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
 * (encoding.rb:114-130). A class with `static` accessors rather than an object
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
