/**
 * MySQL explain pretty printer — formats EXPLAIN output as a table.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::ExplainPrettyPrinter
 */

export interface ExplainResult {
  columns: string[];
  rows: Array<Array<unknown>>;
}

export class ExplainPrettyPrinter {
  pp(result: ExplainResult, elapsed: number): string {
    if (result.columns.length === 0) return "";
    const widths = this.computeColumnWidths(result);
    const separator = this.buildSeparator(widths);
    const lines = [separator, this.buildCells(result.columns, widths), separator];
    for (const row of result.rows) lines.push(this.buildCells(row, widths));
    lines.push(separator, this.buildFooter(result.rows.length, elapsed));
    return lines.join("\n") + "\n";
  }

  /** @internal */
  protected computeColumnWidths(result: ExplainResult): number[] {
    return result.columns.map((col, i) => {
      const cells = [col, ...result.rows.map((r) => (r[i] == null ? "NULL" : String(r[i])))];
      return Math.max(...cells.map((s) => s.length));
    });
  }

  /** @internal */
  protected buildSeparator(widths: number[]): string {
    return "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  }

  /** @internal */
  protected buildCells(items: Array<unknown>, widths: number[]): string {
    const cells = items.map((item, i) => {
      const s = item == null ? "NULL" : String(item);
      return typeof item === "number" ? s.padStart(widths[i]) : s.padEnd(widths[i]);
    });
    return "| " + cells.join(" | ") + " |";
  }

  /** @internal */
  protected buildFooter(nrows: number, elapsed: number): string {
    return `${nrows} ${nrows === 1 ? "row" : "rows"} in set (${elapsed.toFixed(2)} sec)`;
  }
}
