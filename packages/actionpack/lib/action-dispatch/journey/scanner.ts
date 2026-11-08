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
const ANY = /./y;

export class Scanner {
  static Scanner = class Scanner {
    /** @internal */
    readonly string: string;
    /** @internal */
    pos = 0;

    constructor(string: string) {
      this.string = string;
    }

    peekByte(): number {
      return this.string.charCodeAt(this.pos);
    }

    /** @internal */
    isEos(): boolean {
      return this.pos >= this.string.length;
    }

    /** @internal */
    skip(pattern: RegExp): number | null {
      pattern.lastIndex = this.pos;
      const m = pattern.exec(this.string);
      if (m === null) return null;
      this.pos += m[0].length;
      return m[0].length;
    }
  };

  private _scanner: InstanceType<typeof Scanner.Scanner> | null;
  private _length: number | null;

  constructor() {
    this._scanner = null;
    this._length = null;
  }

  scanSetup(str: string): void {
    this._scanner = new Scanner.Scanner(str);
  }

  nextToken(): Token | null {
    if (this._scanner!.isEos()) return null;

    let token: Token | null;
    for (;;) {
      token = this.scan();
      if (token !== null || this._scanner!.isEos()) break;
    }
    return token;
  }

  lastString(): string {
    return this._scanner!.string.slice(this._scanner!.pos - this._length!, this._scanner!.pos);
  }

  lastLiteral(): string {
    const lastStr = this._scanner!.string.slice(
      this._scanner!.pos - this._length!,
      this._scanner!.pos,
    );
    return lastStr.replace(/\\/g, "");
  }

  /** @internal */
  private scan(): Token | null {
    const nextByte = this._scanner!.peekByte();
    let token: Token | undefined;
    if (
      (token = STATIC_TOKENS[nextByte]) !== undefined &&
      (token !== "SYMBOL" || this.isNextByteIsNotAToken())
    ) {
      this._scanner!.pos += 1;
      if (token === "SYMBOL" || token === "STAR") {
        this._length = (this._scanner!.skip(WORD) ?? 0) + 1;
      }
      return token;
    }
    if ((this._length = this._scanner!.skip(LITERAL_RUN)) !== null) {
      return "LITERAL";
    }
    if ((this._length = this._scanner!.skip(ANY)) !== null) {
      return "LITERAL";
    }
    return null;
  }

  /** @internal */
  private isNextByteIsNotAToken(): boolean {
    return STATIC_TOKENS[this._scanner!.string.charCodeAt(this._scanner!.pos + 1)] === undefined;
  }
}
