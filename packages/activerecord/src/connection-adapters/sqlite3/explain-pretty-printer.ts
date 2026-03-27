/**
 * SQLite3 explain pretty printer — formats EXPLAIN QUERY PLAN output.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::ExplainPrettyPrinter
 */

export class ExplainPrettyPrinter {
  pp(result: Array<Record<string, unknown>>): string {
    if (result.length === 0) return "";

    const lines = result.map((row) => {
      const selectid = row.selectid ?? row.id ?? "";
      const order = row.order ?? row.parent ?? "";
      const from = row.from ?? row.notused ?? "";
      const detail = row.detail ?? "";
      return `${selectid}|${order}|${from}|${detail}`;
    });

    return lines.join("\n");
  }
}
