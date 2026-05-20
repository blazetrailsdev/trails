export type Token = "SLASH" | "DOT" | "LPAREN" | "RPAREN" | "OR" | "SYMBOL" | "STAR" | "LITERAL";

const STATIC_TOKENS: Record<string, Token> = {
  ".": "DOT",
  "/": "SLASH",
  "(": "LPAREN",
  ")": "RPAREN",
  "|": "OR",
  ":": "SYMBOL",
  "*": "STAR",
};

const WORD = /\w+/y;
const LITERAL_RUN = /(?:[\w%\-~!$&'*+,;=@]|\\[:()])+/y;

export class Scanner {
  private _str = "";
  private _pos = 0;
  private _length = 0;

  constructor() {}

  scanSetup(str: string): void {
    this._str = str;
    this._pos = 0;
    this._length = 0;
  }

  nextToken(): Token | null {
    if (this._pos >= this._str.length) return null;
    let token: Token | null = null;
    while (this._pos < this._str.length && (token = this.scan()) === null) {
      // continue scanning
    }
    return token;
  }

  lastString(): string {
    return this._str.slice(this._pos - this._length, this._pos);
  }

  lastLiteral(): string {
    return this.lastString().replace(/\\/g, "");
  }

  /** @internal */
  private scan(): Token | null {
    const ch = this._str[this._pos];
    const staticTok = STATIC_TOKENS[ch];

    if (staticTok !== undefined && (staticTok !== "SYMBOL" || this.isNextByteIsNotAToken())) {
      this._pos += 1;
      if (staticTok === "SYMBOL" || staticTok === "STAR") {
        WORD.lastIndex = this._pos;
        const m = WORD.exec(this._str);
        const skipped = m ? m[0].length : 0;
        this._pos += skipped;
        this._length = skipped + 1;
      }
      return staticTok;
    }

    LITERAL_RUN.lastIndex = this._pos;
    const litMatch = LITERAL_RUN.exec(this._str);
    if (litMatch) {
      this._length = litMatch[0].length;
      this._pos += this._length;
      return "LITERAL";
    }

    // Fallback: consume one character as a literal (matches Rails `skip(/./)`).
    this._length = 1;
    this._pos += 1;
    return "LITERAL";
  }

  /** @internal */
  private isNextByteIsNotAToken(): boolean {
    const next = this._str[this._pos + 1];
    return next === undefined || STATIC_TOKENS[next] === undefined;
  }
}
