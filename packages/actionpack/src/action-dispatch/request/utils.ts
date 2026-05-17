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

export type ParamValue = string | null | ParamValue[] | { [key: string]: ParamValue };
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
      for (const el of params) yield* this.eachParamValue(el);
    } else if (params !== null && typeof params === "object") {
      for (const val of Object.values(params)) yield* this.eachParamValue(val);
    } else if (typeof params === "string") {
      yield params;
    }
  }

  /**
   * Returns a normalized version of `params`. When `performDeepMunge` is
   * true (the Rails default), the structure is recursively cloned with
   * `null` entries removed from arrays. When false, `params` is returned
   * as-is — Rails wraps with HashWithIndifferentAccess at this point,
   * which we don't need in TS.
   *
   * Mirrors `Request::Utils.normalize_encode_params`.
   */
  static normalizeEncodeParams(params: ParamValue): ParamValue {
    if (this.performDeepMunge) {
      return noNilNormalize(params);
    }
    return params;
  }

  /**
   * Standalone deep-munge: strip `null` from arrays at every depth.
   * Equivalent to Rails' `NoNilParamEncoder.handle_array` applied
   * recursively.
   */
  static deepMunge(params: ParamValue): ParamValue {
    return noNilNormalize(params);
  }
}

function noNilNormalize(params: ParamValue): ParamValue {
  if (Array.isArray(params)) {
    const mapped = params.map(noNilNormalize);
    return mapped.filter((el) => el !== null);
  }
  if (params !== null && typeof params === "object") {
    // Null-prototype to (a) match parseNestedQuery's shape and (b) make
    // `__proto__` in an own key land as data instead of mutating the
    // prototype chain.
    const out: ParamHash = Object.create(null);
    for (const [k, v] of Object.entries(params)) out[k] = noNilNormalize(v);
    return out;
  }
  return params;
}
