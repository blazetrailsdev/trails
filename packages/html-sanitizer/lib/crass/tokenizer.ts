import { Scanner } from "./scanner.js";

export interface Node {
  node: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface TokenizerOptions {
  preserveComments?: boolean;
  preserveHacks?: boolean;
}

const RE_COMMENT_CLOSE = /\*\//;
const RE_DIGIT = /[0-9]+/;
const RE_HEX = /[0-9A-Fa-f]{1,6}/;
const RE_NAME = /[0-9A-Za-z_\u0080-\u{10ffff}-]+/u;
const RE_NAME_START = /[A-Za-z_\u0080-\u{10ffff}]+/u;
const RE_NON_PRINTABLE = /[\u0000-\u0008\u000b\u000e-\u001f\u007f]+/; // eslint-disable-line no-control-regex
const RE_NUMBER_DECIMAL = /\.[0-9]+/;
const RE_NUMBER_EXPONENT = /[Ee][+-]?[0-9]+/;
const RE_NUMBER_SIGN = /[+-]/;

const RE_NUMBER_STR =
  /^(?<sign>[+-]?)(?<integer>[0-9]*)(?:\.(?<fractional>[0-9]*))?(?:[Ee](?<exponentSign>[+-]?)(?<exponent>[0-9]*))?$/;

const RE_QUOTED_URL_START = /^[\n\t ]?["']/;
const RE_UNICODE_RANGE_START = /\+(?:[0-9A-Fa-f]|\?)/;
const RE_UNICODE_RANGE_END = /-[0-9A-Fa-f]/;
const RE_WHITESPACE = /[\n\t ]+/;
const RE_WHITESPACE_ANCHORED = /^[\n\t ]+$/;

export class Tokenizer {
  static tokenize(input: string, options: TokenizerOptions = {}): Node[] {
    return new Tokenizer(input, options).tokenize();
  }

  private s: Scanner;
  private _options: TokenizerOptions;

  constructor(input: string, options: TokenizerOptions = {}) {
    this.s = new Scanner(this.preprocess(input));
    this._options = options;
  }

  consume(): Node | null {
    if (this.s.isEos()) return null;

    this.s.mark();

    const commentToken = this.consumeComments();
    if (commentToken !== null) {
      if (this._options.preserveComments) {
        return commentToken;
      } else {
        return this.consume();
      }
    }

    if (this.s.scan(RE_WHITESPACE) !== null) return this.createToken("whitespace");

    const char = this.s.consume();

    switch (char) {
      case '"':
        return this.consumeString();

      case "#":
        if (RE_NAME.test(this.s.peek()) || this.isValidEscape(this.s.peek(2))) {
          return this.createToken("hash", {
            type: this.isStartIdentifier(this.s.peek(3)) ? "id" : "unrestricted",
            value: this.consumeName(),
          });
        } else {
          return this.createToken("delim", { value: char });
        }

      case "$":
        if (this.s.peek() === "=") {
          this.s.consume();
          return this.createToken("suffix_match");
        } else {
          return this.createToken("delim", { value: char });
        }

      case "'":
        return this.consumeString();

      case "(":
        return this.createToken("(");

      case ")":
        return this.createToken(")");

      case "*":
        if (this.s.peek() === "=") {
          this.s.consume();
          return this.createToken("substring_match");
        } else if (this._options.preserveHacks && RE_NAME_START.test(this.s.peek())) {
          this.s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { value: char });
        }

      case "+":
        if (this.isStartNumber()) {
          this.s.reconsume();
          return this.consumeNumeric();
        } else {
          return this.createToken("delim", { value: char });
        }

      case ",":
        return this.createToken("comma");

      case "-": {
        const nextTwoChars = this.s.peek(2);
        const nextThreeChars = char + nextTwoChars;

        if (this.isStartNumber(nextThreeChars)) {
          this.s.reconsume();
          return this.consumeNumeric();
        } else if (nextTwoChars === "->") {
          this.s.consume();
          this.s.consume();
          return this.createToken("cdc");
        } else if (this.isStartIdentifier(nextThreeChars)) {
          this.s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { value: char });
        }
      }

      case ".":
        if (this.isStartNumber()) {
          this.s.reconsume();
          return this.consumeNumeric();
        } else {
          return this.createToken("delim", { value: char });
        }

      case ":":
        return this.createToken("colon");

      case ";":
        return this.createToken("semicolon");

      case "<":
        if (this.s.peek(3) === "!--") {
          this.s.consume();
          this.s.consume();
          this.s.consume();

          return this.createToken("cdo");
        } else {
          return this.createToken("delim", { value: char });
        }

      case "@":
        if (this.isStartIdentifier(this.s.peek(3))) {
          return this.createToken("at_keyword", { value: this.consumeName() });
        } else {
          return this.createToken("delim", { value: char });
        }

      case "[":
        return this.createToken("[");

      case "\\":
        if (this.isValidEscape()) {
          this.s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { error: true, value: char });
        }

      case "]":
        return this.createToken("]");

      case "^":
        if (this.s.peek() === "=") {
          this.s.consume();
          return this.createToken("prefix_match");
        } else {
          return this.createToken("delim", { value: char });
        }

      case "{":
        return this.createToken("{");

      case "}":
        return this.createToken("}");

      case "U":
      case "u":
        if (RE_UNICODE_RANGE_START.test(this.s.peek(2))) {
          this.s.consume();
          return this.consumeUnicodeRange();
        } else {
          this.s.reconsume();
          return this.consumeIdent();
        }

      case "|":
        switch (this.s.peek()) {
          case "=":
            this.s.consume();
            return this.createToken("dash_match");

          case "|":
            this.s.consume();
            return this.createToken("column");

          default:
            return this.createToken("delim", { value: char });
        }

      case "~":
        if (this.s.peek() === "=") {
          this.s.consume();
          return this.createToken("include_match");
        } else {
          return this.createToken("delim", { value: char });
        }

      default:
        if (RE_DIGIT.test(char)) {
          this.s.reconsume();
          return this.consumeNumeric();
        } else if (RE_NAME_START.test(char)) {
          this.s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { value: char });
        }
    }
  }

  consumeBadUrl(): string {
    let text = "";

    while (!this.s.isEos()) {
      if (this.isValidEscape()) {
        text += this.consumeEscaped();
      } else if (this.isValidEscape(this.s.peek(2))) {
        this.s.consume();
        text += this.consumeEscaped();
      } else {
        const char = this.s.consume();

        if (char === ")") {
          break;
        } else {
          text += char;
        }
      }
    }

    return text;
  }

  consumeComments(): Node | null {
    if (this.s.peek(2) === "/*") {
      this.s.consume();
      this.s.consume();

      let text = this.s.scanUntil(RE_COMMENT_CLOSE);
      if (text !== null) {
        text = text.slice(0, -2);
      } else {
        text = this.s.consumeRest();
      }

      return this.createToken("comment", { value: text });
    }

    return null;
  }

  consumeEscaped(): string {
    if (this.s.isEos()) return "\ufffd";

    const hexStr = this.s.scan(RE_HEX);
    if (hexStr != null) {
      if (RE_WHITESPACE.test(this.s.peek())) this.s.consume();

      const codepoint = parseInt(hexStr, 16);

      if (codepoint === 0 || (codepoint >= 0xd800 && codepoint <= 0xdfff) || codepoint > 0x10ffff) {
        return "\ufffd";
      } else {
        return String.fromCodePoint(codepoint);
      }
    }

    return this.s.consume();
  }

  consumeIdent(): Node {
    const value = this.consumeName();

    if (this.s.peek() === "(") {
      this.s.consume();

      if (value.toLowerCase() === "url") {
        while (RE_WHITESPACE_ANCHORED.test(this.s.peek(2))) this.s.consume();

        if (RE_QUOTED_URL_START.test(this.s.peek(2))) {
          return this.createToken("function", { value });
        } else {
          return this.consumeUrl();
        }
      } else {
        return this.createToken("function", { value });
      }
    } else {
      return this.createToken("ident", { value });
    }
  }

  consumeName(): string {
    let result = "";

    while (!this.s.isEos()) {
      const match = this.s.scan(RE_NAME);
      if (match !== null) {
        result += match;
        continue;
      }

      const char = this.s.consume();

      if (this.isValidEscape()) {
        result += this.consumeEscaped();
      } else if (char === "*" && this._options.preserveHacks) {
        result += this.s.consume();
      } else {
        this.s.reconsume();
        return result;
      }
    }

    return result;
  }

  consumeNumber(): [string, number, string] {
    let repr = "";
    let type = "integer";

    if (RE_NUMBER_SIGN.test(this.s.peek())) repr += this.s.consume();
    repr += this.s.scan(RE_DIGIT) ?? "";

    let match = this.s.scan(RE_NUMBER_DECIMAL);
    if (match !== null) {
      repr += match;
      type = "number";
    }

    match = this.s.scan(RE_NUMBER_EXPONENT);
    if (match !== null) {
      repr += match;
      type = "number";
    }

    return [repr, this.convertStringToNumber(repr), type];
  }

  consumeNumeric(): Node {
    const number = this.consumeNumber();
    const repr = number[0];
    let value = number[1];
    const type = number[2];

    if (type === "integer") {
      value = Math.trunc(value) + 0;
    }

    if (this.isStartIdentifier(this.s.peek(3))) {
      return this.createToken("dimension", { repr, type, unit: this.consumeName(), value });
    } else if (this.s.peek() === "%") {
      this.s.consume();

      return this.createToken("percentage", { repr, type, value });
    } else {
      return this.createToken("number", { repr, type, value });
    }
  }

  consumeString(ending: string | null = null): Node {
    if (ending === null) ending = this.s.current;
    let value = "";

    while (!this.s.isEos()) {
      const char = this.s.consume();
      if (char === ending) {
        break;
      } else if (char === "\n") {
        this.s.reconsume();
        return this.createToken("bad_string", { error: true, value });
      } else if (char === "\\") {
        switch (this.s.peek()) {
          case "":
            continue;

          case "\n":
            this.s.consume();
            break;

          default:
            value += this.consumeEscaped();
        }
      } else {
        value += char;
      }
    }

    return this.createToken("string", { value });
  }

  consumeUnicodeRange(): Node {
    let value = this.s.scan(RE_HEX) ?? "";

    while (value.length < 6) {
      if (this.s.peek() !== "?") break;
      value += this.s.consume();
    }

    const range: { start?: number; end?: number } = {};

    if (value.includes("?")) {
      range.start = parseInt(value.replaceAll("?", "0"), 16);
      range.end = parseInt(value.replaceAll("?", "F"), 16);
      return this.createToken("unicode_range", range);
    }

    range.start = parseInt(value, 16);

    if (RE_UNICODE_RANGE_END.test(this.s.peek(2))) {
      this.s.consume();
      range.end = parseInt(this.s.scan(RE_HEX) ?? "", 16);
    } else {
      range.end = range.start;
    }

    return this.createToken("unicode_range", range);
  }

  consumeUrl(): Node {
    let value = "";

    this.s.scan(RE_WHITESPACE);

    while (!this.s.isEos()) {
      const char = this.s.consume();

      if (char === ")") {
        break;
      } else if (RE_WHITESPACE.test(char)) {
        this.s.scan(RE_WHITESPACE);

        if (this.s.isEos() || this.s.peek() === ")") {
          this.s.consume();
          break;
        } else {
          return this.createToken("bad_url", { value: value + this.consumeBadUrl() });
        }
      } else if (char === '"' || char === "'" || char === "(" || RE_NON_PRINTABLE.test(char)) {
        return this.createToken("bad_url", { error: true, value: value + this.consumeBadUrl() });
      } else if (char === "\\") {
        if (this.isValidEscape()) {
          value += this.consumeEscaped();
        } else {
          return this.createToken("bad_url", { error: true, value: value + this.consumeBadUrl() });
        }
      } else {
        value += char;
      }
    }

    return this.createToken("url", { value });
  }

  convertStringToNumber(str: string): number {
    const matches = RE_NUMBER_STR.exec(str)!.groups!;

    const s = matches.sign === "-" ? -1 : 1;
    const d = matches.fractional !== undefined ? matches.fractional.length : 0;
    const t = matches.exponentSign === "-" ? -1 : 1;
    const e = parseInt(matches.exponent || "0", 10);

    let value = s * Number(`${matches.integer}${matches.fractional ?? ""}e${t * e - d}`);

    if (value > Number.MAX_VALUE) {
      value = Number.MAX_VALUE;
    } else if (value < -Number.MAX_VALUE) {
      value = -Number.MAX_VALUE;
    }

    return value;
  }

  createToken(type: string, properties: Record<string, unknown> = {}): Node {
    return {
      node: type,
      pos: this.s.marker,
      raw: this.s.marked(),
      ...properties,
    };
  }

  preprocess(input: string): string {
    return String(input)
      .replace(/\r\n|[\r\f]/g, "\n")
      .replaceAll("\0", "\ufffd");
  }

  isStartIdentifier(text: string | null = null): boolean {
    if (text === null) text = (this.s.current ?? "") + this.s.peek(2);

    switch (text[0]) {
      case "-": {
        const nextChar = text[1] ?? "";
        return (
          nextChar === "-" || RE_NAME_START.test(nextChar) || this.isValidEscape(text.slice(1, 3))
        );
      }

      case "\\":
        return this.isValidEscape(text.slice(0, 2));

      default:
        return RE_NAME_START.test(text[0] ?? "");
    }
  }

  isStartNumber(text: string | null = null): boolean {
    if (text === null) text = (this.s.current ?? "") + this.s.peek(2);

    switch (text[0]) {
      case "+":
      case "-":
        return RE_DIGIT.test(text[1] ?? "") || (text[1] === "." && RE_DIGIT.test(text[2] ?? ""));

      case ".":
        return RE_DIGIT.test(text[1] ?? "");

      default:
        return RE_DIGIT.test(text[0] ?? "");
    }
  }

  tokenize(): Node[] {
    this.s.reset();

    const tokens: Node[] = [];

    let token: Node | null;
    while ((token = this.consume()) !== null) {
      tokens.push(token);
    }

    return tokens;
  }

  isValidEscape(text: string | null = null): boolean {
    if (text === null) text = (this.s.current ?? "") + this.s.peek();
    return text[0] === "\\" && text[1] !== "\n";
  }
}
