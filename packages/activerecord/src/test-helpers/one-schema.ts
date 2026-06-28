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

/** @internal */
function normalizeIndex(ix: IndexSpec): string {
  const cols = Array.isArray(ix.columns) ? ix.columns : [ix.columns];
  return JSON.stringify({ columns: cols, unique: !!ix.unique, where: ix.where ?? null });
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
    const pk = isWrappedSchema(raw) ? raw.primaryKey : undefined;
    const indexes = new Set((isWrappedSchema(raw) ? (raw.indexes ?? []) : []).map(normalizeIndex));
    m.set(table, { columns: cols, primaryKey: JSON.stringify(pk ?? null), indexes });
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
    if (isWrappedSchema(raw)) {
      if (raw.primaryKey !== undefined && JSON.stringify(raw.primaryKey) !== ct.primaryKey) {
        throw new OneSchemaViolation(
          `AR_ONE_SCHEMA: defineSchema table "${table}" declares a primary key that differs ` +
            `from canonical. Converge to canonical or exclude this file.`,
        );
      }
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
