import type { Encoding } from "@blazetrails/ruby-compat";
import { StructuredField } from "./structured-field.js";

export class NamedStructuredField extends StructuredField {
  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    super((new.target as unknown as { NAME: string }).NAME, value, charset);
  }
}
