export type ParamValue =
  | string
  | number
  | boolean
  | null
  | ParamValue[]
  | { [key: string]: ParamValue };
export type ParamHash = { [key: string]: ParamValue };

export class RequestUtils {
  static performDeepMunge = true;

  static *eachParamValue(params: ParamValue): Generator<string> {
    if (Array.isArray(params)) {
      for (const el of params) yield* RequestUtils.eachParamValue(el);
    } else if (params !== null && typeof params === "object") {
      for (const val of Object.values(params)) yield* RequestUtils.eachParamValue(val);
    } else if (typeof params === "string") {
      yield params;
    }
  }

  static normalizeEncodeParams(params: ParamValue): ParamValue {
    return normalize(params, this.performDeepMunge);
  }

  /** @internal */
  static checkParamEncoding(_params: ParamValue): void {}

  /** @internal */
  static setBinaryEncoding<P extends ParamValue>(
    _request: unknown,
    params: P,
    _controller: string | undefined,
    _action: string | undefined,
  ): P {
    return params;
  }

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
    const proto = Object.getPrototypeOf(params);
    if (proto !== null && proto !== Object.prototype) return params;
    const out: ParamHash = Object.create(null);
    for (const [k, v] of Object.entries(params)) out[k] = normalize(v, stripNil);
    return out;
  }
  return params;
}
