/**
 * PostgreSQL referential integrity — disable/enable FK constraints.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::ReferentialIntegrity
 */

import { ActiveRecordError, InvalidForeignKey } from "../../errors.js";

export interface ReferentialIntegrity {
  disableReferentialIntegrity(fn: () => Promise<void>): Promise<void>;
  checkAllForeignKeysValidBang(): Promise<void>;
}

interface ReferentialIntegritySqlHost {
  quoteTableName(name: string): string;
}

export function disableReferentialIntegritySql(
  this: ReferentialIntegritySqlHost,
  tables: string[],
): string[] {
  return tables.map((t) => `ALTER TABLE ${this.quoteTableName(t)} DISABLE TRIGGER ALL`);
}

export function enableReferentialIntegritySql(
  this: ReferentialIntegritySqlHost,
  tables: string[],
): string[] {
  return tables.map((t) => `ALTER TABLE ${this.quoteTableName(t)} ENABLE TRIGGER ALL`);
}

interface ReferentialIntegrityHost extends ReferentialIntegritySqlHost {
  execute(sql: string): Promise<unknown>;
  tables(): Promise<string[]>;
  transaction(fn: () => Promise<void>, options: { requiresNew: boolean }): Promise<unknown>;
}

// Mirrors: ReferentialIntegrity#disable_referential_integrity. Disables the
// triggers (FK checks) on the affected tables inside a requires_new
// transaction, yields, then re-enables them. Both ALTER passes are wrapped in
// `requiresNew` so a missing-superuser failure rolls back to the savepoint and
// leaves any surrounding transaction usable. Only an InvalidForeignKey raised
// by the block earns the missing-privileges warning; every other error bubbles
// up unchanged.
export async function disableReferentialIntegrity(
  this: ReferentialIntegrityHost,
  fn: () => Promise<void>,
): Promise<void> {
  let originalException: Error | null = null;

  // Snapshot the set once and re-enable exactly what we disabled. Re-deriving
  // the list after the block ran would risk re-enabling a different set if the
  // block created/dropped tables.
  //
  // Snapshotting before `fn()` means that if the block drops a table, the
  // ENABLE pass issues `ALTER TABLE <dropped> ENABLE TRIGGER ALL` against a
  // gone table. Postgres raises undefined_table (42P01), which the adapter
  // translates to StatementInvalid (an ActiveRecordError), so the enable-pass
  // catch below swallows it — same as Rails silently rescues enable-pass
  // errors (referential_integrity.rb:28-34).
  const tables = await this.tables();

  // An empty database has no triggers to toggle, so skip both ALTER passes — but
  // still route `fn()` through the shared catch below so an InvalidForeignKey it
  // raises earns the missing-privileges warning Rails always prints
  // (referential_integrity.rb:20-30), matching the non-empty path.
  if (tables.length > 0) {
    try {
      await this.transaction(
        async () => {
          await this.execute(disableReferentialIntegritySql.call(this, tables).join(";"));
        },
        { requiresNew: true },
      );
    } catch (e) {
      if (e instanceof ActiveRecordError) originalException = e as Error;
      else throw e;
    }
  }

  try {
    await fn();
  } catch (e) {
    if (e instanceof InvalidForeignKey) {
      console.warn(
        `WARNING: Rails was not able to disable referential integrity.\n\n` +
          `This is most likely caused due to missing permissions.\n` +
          `Rails needs superuser privileges to disable referential integrity.\n\n` +
          `    cause: ${originalException?.message ?? ""}\n`,
      );
    }
    throw e;
  }

  if (tables.length === 0) return;

  try {
    await this.transaction(
      async () => {
        await this.execute(enableReferentialIntegritySql.call(this, tables).join(";"));
      },
      { requiresNew: true },
    );
  } catch (e) {
    if (!(e instanceof ActiveRecordError)) throw e;
  }
}

// Mirrors: ReferentialIntegrity#check_all_foreign_keys_valid!
// Rails uses `transaction(requires_new: true)` — a savepoint when already
// inside a transaction, or a fresh BEGIN otherwise.
export async function checkAllForeignKeysValidBang(this: ReferentialIntegrityHost): Promise<void> {
  await this.transaction(
    async () => {
      const sql = `
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
      await this.execute(sql);
    },
    { requiresNew: true },
  );
}
