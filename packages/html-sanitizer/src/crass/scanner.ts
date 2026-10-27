import { StringScanner } from "@blazetrails/ruby-compat";

export class Scanner {
  current: string | null = null;
  marker = 0;
  pos = 0;
  readonly string: string;
  private _scanner: StringScanner;
  private _len = 0;

  constructor(input: unknown) {
    this.string = String(input ?? "");
    this._scanner = new StringScanner(this.string);

    this.reset();
  }

  consume(): string {
    if (this.pos < this._len) {
      this.current = this._scanner.getch();
      this.pos += this.current!.length;
      return this.current!;
    } else {
      return "";
    }
  }

  consumeRest(): string {
    const result = this._scanner.rest();

    this.current = result.at(-1) ?? null;
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
    return this.string.slice(this.marker, this.pos);
  }

  peek(length = 1): string {
    return this.string.slice(this.pos, this.pos + length);
  }

  reconsume(): void {
    const before = this._scanner.pos;
    this._scanner.unscan();
    if (this.pos > 0) this.pos -= before - this._scanner.pos;
  }

  reset(): void {
    this.current = null;
    this._len = this.string.length;
    this.marker = 0;
    this.pos = 0;
  }

  scan(pattern: RegExp): string | null {
    const match = this._scanner.scan(pattern);
    if (match !== null) {
      this.pos += match.length;
      this.current = match.at(-1) ?? null;
    }

    return match;
  }

  scanUntil(pattern: RegExp): string | null {
    const match = this._scanner.scanUntil(pattern);
    if (match !== null) {
      this.pos += match.length;
      this.current = match.at(-1) ?? null;
    }

    return match;
  }
}
