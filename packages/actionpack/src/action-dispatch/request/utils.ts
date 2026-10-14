import { mattrAccessor } from "@blazetrails/activesupport";
import {
  bytes,
  eachPair,
  eachValue,
  forceEncoding,
  Hash,
  isValidEncoding,
  scrub,
  toS,
} from "@blazetrails/ruby-compat";
import { InvalidParameterError } from "@blazetrails/rack";
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
type ParamInput = ParamValue | Hash<string, ParamValue>;

export class RequestUtils {
  declare static performDeepMunge: boolean;
  declare performDeepMunge: boolean;

  static {
    mattrAccessor.call(this, "performDeepMunge", { default: true });
  }

  static eachParamValue<P extends ParamInput>(
    params: P,
    block: (param: string) => string | void,
  ): P {
    if (Array.isArray(params)) {
      params.forEach((element, i) => {
        const replaced = RequestUtils.eachParamValue(element, block);
        if (replaced === element) return;
        if (Object.isFrozen(params)) params = [...(params as ParamValue[])] as P;
        (params as ParamValue[])[i] = replaced;
      });
    } else if (params instanceof Hash) {
      for (const [key, value] of params.entries()) {
        const replaced = RequestUtils.eachParamValue(value, block);
        if (replaced !== value) params.set(key, replaced);
      }
    } else if (params !== null && typeof params === "object") {
      for (const [key, value] of Object.entries(params)) {
        const replaced = RequestUtils.eachParamValue(value, block);
        if (replaced === value) continue;
        if (Object.isFrozen(params)) params = { ...(params as ParamHash) } as P;
        (params as ParamHash)[key] = replaced;
      }
    } else if (typeof params === "string") {
      return (block(params) ?? params) as P;
    }
    return params;
  }

  static normalizeEncodeParams(params: ParamInput): ParamValue {
    return normalize(params, this.performDeepMunge);
  }

  static checkParamEncoding(params: ParamInput): void {
    if (Array.isArray(params)) {
      params.forEach((element) => RequestUtils.checkParamEncoding(element));
    } else if (params !== null && typeof params === "object") {
      eachValue(params as ParamHash, (value) => RequestUtils.checkParamEncoding(value));
    } else if (typeof params === "string") {
      if (/\p{Cs}/u.test(params)) {
        throw new InvalidParameterError(`Invalid encoding for parameter: ${scrub(params)}`);
      }
    }
  }

  /** @internal */
  static setBinaryEncoding(
    request: { controllerClassFor(name: string): unknown },
    params: ParamHash,
    controller: string | undefined,
    action: string | undefined,
  ): ParamHash {
    return CustomParamEncoder.encode(request, params, controller, action);
  }

  static deepMunge(params: ParamValue): ParamValue {
    return normalize(params, true);
  }
}

export class CustomParamEncoder {
  static encodeForTemplate<P extends ParamHash | Hash<string, ParamValue>>(
    params: P,
    encodingTemplate: EncodingTemplate | false | null | undefined,
  ): P {
    if (!encodingTemplate) return params;
    for (const [key, value] of params instanceof Hash ? params.entries() : Object.entries(params)) {
      if (key === "controller" || key === "action") continue;
      const replaced = RequestUtils.eachParamValue(value, (param) => {
        if (encodingTemplate.get(toS(key))) {
          const b = bytes(param);
          const forced = b.map((byte) => String.fromCharCode(byte)).join("");
          if (!isValidEncoding(forced, encodingTemplate.get(toS(key))!)) {
            return b
              .map((byte) => String.fromCharCode(byte < 0x80 ? byte : 0xdc00 + byte))
              .join("");
          }
          return forceEncoding(forced, encodingTemplate.get(toS(key))!);
        }
      });
      if (replaced === value) continue;
      if (params instanceof Hash) {
        params.set(key, replaced);
        continue;
      }
      if (Object.isFrozen(params)) params = { ...params };
      (params as ParamHash)[key] = replaced;
    }
    return params;
  }

  static encode(
    request: { controllerClassFor(name: string): unknown },
    params: ParamHash,
    controller: string | undefined,
    action: string | undefined,
  ): ParamHash {
    const encodingTemplate = CustomParamEncoder.actionEncodingTemplate(request, controller, action);
    return CustomParamEncoder.encodeForTemplate(params, encodingTemplate);
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

function normalize(params: ParamInput, stripNil: boolean): ParamValue {
  if (Array.isArray(params)) {
    const mapped = params.map((el) => normalize(el, stripNil));
    return stripNil ? mapped.filter((el) => el !== null) : mapped;
  }
  if (params instanceof Hash) {
    const out: ParamHash = Object.create(null);
    eachPair(params, (k, v) => {
      out[k] = normalize(v, stripNil);
    });
    return out;
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
