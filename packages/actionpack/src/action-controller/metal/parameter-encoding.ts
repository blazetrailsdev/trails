import { Encoding, Hash, toS } from "@blazetrails/ruby-compat";
import type { EncodingTemplate } from "../../action-dispatch/http/param-builder.js";

export interface ParameterEncodingHost {
  _parameterEncodings: Hash<string, EncodingTemplate>;
}

export const ParameterEncoding = {
  ClassMethods: {
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
