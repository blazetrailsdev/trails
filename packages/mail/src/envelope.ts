import { EnvelopeFromElement } from "./elements/envelope-from-element.js";
import { NamedStructuredField } from "./fields/named-structured-field.js";

export class Envelope extends NamedStructuredField {
  static readonly NAME = "Envelope-From";

  override element(): EnvelopeFromElement {
    return (this._element ??= new EnvelopeFromElement(this.value as string)) as EnvelopeFromElement;
  }

  from(): unknown {
    return this.element().address;
  }

  date(): unknown {
    return this.element().dateTime;
  }
}
