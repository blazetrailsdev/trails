import {
  arySlice,
  cmp,
  format,
  isEmpty,
  max,
  puts,
  rbCNumeric,
  rbEqual,
  rbObjAsString as toS,
  rbObjIsKindOf,
  rtest,
  strlen,
  type StdStream,
} from "@blazetrails/ruby-compat";
import { ColumnPrinter, type ColumnPrinterOptions } from "./column-printer.js";
import * as Terminal from "./terminal.js";

export class TablePrinter extends ColumnPrinter {
  static BORDER_SEPARATOR = ":separator";

  /** @internal */
  protected _formats: string[];
  /** @internal */
  protected _maximas: number[];
  /** @internal */
  protected _colwidth: number | null | undefined;
  /** @internal */
  protected _truncate: number | false | null | undefined;
  /** @internal */
  protected _padding: number;

  constructor(stdout: StdStream, options: ColumnPrinterOptions = {}) {
    super(stdout, options);
    this._formats = [];
    this._maximas = [];
    this._colwidth = options.colwidth;
    this._truncate = options.truncate === true ? Terminal.terminalWidth() : options.truncate;
    this._padding = 1;
  }

  override print(array: unknown[]): void {
    if (isEmpty(array)) return;

    this.prepare(array);

    if (rtest(this.options.borders)) this.printBorderSeparator();

    for (const row of array as unknown[][]) {
      if (rtest(this.options.borders) && rbEqual(row, TablePrinter.BORDER_SEPARATOR)) {
        this.printBorderSeparator();
        continue;
      }

      let sentence = "";

      row.forEach((column, index) => {
        sentence += this.formatCell(column, row.length, index);
      });

      sentence = this.truncate(sentence);
      if (rtest(this.options.borders)) sentence += "|";
      puts.call(this.stdout, this.indentation() + sentence);
    }
    if (rtest(this.options.borders)) this.printBorderSeparator();
  }

  /** @internal */
  private prepare(array: unknown[]): void {
    array = array.filter((row) => !rbEqual(row, TablePrinter.BORDER_SEPARATOR));

    if (this._colwidth != null) this._formats.push(`%-${this._colwidth + 2}s`);
    const start = this._colwidth != null ? 1 : 0;

    const colcount = max(array as unknown[][], (a, b) => cmp(a.length, b.length))!.length;

    for (let index = start; index <= colcount - 1; index++) {
      const maxima = max(
        (array as unknown[][]).map((row) => (rtest(row[index]) ? strlen(toS(row[index])) : 0)),
      )!;

      this._maximas.push(maxima);
      if (rtest(this.options.borders)) {
        this._formats.push(`%-${maxima}s`);
      } else if (index === colcount - 1) {
        this._formats.push("%-s");
      } else {
        this._formats.push(`%-${maxima + 2}s`);
      }
    }

    this._formats.push("%s");
  }

  /** @internal */
  private formatCell(column: unknown, rowSize: number, index: number): string {
    const maxima = this._maximas[index];

    let f: string;
    if (rbObjIsKindOf(column, rbCNumeric)) {
      if (rtest(this.options.borders)) {
        f = `%${toS(maxima)}s`;
      } else if (index === rowSize - 1) {
        f = `%${toS(maxima)}s`;
      } else {
        f = `%${toS(maxima)}s  `;
      }
    } else {
      f = this._formats[index];
    }

    let cell = "";
    if (rtest(this.options.borders)) cell += "|" + " ".repeat(this._padding);
    cell += format(f, toS(column));
    if (rtest(this.options.borders)) cell += " ".repeat(this._padding);
    return cell;
  }

  /** @internal */
  private printBorderSeparator(): void {
    const separator = this._maximas.map((maxima) => "+" + "-".repeat(maxima + 2 * this._padding));
    puts.call(this.stdout, this.indentation() + separator.join("") + "+");
  }

  /**
   * @internal
   * @missingRailsArgs join — PERMANENT
   */
  private truncate(string: string): string {
    if (!rtest(this._truncate)) return string;
    const chars = [...string];
    if (chars.length <= this._truncate) {
      return chars.join("");
    } else {
      return (arySlice(chars, 0, this._truncate - 3 - this._indent) as string[]).join("") + "...";
    }
  }

  /** @internal */
  private indentation(): string {
    return " ".repeat(this._indent);
  }
}
