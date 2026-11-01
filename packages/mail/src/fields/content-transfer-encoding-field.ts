import type { Encoding } from "@blazetrails/ruby-compat";
import { ContentTransferEncodingElement } from "../elements/content-transfer-encoding-element.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class ContentTransferEncodingField extends NamedStructuredField {
  static readonly NAME = "Content-Transfer-Encoding";

  static override isSingular(): boolean {
    return true;
  }

  static normalizeContentTransferEncoding(value: unknown): unknown {
    if (typeof value === "string" && /7-?bits?/i.test(value)) {
      return "7bit";
    } else if (typeof value === "string" && /8-?bits?/i.test(value)) {
      return "8bit";
    } else {
      return value;
    }
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    super(new.target.normalizeContentTransferEncoding(value), charset);
  }

  override element(): ContentTransferEncodingElement {
    return (this._element ??= new ContentTransferEncodingElement(
      this.value as string,
    )) as ContentTransferEncodingElement;
  }

  encoding(): string {
    return this.element().encoding;
  }

  /** @internal */
  doEncode(): string {
    return `${this.name}: ${this.encoding()}\r\n`;
  }

  /** @internal */
  doDecode(): string {
    return this.encoding();
  }
}
