/**
 * A throwaway PostgreSQL database for a suite whose subject is a DDL statement
 * against a *canonical* table name.
 *
 * `exclusion_constraint_test.rb:16-25` and `unique_constraint_test.rb:14-22`
 * both `create_table force: true` a table schema.rb already lays — `invoices`
 * (`schema.rb:675`) and `sections` (`schema.rb:1090`) — and drop it again in
 * teardown, leaving the shared schema short for whatever runs next. Rails
 * tolerates that; trails' canonical schema is shared across a worker's files,
 * so `sections` disappearing takes the session/seminar association suites with
 * it (RFC 0079).
 *
 * The remedy is the one `support/setup-second-pool.ts` already uses for
 * `arunit2`: a database of its own, created through the primary connection, so
 * the clobber-and-drop happens somewhere nothing else reads. The name is
 * derived from the worker's own primary database, so parallel workers and
 * lanes cannot collide.
 *
 * @internal
 */

import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { postgresSettings, postgresUrl, settingsUrl } from "./config.js";

/** An open connection to a scratch database, plus its teardown. */
export interface ScratchDatabase {
  connection: PostgreSQLAdapter;
  /** Closes the connection and drops the database. */
  drop(): Promise<void>;
}

async function withRootConnection(body: (root: PostgreSQLAdapter) => Promise<void>): Promise<void> {
  const root = new PostgreSQLAdapter(postgresUrl());
  try {
    await body(root);
  } finally {
    await root.close();
  }
}

/**
 * Creates `<primary database>_<suffix>` — dropping a leftover from an earlier
 * run first, as `provisionSecondDatabase` does — and opens a connection on it.
 */
export async function openScratchDatabase(suffix: string): Promise<ScratchDatabase> {
  const settings = postgresSettings();
  const database = `${settings.database}_${suffix}`;

  await withRootConnection(async (root) => {
    await root.recreateDatabase(database);
  });

  const connection = new PostgreSQLAdapter(settingsUrl("postgres", { ...settings, database }));
  return {
    connection,
    async drop() {
      await connection.close();
      await withRootConnection(async (root) => {
        await root.dropDatabase(database);
      });
    },
  };
}
