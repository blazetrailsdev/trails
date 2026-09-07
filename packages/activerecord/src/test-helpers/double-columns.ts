import { TEST_SCHEMA } from "./test-schema.js";
import { isWrappedSchema } from "../support/schema-types.js";

/** @internal */
export function doubleColumnsHash(
  tableName: string,
  extraColumns: Record<string, string[]> = {},
): Record<string, { name: string }> {
  const table = TEST_SCHEMA[tableName];
  const columns = table === undefined ? {} : isWrappedSchema(table) ? table.columns : table;
  const names = ["id", ...Object.keys(columns), ...(extraColumns[tableName] ?? [])];
  return Object.fromEntries(names.map((name) => [name, { name }]));
}
