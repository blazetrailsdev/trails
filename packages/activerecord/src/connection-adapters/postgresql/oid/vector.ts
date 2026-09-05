import { ValueType } from "@blazetrails/activemodel";

export class Vector extends ValueType<unknown> {
  readonly delim: string;
  readonly subtype: unknown;

  constructor(delim: string, subtype: unknown) {
    super();
    this.delim = delim;
    this.subtype = subtype;
  }

  cast(value: unknown): unknown {
    return value;
  }
}
