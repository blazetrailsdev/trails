/**
 * PostgreSQL referential integrity — disable/enable FK constraints.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::ReferentialIntegrity
 */

import { quoteTableName } from "./quoting.js";

export interface ReferentialIntegrity {
  disableReferentialIntegrity(fn: () => Promise<void>): Promise<void>;
  checkAllForeignKeysValidBang(): Promise<void>;
}

export function disableReferentialIntegritySql(tables: string[]): string[] {
  return tables.map((t) => `ALTER TABLE ${quoteTableName(t)} DISABLE TRIGGER ALL`);
}

export function enableReferentialIntegritySql(tables: string[]): string[] {
  return tables.map((t) => `ALTER TABLE ${quoteTableName(t)} ENABLE TRIGGER ALL`);
}

// Mirrors: ReferentialIntegrity#check_all_foreign_keys_valid!
// Marks every FK constraint as unvalidated then immediately re-validates, causing
// the database to raise if any constraint is currently violated.
export const CHECK_ALL_FOREIGN_KEYS_SQL = `
do $$
  declare r record;
BEGIN
FOR r IN (
  SELECT FORMAT(
    'UPDATE pg_catalog.pg_constraint SET convalidated=false WHERE conname = ''%1$I'' AND connamespace::regnamespace = ''%2$I''::regnamespace; ALTER TABLE %2$I.%3$I VALIDATE CONSTRAINT %1$I;',
    constraint_name,
    table_schema,
    table_name
  ) AS constraint_check
  FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY'
)
  LOOP
    EXECUTE (r.constraint_check);
  END LOOP;
END;
$$;
`.trim();
