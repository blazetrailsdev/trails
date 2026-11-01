import { rbStrToI, type Encoding } from "@blazetrails/ruby-compat";
import { MimeVersionElement } from "../elements/mime-version-element.js";
import { Utilities } from "../utilities.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class MimeVersionField extends NamedStructuredField {
  static readonly NAME = "Mime-Version";

  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    if (Utilities.isBlank(value)) value = "1.0";
    super(value, charset);
  }

  override element(): MimeVersionElement {
    return (this._element ??= new MimeVersionElement(this.value as string)) as MimeVersionElement;
  }

  version(): string {
    return `${this.element().major}.${this.element().minor}`;
  }

  major(): number {
    return rbStrToI(this.element().major) as number;
  }

  minor(): number {
    return rbStrToI(this.element().minor) as number;
  }

  override encoded(): string {
    return `${this.name}: ${this.version()}\r\n`;
  }

  override decoded(): string {
    return this.version();
  }
}
