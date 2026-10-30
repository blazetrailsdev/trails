import { StandardError } from "@blazetrails/ruby-compat";
import { Chars } from "./multibyte/chars.js";
import { Utils } from "./multibyte/utils.js";

export class EncodingError extends StandardError {
  static toString(): string {
    return "Mail::Multibyte::EncodingError";
  }
}

export const Multibyte = {
  EncodingError,

  proxyClass: Chars,

  mbChars(str: string): Chars | string {
    if (Multibyte.isUtf8(str)) {
      return new Multibyte.proxyClass(str);
    } else {
      return str;
    }
  },

  VALID_CHARACTER: {
    "UTF-8":
      // eslint-disable-next-line no-control-regex -- Kconv's UTF-8 byte table
      /^(?:[\x00-\x7f]|[\xc2-\xdf][\x80-\xbf]|\xe0[\xa0-\xbf][\x80-\xbf]|[\xe1-\xef][\x80-\xbf][\x80-\xbf]|\xf0[\x90-\xbf][\x80-\xbf][\x80-\xbf]|[\xf1-\xf3][\x80-\xbf][\x80-\xbf][\x80-\xbf]|\xf4[\x80-\x8f][\x80-\xbf][\x80-\xbf])$/,
    Shift_JIS:
      // eslint-disable-next-line no-control-regex -- quick Shift-JIS check
      /^(?:[\x00-\x7e\xa1-\xdf]|[\x81-\x9f\xe0-\xef][\x40-\x7e\x80-\x9e\x9f-\xfc])$/,
  } as Record<string, RegExp>,

  ...Utils,
};
