import { constSet } from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

export class ParseOptions {
  static readonly STRICT = 0;
  static readonly RECOVER = 1 << 0;
  static readonly NONET = 1 << 11;
  static readonly BIG_LINES = 1 << 22;
  static readonly DEFAULT_XML = ParseOptions.RECOVER | ParseOptions.NONET | ParseOptions.BIG_LINES;

  options: number;

  constructor(options = ParseOptions.STRICT) {
    this.options = options;
  }

  isStrict(): boolean {
    return (this.options & ParseOptions.RECOVER) === ParseOptions.STRICT;
  }

  toI(): number {
    return this.options;
  }
}

constSet(XML, "ParseOptions", ParseOptions);
