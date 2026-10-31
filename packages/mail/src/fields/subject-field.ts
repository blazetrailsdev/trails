import { NamedUnstructuredField } from "./named-unstructured-field.js";

export class SubjectField extends NamedUnstructuredField {
  static readonly NAME = "Subject";

  static override isSingular(): boolean {
    return true;
  }
}
