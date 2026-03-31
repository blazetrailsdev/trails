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
      return String(queryPlan);
    });

    return lines.join("\n");
  }
}
