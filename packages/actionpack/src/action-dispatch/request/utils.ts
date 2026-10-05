import { bytes, forceEncoding, toS } from "@blazetrails/ruby-compat";
import { InvalidParameterError } from "../http/param-error.js";
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

  static eachParamValue(params: ParamValue, block: (param: string) => string | void): ParamValue {
    if (Array.isArray(params)) {
      params.forEach((element, i) => (params[i] = RequestUtils.eachParamValue(element, block)));
    } else if (params !== null && typeof params === "object") {
      for (const [key, value] of Object.entries(params)) {
        params[key] = RequestUtils.eachParamValue(value, block);
      }
    } else if (typeof params === "string") {
      return block(params) ?? params;
    }
    return params;
  }

  static normalizeEncodeParams(params: ParamValue): ParamValue {
    return normalize(params, this.performDeepMunge);
  }

  static checkParamEncoding(params: ParamValue): void {
    if (Array.isArray(params)) {
      params.forEach((element) => RequestUtils.checkParamEncoding(element));
    } else if (params !== null && typeof params === "object") {
      Object.values(params).forEach((value) => RequestUtils.checkParamEncoding(value));
    } else if (typeof params === "string") {
      if (/\p{Cs}/u.test(params)) {
        throw new InvalidParameterError(
          `Invalid encoding for parameter: ${params.replace(/\p{Cs}/gu, "\uFFFD")}`,
        );
      }
    }
  }

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
  static encodeForTemplate(
    params: ParamHash,
    encodingTemplate: EncodingTemplate | false | null | undefined,
  ): ParamHash {
    if (!encodingTemplate) return params;
    for (const [key, value] of Object.entries(params)) {
      if (key === "controller" || key === "action") continue;
      params[key] = RequestUtils.eachParamValue(value, (param) => {
        if (encodingTemplate.get(toS(key))) {
          const b = bytes(param).map((byte) => String.fromCharCode(byte));
          return forceEncoding(b.join(""), encodingTemplate.get(toS(key))!);
        }
      });
    }
    return params;
  }

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
            actionEncodingTemplate(
              action: string | null | undefined,
            ): EncodingTemplate | false | null;
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
