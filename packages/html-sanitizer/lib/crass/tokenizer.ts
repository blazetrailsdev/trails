import { TokenType, tokenize, type CSSToken } from "@csstools/css-tokenizer";

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

const SIMPLE_TOKENS: Partial<Record<TokenType, string>> = {
  [TokenType.Whitespace]: "whitespace",
  [TokenType.Colon]: "colon",
  [TokenType.Semicolon]: "semicolon",
  [TokenType.Comma]: "comma",
  [TokenType.CDO]: "cdo",
  [TokenType.CDC]: "cdc",
  [TokenType.OpenParen]: "(",
  [TokenType.CloseParen]: ")",
  [TokenType.OpenSquare]: "[",
  [TokenType.CloseSquare]: "]",
  [TokenType.OpenCurly]: "{",
  [TokenType.CloseCurly]: "}",
};

const VALUE_TOKENS: Partial<Record<TokenType, string>> = {
  [TokenType.Ident]: "ident",
  [TokenType.Function]: "function",
  [TokenType.AtKeyword]: "at_keyword",
  [TokenType.String]: "string",
  [TokenType.URL]: "url",
};

const MATCH_TOKENS: Record<string, string> = {
  "~=": "include_match",
  "|=": "dash_match",
  "^=": "prefix_match",
  "$=": "suffix_match",
  "*=": "substring_match",
  "||": "column",
};

const RE_HEX = /[0-9A-Fa-f]{1,6}/;
const RE_NON_PRINTABLE = /[\u0000-\u0008\u000b\u000e-\u001f\u007f]+/; // eslint-disable-line no-control-regex
const RE_WHITESPACE = /[\n\t ]+/;

const RE_NAME = /[0-9A-Za-z_\u0080-\u{10ffff}-]+/u;
const RE_NON_ASCII_START = /^[\u0080-\u{10ffff}]/u;

const RE_NUMBER = /^[+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?/;

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

  tokenize(): Node[] {
    const css = this.s.string;
    const tokens: Node[] = [];
    let lastEnd = -1;
    let offset = 0;
    let pos = 0;
    const charPos = (index: number): number => {
      for (; offset < index; offset++) {
        const code = css.charCodeAt(offset);
        if (code < 0xdc00 || code > 0xdfff) pos++;
      }
      return pos;
    };

    let start = 0;
    let afterName = false;
    restart: for (;;) {
      for (const token of tokenize({ css: css.slice(start), unicodeRangesAllowed: true })) {
        if (token[0] === TokenType.EOF) break restart;
        if (token[0] === TokenType.Comment && !this._options.preserveComments) continue;
        const tokenStart = token[2] + start;
        let created = this._convertToken(token, charPos(tokenStart));
        let end = token[3] + start + 1;
        const nonAscii = token[0] === TokenType.Delim && RE_NON_ASCII_START.test(token[1]);
        if (nonAscii) {
          while (this.s.pos < created.pos) this.s.consume();
          this.s.mark();
          let value = "";
          while (!this.s.isEos()) {
            const match = this.s.scan(RE_NAME);
            if (match !== null) {
              value += match;
              continue;
            }

            if (this.isValidEscape(this.s.peek(2))) {
              this.s.consume();
              value += this.consumeEscaped();
            } else if (this.s.peek() === "*" && this._options.preserveHacks) {
              this.s.consume();
              value += this.s.consume();
            } else {
              break;
            }
          }
          created = this.createToken("ident", { value });
          end = tokenStart + created.raw.length;
        }
        const adjacent = lastEnd === tokenStart;
        const merged: Node | null = adjacent
          ? this.mergeTokens(tokens.at(-1)!, created, afterName)
          : null;
        if (merged !== null) {
          tokens[tokens.length - 1] = merged;
        } else {
          tokens.push(created);
        }
        afterName = nonAscii || (afterName && adjacent && merged !== null);
        const last = tokens.at(-1)!;
        if (afterName && last.node === "ident" && css[end] === "(") {
          tokens[tokens.length - 1] = { ...last, node: "function", raw: `${last.raw}(` };
          end++;
          afterName = false;
        }
        lastEnd = end;
        if (nonAscii) {
          start = end;
          continue restart;
        }
      }
      break;
    }
    return tokens;
  }

  /** @noRailsEquivalent CONVERGEABLE crass-tokenizer-ports-consume */
  private _convertToken(token: CSSToken, pos: number): Node {
    const [type, raw] = token;
    const data = token[4] as Record<string, Node[string]> | undefined;
    const simple = SIMPLE_TOKENS[type];
    if (simple !== undefined) return { node: simple, pos, raw };
    const valued = VALUE_TOKENS[type];
    if (valued !== undefined) return { node: valued, pos, raw, value: data!.value };

    switch (type) {
      case TokenType.Comment:
        return {
          node: "comment",
          pos,
          raw,
          value: raw.slice(2, raw.endsWith("*/") ? -2 : undefined),
        };
      case TokenType.Delim:
        if (raw === "\\") return { node: "delim", pos, raw, error: true, value: data!.value };
        return { node: "delim", pos, raw, value: data!.value };
      case TokenType.Hash:
        return { node: "hash", pos, raw, type: data!.type, value: data!.value };
      case TokenType.BadString:
        return { node: "bad_string", pos, raw, error: true, value: raw.slice(1) };
      case TokenType.BadURL:
        while (this.s.pos < pos) this.s.consume();
        this.s.mark();
        this.s.scanUntil(/\(/);
        return this.consumeUrl();
      case TokenType.UnicodeRange:
        return {
          node: "unicode_range",
          pos,
          raw,
          start: data!.startOfRange,
          end: data!.endOfRange,
        };
      default: {
        const repr = RE_NUMBER.exec(raw)![0];
        const numType = /[.eE]/.test(repr) ? "number" : "integer";
        const value = numType === "integer" ? data!.value + 0 : data!.value;
        if (type === TokenType.Dimension) {
          return { node: "dimension", pos, raw, repr, type: numType, unit: data!.unit, value };
        }
        const node = type === TokenType.Percentage ? "percentage" : "number";
        return { node, pos, raw, repr, type: numType, value };
      }
    }
  }

  /** @noRailsEquivalent CONVERGEABLE crass-tokenizer-ports-consume */
  private mergeTokens(first: Node, second: Node, afterName: boolean): Node | null {
    const raw = first.raw + second.raw;
    const name = second.node === "ident" || (afterName && second.node === "function");
    if (name && (afterName || RE_NON_ASCII_START.test(second.raw))) {
      switch (first.node) {
        case "ident":
          return { ...second, pos: first.pos, raw, value: first.value + second.value };
        case "at_keyword":
        case "hash":
          if (second.node === "ident") return { ...first, raw, value: first.value + second.value };
          break;
        case "dimension":
          if (second.node === "ident") return { ...first, raw, unit: first.unit + second.value };
          break;
        case "number":
          return { ...first, node: "dimension", raw, unit: second.value };
        case "delim":
          if (first.value === "-")
            return { ...second, pos: first.pos, raw, value: `-${second.value}` };
          if (first.value === "@") return { ...second, node: "at_keyword", pos: first.pos, raw };
          if (first.value === "#") {
            return { ...second, node: "hash", pos: first.pos, raw, type: "id" };
          }
      }
    }
    if (first.node !== "delim") return null;
    const match = MATCH_TOKENS[first.value + (second.node === "delim" ? second.value : second.raw)];
    if (match !== undefined && (second.node === "delim" || second.raw === "=")) {
      return { node: match, pos: first.pos, raw: first.raw + second.raw };
    }
    if (
      this._options.preserveHacks &&
      first.value === "*" &&
      (second.node === "ident" || second.node === "function")
    ) {
      return { ...second, pos: first.pos, raw: `*${second.raw}` };
    }
    return null;
  }

  private consumeBadUrl(): string {
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

  private consumeEscaped(): string {
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

  private consumeUrl(): Node {
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

  private createToken(type: string, properties: Record<string, unknown> = {}): Node {
    return {
      node: type,
      pos: this.s.marker,
      raw: this.s.marked(),
      ...properties,
    };
  }

  private preprocess(input: string): string {
    return String(input)
      .replace(/\r\n|[\r\f]/g, "\n")
      .replaceAll("\0", "\ufffd");
  }

  private isValidEscape(text: string | null = null): boolean {
    if (text === null) text = (this.s.current ?? "") + this.s.peek();
    return text[0] === "\\" && text[1] !== "\n";
  }
}
