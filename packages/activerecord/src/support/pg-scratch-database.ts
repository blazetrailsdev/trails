/** @internal */

import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { postgresSettings, postgresUrl, settingsUrl } from "./config.js";

export interface ScratchDatabase {
  connection: PostgreSQLAdapter;
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
