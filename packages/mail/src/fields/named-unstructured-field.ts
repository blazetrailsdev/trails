import type { Encoding } from "@blazetrails/ruby-compat";
import { UnstructuredField } from "./unstructured-field.js";

export class NamedUnstructuredField extends UnstructuredField {
  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    super((new.target as unknown as { NAME: string }).NAME, value, charset);
  }
}
