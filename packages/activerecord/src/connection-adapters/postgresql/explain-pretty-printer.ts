import { first } from "@blazetrails/ruby-compat";
import type { Result } from "../../result.js";

export class ExplainPrettyPrinter {
  pp(result: Result): string {
    const header = first(result.columns)!;
    const lines = result.rows.map((row) => String(first(row)));

    const width = Math.max(...[header, ...lines].map((line) => line.length)) + 2;

    const pp: string[] = [];

    pp.push(" ".repeat(Math.floor((width - header.length) / 2)) + header);
    pp.push("-".repeat(width));

    pp.push(...lines.map((line) => ` ${line}`));

    const nrows = result.rows.length;
    const rowsLabel = nrows === 1 ? "row" : "rows";
    pp.push(`(${nrows} ${rowsLabel})`);

    return pp.join("\n") + "\n";
  }
}
