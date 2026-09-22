import { STRING_METHOD_TABLE } from "@blazetrails/ruby-compat";
import { Multibyte } from "../../multibyte.js";
import type { Chars } from "../../multibyte/chars.js";

export function mbChars(str: string): Chars {
  return new (Multibyte.proxyClass())(str);
}

export function isUtf8(str: string): boolean {
  return !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(str);
}

STRING_METHOD_TABLE.mbChars = (self) => mbChars(self.string);
STRING_METHOD_TABLE.isUtf8 = (self) => isUtf8(self.string);
