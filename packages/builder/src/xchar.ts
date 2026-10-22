import { Encoding, encode as strEncode, rbObjEncoding, trTrans } from "@blazetrails/ruby-compat";

const CP1252: Record<number, number> = {
  128: 8364,
  130: 8218,
  131: 402,
  132: 8222,
  133: 8230,
  134: 8224,
  135: 8225,
  136: 710,
  137: 8240,
  138: 352,
  139: 8249,
  140: 338,
  142: 381,
  145: 8216,
  146: 8217,
  147: 8220,
  148: 8221,
  149: 8226,
  150: 8211,
  151: 8212,
  152: 732,
  153: 8482,
  154: 353,
  155: 8250,
  156: 339,
  158: 382,
  159: 376,
};

const PREDEFINED: Record<number, string> = {
  38: "&amp;",
  60: "&lt;",
  62: "&gt;",
};

const VALID: (number | [number, number])[] = [
  0x9,
  0xa,
  0xd,
  [0x20, 0xd7ff],
  [0xe000, 0xfffd],
  [0x10000, 0x10ffff],
];

const REPLACEMENT_CHAR = "�";

const CP1252_DIFFERENCES = String.fromCodePoint(...Object.keys(CP1252).map(Number));
const UNICODE_EQUIVALENT = String.fromCodePoint(...Object.values(CP1252));

const XML_PREDEFINED = new RegExp(
  "[" + String.fromCodePoint(...Object.keys(PREDEFINED).map(Number)) + "]",
  "gu",
);

const INVALID_XML_CHAR = new RegExp(
  "[^" +
    VALID.map((item) =>
      typeof item === "number"
        ? `\\u{${item.toString(16)}}`
        : `\\u{${item[0].toString(16)}}-\\u{${item[1].toString(16)}}`,
    ).join("") +
    "]",
  "gu",
);

const ENCODING_BINARY = Encoding.find("BINARY")!;
const ENCODING_UTF8 = Encoding.find("UTF-8")!;
const ENCODING_ISO1 = Encoding.find("ISO-8859-1")!;

function unicode(string: string | Uint8Array): string {
  if (rbObjEncoding(string) === ENCODING_BINARY) {
    const bytes = string as Uint8Array;
    if (bytes.every((b) => b < 0x80)) {
      return String.fromCharCode(...bytes);
    } else {
      try {
        return new TextDecoder(ENCODING_UTF8.name, { fatal: true }).decode(bytes);
      } catch {
        return new TextDecoder(ENCODING_ISO1.decoderLabel!).decode(bytes);
      }
    }
  } else if (rbObjEncoding(string) === ENCODING_UTF8) {
    return string as string;
  } else {
    return strEncode(string, ENCODING_UTF8) as string;
  }
}

function encode(string: string | Uint8Array): string {
  return trTrans(unicode(string), CP1252_DIFFERENCES, UNICODE_EQUIVALENT, false)
    .replace(INVALID_XML_CHAR, REPLACEMENT_CHAR)
    .replace(XML_PREDEFINED, (c) => PREDEFINED[c.codePointAt(0)!]);
}

export const XChar = {
  CP1252,
  PREDEFINED,
  VALID,
  REPLACEMENT_CHAR,
  CP1252_DIFFERENCES,
  UNICODE_EQUIVALENT,
  XML_PREDEFINED,
  INVALID_XML_CHAR,
  ENCODING_BINARY,
  ENCODING_UTF8,
  ENCODING_ISO1,
  unicode,
  encode,
};
