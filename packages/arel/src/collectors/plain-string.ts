import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Collectors } from "../namespaces.js";

export class PlainString {
  private str: string;

  constructor() {
    this.str = "";
  }

  get value(): string {
    return this.str;
  }

  append(str: string): this {
    this.str += str;
    return this;
  }
}

rbModConstSet(Collectors, "PlainString", PlainString);
