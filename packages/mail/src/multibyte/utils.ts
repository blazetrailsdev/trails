import { EncodingError, Multibyte } from "../multibyte.js";

export const Utils = {
  validCharacter(): RegExp | undefined {
    return Multibyte.VALID_CHARACTER["UTF-8"];
  },

  isUtf8(string: string): boolean {
    return Utils.verify(string);
  },

  verify(string: string): boolean {
    return !/\p{Cs}/u.test(string);
  },

  verifyBang(string: string): void {
    if (!Utils.verify(string)) throw new EncodingError("Found characters with invalid encoding");
  },

  clean(string: string): string {
    return string;
  },

  toUtf8(string: string): string {
    return string;
  },
};
