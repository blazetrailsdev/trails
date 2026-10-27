import { Scanner } from "./scanner.js";

export type Token = { node: string; pos: number; raw: string; [key: string]: unknown };

export interface TokenizerOptions {
  preserveComments?: boolean;
  preserveHacks?: boolean;
}

const hex = (str: string): number => parseInt(/^[0-9A-Fa-f]*/.exec(str)![0] || "0", 16);

export class Tokenizer {
  /* eslint-disable no-control-regex -- vendor/crass/v1.0.6/lib/crass/tokenizer.rb:11-48 matches these code points */
  static RE_COMMENT_CLOSE = /\*\//u;
  static RE_DIGIT = /[0-9]+/u;
  static RE_ESCAPE = /\\[^\n]/u;
  static RE_HEX = /[0-9A-Fa-f]{1,6}/u;
  static RE_NAME = /[0-9A-Za-z_\u0080-\u{10ffff}-]+/u;
  static RE_NAME_START = /[A-Za-z_\u0080-\u{10ffff}]+/u;
  static RE_NON_PRINTABLE = /[\u0000-\u0008\u000b\u000e-\u001f\u007f]+/u;
  static RE_NUMBER_DECIMAL = /\.[0-9]+/u;
  static RE_NUMBER_EXPONENT = /[Ee][+-]?[0-9]+/u;
  static RE_NUMBER_SIGN = /[+-]/u;
  static RE_NUMBER_STR =
    /^(?<sign>[+-]?)(?<integer>[0-9]*)(?:\.(?<fractional>[0-9]*))?(?:[Ee](?<exponent_sign>[+-]?)(?<exponent>[0-9]*))?$/u;
  static RE_QUOTED_URL_START = /^[\n\u0009 ]?["']/u;
  static RE_UNICODE_RANGE_START = /\+(?:[0-9A-Fa-f]|\?)/u;
  static RE_UNICODE_RANGE_END = /-[0-9A-Fa-f]/u;
  static RE_WHITESPACE = /[\n\u0009 ]+/u;
  static RE_WHITESPACE_ANCHORED = /^[\n\u0009 ]+$/u;
  /* eslint-enable no-control-regex */

  static tokenize(input: unknown, options: TokenizerOptions = {}): Token[] {
    return new Tokenizer(input, options).tokenize();
  }

  private _s: Scanner;
  private _options: TokenizerOptions;

  constructor(input: unknown, options: TokenizerOptions = {}) {
    this._s = new Scanner(this.preprocess(input));
    this._options = options;
  }

  consume(): Token | null {
    const T = Tokenizer;
    if (this._s.isEos()) return null;

    this._s.mark();

    const commentToken = this.consumeComments();
    if (commentToken) {
      if (this._options.preserveComments) {
        return commentToken;
      } else {
        return this.consume();
      }
    }

    if (this._s.scan(T.RE_WHITESPACE) !== null) return this.createToken("whitespace");

    const char = this._s.consume();

    switch (char) {
      case '"':
        return this.consumeString();
      case "#":
        if (T.RE_NAME.test(this._s.peek()) || this.isValidEscape(this._s.peek(2))) {
          return this.createToken("hash", {
            type: this.isStartIdentifier(this._s.peek(3)) ? "id" : "unrestricted",
            value: this.consumeName(),
          });
        } else {
          return this.createToken("delim", { value: char });
        }
      case "$":
        if (this._s.peek() === "=") {
          this._s.consume();
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
        if (this._s.peek() === "=") {
          this._s.consume();
          return this.createToken("substring_match");
        } else if (this._options.preserveHacks && T.RE_NAME_START.test(this._s.peek())) {
          this._s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { value: char });
        }
      case "+":
        if (this.isStartNumber()) {
          this._s.reconsume();
          return this.consumeNumeric();
        } else {
          return this.createToken("delim", { value: char });
        }
      case ",":
        return this.createToken("comma");
      case "-": {
        const nextTwoChars = this._s.peek(2);
        const nextThreeChars = char + nextTwoChars;

        if (this.isStartNumber(nextThreeChars)) {
          this._s.reconsume();
          return this.consumeNumeric();
        } else if (nextTwoChars === "->") {
          this._s.consume();
          this._s.consume();
          return this.createToken("cdc");
        } else if (this.isStartIdentifier(nextThreeChars)) {
          this._s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { value: char });
        }
      }
      case ".":
        if (this.isStartNumber()) {
          this._s.reconsume();
          return this.consumeNumeric();
        } else {
          return this.createToken("delim", { value: char });
        }
      case ":":
        return this.createToken("colon");
      case ";":
        return this.createToken("semicolon");
      case "<":
        if (this._s.peek(3) === "!--") {
          this._s.consume();
          this._s.consume();
          this._s.consume();
          return this.createToken("cdo");
        } else {
          return this.createToken("delim", { value: char });
        }
      case "@":
        if (this.isStartIdentifier(this._s.peek(3))) {
          return this.createToken("at_keyword", { value: this.consumeName() });
        } else {
          return this.createToken("delim", { value: char });
        }
      case "[":
        return this.createToken("[");
      case "\\":
        if (this.isValidEscape()) {
          this._s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { error: true, value: char });
        }
      case "]":
        return this.createToken("]");
      case "^":
        if (this._s.peek() === "=") {
          this._s.consume();
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
        if (T.RE_UNICODE_RANGE_START.test(this._s.peek(2))) {
          this._s.consume();
          return this.consumeUnicodeRange();
        } else {
          this._s.reconsume();
          return this.consumeIdent();
        }
      case "|":
        switch (this._s.peek()) {
          case "=":
            this._s.consume();
            return this.createToken("dash_match");
          case "|":
            this._s.consume();
            return this.createToken("column");
          default:
            return this.createToken("delim", { value: char });
        }
      case "~":
        if (this._s.peek() === "=") {
          this._s.consume();
          return this.createToken("include_match");
        } else {
          return this.createToken("delim", { value: char });
        }
      default:
        if (T.RE_DIGIT.test(char)) {
          this._s.reconsume();
          return this.consumeNumeric();
        } else if (T.RE_NAME_START.test(char)) {
          this._s.reconsume();
          return this.consumeIdent();
        } else {
          return this.createToken("delim", { value: char });
        }
    }
  }

  consumeBadUrl(): string {
    let text = "";

    while (!this._s.isEos()) {
      if (this.isValidEscape()) {
        text += this.consumeEscaped();
      } else if (this.isValidEscape(this._s.peek(2))) {
        this._s.consume();
        text += this.consumeEscaped();
      } else {
        const char = this._s.consume();

        if (char === ")") {
          break;
        } else {
          text += char;
        }
      }
    }

    return text;
  }

  consumeComments(): Token | null {
    if (this._s.peek(2) === "/*") {
      this._s.consume();
      this._s.consume();

      let text = this._s.scanUntil(Tokenizer.RE_COMMENT_CLOSE);
      if (text !== null) {
        text = text.slice(0, -2);
      } else {
        text = this._s.consumeRest();
      }

      return this.createToken("comment", { value: text });
    }

    return null;
  }

  consumeEscaped(): string {
    if (this._s.isEos()) return "�";

    const hexStr = this._s.scan(Tokenizer.RE_HEX);
    if (hexStr !== null) {
      if (Tokenizer.RE_WHITESPACE.test(this._s.peek())) this._s.consume();

      const codepoint = hex(hexStr);

      if (codepoint === 0 || (codepoint >= 0xd800 && codepoint <= 0xdfff) || codepoint > 0x10ffff) {
        return "�";
      } else {
        return String.fromCodePoint(codepoint);
      }
    }

    return this._s.consume();
  }

  consumeIdent(): Token {
    const value = this.consumeName();

    if (this._s.peek() === "(") {
      this._s.consume();

      if (value.toLowerCase() === "url") {
        while (Tokenizer.RE_WHITESPACE_ANCHORED.test(this._s.peek(2))) this._s.consume();

        if (Tokenizer.RE_QUOTED_URL_START.test(this._s.peek(2))) {
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

    while (!this._s.isEos()) {
      const match = this._s.scan(Tokenizer.RE_NAME);
      if (match !== null) {
        result += match;
        continue;
      }

      const char = this._s.consume();

      if (this.isValidEscape()) {
        result += this.consumeEscaped();
      } else if (char === "*" && this._options.preserveHacks) {
        result += this._s.consume();
      } else {
        this._s.reconsume();
        return result;
      }
    }

    return result;
  }

  consumeNumber(): [string, number, "integer" | "number"] {
    let repr = "";
    let type: "integer" | "number" = "integer";

    if (Tokenizer.RE_NUMBER_SIGN.test(this._s.peek())) repr += this._s.consume();
    repr += this._s.scan(Tokenizer.RE_DIGIT) ?? "";

    let match = this._s.scan(Tokenizer.RE_NUMBER_DECIMAL);
    if (match !== null) {
      repr += match;
      type = "number";
    }

    match = this._s.scan(Tokenizer.RE_NUMBER_EXPONENT);
    if (match !== null) {
      repr += match;
      type = "number";
    }

    return [repr, this.convertStringToNumber(repr), type];
  }

  consumeNumeric(): Token {
    const number = this.consumeNumber();
    const repr = number[0];
    let value = number[1];
    const type = number[2];

    if (type === "integer") {
      value = Math.trunc(value) + 0;
    }

    if (this.isStartIdentifier(this._s.peek(3))) {
      return this.createToken("dimension", { repr, type, unit: this.consumeName(), value });
    } else if (this._s.peek() === "%") {
      this._s.consume();
      return this.createToken("percentage", { repr, type, value });
    } else {
      return this.createToken("number", { repr, type, value });
    }
  }

  consumeString(ending: string | null = null): Token {
    if (ending === null) ending = this._s.current;
    let value = "";

    while (!this._s.isEos()) {
      const char = this._s.consume();
      if (char === ending) {
        break;
      } else if (char === "\n") {
        this._s.reconsume();
        return this.createToken("bad_string", { error: true, value });
      } else if (char === "\\") {
        switch (this._s.peek()) {
          case "":
            continue;
          case "\n":
            this._s.consume();
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

  consumeUnicodeRange(): Token {
    let value = this._s.scan(Tokenizer.RE_HEX) ?? "";

    while (value.length < 6) {
      if (this._s.peek() !== "?") break;
      value += this._s.consume();
    }

    const range: Record<string, number> = {};

    if (value.includes("?")) {
      range.start = hex(value.replaceAll("?", "0"));
      range.end = hex(value.replaceAll("?", "F"));
      return this.createToken("unicode_range", range);
    }

    range.start = hex(value);

    if (Tokenizer.RE_UNICODE_RANGE_END.test(this._s.peek(2))) {
      this._s.consume();
      range.end = hex(this._s.scan(Tokenizer.RE_HEX) ?? "");
    } else {
      range.end = range.start;
    }

    return this.createToken("unicode_range", range);
  }

  consumeUrl(): Token {
    let value = "";

    this._s.scan(Tokenizer.RE_WHITESPACE);

    while (!this._s.isEos()) {
      const char = this._s.consume();
      if (char === ")") {
        break;
      } else if (Tokenizer.RE_WHITESPACE.test(char)) {
        this._s.scan(Tokenizer.RE_WHITESPACE);

        if (this._s.isEos() || this._s.peek() === ")") {
          this._s.consume();
          break;
        } else {
          return this.createToken("bad_url", { value: value + this.consumeBadUrl() });
        }
      } else if (
        char === '"' ||
        char === "'" ||
        char === "(" ||
        Tokenizer.RE_NON_PRINTABLE.test(char)
      ) {
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
    const matches = Tokenizer.RE_NUMBER_STR.exec(str)!.groups!;

    const s = matches.sign === "-" ? -1 : 1;
    const i = parseInt(matches.integer || "0", 10);
    const f = parseInt(matches.fractional || "0", 10);
    const d = matches.fractional !== undefined ? matches.fractional.length : 0;
    const t = matches.exponent_sign === "-" ? -1 : 1;
    const e = parseInt(matches.exponent || "0", 10);

    let value = s * (i + f * 10 ** -d) * 10 ** (t * e);

    if (value > Number.MAX_VALUE) {
      value = Number.MAX_VALUE;
    } else if (value < -Number.MAX_VALUE) {
      value = -Number.MAX_VALUE;
    }

    return value;
  }

  createToken(type: string, properties: Record<string, unknown> = {}): Token {
    return Object.assign({ node: type, pos: this._s.marker, raw: this._s.marked() }, properties);
  }

  preprocess(input: unknown): string {
    let str = String(input ?? "").replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "\ufffd",
    );
    str = str.replace(/(?:\r\n|[\r\f])/g, "\n");
    str = str.replaceAll("\u0000", "�");
    return str;
  }

  isStartIdentifier(text: string | null = null): boolean {
    if (text === null) text = this._s.current + this._s.peek(2);

    const first = text[0];
    if (first === "-") {
      const nextChar = text[1];
      return (
        nextChar === "-" ||
        (nextChar !== undefined && Tokenizer.RE_NAME_START.test(nextChar)) ||
        this.isValidEscape(text.slice(1, 3))
      );
    } else if (first !== undefined && Tokenizer.RE_NAME_START.test(first)) {
      return true;
    } else if (first === "\\") {
      return this.isValidEscape(text.slice(0, 2));
    } else {
      return false;
    }
  }

  isStartNumber(text: string | null = null): boolean {
    if (text === null) text = this._s.current + this._s.peek(2);

    const digit = (c: string | undefined): boolean => c !== undefined && Tokenizer.RE_DIGIT.test(c);
    const first = text[0];
    if (first === "+" || first === "-") {
      return digit(text[1]) || (text[1] === "." && digit(text[2]));
    } else if (first === ".") {
      return digit(text[1]);
    } else {
      return digit(first);
    }
  }

  tokenize(): Token[] {
    this._s.reset();

    const tokens: Token[] = [];
    let token: Token | null;
    while ((token = this.consume())) {
      tokens.push(token);
    }

    return tokens;
  }

  isValidEscape(text: string | null = null): boolean {
    if (text === null) text = this._s.current + this._s.peek();
    return text[0] === "\\" && text[1] !== "\n";
  }
}
