import { StringScanner } from "@blazetrails/ruby-compat";

export class Scanner {
  current: string | null = null;
  marker = 0;
  pos = 0;
  readonly string: string;

  private _scanner: StringScanner;
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  private _chars: string[];
  private _len = 0;

  constructor(input: string | { read(): string }) {
    this.string = typeof input === "string" ? input : input.read();
    this._chars = Array.from(this.string);
    this._scanner = new StringScanner(this.string);

    this.reset();
  }

  consume(): string {
    if (this.pos < this._len) {
      this.pos += 1;
      return (this.current = this._scanner.getch()!);
    } else {
      return "";
    }
  }

  consumeRest(): string {
    const result = this._scanner.rest();

    this.current = Array.from(result).at(-1) ?? null;
    this.pos = this._len;

    return result;
  }

  isEos(): boolean {
    return this.pos === this._len;
  }

  mark(): void {
    this.marker = this.pos;
  }

  marked(): string {
    return this._chars.slice(this.marker, this.pos).join("");
  }

  peek(length = 1): string {
    return this._chars.slice(this.pos, this.pos + length).join("");
  }

  reconsume(): void {
    this._scanner.unscan();
    if (this.pos > 0) this.pos -= 1;
  }

  reset(): void {
    this.current = null;
    this._len = this._chars.length;
    this.marker = 0;
    this.pos = 0;
  }

  scan(pattern: RegExp): string | null {
    const match = this._scanner.scan(pattern);
    if (match !== null) {
      const chars = Array.from(match);
      this.pos += chars.length;
      this.current = chars.at(-1) ?? null;
    }

    return match;
  }

  scanUntil(pattern: RegExp): string | null {
    const match = this._scanner.scanUntil(pattern);
    if (match !== null) {
      const chars = Array.from(match);
      this.pos += chars.length;
      this.current = chars.at(-1) ?? null;
    }

    return match;
  }
}
