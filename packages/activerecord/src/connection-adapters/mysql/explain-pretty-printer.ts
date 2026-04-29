/**
 * MySQL explain pretty printer — formats EXPLAIN output as a table.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::ExplainPrettyPrinter
 *
 * MySQL's EXPLAIN returns tabular data with columns like id, select_type,
 * table, type, possible_keys, key, key_len, ref, rows, Extra. This
 * printer formats that data into an ASCII table, similar to how the
 * mysql CLI displays results.
 */

import { NotImplementedError } from "../../errors.js";
export class ExplainPrettyPrinter {
  pp(result: Array<Record<string, unknown>>, elapsed: number): string {
    if (result.length === 0) return "";

    const columns = Object.keys(result[0]);
    const widths = new Map<string, number>();

    for (const col of columns) {
      widths.set(col, col.length);
    }

    for (const row of result) {
      for (const col of columns) {
        const val = String(row[col] ?? "NULL");
        const current = widths.get(col)!;
        if (val.length > current) {
          widths.set(col, val.length);
        }
      }
    }

    const separator = "+" + columns.map((col) => "-".repeat(widths.get(col)! + 2)).join("+") + "+";

    const header = "|" + columns.map((col) => ` ${col.padEnd(widths.get(col)!)} `).join("|") + "|";

    const rows = result.map(
      (row) =>
        "|" +
        columns
          .map((col) => {
            const val = String(row[col] ?? "NULL");
            return ` ${val.padEnd(widths.get(col)!)} `;
          })
          .join("|") +
        "|",
    );

    const lines = [separator, header, separator, ...rows, separator];

    const rowCount = result.length;
    const rowWord = rowCount === 1 ? "row" : "rows";
    lines.push(`${rowCount} ${rowWord} in set (${elapsed.toFixed(2)} sec)`);

    return lines.join("\n");
  }
}

/** @internal */
function computeColumnWidths(result: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::ExplainPrettyPrinter#compute_column_widths is not implemented",
  );
}

/** @internal */
function buildSeparator(widths: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::ExplainPrettyPrinter#build_separator is not implemented",
  );
}

/** @internal */
function buildCells(items: any, widths: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::ExplainPrettyPrinter#build_cells is not implemented",
  );
}

/** @internal */
function buildFooter(nrows: any, elapsed: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::ExplainPrettyPrinter#build_footer is not implemented",
  );
}
