import { UnstructuredField } from "./unstructured-field.js";

export class OptionalField extends UnstructuredField {
  /** @internal */
  override doEncode(): string {
    return `${this.wrappedValue()}\r\n`;
  }
}
