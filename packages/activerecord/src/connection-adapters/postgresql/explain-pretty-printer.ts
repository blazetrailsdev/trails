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
      // `EXPLAIN (FORMAT JSON)` returns the plan as a json/jsonb column
      // which the pg driver auto-parses to a JS object/array. `String(obj)`
      // renders "[object Object]"; JSON.stringify preserves the plan.
      if (queryPlan !== null && typeof queryPlan === "object") {
        return JSON.stringify(queryPlan, null, 2);
      }
      return String(queryPlan);
    });

    return lines.join("\n");
  }
}
