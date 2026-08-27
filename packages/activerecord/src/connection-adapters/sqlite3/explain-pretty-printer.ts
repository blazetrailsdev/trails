export interface ExplainResult {
  rows: Array<Array<unknown>>;
}

export class ExplainPrettyPrinter {
  pp(result: ExplainResult): string {
    return result.rows.map((row) => row.join("|")).join("\n") + "\n";
  }
}
