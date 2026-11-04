import { UnstructuredField } from "./unstructured-field.js";
import { Mail } from "../mail.js";

export class OptionalField extends UnstructuredField {
  /** @internal */
  override doEncode(): string {
    return `${this.wrappedValue()}\r\n`;
  }
}
Mail.OptionalField = OptionalField;
