/**
 * Generates a loadable schema-file module from `TEST_SCHEMA` at runtime,
 * once per Vitest worker. The generated file exports a default function
 * `(ctx: DatabaseAdapter) => Promise<void>` that drives
 * `DatabaseTasks.loadSchema`, giving that path the same coverage it gets
 * in a Rails `db:test:prepare` flow without requiring a checked-in artifact.
 *
 * Hard rule: no `node:*` imports — all I/O goes through the activesupport
 * adapters. `getEnv` replaces `process.env` reads to stay browser-safe.
 */

import { getEnv, getOsAsync } from "@blazetrails/activesupport";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import type { Schema, ColumnSpec, TableSchema, IndexSpec, ForeignKeySpec } from "./schema-types.js";

const SCHEMA_TO_AR: Record<string, string> = { big_integer: "bigint" };

function toArType(primitive: string): string {
  return SCHEMA_TO_AR[primitive] ?? primitive;
}

function isWrapped(t: TableSchema): t is {
  columns: Record<string, ColumnSpec>;
  primaryKey?: string[] | false;
  indexes?: IndexSpec[];
  foreignKeys?: ForeignKeySpec[];
} {
  if (!t || typeof t !== "object") return false;
  if (!("columns" in t)) return false;
  if ("primaryKey" in t) {
    const pk = (t as { primaryKey?: unknown }).primaryKey;
    if (pk !== false && !Array.isArray(pk)) return false;
    return true;
  }
  if (Array.isArray((t as { foreignKeys?: unknown }).foreignKeys)) return true;
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

function foreignKeysOf(t: TableSchema): ForeignKeySpec[] {
  return isWrapped(t) ? ((t as { foreignKeys?: ForeignKeySpec[] }).foreignKeys ?? []) : [];
}

// `integer` and `big_integer` both map to an auto-increment serial/identity PK
// when declared `primaryKey: ["col"]`. Keep in sync with schema-types.ts's
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
  // Mirrors schema-types.ts: MySQL DATETIME without precision defaults to
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

function generateCode(
  schema: Schema,
  adapterName?: string,
  supportsExpressionIndex?: boolean,
): string {
  const lines: string[] = [
    `import type { DatabaseAdapter } from "@blazetrails/activerecord";`,
    ``,
    `export default async function defineSchema(ctx: DatabaseAdapter): Promise<void> {`,
  ];

  // PG/MySQL: loadSchema runs on a shared database that other workers may already
  // have connected to, so we can't DROP DATABASE. Use force:"cascade" per-table
  // drop+recreate instead — safe for concurrent workers on a shared DB.
  const needsForce = adapterName === "postgres" || adapterName === "mysql";

  // A referencing table must go before the table it points at: PG/MySQL below
  // drop+recreate each table in declaration order, and a live child FK blocks
  // (MySQL) or cascades away (PG) the parent's drop. Dropping every FK-carrying
  // table up front keeps the per-table `force: "cascade"` recreate safe.
  if (needsForce) {
    for (const [tableName, tableSpec] of Object.entries(schema)) {
      if (foreignKeysOf(tableSpec).length === 0) continue;
      lines.push(`  await ctx.dropTable(${JSON.stringify(tableName)}, { ifExists: true });`);
    }
  }

  for (const [tableName, tableSpec] of Object.entries(schema)) {
    const cols = columnsOf(tableSpec);
    const pk = primaryKeyOf(tableSpec);
    // A single-column integer PK declared via `primaryKey: ["col"]` mirrors
    // Rails' `t.primary_key :col`, which makes the column a serial/identity.
    // Emit it via the string `primaryKey` form (auto-increment) rather than the
    // array form (plain integer PK, no sequence). Keep them in sync with
    // schema-types.ts, which applies the same rule for the fixtures path.
    const serialPkName =
      Array.isArray(pk) && pk.length === 1 && isIntegerSpec(cols[pk[0]]) ? pk[0] : null;
    const cpkCols = Array.isArray(pk) && serialPkName === null ? new Set(pk) : null;

    const tOptsEntries: string[] = [];
    if (pk === false) tOptsEntries.push(`id: false`);
    else if (serialPkName !== null) {
      // Suppress the auto `id` column; the serial PK is emitted INLINE at its
      // declared offset in the column loop below (mirrors schema-types.ts)
      // rather than via createTable's string-`primaryKey` option, which hoists
      // the PK column first. Inline emission keeps the reflected column order
      // matching Rails — e.g. `auto_id_tests` declares `t.primary_key :auto_id`
      // LAST (persistence_test `test_populates_autoincremented_id_pk_...`).
      tOptsEntries.push(`id: false`);
    } else if (Array.isArray(pk)) tOptsEntries.push(`primaryKey: ${JSON.stringify(pk)}`);
    if (needsForce) tOptsEntries.push(`force: "cascade"`);
    const tOpts = tOptsEntries.length === 0 ? `{}` : `{ ${tOptsEntries.join(", ")} }`;

    // Foreign keys ride inside the create-table block (Rails `t.foreign_key`),
    // so a table declaring one always emits a block even with no columns.
    const fks = foreignKeysOf(tableSpec);
    const fkLines = fks.map(
      (fk) =>
        `    t.foreignKey(${JSON.stringify(fk.toTable)}, ${JSON.stringify({
          column: fk.column,
          ...(fk.primaryKey === undefined ? {} : { primaryKey: fk.primaryKey }),
          ...(fk.name === undefined ? {} : { name: fk.name }),
        })});`,
    );

    const colEntries = Object.entries(cols);
    if (colEntries.length === 0 && fkLines.length === 0) {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts});`);
    } else {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts}, (t) => {`);
      for (const [colName, colSpec] of colEntries) {
        // Emit the single-column integer PK inline at its declared offset.
        // Preserve the declared INTEGER width per adapter (serialIdType); the
        // default `primary_key` type widens to BIGINT on MySQL and breaks
        // integer FK references. Keep in sync with schema-types.ts.
        if (colName === serialPkName) {
          lines.push(
            `    t.column(${JSON.stringify(colName)}, ${JSON.stringify(serialIdType(colSpec, adapterName))}, { primaryKey: true });`,
          );
          continue;
        }
        const primitive = typeof colSpec === "string" ? colSpec : colSpec.type;
        lines.push(
          `    t.column(${JSON.stringify(colName)}, ${JSON.stringify(toArType(primitive))}, ${colOpts(colSpec, colName, cpkCols, primitive, adapterName)});`,
        );
      }
      lines.push(...fkLines);
      lines.push(`  });`);
    }

    // Emit indexes after the table (Rails `t.index`). The partial `where` is
    // dropped at SQL generation on adapters without partial-index support, so
    // it needs no gate here. An expression index (string column with non-word
    // characters, e.g. "(lower(external_id))") is gated below.
    for (const index of indexesOf(tableSpec)) {
      const isExpression = typeof index.columns === "string" && /\W/.test(index.columns);
      // Expression-index gate. The generator has no live adapter, so the caller
      // threads in `supportsExpressionIndex` (resolved from the DB version) to
      // match `emitTableIndexes`' runtime `supportsExpressionIndex(adapter)`
      // check (MySQL >= 8.0.13, SQLite >= 3.9, never MariaDB). When the flag is
      // omitted, fall back to the coarse `adapterName === "mysql"` skip — a
      // last resort for a caller with no live connection. Live callers
      // (test-setup-dy.ts, template-global-setup.ts) must thread the flag, or
      // a MySQL-8 worker rebuild strips the canonical expression indexes.
      const dropExpression =
        supportsExpressionIndex !== undefined ? !supportsExpressionIndex : adapterName === "mysql";
      if (isExpression && dropExpression) continue;
      // schema.rb's inline current_adapter? gate (e.g. the MySQL-only
      // full_name_index) — mirrors emitTableIndexes' `opts.adapters` skip.
      if (index.adapters && adapterName !== undefined && !index.adapters.includes(adapterName))
        continue;
      const optEntries: string[] = [];
      if (index.unique) optEntries.push(`unique: true`);
      if (index.where !== undefined) optEntries.push(`where: ${JSON.stringify(index.where)}`);
      if (index.name !== undefined) optEntries.push(`name: ${JSON.stringify(index.name)}`);
      if (index.order !== undefined) optEntries.push(`order: ${JSON.stringify(index.order)}`);
      // Sub-part prefix length is MySQL-only DDL, but the abstract SchemaCreation
      // visitor now drops it on non-MySQL adapters (matching Rails), so emitting it
      // unconditionally is safe — it is silently ignored on PG/SQLite.
      if (index.length !== undefined) optEntries.push(`length: ${JSON.stringify(index.length)}`);
      if (index.nullsNotDistinct) optEntries.push(`nullsNotDistinct: true`);
      if (index.using !== undefined) optEntries.push(`using: ${JSON.stringify(index.using)}`);
      if (index.type !== undefined) optEntries.push(`type: ${JSON.stringify(index.type)}`);
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
 *
 * Pass `supportsExpressionIndex` (resolved from the caller's live DB version)
 * to gate expression indexes with `supportsExpressionIndex` semantics
 * (MySQL >= 8.0.13, SQLite >= 3.9, never MariaDB) instead of the coarse
 * `adapterName === "mysql"` skip. Omitted for the PG-only template caller,
 * where PG always supports expression indexes.
 */
export async function generateSchemaFile(
  schema: Schema,
  adapterName?: string,
  supportsExpressionIndex?: boolean,
): Promise<string> {
  const [os, fs, path] = await Promise.all([getOsAsync(), getFsAsync(), getPathAsync()]);
  const poolId = getEnv("VITEST_POOL_ID") ?? "0";
  const code = generateCode(schema, adapterName, supportsExpressionIndex);
  const filePath = path.join(os.tmpdir(), `trails-schema-${poolId}-${schemaChecksum(code)}.ts`);
  if (fs.writeFile) {
    await fs.writeFile(filePath, code);
  } else {
    fs.writeFileSync(filePath, code);
  }
  return filePath;
}
