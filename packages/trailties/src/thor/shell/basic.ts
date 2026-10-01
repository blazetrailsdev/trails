import {
  chomp,
  isSymbol,
  print,
  puts,
  rbConstGet,
  rbObjAsString as toS,
  rtest,
  stderr as $stderr,
  stdout as $stdout,
  symbolToS,
  type WriteStream,
} from "@blazetrails/ruby-compat";
import * as Terminal from "./terminal.js";

export class Basic {
  base: { options: Record<string, unknown> } | null;
  /** @internal */
  protected _mute: boolean;
  /** @internal */
  protected _padding: number;
  /** @internal */
  protected _alwaysForce: boolean;

  get padding(): number {
    return this._padding;
  }

  constructor() {
    this.base = null;
    this._mute = false;
    this._padding = 0;
    this._alwaysForce = false;
  }

  mute<T>(block: () => T): T {
    this._mute = true;
    let result: T;
    try {
      result = block();
    } catch (error) {
      this._mute = false;
      throw error;
    }
    if (result instanceof Promise) {
      return result.finally(() => {
        this._mute = false;
      }) as T;
    }
    this._mute = false;
    return result;
  }

  isMute(): boolean {
    return this._mute;
  }

  set padding(value: number) {
    this._padding = Math.max(0, value);
  }

  indent<T>(count: number = 1, block: () => T): T {
    const origPadding = this.padding;
    this.padding = this.padding + count;
    const result = block();
    if (result instanceof Promise) {
      return result.then((value: unknown) => {
        this.padding = origPadding;
        return value;
      }) as T;
    }
    this.padding = origPadding;
    return result;
  }

  say(message: unknown = "", color: unknown = null, forceNewLine?: unknown): void {
    if (arguments.length < 3) forceNewLine = !/( |\t)(?=\n?$)/.test(toS(message));
    if (rtest(this.isQuiet())) return;

    let buffer = this.prepareMessage(
      message,
      ...(color == null ? [] : Array.isArray(color) ? color : [color]),
    );
    if (rtest(forceNewLine) && !toS(message).endsWith("\n")) buffer += "\n";

    print.call(this.stdout(), buffer);
  }

  sayError(message: unknown = "", color: unknown = null, forceNewLine?: unknown): void {
    if (arguments.length < 3) forceNewLine = !/( |\t)(?=\n?$)/.test(toS(message));
    if (rtest(this.isQuiet())) return;

    let buffer = this.prepareMessage(
      message,
      ...(color == null ? [] : Array.isArray(color) ? color : [color]),
    );
    if (rtest(forceNewLine) && !toS(message).endsWith("\n")) buffer += "\n";

    print.call(this.stderr(), buffer);
  }

  /** @missingRailsArgs chomp — PERMANENT */
  sayStatus(status: unknown, message: unknown, logStatus: unknown = true): void {
    if (rtest(this.isQuiet()) || logStatus === false) return;
    const spaces = "  ".repeat(this.padding + 1);
    status = toS(status).padStart(12);
    const margin = " ".repeat((status as string).length) + spaces;

    const color = isSymbol(logStatus) ? logStatus : ":green";
    if (color) status = this.setColor(status as string, color, true);

    message = chomp(toS(message)).replace(/(?<=\n)(?!$)/g, margin);
    const buffer = `${status}${spaces}${message}\n`;

    print.call(this.stdout(), buffer);
  }

  error(statement: unknown): void {
    puts.call(this.stderr(), statement);
  }

  setColor(string: string, ..._: unknown[]): string {
    return string;
  }

  /** @internal */
  protected prepareMessage(message: unknown, ...color: unknown[]): string {
    const spaces = "  ".repeat(this.padding);
    return spaces + this.setColor(toS(message), ...color);
  }

  /** @internal */
  protected canDisplayColors(): boolean {
    return false;
  }

  /** @internal */
  protected lookupColor(color: unknown): unknown {
    if (!isSymbol(color)) return color;
    return rbConstGet(this.constructor, symbolToS(color).toUpperCase());
  }

  /** @internal */
  protected stdout(): WriteStream {
    return $stdout;
  }

  /** @internal */
  protected stderr(): WriteStream {
    return $stderr;
  }

  /** @internal */
  protected isQuiet(): unknown {
    return this.isMute() || (this.base && this.base.options["quiet"]);
  }

  /** @internal */
  protected isUnix(): boolean {
    return Terminal.isUnix();
  }
}
