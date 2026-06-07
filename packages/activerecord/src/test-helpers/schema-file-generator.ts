/**
 * Generates a loadable schema-file module from `TEST_SCHEMA` at runtime,
 * once per Vitest worker. The generated file exports a default function
 * `(ctx: MigrationContext) => Promise<void>` that drives
 * `DatabaseTasks.loadSchema`, giving that path the same coverage it gets
 * in a Rails `db:test:prepare` flow without requiring a checked-in artifact.
 *
 * Hard rule: no `node:*` imports — all I/O goes through the activesupport
 * adapters. `getEnv` replaces `process.env` reads to stay browser-safe.
 */

import { getEnv, getOsAsync } from "@blazetrails/activesupport";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import type { Schema, ColumnSpec, TableSchema } from "./define-schema.js";

const SCHEMA_TO_AR: Record<string, string> = { big_integer: "bigint" };

function toArType(primitive: string): string {
  return SCHEMA_TO_AR[primitive] ?? primitive;
}

function isWrapped(
  t: TableSchema,
): t is { columns: Record<string, ColumnSpec>; primaryKey: string[] | false } {
  if (!t || typeof t !== "object") return false;
  if (!("primaryKey" in t)) return false;
  const pk = (t as { primaryKey?: unknown }).primaryKey;
  return pk === false || Array.isArray(pk);
}

function columnsOf(t: TableSchema): Record<string, ColumnSpec> {
  return isWrapped(t)
    ? (t as { columns: Record<string, ColumnSpec> }).columns
    : (t as Record<string, ColumnSpec>);
}

function primaryKeyOf(t: TableSchema): string[] | false | undefined {
  return isWrapped(t) ? (t as { primaryKey: string[] | false }).primaryKey : undefined;
}

function colOpts(spec: ColumnSpec, colName: string, cpkCols: Set<string> | null): string {
  const parts: string[] = [];
  if (typeof spec === "object") {
    if (spec.limit !== undefined) parts.push(`limit: ${JSON.stringify(spec.limit)}`);
    if (spec.precision !== undefined) parts.push(`precision: ${JSON.stringify(spec.precision)}`);
    if (spec.scale !== undefined) parts.push(`scale: ${JSON.stringify(spec.scale)}`);
    if (spec.null !== undefined) parts.push(`null: ${JSON.stringify(spec.null)}`);
    if (spec.defaultFunction !== undefined) {
      parts.push(`default: () => ${JSON.stringify(spec.defaultFunction)}`);
    } else if (spec.default !== undefined) {
      parts.push(`default: ${JSON.stringify(spec.default)}`);
    }
    if (spec.array) parts.push(`array: true`);
    if (spec.primary) parts.push(`primaryKey: true`);
  }
  if (cpkCols?.has(colName) && !parts.some((p) => p.startsWith("null:"))) {
    parts.push(`null: false`);
  }
  return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
}

// DJB2 hash — makes each unique schema state produce a unique file path so
// `import(href)` (ESM-cached by URL) never returns a stale module when the
// schema changes between calls, mirroring Rails' `load(file)` re-execution.
function schemaChecksum(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function generateCode(schema: Schema): string {
  const lines: string[] = [
    `import type { MigrationContext } from "@blazetrails/activerecord";`,
    ``,
    `export default async function defineSchema(ctx: MigrationContext): Promise<void> {`,
  ];

  for (const [tableName, tableSpec] of Object.entries(schema)) {
    const cols = columnsOf(tableSpec);
    const pk = primaryKeyOf(tableSpec);
    const cpkCols = Array.isArray(pk) ? new Set(pk) : null;

    const tOpts =
      pk === false
        ? `{ id: false }`
        : Array.isArray(pk)
          ? `{ primaryKey: ${JSON.stringify(pk)} }`
          : `{}`;

    const colEntries = Object.entries(cols);
    if (colEntries.length === 0) {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts});`);
    } else {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts}, (t) => {`);
      for (const [colName, colSpec] of colEntries) {
        const primitive = typeof colSpec === "string" ? colSpec : colSpec.type;
        lines.push(
          `    t.column(${JSON.stringify(colName)}, ${JSON.stringify(toArType(primitive))}, ${colOpts(colSpec, colName, cpkCols)});`,
        );
      }
      lines.push(`  });`);
    }
  }

  lines.push(`}`);
  return lines.join("\n") + "\n";
}

/**
 * Generate a TypeScript schema file from `schema` and write it to a
 * temp path keyed off `VITEST_POOL_ID`. Returns the absolute file path so
 * callers can pass it to `DatabaseTasks.loadSchema`.
 */
export async function generateSchemaFile(schema: Schema): Promise<string> {
  const [os, fs, path] = await Promise.all([getOsAsync(), getFsAsync(), getPathAsync()]);
  const poolId = getEnv("VITEST_POOL_ID") ?? "0";
  const code = generateCode(schema);
  const filePath = path.join(os.tmpdir(), `trails-schema-${poolId}-${schemaChecksum(code)}.ts`);
  if (fs.writeFile) {
    await fs.writeFile(filePath, code);
  } else {
    fs.writeFileSync(filePath, code);
  }
  return filePath;
}
