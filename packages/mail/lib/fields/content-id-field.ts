import type { Encoding } from "@blazetrails/ruby-compat";
import { MessageIdsElement } from "../elements/message-ids-element.js";
import { Mail } from "../mail.js";
import { Utilities } from "../utilities.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class ContentIdField extends NamedStructuredField {
  static readonly NAME = "Content-ID";

  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    if (Utilities.isBlank(value)) value = Utilities.generateMessageId();
    super(value, charset);
  }

  override element(): MessageIdsElement {
    return (this._element ??= new MessageIdsElement(this.value as string)) as MessageIdsElement;
  }

  contentId(): string | null {
    return this.element().messageId;
  }

  /** @internal */
  doDecode(): string {
    return `<${this.contentId()}>`;
  }

  /** @internal */
  doEncode(): string {
    return `${this.name}: ${this.doDecode()}\r\n`;
  }
}
Mail.ContentIdField = ContentIdField;
