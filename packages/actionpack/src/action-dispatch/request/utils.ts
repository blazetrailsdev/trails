import { mattrAccessor } from "@blazetrails/activesupport";
import {
  bytes,
  compactBang,
  eachPair,
  eachValue,
  forceEncoding,
  Hash,
  hasKey,
  isValidEncoding,
  rbObjIsKindOf,
  scrub,
  toS,
} from "@blazetrails/ruby-compat";
import { InvalidParameterError } from "@blazetrails/rack";
import { ActionDispatch } from "../../namespaces.js";
import type { EncodingTemplate } from "../http/param-builder.js";
import { UploadedFile, type UploadedFileOptions } from "../http/upload.js";

export type ParamValue =
  | string
  | number
  | boolean
  | null
  | ParamValue[]
  | { [key: string]: ParamValue };
export type ParamHash = { [key: string]: ParamValue };
type ParamInput = ParamValue | Hash<string, ParamValue>;

export class ParamEncoder {
  static normalizeEncodeParams(params: ParamInput): ParamValue {
    if (Array.isArray(params)) {
      return this.handleArray(params);
    } else if (rbObjIsKindOf(params, Hash)) {
      if (hasKey(params as object, "tempfile")) {
        return new UploadedFile(params as UploadedFileOptions) as unknown as ParamValue;
      } else {
        const hwia: ParamHash = Object.create(null);
        eachPair(params as ParamHash, (key, val) => {
          hwia[key] = this.normalizeEncodeParams(val);
        });
        return hwia;
      }
    } else {
      return params as ParamValue;
    }
  }

  static handleArray(params: ParamValue[]): ParamValue[] {
    params.forEach((el, i) => {
      params[i] = this.normalizeEncodeParams(el);
    });
    return params;
  }
}

export class NoNilParamEncoder extends ParamEncoder {
  static override handleArray(params: ParamValue[]): ParamValue[] {
    const list = super.handleArray(params);
    compactBang(list);
    return list;
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
      const replaced = Utils.eachParamValue(value, (param) => {
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
      if (e instanceof ActionDispatch.MissingController) return null;
      throw e;
    }
  }
}

export class Utils {
  declare static performDeepMunge: boolean;
  declare performDeepMunge: boolean;

  static {
    mattrAccessor.call(this, "performDeepMunge", { default: true });
  }

  /** @inventedArm if — PERMANENT */
  static eachParamValue<P extends ParamInput>(
    params: P,
    block: (param: string) => string | void,
  ): P {
    if (Array.isArray(params)) {
      params.forEach((element, i) => {
        const replaced = Utils.eachParamValue(element, block);
        if (replaced === element) return;
        if (Object.isFrozen(params)) params = [...(params as ParamValue[])] as P;
        (params as ParamValue[])[i] = replaced;
      });
    } else if (params instanceof Hash) {
      for (const [key, value] of params.entries()) {
        const replaced = Utils.eachParamValue(value, block);
        if (replaced !== value) params.set(key, replaced);
      }
    } else if (params !== null && typeof params === "object") {
      for (const [key, value] of Object.entries(params)) {
        const replaced = Utils.eachParamValue(value, block);
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
    if (this.performDeepMunge) {
      return NoNilParamEncoder.normalizeEncodeParams(params);
    } else {
      return ParamEncoder.normalizeEncodeParams(params);
    }
  }

  static checkParamEncoding(params: ParamInput): void {
    if (Array.isArray(params)) {
      params.forEach((element) => Utils.checkParamEncoding(element));
    } else if (params !== null && typeof params === "object") {
      eachValue(params as ParamHash, (value) => Utils.checkParamEncoding(value));
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

  static ParamEncoder = ParamEncoder;
  static NoNilParamEncoder = NoNilParamEncoder;
  static CustomParamEncoder = CustomParamEncoder;
}
