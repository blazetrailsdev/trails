import { center, first, rstrip } from "@blazetrails/ruby-compat";
import type { Result } from "../../result.js";

export class ExplainPrettyPrinter {
  pp(result: Result): string {
    const header = first(result.columns)!;
    const lines = result.rows.map(first) as string[];

    const width = Math.max(...[header, ...lines].map((line) => line.length)) + 2;

    const pp: string[] = [];

    pp.push(rstrip(center(header, width)));
    pp.push("-".repeat(width));

    pp.push(...lines.map((line) => ` ${line}`));

    const nrows = result.rows.length;
    const rowsLabel = nrows === 1 ? "row" : "rows";
    pp.push(`(${nrows} ${rowsLabel})`);

    return pp.join("\n") + "\n";
  }
}
