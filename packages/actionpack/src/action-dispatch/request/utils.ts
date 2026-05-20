/**
 * ActionDispatch::Request::Utils
 *
 * Walks parsed parameter structures (from `parseNestedQuery` etc.) for
 * normalization and traversal. The headline feature is `deepMunge`, which
 * strips `null` entries from arrays — Rails enables this by default to
 * defang null-injection attacks against ActiveRecord queries.
 *
 * Rails' Utils also includes `set_binary_encoding` / `CustomParamEncoder`
 * (string encoding fixups for non-UTF-8 input) and HashWithIndifferentAccess
 * wrapping. Both are skipped here: JS strings are always UTF-16, and the
 * indifferent-access concern doesn't apply (object keys are strings only).
 */

// JSON-compatible primitives: urlencoded bodies yield string|null, JSON bodies
// can also yield number|boolean. ParamValue covers both.
export type ParamValue =
  | string
  | number
  | boolean
  | null
  | ParamValue[]
  | { [key: string]: ParamValue };
export type ParamHash = { [key: string]: ParamValue };

export class RequestUtils {
  /**
   * Mirrors Rails `mattr_accessor :perform_deep_munge, default: true`.
   * When true, `deepMunge` compacts `null` out of arrays. The toggle is
   * test-only escape hatch; production code should not flip it.
   */
  static performDeepMunge = true;

  /** Yields every string leaf in a parsed param tree. */
  static *eachParamValue(params: ParamValue): Generator<string> {
    if (Array.isArray(params)) {
      for (const el of params) yield* RequestUtils.eachParamValue(el);
    } else if (params !== null && typeof params === "object") {
      for (const val of Object.values(params)) yield* RequestUtils.eachParamValue(val);
    } else if (typeof params === "string") {
      yield params;
    }
  }

  /**
   * Returns a normalized copy of `params`. Plain hashes (null-proto or
   * Object.prototype) and arrays are rebuilt — hashes with a null
   * prototype, so attacker-controlled `__proto__` keys (e.g. from
   * `JSON.parse`) land as plain data rather than mutating the prototype
   * chain. Class instances (e.g. UploadedFile) pass through unchanged
   * to preserve their prototype and methods, matching Rails'
   * `normalize_encode_params`, which only walks Hash/Array. When
   * `performDeepMunge` is true (the Rails default), `null` entries are
   * additionally compacted out of arrays.
   *
   * Mirrors `Request::Utils.normalize_encode_params` — Rails' choice
   * between `NoNilParamEncoder` and `ParamEncoder` (HashWithIndifferent-
   * Access wrap omitted; TS object keys are already strings).
   */
  static normalizeEncodeParams(params: ParamValue): ParamValue {
    return normalize(params, this.performDeepMunge);
  }

  /**
   * Mirrors Rails `Request::Utils.check_param_encoding`.
   *
   * Walks the parsed param tree and raises on any string with an invalid
   * encoding. JS strings are UTF-16 and always well-formed, so this is a
   * no-op in trails — included for surface parity. The matching
   * callsites in request.ts (Rails invokes this before params munging)
   * are not yet ported; when they are, they should still route through
   * here so a future encoding-aware backend slots in cleanly.
   *
   * @internal
   */
  static checkParamEncoding(_params: ParamValue): void {
    // no-op: JS strings cannot carry invalid encoding the way Ruby strings can.
  }

  /**
   * Mirrors Rails `Request::Utils.set_binary_encoding`. In Rails this hands
   * params off to `CustomParamEncoder` so per-action template encodings
   * (`Encoding::ASCII_8BIT` etc.) can be applied. Trails has no equivalent
   * encoding mechanism, so this returns params unchanged.
   *
   * @internal
   */
  static setBinaryEncoding<P extends ParamValue>(
    _request: unknown,
    params: P,
    _controller: string | undefined,
    _action: string | undefined,
  ): P {
    return params;
  }

  /**
   * Standalone deep-munge: strip `null` from arrays at every depth.
   * Equivalent to Rails' `NoNilParamEncoder.handle_array` applied
   * recursively. Always normalizes (compaction is unconditional here).
   */
  static deepMunge(params: ParamValue): ParamValue {
    return normalize(params, true);
  }
}

function normalize(params: ParamValue, stripNil: boolean): ParamValue {
  if (Array.isArray(params)) {
    const mapped = params.map((el) => normalize(el, stripNil));
    return stripNil ? mapped.filter((el) => el !== null) : mapped;
  }
  if (params !== null && typeof params === "object") {
    // Rails normalize_encode_params only walks Hash/Array; class
    // instances (UploadedFile, etc.) pass through as opaque leaves so
    // their prototype + methods survive.
    const proto = Object.getPrototypeOf(params);
    if (proto !== null && proto !== Object.prototype) return params;
    // Null-prototype to (a) match parseNestedQuery's shape and (b) make
    // `__proto__` in an own key land as data instead of mutating the
    // prototype chain.
    const out: ParamHash = Object.create(null);
    for (const [k, v] of Object.entries(params)) out[k] = normalize(v, stripNil);
    return out;
  }
  return params;
}
