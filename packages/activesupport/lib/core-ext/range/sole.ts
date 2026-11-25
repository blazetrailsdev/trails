import { rbClearMethodCache } from "@blazetrails/ruby-compat/method-cache";
import { Range } from "@blazetrails/ruby-compat/range";

import { SoleItemExpectedError, sole as enumerableSole } from "../enumerable.js";

export function sole<T>(this: Range<T>): T {
  if (this.begin == null || this.end == null) {
    throw new SoleItemExpectedError(
      `infinite range '${this.inspect()}' cannot represent a sole item`,
    );
  }

  return enumerableSole(this);
}

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    sole(): T;
  }
}

Object.assign(Range.prototype, { sole });
rbClearMethodCache();
