import {
  isEmpty,
  max,
  printf,
  puts,
  rbObjAsString as toS,
  strlen,
  toI,
  type StdStream,
} from "@blazetrails/ruby-compat";
import * as Terminal from "./terminal.js";

export interface ColumnPrinterOptions {
  indent?: unknown;
  colwidth?: number | null;
  truncate?: number | boolean | null;
  borders?: unknown;
}

export class ColumnPrinter {
  readonly stdout: StdStream;
  readonly options: ColumnPrinterOptions;
  /** @internal */
  protected _indent: number;

  constructor(stdout: StdStream, options: ColumnPrinterOptions = {}) {
    this.stdout = stdout;
    this.options = options;
    this._indent = Number(toI(options.indent));
  }

  /** @missingRailsArgs max — PERMANENT */
  print(array: unknown[]): void {
    if (isEmpty(array)) return;
    const colwidth = (max(array.map((el) => strlen(toS(el)))) ?? 0) + 2;
    array.forEach((value, index) => {
      if (
        ((index + 1) % Math.floor(Terminal.terminalWidth() / colwidth) === 0 && index !== 0) ||
        index + 1 === array.length
      ) {
        puts.call(this.stdout, value);
      } else {
        printf.call(this.stdout, `%-${colwidth}s`, value);
      }
    });
  }
}
