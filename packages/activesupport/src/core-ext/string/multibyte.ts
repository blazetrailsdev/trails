import { Multibyte } from "../../multibyte.js";
import type { Chars } from "../../multibyte/chars.js";

export function mbChars(str: string): Chars {
  return new (Multibyte.proxyClass())(str);
}

export function isUtf8(str: string): boolean {
  return !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(str);
}
