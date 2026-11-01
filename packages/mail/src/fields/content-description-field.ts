import { NamedUnstructuredField } from "./named-unstructured-field.js";

export class ContentDescriptionField extends NamedUnstructuredField {
  static readonly NAME = "Content-Description";

  static override isSingular(): boolean {
    return true;
  }
}
