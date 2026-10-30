import {
  b,
  chomp,
  eachSlice,
  encode,
  type Enumerator,
  Errno,
  isAsciiOnly,
  rbObjEncoding,
  RuntimeError,
  StandardError,
  stringSplit,
  toEnum,
} from "@blazetrails/ruby-compat";
import * as Constants from "./constants.js";
import type { QuotedPrintable } from "./encodings/quoted-printable.js";
import type { TransferEncoding } from "./encodings/transfer-encoding.js";
import { Utilities } from "./utilities.js";

export class UnknownEncodingType extends StandardError {}

const transferEncodings: Record<string, typeof TransferEncoding> = Object.create(null);

type RubyString = string | Uint8Array;

export const Encodings = {
  QuotedPrintable: null as typeof QuotedPrintable | null,

  register(name: string, cls: typeof TransferEncoding): void {
    transferEncodings[Encodings.getName(name)] = cls;
  },

  isDefined(name: string): boolean {
    return Encodings.getName(name) in transferEncodings;
  },

  getEncoding(name: string): typeof TransferEncoding | null {
    return transferEncodings[Encodings.getName(name)] ?? null;
  },

  getAll(): (typeof TransferEncoding)[] {
    return Object.values(transferEncodings);
  },

  getName(name: string): string {
    return Utilities.underscoreize(name).toLowerCase();
  },

  transcodeCharset(str: RubyString, fromCharset: string | null, toCharset = "UTF-8"): RubyString {
    if (fromCharset != null) {
      return Utilities.transcodeCharset(str, fromCharset, toCharset);
    } else {
      return str;
    }
  },

  paramEncode(str: string): string {
    if (isAsciiOnly(str) && Constants.TOKEN_UNSAFE.test(str)) {
      return `"${str}"`;
    } else if (isAsciiOnly(str)) {
      return str;
    } else {
      return Utilities.paramEncode(str);
    }
  },

  paramDecode(str: string, encoding: string | null): RubyString {
    return Utilities.paramDecode(str, encoding);
  },

  decodeEncode(str: string, outputType: string): string {
    if (outputType === "decode") {
      return Encodings.valueDecode(str);
    } else {
      if (isAsciiOnly(str)) {
        return str;
      } else {
        return Encodings.bValueEncode(str, rbObjEncoding(str).toString());
      }
    }
  },

  valueDecode(str: string): string {
    if (!Constants.ENCODED_VALUE.test(str)) return str;

    const lines = Encodings.collapseAdjacentEncodings(str);

    return lines
      .map((line) =>
        line.replace(new RegExp(Constants.ENCODED_VALUE, "gis"), (string, _1, $2: string) => {
          if (Constants.B_VALUES.includes($2)) return Encodings.bValueDecode(string) as string;
          if (Constants.Q_VALUES.includes($2)) return Encodings.qValueDecode(string) as string;
          return "";
        }),
      )
      .join("");
  },

  unquoteAndConvertTo(str: string, toEncoding: string | null): RubyString {
    const output = Encodings.valueDecode(str);

    if (
      "utf8" ===
      String(toEncoding ?? "")
        .toLowerCase()
        .replaceAll("-", "")
    ) {
      return output;
    } else if (toEncoding != null) {
      try {
        return encode(output, toEncoding);
      } catch (e) {
        if (!(e instanceof Errno.EINVAL)) throw e;
        return output;
      }
    } else {
      return output;
    }
  },

  addressEncode(address: unknown, charset: string | null = "utf-8"): string | null {
    if (Array.isArray(address)) {
      return address
        .filter((a) => a != null)
        .map((a) => Encodings.addressEncode(a, charset))
        .join(", ");
    } else if (address != null && address !== false) {
      return Encodings.encodeNonUsascii(address as string, charset);
    }
    return null;
  },

  /** @missingRailsArgs ascii_only? — PERMANENT */
  encodeNonUsascii(address: string, charset: string | null): string {
    if (isAsciiOnly(address) || charset == null) return address;

    address = address.replace(/("[^"]*[^/]")/g, (s) =>
      Encodings.bValueEncode(Utilities.unquote(s), charset),
    );

    const tokens = stringSplit(address, /\s/);

    return Utilities.mapWithIndex(tokens, (word: string, i) => {
      if (isAsciiOnly(word)) {
        return word;
      } else {
        const previousNonAscii = i > 0 && tokens[i - 1] != null && !isAsciiOnly(tokens[i - 1]);
        if (previousNonAscii) {
          word = ` ${word}`;
        }
        return Encodings.bValueEncode(word, charset);
      }
    }).join(" ");
  },

  bValueEncode(string: string, encoding: string | null = null): string {
    if (isAsciiOnly(String(string ?? ""))) {
      return string;
    } else {
      return [...(Encodings.eachBase64ChunkByterange(string, 60) as Enumerator<string>)]
        .map((chunk) => {
          const [str, chunkEncoding] = Utilities.bValueEncode(chunk, encoding);
          encoding = chunkEncoding;
          return `=?${encoding}?B?${chomp(str)}?=`;
        })
        .join(" ");
    }
  },

  qValueEncode(encodedStr: string, encoding: string | null = null): string {
    if (isAsciiOnly(String(encodedStr ?? ""))) return encodedStr;
    let string: string;
    [string, encoding] = Utilities.qValueEncode(encodedStr, encoding);
    string = string.replaceAll("=\r\n", "");
    return Utilities.mapLines(string, (str) => {
      return `=?${encoding}?Q?${chomp(str).replace(/ /g, "_")}?=`;
    }).join(" ");
  },

  /** @internal */
  bValueDecode(str: string): RubyString {
    return Utilities.bValueDecode(str);
  },

  /** @internal */
  qValueDecode(str: string): RubyString {
    return Utilities.qValueDecode(str);
  },

  /** @internal */
  valueEncodingFromString(str: string): string | null {
    return Constants.ENCODED_VALUE.exec(str)?.[1] ?? null;
  },

  /** @internal */
  collapseAdjacentEncodings(str: string): string[] {
    const results: string[] = [];

    let lastEncoded: string | null = null;

    const lines = stringSplit(str, Constants.FULL_ENCODED_VALUE);
    eachSlice(lines, 2, ([unencoded, encoded = null]: (string | null)[]) => {
      if ((lastEncoded = encoded) != null) {
        if (
          !Utilities.isBlank(unencoded) ||
          (lastEncoded == null && unencoded !== Constants.EMPTY)
        ) {
          results.push(unencoded!);
        }

        results.push(encoded!);
      } else {
        results.push(unencoded!);
      }
    });

    return results;
  },

  /** @internal */
  eachBase64ChunkByterange(
    str: string,
    maxBytesizePerBase64Chunk: number,
    block?: (chunk: string) => void,
  ): Enumerator<RubyString> | void {
    if (maxBytesizePerBase64Chunk % 4 !== 0) {
      throw new RuntimeError("size per chunk must be multiple of 4");
    }

    if (block != null) {
      const maxBytesize = Math.floor((3 * maxBytesizePerBase64Chunk) / 4.0);
      Encodings.eachChunkByterange(str, maxBytesize, block);
    } else {
      return toEnum(Encodings, "eachBase64ChunkByterange", str, maxBytesizePerBase64Chunk);
    }
  },

  /** @internal */
  eachChunkByterange(
    str: string,
    maxBytesizePerChunk: number,
    block?: (chunk: string) => void,
  ): Enumerator<RubyString> | void {
    if (block == null) {
      return toEnum(Encodings, "eachChunkByterange", str, maxBytesizePerChunk);
    }

    let offset = 0;
    let chunksize = 0;

    for (const chr of str) {
      const charsize = b(chr).length;

      if (chunksize + charsize > maxBytesizePerChunk) {
        block(Utilities.stringByteslice(str, offset, chunksize) as string);
        offset += chunksize;
        chunksize = charsize;
      } else {
        chunksize += charsize;
      }
    }

    block(Utilities.stringByteslice(str, offset, chunksize) as string);
  },
};
