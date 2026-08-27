import { describe, it, type SuiteFactory, type TestFunction } from "vitest";
import { adapterType } from "../test-adapter.js";
import { inMemoryDb } from "./adapter-helper.js";

const ALL = ["postgres", "mysql", "sqlite"] as const;
type Backend = (typeof ALL)[number];

const mysql =
  adapterType === "mysql"
    ? await import("./mysql-server-version.js")
    : {
        supportsExpressionIndex: false,
        supportsJson: false,
        supportsOptimizerHints: false,
        supportsInsertReturning: false,
        supportsTextColumnWithDefault: false,
        supportsNonUniqueConstraintName: false,
        supportsSqlStandardDropConstraint: false,
        supportsDefaultExpression: false,
        supportsCheckConstraints: false,
      };

function withMysql(base: readonly Backend[], supported: boolean): readonly Backend[] {
  return supported ? [...base, "mysql"] : base;
}

const SUPPORTS: Readonly<Record<string, readonly Backend[]>> = {
  savepoints: ALL,
  foreign_keys: ALL,
  check_constraints: withMysql(["postgres", "sqlite"], mysql.supportsCheckConstraints),
  json: withMysql(["postgres", "sqlite"], mysql.supportsJson),
  comments: ["postgres", "mysql"],
  concurrent_connections: inMemoryDb() ? ["postgres", "mysql"] : ALL,
  insert_conflict_target: ["postgres", "sqlite"],
  advisory_locks: ["postgres", "mysql"],
  exclusion_constraints: ["postgres"],
  unique_constraints: ["postgres"],
  validate_constraints: ["postgres"],
  deferrable_constraints: ["postgres", "sqlite"],
  expression_index: withMysql(["postgres", "sqlite"], mysql.supportsExpressionIndex),
  bulk_alter: ["postgres", "mysql"],
  ddl_transactions: ["postgres", "sqlite"],
  partial_index: ["postgres", "sqlite"],
  index_include: ["postgres"],
  identity_columns: ["postgres"],
  nulls_not_distinct: ["postgres"],
  native_partitioning: ["postgres"],
  partitioned_indexes: ["postgres"],
  pgcrypto_uuid: ["postgres"],
  insert_returning: withMysql(["postgres", "sqlite"], mysql.supportsInsertReturning),
  text_column_with_default: withMysql(["postgres", "sqlite"], mysql.supportsTextColumnWithDefault),
  non_unique_constraint_name: withMysql([], mysql.supportsNonUniqueConstraintName),
  sql_standard_drop_constraint: withMysql(["postgres"], mysql.supportsSqlStandardDropConstraint),
  common_table_expressions: ALL,
  insert_on_duplicate_skip: ALL,
  insert_on_duplicate_update: ALL,
  explain: ALL,
  views: ALL,
  datetime_with_precision: ALL,
  virtual_columns: ALL,
  foreign_tables: ["postgres"] as readonly Backend[],
  default_expression: withMysql(["postgres"], mysql.supportsDefaultExpression),
  optimizer_hints: withMysql([], mysql.supportsOptimizerHints),
  transaction_isolation: ALL,
};

export const SUPPORTS_FEATURES: readonly string[] = Object.keys(SUPPORTS);

export function adapterSupports(feature: string): boolean {
  if (feature.includes(",")) {
    const answers = feature.split(",").map((f) => adapterSupports(f.trim()));
    return answers.every(Boolean);
  }
  const backends = SUPPORTS[feature];
  if (!backends) {
    throw new Error(
      `adapterSupports: unknown feature "${feature}". Add it to ` +
        `support/supports.ts (mirror the adapter's supports_${feature}? method). ` +
        `Known: ${Object.keys(SUPPORTS).sort().join(", ")}.`,
    );
  }
  return backends.includes(adapterType);
}

export function describeIfSupports(feature: string, name: string, factory: SuiteFactory): void {
  (adapterSupports(feature) ? describe : describe.skip)(name, factory);
}

function _itIfSupports(feature: string, name: string, fn: TestFunction, timeout?: number): void {
  (adapterSupports(feature) ? it : it.skip)(name, fn, timeout);
}

export const itIfSupports = Object.assign(_itIfSupports, {
  skipIf:
    (cond: boolean) =>
    (feature: string, name: string, fn: TestFunction, timeout?: number): void =>
      (!cond && adapterSupports(feature) ? it : it.skip)(name, fn, timeout),
});
