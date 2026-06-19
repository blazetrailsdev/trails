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
import type { Schema, ColumnSpec, TableSchema, IndexSpec } from "./define-schema.js";

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

function isWrapped(t: TableSchema): t is {
  columns: Record<string, ColumnSpec>;
  primaryKey?: string[] | false;
  indexes?: IndexSpec[];
} {
  if (!t || typeof t !== "object") return false;
  if (!("columns" in t)) return false;
  if ("primaryKey" in t) {
    const pk = (t as { primaryKey?: unknown }).primaryKey;
    if (pk !== false && !Array.isArray(pk)) return false;
    return true;
  }
  return Array.isArray((t as { indexes?: unknown }).indexes);
}

function columnsOf(t: TableSchema): Record<string, ColumnSpec> {
  return isWrapped(t) ? (t as { columns: Record<string, ColumnSpec> }).columns : t;
}

function primaryKeyOf(t: TableSchema): string[] | false | undefined {
  return isWrapped(t) ? (t as { primaryKey?: string[] | false }).primaryKey : undefined;
}

function indexesOf(t: TableSchema): IndexSpec[] {
  return isWrapped(t) ? ((t as { indexes?: IndexSpec[] }).indexes ?? []) : [];
}

// `integer` and `big_integer` both map to an auto-increment serial/identity PK
// when declared `primaryKey: ["col"]`. Keep in sync with define-schema.ts's
// isIntegerSpec / serialIdType.
function isIntegerSpec(spec: ColumnSpec | undefined): boolean {
  if (spec === undefined) return false;
  const type = typeof spec === "string" ? spec : spec.type;
  return type === "integer" || type === "big_integer";
}

// The `id: { type }` value preserving the declared INTEGER width per adapter:
// PG `serial`/`bigserial`, MySQL `integer`/`bigint`, SQLite always `integer`
// (only `INTEGER PRIMARY KEY` aliases the rowid).
function serialIdType(spec: ColumnSpec | undefined, adapterName?: string): string {
  const type = typeof spec === "string" ? spec : spec?.type;
  const isBig = type === "big_integer";
  if (adapterName === "postgres") return isBig ? "bigserial" : "serial";
  if (adapterName === "sqlite") return "integer";
  return isBig ? "bigint" : "integer";
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
      // Preserve INTEGER width per adapter (serialIdType). The default
      // `primary_key` type widens to BIGINT on MySQL and breaks integer FK
      // references. Keep in sync with define-schema.ts.
      tOptsEntries.push(
        `id: { type: ${JSON.stringify(serialIdType(cols[serialPkName], adapterName))} }`,
      );
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

    // Emit indexes after the table (Rails `t.index`). The partial `where` is
    // dropped at SQL generation on adapters without partial-index support, so
    // it needs no gate here. An expression index (string column with non-word
    // characters, e.g. "(lower(external_id))") is gated below.
    for (const index of indexesOf(tableSpec)) {
      const isExpression = typeof index.columns === "string" && /\W/.test(index.columns);
      // Coarse `adapterName === "mysql"` gate (not the precise
      // `supports_expression_index?`, which is true on MySQL 8.0.13+) because
      // the generator has no DB version. This is exact for the only live
      // caller — the PG-only template path (template-global-setup.ts) — where
      // MySQL/SQLite build via defineSchema's runtime supportsExpressionIndex
      // check instead. A future MySQL-template caller would need that check
      // here to avoid dropping the index on MySQL 8.
      if (isExpression && adapterName === "mysql") continue;
      const optEntries: string[] = [];
      if (index.unique) optEntries.push(`unique: true`);
      if (index.where !== undefined) optEntries.push(`where: ${JSON.stringify(index.where)}`);
      if (index.name !== undefined) optEntries.push(`name: ${JSON.stringify(index.name)}`);
      const opts = optEntries.length === 0 ? `{}` : `{ ${optEntries.join(", ")} }`;
      lines.push(
        `  await ctx.addIndex(${JSON.stringify(tableName)}, ${JSON.stringify(index.columns)}, ${opts});`,
      );
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
