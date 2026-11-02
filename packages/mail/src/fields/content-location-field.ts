import { rbObjAsString } from "@blazetrails/ruby-compat";
import { ContentLocationElement } from "../elements/content-location-element.js";
import { NamedStructuredField } from "./named-structured-field.js";
import { Mail } from "../mail.js";

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
    return `${this.name}: ${rbObjAsString(this.location())}\r\n`;
  }

  override decoded(): string | null {
    return this.location();
  }
}
Mail.ContentLocationField = ContentLocationField;
