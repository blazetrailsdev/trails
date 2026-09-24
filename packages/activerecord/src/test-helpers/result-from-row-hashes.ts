import { Result } from "../result.js";

export function resultFromRowHashes(rows: Record<string, unknown>[]): Result {
  const columns = rows.length === 0 ? [] : Object.keys(rows[0]);
  return new Result(
    columns,
    rows.map((row) => columns.map((column) => row[column])),
  );
}
