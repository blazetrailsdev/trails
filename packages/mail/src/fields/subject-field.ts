import { NamedUnstructuredField } from "./named-unstructured-field.js";
import { Mail } from "../mail.js";

export class SubjectField extends NamedUnstructuredField {
  static readonly NAME = "Subject";

  static override isSingular(): boolean {
    return true;
  }
}
Mail.SubjectField = SubjectField;
