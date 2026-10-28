import { TokenType, tokenize, type CSSToken } from "@csstools/css-tokenizer";

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
  [TokenType.Delim]: "delim",
};

const MATCH_TOKENS: Record<string, string> = {
  "~=": "include_match",
  "|=": "dash_match",
  "^=": "prefix_match",
  "$=": "suffix_match",
  "*=": "substring_match",
  "||": "column",
};

const RE_NUMBER = /^[+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?/;

export class Tokenizer {
  static tokenize(input: string, options: TokenizerOptions = {}): Node[] {
    return new Tokenizer(input, options).tokenize();
  }

  private _input: string;
  private _options: TokenizerOptions;

  constructor(input: string, options: TokenizerOptions = {}) {
    this._input = this.preprocess(input);
    this._options = options;
  }

  tokenize(): Node[] {
    const css = this._input;
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

    for (const token of tokenize({ css, unicodeRangesAllowed: true })) {
      if (token[0] === TokenType.EOF) break;
      if (token[0] === TokenType.Comment && !this._options.preserveComments) continue;
      const created = this.createToken(token, charPos(token[2]));
      const merged = lastEnd === token[2] ? this.mergeTokens(tokens.at(-1)!, created) : null;
      if (merged !== null) {
        tokens[tokens.length - 1] = merged;
      } else {
        tokens.push(created);
      }
      lastEnd = token[3] + 1;
    }
    return tokens;
  }

  private createToken(token: CSSToken, pos: number): Node {
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
      case TokenType.Hash:
        return { node: "hash", pos, raw, type: data!.type, value: data!.value };
      case TokenType.BadString:
        return { node: "bad_string", pos, raw, error: true, value: raw.slice(1) };
      case TokenType.BadURL: {
        const inner = raw.replace(/^[^(]*\(\s*/, "").replace(/\)$/, "");
        const bad = /\s+|["'(\\]|[^\P{Cc}\t\n\f\r\u0080-\u009f]/u.exec(inner);
        const value =
          bad === null ? inner : inner.slice(0, bad.index) + inner.slice(bad.index + bad[0].length);
        if (bad !== null && !/^\s/.test(bad[0]))
          return { node: "bad_url", pos, raw, error: true, value };
        return { node: "bad_url", pos, raw, value };
      }
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

  /** @noRailsEquivalent PERMANENT */
  private mergeTokens(first: Node, second: Node): Node | null {
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

  private preprocess(input: string): string {
    return String(input)
      .replace(/\r\n|[\r\f]/g, "\n")
      .replaceAll("\0", "\ufffd");
  }
}
