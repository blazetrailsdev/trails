import { PhraseList } from "../elements/phrase-list.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class KeywordsField extends NamedStructuredField {
  static readonly NAME = "Keywords";

  override element(): PhraseList {
    return (this._element ??= new PhraseList(this.value as string)) as PhraseList;
  }

  keywords(): string[] {
    return this.element().phrases;
  }

  override default(): string[] {
    return this.keywords();
  }

  /** @internal */
  doDecode(): string {
    return this.keywords().join(", ");
  }

  /** @internal */
  doEncode(): string {
    return `${this.name}: ${this.keywords().join(",\r\n ")}\r\n`;
  }
}
