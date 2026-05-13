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

    return lines.join("\n");
  }
}
