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

interface ReferentialIntegrityHost {
  quoteTableName(name: string): string;
  execute(sql: string): Promise<unknown>;
  tables(): Promise<string[]>;
  transaction(fn: () => Promise<void>, options: { requiresNew: boolean }): Promise<unknown>;
}

// Mirrors: ReferentialIntegrity#disable_referential_integrity
// (referential_integrity.rb:7-38).
export async function disableReferentialIntegrity(
  this: ReferentialIntegrityHost,
  fn: () => Promise<void>,
): Promise<void> {
  let originalException: Error | null = null;

  try {
    await this.transaction(
      async () => {
        await this.execute(
          (await this.tables())
            .map((name) => `ALTER TABLE ${this.quoteTableName(name)} DISABLE TRIGGER ALL`)
            .join(";"),
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
        await this.execute(
          (await this.tables())
            .map((name) => `ALTER TABLE ${this.quoteTableName(name)} ENABLE TRIGGER ALL`)
            .join(";"),
        );
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
