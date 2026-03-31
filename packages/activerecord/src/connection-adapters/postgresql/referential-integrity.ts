/**
 * PostgreSQL referential integrity — disable/enable FK constraints.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::ReferentialIntegrity
 */

import { quoteTableName } from "./quoting.js";

export interface ReferentialIntegrity {
  disableReferentialIntegrity(): Promise<void>;
  enableReferentialIntegrity(): Promise<void>;
}

export function disableReferentialIntegritySql(tables: string[]): string[] {
  return tables.map((t) => `ALTER TABLE ${quoteTableName(t)} DISABLE TRIGGER ALL`);
}

export function enableReferentialIntegritySql(tables: string[]): string[] {
  return tables.map((t) => `ALTER TABLE ${quoteTableName(t)} ENABLE TRIGGER ALL`);
}
