import type { Result } from "../../result.js";

export class ExplainPrettyPrinter {
  /** @missingRailsCall first — PERMANENT */
  pp(result: Result): string {
    const header = result.columns[0];
    const lines = result.rows.map((row) => String(row[0]));

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
