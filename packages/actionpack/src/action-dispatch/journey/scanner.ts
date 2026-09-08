export type Token = "SLASH" | "DOT" | "LPAREN" | "RPAREN" | "OR" | "SYMBOL" | "STAR" | "LITERAL";

const STATIC_TOKENS: (Token | undefined)[] = new Array(150);
STATIC_TOKENS[".".charCodeAt(0)] = "DOT";
STATIC_TOKENS["/".charCodeAt(0)] = "SLASH";
STATIC_TOKENS["(".charCodeAt(0)] = "LPAREN";
STATIC_TOKENS[")".charCodeAt(0)] = "RPAREN";
STATIC_TOKENS["|".charCodeAt(0)] = "OR";
STATIC_TOKENS[":".charCodeAt(0)] = "SYMBOL";
STATIC_TOKENS["*".charCodeAt(0)] = "STAR";

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
      /** @empty */
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
  peekByte(): number {
    return this._str.charCodeAt(this._pos);
  }

  /** @internal */
  private scan(): Token | null {
    const nextByte = this.peekByte();
    const staticTok = STATIC_TOKENS[nextByte];

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

    this._length = 1;
    this._pos += 1;
    return "LITERAL";
  }

  /** @internal */
  private isNextByteIsNotAToken(): boolean {
    return STATIC_TOKENS[this._str.charCodeAt(this._pos + 1)] === undefined;
  }
}
