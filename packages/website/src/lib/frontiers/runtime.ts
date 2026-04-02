import type { SqlJsStatic } from "sql.js";
import { SqlJsAdapter } from "./sql-js-adapter.js";
import { VirtualFS } from "./virtual-fs.js";
import { createTrailCLI, dropUserTables, type CliResult } from "./trail-cli.js";
import type { MigrationProxy } from "@blazetrails/activerecord/migration";

export type { VirtualFS, VfsFile } from "./virtual-fs.js";
export type { CliResult } from "./trail-cli.js";

export interface Runtime {
  adapter: SqlJsAdapter;
  vfs: VirtualFS;

  executeSQL: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  getTables: () => string[];

  registerMigration: (proxy: MigrationProxy) => void;
  getMigrations: () => MigrationProxy[];
  clearMigrations: () => void;

  exec: (command: string) => Promise<CliResult>;

  exportDB: () => Uint8Array;
  /** Replaces the database. Callers must re-read runtime.adapter/runtime.vfs
   * after calling — previous references become stale. */
  loadDB: (data: Uint8Array) => void;

  reset: () => void;
}

function createMigrationRegistry() {
  let migrations: MigrationProxy[] = [];

  return {
    register(proxy: MigrationProxy) {
      const idx = migrations.findIndex((m) => m.version === proxy.version);
      if (idx >= 0) {
        migrations[idx] = proxy;
      } else {
        migrations.push(proxy);
      }
    },
    getAll: () => [...migrations],
    clear() {
      migrations = [];
    },
  };
}

export async function createRuntime(SQL: SqlJsStatic): Promise<Runtime> {
  let db = new SQL.Database();
  let adapter = new SqlJsAdapter(db);
  let vfs = new VirtualFS(adapter);
  const registry = createMigrationRegistry();

  function executeCode(_code: string): Promise<unknown> {
    throw new Error(
      "Code execution is not yet supported in this runtime. " +
        "db:migrate, db:rollback, and db:seed require a sandboxed eval context.",
    );
  }

  function buildCli() {
    return createTrailCLI({
      vfs,
      adapter,
      executeCode,
      getMigrations: registry.getAll,
      registerMigration: registry.register,
      clearMigrations: registry.clear,
      getTables: () => adapter.getTables(),
    });
  }

  let cli = buildCli();

  const runtime: Runtime = {
    adapter,
    vfs,

    executeSQL: (sql) => adapter.execRaw(sql),
    getTables: () => adapter.getTables(),

    registerMigration: registry.register,
    getMigrations: registry.getAll,
    clearMigrations: registry.clear,

    exec: (command) => cli.exec(command),

    exportDB: () => db.export(),
    loadDB: (data) => {
      db = new SQL.Database(data);
      adapter = new SqlJsAdapter(db);
      vfs = new VirtualFS(adapter);
      runtime.adapter = adapter;
      runtime.vfs = vfs;
      cli = buildCli();
      registry.clear();
    },

    reset: () => {
      vfs.clear();
      dropUserTables(adapter, () => adapter.getTables());
      registry.clear();
    },
  };

  return runtime;
}
