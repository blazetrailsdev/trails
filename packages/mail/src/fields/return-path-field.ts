import type { Encoding } from "@blazetrails/ruby-compat";
import { CommonAddressField } from "./common-address-field.js";

export class ReturnPathField extends CommonAddressField {
  static readonly NAME = "Return-Path";

  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    if (value === "<>") {
      super(null, charset);
    } else {
      super(value, charset);
    }
  }

  override default(): unknown {
    return this.address();
  }

  /** @internal */
  override doEncode(): string {
    return `${this.name}: <${this.address() ?? ""}>\r\n`;
  }

  /** @internal */
  override doDecode(): unknown {
    return this.address();
  }
}
