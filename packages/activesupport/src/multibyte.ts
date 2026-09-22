import { Chars } from "./multibyte/chars.js";

export namespace Multibyte {
  let _proxyClass: typeof Chars | null = null;

  export function setProxyClass(klass: typeof Chars): void {
    _proxyClass = klass;
  }

  export function proxyClass(): typeof Chars {
    return (_proxyClass ||= Chars);
  }
}
