import { ContentLocationElement } from "../elements/content-location-element.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class ContentLocationField extends NamedStructuredField {
  static readonly NAME = "Content-Location";

  static override isSingular(): boolean {
    return true;
  }

  override element(): ContentLocationElement {
    return (this._element ??= new ContentLocationElement(
      this.value as string,
    )) as ContentLocationElement;
  }

  location(): string | null {
    return this.element().location;
  }

  override encoded(): string {
    return `${this.name}: ${this.location()}\r\n`;
  }

  override decoded(): string | null {
    return this.location();
  }
}
