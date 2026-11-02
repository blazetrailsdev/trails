import { NamedUnstructuredField } from "./named-unstructured-field.js";
import { Mail } from "../mail.js";

export class CommentsField extends NamedUnstructuredField {
  static readonly NAME = "Comments";
}
Mail.CommentsField = CommentsField;
