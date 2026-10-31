import {
  Encoding,
  forceEncoding,
  isAsciiOnly,
  isValidEncoding,
  pack,
  rbObjAsString,
  rbObjDup,
  rbObjEncoding,
  stringSplit,
} from "@blazetrails/ruby-compat";
import * as Constants from "../constants.js";
import { Encodings } from "../encodings.js";
import { Utilities } from "../utilities.js";
import { CommonField } from "./common-field.js";

export class UnstructuredField extends CommonField {
  constructor(name: unknown, value: unknown, charset: string | Encoding | null = null) {
    if (Array.isArray(value)) {
      value = value.join(", ");
    } else if (value instanceof Uint8Array && rbObjEncoding(value) === Encoding.ASCII_8BIT) {
      const utf8 = forceEncoding(rbObjDup(value), Encoding.UTF_8);
      if (isValidEncoding(utf8 as never, Encoding.UTF_8)) value = utf8;
    }

    if (charset == null && (typeof value === "string" || value instanceof Uint8Array)) {
      charset = rbObjEncoding(value);
    }

    super(name, rbObjAsString(value), charset);
  }

  override parse(): this {
    return this;
  }

  /** @internal */
  doEncode(): string {
    if (this.value && this.value.length !== 0) {
      return `${this.wrappedValue()}\r\n`;
    } else {
      return "";
    }
  }

  /** @internal */
  doDecode(): unknown {
    return Utilities.isBlank(this.value)
      ? null
      : Encodings.decodeEncode(this.value as string, "decode");
  }

  /** @internal */
  protected wrappedValue(): string {
    return this.wrapLines(this.name, this.fold(`${this.name}: `.length));
  }

  /** @internal */
  protected wrapLines(name: unknown, foldedLines: string[]): string {
    const result = [`${name}: ${foldedLines.shift() ?? ""}`];
    result.push(...foldedLines);
    return result.join("\r\n ");
  }

  /** @internal */
  protected fold(prepend = 0): string[] {
    const encoding = this.normalizedEncoding();
    const decodedString = rbObjAsString(this.decoded());
    const shouldEncode = !isAsciiOnly(decodedString);
    let words: string[];
    if (shouldEncode) {
      let first = true;
      words = stringSplit(decodedString, /[ \t]/).flatMap((word) => {
        if (first) {
          first = !first;
        } else {
          word = ` ${word}`;
        }
        if (!isAsciiOnly(word)) {
          return word;
        } else {
          return word.match(/[^\n]{7}|[^\n]+$/g) ?? [];
        }
      });
    } else {
      words = stringSplit(decodedString, /[ \t]/);
    }

    const foldedLines: string[] = [];
    while (words.length !== 0) {
      let limit = 78 - prepend;
      if (shouldEncode) limit = limit - 7 - encoding.length;
      let line = "";
      let firstWord = true;
      while (words.length !== 0) {
        let word = words[0] as string | Uint8Array;

        if (this.charset != null) {
          word = Encodings.transcodeCharset(word, String(rbObjEncoding(word)), this.charset);
        }

        if (shouldEncode) word = this.encode(word);
        if (word instanceof Uint8Array) word = String.fromCharCode(...word);
        word = this.encodeCrlf(word);
        if (line.length !== 0 && line.length + word.length + 1 > limit) break;
        words.shift();
        if (firstWord) {
          firstWord = false;
        } else {
          if (!shouldEncode) line += " ";
        }

        line += word;
      }
      if (shouldEncode) line = `=?${encoding}?Q?${line}?=`;
      foldedLines.push(line);
      prepend = 0;
    }
    return foldedLines;
  }

  /** @internal */
  protected encode(value: string | Uint8Array): string {
    return pack([value], Constants.CAPITAL_M)
      .replaceAll(Constants.EQUAL_LF, Constants.EMPTY)
      .replace(/"/g, "=22")
      .replace(/\(/g, "=28")
      .replace(/\)/g, "=29")
      .replace(/\?/g, "=3F")
      .replace(/_/g, "=5F")
      .replace(/ /g, "_");
  }

  /** @internal */
  protected encodeCrlf(value: string): string {
    return value
      .replaceAll(Constants.CR, Constants.CR_ENCODED)
      .replaceAll(Constants.LF, Constants.LF_ENCODED);
  }

  /** @internal */
  protected normalizedEncoding(): string {
    return String(this.charset).toUpperCase().replace(/_/g, "-");
  }
}
