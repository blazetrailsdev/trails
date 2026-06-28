/**
 * "One-schema" test mode (RFC: existing-db-schema). Opt-in via `AR_ONE_SCHEMA=1`.
 *
 * The canonical `TEST_SCHEMA` is laid into each worker's slot DB exactly once
 * (the global template clone). In this mode the per-test reset truncates the
 * canonical tables instead of dropping them, and `defineSchema` issues no DDL
 * at all: a call is accepted as a no-op as long as every table/column it names
 * MATCHES the canonical schema. A request may name a *subset* of canonical
 * tables and a *subset* of a table's columns — what it must not do is deviate
 * (name a table or column the canonical schema lacks, or declare a different
 * type/shape). A deviation throws {@link OneSchemaViolation}, so the file is
 * excluded (see `eslint/one-schema-exclude.json`) and tracked as a conversion
 * story. The whole run thus issues `CREATE TABLE` only at boot and never a
 * single `DROP TABLE`.
 *
 * @internal
 */

import {
  columnsOf,
  isWrappedSchema,
  type ColumnSpec,
  type IndexSpec,
  type Schema,
  type TableSchema,
} from "./define-schema.js";
import { TEST_SCHEMA } from "./test-schema.js";

/** @internal */
export function oneSchemaMode(): boolean {
  return process.env.AR_ONE_SCHEMA === "1";
}

interface NormColumn {
  type: string;
  opts: Map<string, string>;
}

/**
 * Adapter-independent structured form of a column spec. The shorthand
 * `"string"` and longhand `{ type: "string" }` normalize identically.
 * Function defaults (`defaultFunction`) stringify to their source so a
 * `() => "CURRENT_TIMESTAMP"` compares by body.
 *
 * @internal
 */
function normalizeColumn(spec: ColumnSpec): NormColumn {
  if (typeof spec === "string") return { type: spec, opts: new Map() };
  const opts = new Map<string, string>();
  for (const k of Object.keys(spec)) {
    if (k === "type") continue;
    const v = (spec as Record<string, unknown>)[k];
    if (v === undefined) continue;
    opts.set(k, JSON.stringify(typeof v === "function" ? String(v) : v));
  }
  return { type: spec.type, opts };
}

/**
 * Whether a test's requested column is COMPATIBLE with the canonical column.
 * The base type must match. Under-specification is fine — a test may omit
 * options the canonical column carries (e.g. ask for `"string"` where canonical
 * is `{ string, limit: 250 }`); the real column keeps its full definition. Only
 * a CONFLICT is a deviation: an option the test declares whose value disagrees
 * with canonical (or which canonical doesn't carry at all).
 *
 * @internal
 */
function columnCompatible(canon: NormColumn, req: NormColumn): boolean {
  if (canon.type !== req.type) return false;
  for (const [k, v] of req.opts) {
    if (canon.opts.get(k) !== v) return false;
  }
  return true;
}

/**
 * Index key includes `name`: Rails passes `options[:name]` straight through to
 * `add_index` (schema_statements.rb:915, :1000), so an index declared with a
 * custom name is a genuinely different index from the canonical auto-named one
 * — leaving the test running against an index it didn't declare. A request that
 * omits `name` (the common, auto-named case) only matches a canonical index
 * that is itself auto-named.
 * @internal
 */
function normalizeIndex(ix: IndexSpec): string {
  const cols = Array.isArray(ix.columns) ? ix.columns : [ix.columns];
  return JSON.stringify({
    columns: cols,
    unique: !!ix.unique,
    where: ix.where ?? null,
    name: ix.name ?? null,
  });
}

/**
 * The effective primary-key shape of a table request, independent of wrapper
 * form. An unwrapped request — or a wrapper that omits `primaryKey` — means
 * Rails' `create_table` default of `id: :primary_key` (schema_statements.rb:293,
 * mirrored by define-schema.ts), so it must compare equal to a canonical table
 * that also defaults its id, and UNEQUAL to a canonical id-less (`false`) or
 * composite-key (`string[]`) table. Encoded the same way as the canonical side
 * (`pk ?? null`) so the default-id case is the shared `null` sentinel.
 * @internal
 */
function effectivePrimaryKey(table: TableSchema): string {
  const pk = isWrappedSchema(table) ? table.primaryKey : undefined;
  return JSON.stringify(pk ?? null);
}

interface CanonicalTable {
  columns: Map<string, NormColumn>;
  primaryKey: string;
  indexes: Set<string>;
}

let _canonical: Map<string, CanonicalTable> | null = null;

/** @internal */
function canonical(): Map<string, CanonicalTable> {
  if (_canonical) return _canonical;
  const m = new Map<string, CanonicalTable>();
  for (const [table, raw] of Object.entries(TEST_SCHEMA)) {
    const cols = new Map<string, NormColumn>();
    for (const [name, spec] of Object.entries(columnsOf(raw))) {
      cols.set(name, normalizeColumn(spec));
    }
    const indexes = new Set((isWrappedSchema(raw) ? (raw.indexes ?? []) : []).map(normalizeIndex));
    m.set(table, { columns: cols, primaryKey: effectivePrimaryKey(raw), indexes });
  }
  _canonical = m;
  return m;
}

/**
 * Throw if `schema` deviates from canonical `TEST_SCHEMA`. A request is
 * accepted when every table it names exists canonically and every column it
 * declares matches the canonical column exactly; declaring *fewer* tables or
 * columns is fine. Deviations — an unknown table, an unknown column, a column
 * whose type/options differ, or a primary-key/index the canonical table
 * doesn't have — are rejected.
 *
 * @internal
 */
export function assertCanonicalSchema(schema: Schema): void {
  const canon = canonical();
  for (const [table, raw] of Object.entries(schema)) {
    const ct = canon.get(table);
    if (!ct) {
      throw new OneSchemaViolation(
        `AR_ONE_SCHEMA: defineSchema requested table "${table}", which is not in the ` +
          `canonical TEST_SCHEMA. Convert this file to canonical fixtures or add it to ` +
          `eslint/one-schema-exclude.json.`,
      );
    }
    for (const [col, spec] of Object.entries(columnsOf(raw))) {
      const want = ct.columns.get(col);
      if (want === undefined) {
        throw new OneSchemaViolation(
          `AR_ONE_SCHEMA: defineSchema table "${table}" declares column "${col}", which is ` +
            `not on the canonical "${table}". Converge to canonical or exclude this file.`,
        );
      }
      if (!columnCompatible(want, normalizeColumn(spec))) {
        throw new OneSchemaViolation(
          `AR_ONE_SCHEMA: defineSchema column "${table}.${col}" conflicts with the canonical ` +
            `column (different type or an option value that disagrees). Converge to canonical ` +
            `or exclude this file.`,
        );
      }
    }
    // Compare the EFFECTIVE primary key regardless of wrapper form: an
    // unwrapped (or primaryKey-less) request implies Rails' default `id`, which
    // must not be silently accepted against an id-less/composite canonical table.
    if (effectivePrimaryKey(raw) !== ct.primaryKey) {
      throw new OneSchemaViolation(
        `AR_ONE_SCHEMA: defineSchema table "${table}" implies a primary key that differs from ` +
          `canonical (an unwrapped request defaults to an \`id\` column; canonical "${table}" ` +
          `does not). Declare the canonical primary key or exclude this file.`,
      );
    }
    if (isWrappedSchema(raw)) {
      for (const ix of raw.indexes ?? []) {
        if (!ct.indexes.has(normalizeIndex(ix))) {
          throw new OneSchemaViolation(
            `AR_ONE_SCHEMA: defineSchema table "${table}" declares an index the canonical ` +
              `table lacks. Converge to canonical or exclude this file.`,
          );
        }
      }
    }
  }
}

/** @internal */
export class OneSchemaViolation extends Error {
  override name = "OneSchemaViolation";
}

/** Canonical table names in declared order (used for truncate-reset). @internal */
export function canonicalTableNames(): string[] {
  return Object.keys(TEST_SCHEMA);
}
