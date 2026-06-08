/**
 * PostgreSQL explain pretty printer — formats EXPLAIN output.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::ExplainPrettyPrinter
 */

export class ExplainPrettyPrinter {
  pp(result: Array<Record<string, unknown>>): string {
    if (result.length === 0) return "";

    const lines = result.map((row) => {
      const queryPlan = row["QUERY PLAN"] ?? row.query_plan ?? row.queryplan ?? "";
      // `EXPLAIN (FORMAT JSON)` returns the plan as a json/jsonb column.
      // The pg driver previously auto-parsed it to a JS object; with the
      // per-connection OID override it now arrives as a raw string. Handle
      // both: object (user-supplied parser) and string (our raw passthrough).
      if (queryPlan !== null && typeof queryPlan === "object") {
        return JSON.stringify(queryPlan, null, 2);
      }
      if (typeof queryPlan === "string") {
        try {
          return JSON.stringify(JSON.parse(queryPlan), null, 2);
        } catch {
          // not JSON — fall through to plain string (TEXT format plans)
        }
      }
      return String(queryPlan);
    });

    const header = "QUERY PLAN";
    // Width: max of header and all plan sub-line lengths + 2 (one space each side). Mirrors Rails.
    // Multi-line JSON values are split so each sub-line is measured independently.
    const allWidths = lines.flatMap((l) => l.split("\n").map((s) => s.length));
    const width = Math.max(header.length, ...allWidths) + 2;
    const sep = "-".repeat(width);

    // Rails: header.center(width).rstrip
    const leftPad = Math.floor((width - header.length) / 2);
    const centeredHeader = " ".repeat(leftPad) + header;

    // Rails: lines.map { |line| " #{line}" } — one leading space per plan line.
    // Multi-line JSON values: indent each sub-line individually.
    const indentedLines = lines.flatMap((l) => l.split("\n").map((s) => ` ${s}`));

    // Rails: "(N rows)" footer (not a second separator), then a trailing newline.
    const nrows = result.length;
    const footer = `(${nrows} ${nrows === 1 ? "row" : "rows"})`;

    return [centeredHeader, sep, ...indentedLines, footer].join("\n") + "\n";
  }
}
