import { NamedUnstructuredField } from "./named-unstructured-field.js";
import { Mail } from "../mail.js";

export class ContentDescriptionField extends NamedUnstructuredField {
  static readonly NAME = "Content-Description";

  static override isSingular(): boolean {
    return true;
  }
}
Mail.ContentDescriptionField = ContentDescriptionField;
