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

// Mirrors define-schema.ts COLUMN_TYPE_MAP_MYSQL: date/time/json map to
// "string" (VARCHAR 255) on MySQL so the column type matches what defineSchema
// produced before this path was introduced.
const SCHEMA_TO_AR_MYSQL: Record<string, string> = {
  ...SCHEMA_TO_AR,
  date: "string",
  time: "string",
  json: "string",
};

function toArType(primitive: string, adapterName?: string): string {
  const map = adapterName === "mysql" ? SCHEMA_TO_AR_MYSQL : SCHEMA_TO_AR;
  return map[primitive] ?? primitive;
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

// Excludes `big_integer` on purpose: the serial-PK path emits a `primary_key`
// column, which is `SERIAL` (INT4) on PG, not `BIGSERIAL`. Keep in sync with
// define-schema.ts's isIntegerSpec.
function isIntegerSpec(spec: ColumnSpec | undefined): boolean {
  if (spec === undefined) return false;
  const type = typeof spec === "string" ? spec : spec.type;
  return type === "integer";
}

function colOpts(
  spec: ColumnSpec,
  colName: string,
  cpkCols: Set<string> | null,
  primitive: string,
  adapterName?: string,
): string {
  const parts: string[] = [];
  const hasPrecision = typeof spec === "object" && spec.precision !== undefined;
  if (typeof spec === "object") {
    if (spec.limit !== undefined) parts.push(`limit: ${JSON.stringify(spec.limit)}`);
    if (hasPrecision) parts.push(`precision: ${JSON.stringify(spec.precision)}`);
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
  // Mirrors define-schema.ts: MySQL DATETIME without precision defaults to
  // DATETIME(0), which rejects fractional seconds. Inject precision:6 unless
  // the spec sets precision explicitly (even precision:null opts out).
  if (adapterName === "mysql" && primitive === "datetime" && !hasPrecision) {
    parts.push(`precision: 6`);
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

function generateCode(schema: Schema, adapterName?: string): string {
  const lines: string[] = [
    `import type { MigrationContext } from "@blazetrails/activerecord";`,
    ``,
    `export default async function defineSchema(ctx: MigrationContext): Promise<void> {`,
  ];

  // PG/MySQL: loadSchema runs on a shared database that other workers may already
  // have connected to, so we can't DROP DATABASE. Use force:"cascade" per-table
  // drop+recreate instead — safe for concurrent workers on a shared DB.
  const needsForce = adapterName === "postgres" || adapterName === "mysql";

  for (const [tableName, tableSpec] of Object.entries(schema)) {
    const cols = columnsOf(tableSpec);
    const pk = primaryKeyOf(tableSpec);
    // A single-column integer PK declared via `primaryKey: ["col"]` mirrors
    // Rails' `t.primary_key :col`, which makes the column a serial/identity.
    // Emit it via the string `primaryKey` form (auto-increment) rather than the
    // array form (plain integer PK, no sequence). Keep them in sync with
    // define-schema.ts, which applies the same rule for the fixtures path.
    const serialPkName =
      Array.isArray(pk) && pk.length === 1 && isIntegerSpec(cols[pk[0]]) ? pk[0] : null;
    const cpkCols = Array.isArray(pk) && serialPkName === null ? new Set(pk) : null;

    const tOptsEntries: string[] = [];
    if (pk === false) tOptsEntries.push(`id: false`);
    else if (serialPkName !== null) {
      tOptsEntries.push(`primaryKey: ${JSON.stringify(serialPkName)}`);
      // Preserve INTEGER width: PG `serial` → INT4 serial; MySQL/SQLite
      // `integer` → INT auto-increment. The default `primary_key` type widens to
      // BIGINT on MySQL and breaks integer FK references. Keep in sync with
      // define-schema.ts.
      const serialIdType = adapterName === "postgres" ? "serial" : "integer";
      tOptsEntries.push(`id: { type: ${JSON.stringify(serialIdType)} }`);
    } else if (Array.isArray(pk)) tOptsEntries.push(`primaryKey: ${JSON.stringify(pk)}`);
    if (needsForce) tOptsEntries.push(`force: "cascade"`);
    const tOpts = tOptsEntries.length === 0 ? `{}` : `{ ${tOptsEntries.join(", ")} }`;

    const colEntries = Object.entries(cols).filter(([colName]) => colName !== serialPkName);
    if (colEntries.length === 0) {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts});`);
    } else {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts}, (t) => {`);
      for (const [colName, colSpec] of colEntries) {
        const primitive = typeof colSpec === "string" ? colSpec : colSpec.type;
        lines.push(
          `    t.column(${JSON.stringify(colName)}, ${JSON.stringify(toArType(primitive, adapterName))}, ${colOpts(colSpec, colName, cpkCols, primitive, adapterName)});`,
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
 *
 * Pass `adapterName` to apply adapter-specific column mappings (e.g. MySQL
 * date/time/json → string, datetime precision:6 default).
 */
export async function generateSchemaFile(schema: Schema, adapterName?: string): Promise<string> {
  const [os, fs, path] = await Promise.all([getOsAsync(), getFsAsync(), getPathAsync()]);
  const poolId = getEnv("VITEST_POOL_ID") ?? "0";
  const code = generateCode(schema, adapterName);
  const filePath = path.join(os.tmpdir(), `trails-schema-${poolId}-${schemaChecksum(code)}.ts`);
  if (fs.writeFile) {
    await fs.writeFile(filePath, code);
  } else {
    fs.writeFileSync(filePath, code);
  }
  return filePath;
}
