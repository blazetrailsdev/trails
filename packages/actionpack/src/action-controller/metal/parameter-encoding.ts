import { Encoding, extended, Hash, rbModSingletonP, toS } from "@blazetrails/ruby-compat";
import type { EncodingTemplate } from "../../action-dispatch/http/param-builder.js";

export interface ParameterEncodingHost {
  _parameterEncodings: Hash<string, EncodingTemplate>;
}

const parameterEncodings = Symbol("_parameterEncodings");
type Stored = ParameterEncodingHost & { [parameterEncodings]?: Hash<string, EncodingTemplate> };

function inherited(this: ParameterEncodingHost, klass: { setupParamEncode(): void }): void {
  klass.setupParamEncode();
}

export const ParameterEncoding = {
  ClassMethods: {
    [extended](base: ParameterEncodingHost): void {
      Object.defineProperty(base, "_parameterEncodings", {
        configurable: true,
        get(this: Stored) {
          if (!Object.hasOwn(this, parameterEncodings) && !rbModSingletonP(this as never)) {
            inherited.call(Object.getPrototypeOf(this), this as never);
          }
          return this[parameterEncodings];
        },
        set(this: Stored, value: Hash<string, EncodingTemplate>) {
          this[parameterEncodings] = value;
        },
      });
    },

    /** @internal */
    setupParamEncode(this: ParameterEncodingHost): void {
      this._parameterEncodings = new Hash<string, EncodingTemplate>((h, k) => {
        const template: EncodingTemplate = new Hash();
        h.set(k, template);
        return template;
      });
    },

    /** @internal */
    actionEncodingTemplate(this: ParameterEncodingHost, action: unknown): EncodingTemplate | null {
      if (this._parameterEncodings.has(toS(action))) {
        return this._parameterEncodings.get(toS(action))!;
      }
      return null;
    },

    skipParameterEncoding(this: ParameterEncodingHost, action: unknown): void {
      this._parameterEncodings.set(toS(action), new Hash(() => Encoding.ASCII_8BIT));
    },

    paramEncoding(
      this: ParameterEncodingHost,
      action: unknown,
      param: unknown,
      encoding: Encoding | string,
    ): void {
      this._parameterEncodings.get(toS(action))!.set(toS(param), encoding);
    },
  },
};
