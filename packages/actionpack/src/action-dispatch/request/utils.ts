import { MissingController } from "../http/request.js";
import type { EncodingTemplate } from "../http/param-builder.js";

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

export class CustomParamEncoder {
  static actionEncodingTemplate(
    request: { controllerClassFor(name: string): unknown },
    controller: string | null | undefined,
    action: string | null | undefined,
  ): EncodingTemplate | false | null | undefined {
    try {
      if (controller == null) return controller;
      return (
        !/\p{Cs}/u.test(controller) &&
        (
          request.controllerClassFor(controller) as {
            actionEncodingTemplate(action: string | null | undefined): EncodingTemplate | false;
          }
        ).actionEncodingTemplate(action)
      );
    } catch (e) {
      if (e instanceof MissingController) return null;
      throw e;
    }
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
