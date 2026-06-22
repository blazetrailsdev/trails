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

// Host for the *Sql helpers: quoting dispatches through the adapter instance
// (`this.quoteTableName`) so a sub-adapter can override it polymorphically,
// rather than binding to the dialect's freestanding quoteTableName.
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

// Host for the instance methods: the adapter supplies its transaction/execute
// machinery and table listing, plus the `*Sql` host (`quoteTableName`).
interface ReferentialIntegrityHost extends ReferentialIntegritySqlHost {
  execute(sql: string): Promise<unknown>;
  tables(): Promise<string[]>;
  transaction(fn: () => Promise<void>, options: { requiresNew: boolean }): Promise<unknown>;
  inTransaction: boolean;
  isTransactionOpen(): boolean;
  openTransactions: number;
  materializeTransactions(): Promise<void>;
  createSavepoint(name: string): Promise<unknown>;
  releaseSavepoint(name: string): Promise<unknown>;
  rollbackToSavepoint(name: string): Promise<unknown>;
  beginTransaction(): Promise<unknown>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
}

// Mirrors: ReferentialIntegrity#disable_referential_integrity. Disables every
// table's triggers (FK checks) inside a requires_new transaction, yields, then
// re-enables them. Both ALTER passes are wrapped in `requiresNew` so a
// missing-superuser failure rolls back to the savepoint and leaves any
// surrounding transaction usable. Only an InvalidForeignKey raised by the block
// earns the missing-privileges warning; every other error bubbles up unchanged.
export async function disableReferentialIntegrity(
  this: ReferentialIntegrityHost,
  fn: () => Promise<void>,
): Promise<void> {
  let originalException: Error | null = null;

  try {
    await this.transaction(
      async () => {
        await this.execute(
          disableReferentialIntegritySql.call(this, await this.tables()).join(";"),
        );
      },
      { requiresNew: true },
    );
  } catch (e) {
    if (e instanceof ActiveRecordError) originalException = e as Error;
    else throw e;
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

  try {
    await this.transaction(
      async () => {
        await this.execute(enableReferentialIntegritySql.call(this, await this.tables()).join(";"));
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
  if (this.inTransaction || this.isTransactionOpen()) {
    // Materialize any lazy transaction so the savepoint lands inside the
    // real PG transaction (mirrors Rails' transaction(requires_new: true)).
    await this.materializeTransactions();
    // Mirror Rails' savepoint naming: "active_record_#{stack.size}" (transaction.rb:528).
    // Using openTransactions+1 makes repeated calls in the same transaction safe.
    const sp = `active_record_${this.openTransactions + 1}`;
    await this.createSavepoint(sp);
    try {
      await this.execute(CHECK_ALL_FOREIGN_KEYS_SQL);
      await this.releaseSavepoint(sp);
    } catch (e) {
      await this.rollbackToSavepoint(sp);
      await this.releaseSavepoint(sp).catch(() => {});
      throw e;
    }
  } else {
    await this.beginTransaction();
    try {
      await this.execute(CHECK_ALL_FOREIGN_KEYS_SQL);
      await this.commit();
    } catch (e) {
      await this.rollback();
      throw e;
    }
  }
}
