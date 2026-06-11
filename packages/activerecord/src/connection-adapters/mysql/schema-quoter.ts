/**
 * Builds the {@link SchemaQuoter} consumed by the MySQL schema visitor
 * (`SchemaCreation`) and table definitions.
 *
 * Identifier/table/value quoting dispatches through the adapter instance when
 * one is threaded — so a future sub-adapter (e.g. a MariaDB/MySQL split) can
 * override `quoteIdentifier` / `quoteTableName` / `quote` polymorphically —
 * falling back to the dialect's standalone helpers for host-less (unit-test)
 * construction. `quoteDefaultExpression` stays on the abstract implementation
 * to preserve the exact emitted SQL.
 */

import { quote, quoteIdentifier, quoteTableName } from "./quoting.js";
import { quoteDefaultExpression } from "../abstract/quoting.js";

/** @internal Schema-quoter surface the MySQL visitor depends on. */
export interface MysqlSchemaQuoter {
  quoteIdentifier(name: string): string;
  quoteTableName(name: string): string;
  quoteDefaultExpression(value: unknown, column?: unknown): string;
  quote(value: unknown): string;
}

/** @internal */
export function mysqlSchemaQuoter(host?: Partial<MysqlSchemaQuoter>): MysqlSchemaQuoter {
  return {
    quoteIdentifier: host?.quoteIdentifier?.bind(host) ?? quoteIdentifier,
    quoteTableName: host?.quoteTableName?.bind(host) ?? quoteTableName,
    quote: host?.quote?.bind(host) ?? quote,
    quoteDefaultExpression,
  };
}
