/**
 * A gem's `db/schema.rb` (GemConfig.schema), read for the columns its models
 * get from the database: Rails' attribute methods come from the table, not the
 * class body, so the generator needs the schema to declare them.
 */
import { readFileSync } from "node:fs";

export interface Column {
  name: string;
  type: string;
  null: boolean;
}

/** Table name → its columns, in schema order, the implicit `id` first. */
export function readSchema(file: string): Map<string, Column[]> {
  const tables = new Map<string, Column[]>();
  let cols: Column[] | null = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = /^\s*create_table "(\w+)"(.*) do \|t\|/.exec(line);
    if (t) {
      cols = /\bid: false\b/.test(t[2]) ? [] : [{ name: "id", type: "bigint", null: false }];
      tables.set(t[1], cols);
      continue;
    }
    if (/^\s*end\b/.test(line)) {
      cols = null;
      continue;
    }
    const c = /^\s*t\.(\w+) "(\w+)"(.*)$/.exec(line);
    if (cols && c && c[1] !== "index")
      cols.push({ name: c[2], type: c[1], null: !/\bnull: false\b/.test(c[3]) });
  }
  return tables;
}

/** ActiveSupport's `pluralize` for the regular English nouns a table is named for. */
export function pluralize(s: string): string {
  if (/(s|x|z|ch|sh)$/.test(s)) return s + "es";
  if (/[^aeiou]y$/.test(s)) return s.slice(0, -1) + "ies";
  return s + "s";
}
