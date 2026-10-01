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
    const widths: number[] = [];
    for (const [i, column] of result.columns.entries()) {
      const cellsInColumn = [
        column,
        ...result.rows.map((r) => (r[i] == null ? "NULL" : String(r[i]))),
      ];
      widths.push(Math.max(...cellsInColumn.map((cell) => cell.length)));
    }
    return widths;
  }

  /** @internal */
  protected buildSeparator(widths: number[]): string {
    return "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  }

  /** @internal */
  protected buildCells(items: Array<unknown>, widths: number[]): string {
    const cells: string[] = [];
    for (let i = 0; i < items.length; i++) {
      let item = items[i];
      if (item == null) item = "NULL";
      const justifier = typeof item === "number" ? "padStart" : "padEnd";
      cells.push(String(item)[justifier](widths[i]));
    }
    return "| " + cells.join(" | ") + " |";
  }

  /** @internal */
  protected buildFooter(nrows: number, elapsed: number): string {
    return `${nrows} ${nrows === 1 ? "row" : "rows"} in set (${elapsed.toFixed(2)} sec)`;
  }
}
