import { rbObjAsString } from "@blazetrails/ruby-compat";
import { MessageIdsElement } from "../elements/message-ids-element.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class CommonMessageIdField extends NamedStructuredField {
  override element(): MessageIdsElement {
    return (this._element ??= new MessageIdsElement(this.value as string)) as MessageIdsElement;
  }

  messageId(): string | null {
    return this.element().messageId;
  }

  messageIds(): (string | null)[] {
    return this.element().messageIds;
  }

  override default(): unknown {
    const ids = this.messageIds();
    return ids.filter((x) => x != null).length === 1 ? (ids[0] ?? null) : ids;
  }

  override toString(): string {
    return rbObjAsString(this.decoded());
  }

  /** @internal */
  doEncode(): string {
    return `${this.name}: ${this.formattedMessageIds("\r\n ") ?? ""}\r\n`;
  }

  /** @internal */
  doDecode(): unknown {
    return this.formattedMessageIds();
  }

  /** @internal */
  protected formattedMessageIds(join = " "): string | null {
    const messageIds = this.messageIds();
    if (!messageIds.some((x) => x != null)) return null;
    return messageIds.map((m) => `<${m}>`).join(join);
  }
}
