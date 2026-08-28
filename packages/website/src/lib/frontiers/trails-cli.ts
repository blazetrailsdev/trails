import type { VirtualFS } from "./virtual-fs.js";
import type { SqlJsAdapter } from "./sql-js-adapter.js";
import { VfsModelGenerator, VfsMigrationGenerator, VfsAppGenerator } from "./vfs-generator.js";
import type { Migration, MigrationProxy } from "@blazetrails/activerecord/migration";
import { MigrationContext } from "@blazetrails/activerecord/migration";
import { InternalMetadata, SchemaMigration } from "@blazetrails/activerecord";
import {
  camelize,
  getProcessAdapter,
  processAdapterConfig,
  registerProcessAdapter,
  type ProcessAdapter,
} from "@blazetrails/activesupport";

export interface CliResult {
  success: boolean;
  output: string[];
  exitCode: number;
}

interface ParsedInput {
  command: string;
  args: string[];
  opts: Record<string, string>;
}

function parseInput(input: string): ParsedInput {
  const parts = input.trim().split(/\s+/);
  const command = parts[0] ?? "";
  const args: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith("--")) {
      const key = parts[i].slice(2);
      const next = parts[i + 1];
      if (next && !next.startsWith("--")) {
        opts[key] = next;
        i++;
      } else opts[key] = "true";
    } else {
      args.push(parts[i]);
    }
  }
  return { command, args, opts };
}

// NOTE: The up/down implementations assume executeCode will register migrations
// via deps.registerMigration. When executeCode is implemented, it must either:
// (a) evaluate the file in a sandbox that exposes registerMigration, or
// (b) be changed to return the migration class directly so we can build the
//     proxy without the registry lookup.
/**
 * The `MigrationContext` every `db:*` command runs through, over the browser's
 * virtual FS instead of a directory: Rails' `migration_files`
 * (`migration.rb:1369-1372`) is private, and a Ruby private method is still
 * overridable by a subclass, so discovery is repointed there and the run
 * surface (`migrate` / `rollback` / `open` / `migrations_status`) is inherited
 * unchanged. `parse_migration_filename` is NOT overridden — the inherited
 * `migration.rb:1374-1376` regex already reads
 * `db/migrate/<version>_<name>.ts`, scope group included.
 */
class VfsMigrationContext extends MigrationContext {
  constructor(
    private readonly vfs: VirtualFS,
    private readonly executeCode: (code: string) => Promise<unknown>,
    private readonly getMigrations: () => MigrationProxy[],
    schemaMigration: SchemaMigration,
    internalMetadata: InternalMetadata,
  ) {
    super(["db/migrate"], schemaMigration, internalMetadata);
  }

  protected override migrationFiles(): string[] {
    return this.vfs
      .list()
      .map((f) => f.path)
      .filter((path) => path.startsWith("db/migrate/") && this.parseMigrationFilename(path))
      .sort();
  }

  override get migrations(): MigrationProxy[] {
    const migrations = this.migrationFiles().flatMap((path) => {
      const parsed = this.parseMigrationFilename(path);
      if (!parsed) return [];
      const [rawVersion, name, scope] = parsed;
      return [
        {
          version: Number(rawVersion),
          name: camelize(name),
          filename: path,
          scope: scope || undefined,
          migration: async (): Promise<Migration> => {
            const content = this.vfs.read(path)?.content;
            if (!content) throw new Error(`File not found: ${path}`);
            await this.executeCode(content);
            const reg = this.getMigrations().find((r) => r.version === rawVersion);
            if (!reg) {
              throw new Error(
                `Migration ${rawVersion} from ${path} did not register after execution`,
              );
            }
            return reg.migration();
          },
        },
      ];
    });

    // `migrations.sort_by(&:version)` (`migration.rb:1315`) — lexicographic
    // path order puts `10_` before `2_`.
    return migrations.sort((a, b) => Number(a.version) - Number(b.version));
  }
}

export interface TrailsCliDeps {
  vfs: VirtualFS;
  adapter: SqlJsAdapter;
  executeCode: (code: string) => Promise<unknown>;
  getMigrations: () => MigrationProxy[];
  registerMigration: (proxy: MigrationProxy) => void;
  clearMigrations: () => void;
  getTables: () => string[];
}

export function dropUserTables(adapter: SqlJsAdapter, getTables: () => string[]): number {
  const tables = getTables().filter((t) => !t.startsWith("_vfs_"));
  for (const table of tables) {
    adapter.execRaw(`DROP TABLE IF EXISTS "${table.replace(/"/g, '""')}"`);
  }
  return tables.length;
}

let stdoutSink: (chunk: string) => void = () => {};

/** Minimal ProcessAdapter so the activesupport `stdout` shim works in the browser. */
const browserProcessAdapter: ProcessAdapter = {
  envSnapshot: () => ({}),
  argvSnapshot: () => [],
  cwd: () => "/",
  chdir: () => {},
  platform: () => "browser",
  setEnv: () => {},
  exit: () => {
    throw new Error("exit() is not supported in the browser CLI");
  },
  setExitCode: () => {},
  onSignal: () => () => {},
  stdout: {
    write: (chunk) => {
      stdoutSink(chunk);
      return true;
    },
    isTTY: false,
  },
  stderr: {
    write: (chunk) => {
      stdoutSink(chunk);
      return true;
    },
    isTTY: false,
  },
  stdin: { isTTY: false, read: async () => null },
};

export function createTrailsCLI(deps: TrailsCliDeps) {
  const { vfs, adapter } = deps;
  const output: string[] = [];
  function log(msg: string) {
    output.push(msg);
  }

  // Ruby loads a migration file by autoloading it; here it has to be evaluated,
  // so running one is conditional on the host offering an eval context. The
  // Migrator reaches AR's connection handler first, so without this the host's
  // own explanation is masked by "No database connection defined.".
  async function requireEvalContext(): Promise<void> {
    await deps.executeCode("");
  }

  async function withMigrationContext(
    fn: (migrationContext: MigrationContext) => Promise<void>,
  ): Promise<void> {
    const migrationContext = new VfsMigrationContext(
      vfs,
      deps.executeCode,
      deps.getMigrations,
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    if (migrationContext.migrations.length === 0) {
      log("No migrations found in db/migrate/.");
      return;
    }
    // Migration output goes to stdout (Rails' Migration#write is `puts`), and
    // the browser has no process — so the shim's stdout is pointed at this
    // CLI's output buffer for the duration of the run. Any adapter the host
    // already registered (e.g. the Node one under test) is restored after.
    const prevAdapter = processAdapterConfig.adapter === null ? null : getProcessAdapter();
    registerProcessAdapter(browserProcessAdapter);
    stdoutSink = (chunk) => log(chunk.replace(/\n$/, ""));
    try {
      await fn(migrationContext);
    } finally {
      stdoutSink = () => {};
      if (prevAdapter) registerProcessAdapter(prevAdapter);
    }
  }

  const commands: Record<string, (args: string[], opts: Record<string, string>) => Promise<void>> =
    {
      new: async (args) => {
        const name = args[0];
        if (!name) {
          log("Usage: new <app-name>");
          return;
        }

        vfs.clear();
        dropUserTables(adapter, deps.getTables);
        deps.clearMigrations();

        const gen = new VfsAppGenerator({ vfs, output: log, appPath: name, database: "sqlite" });
        await gen.run();
      },

      generate: async (args) => {
        const type = args[0];
        const name = args[1];
        const columnArgs = args.slice(2);

        if (!type || !name) {
          log("Usage: generate <type> <name> [columns...]");
          log("Types: model, migration");
          return;
        }

        if (type === "model") {
          const gen = new VfsModelGenerator({ vfs, output: log });
          gen.run(name, columnArgs);
        } else if (type === "migration") {
          const gen = new VfsMigrationGenerator({ vfs, output: log });
          gen.run(name, columnArgs);
        } else {
          throw new Error(`Unknown generator: ${type}. Available: model, migration`);
        }
      },

      g: async (args, opts) => {
        await commands["generate"](args, opts);
      },

      "db:migrate": async (_args, opts) => {
        await requireEvalContext();
        const version = opts.version && opts.version !== "true" ? opts.version : null;
        await withMigrationContext(async (migrationContext) => {
          await migrationContext.migrate(version);
          const pending = await migrationContext.open().pendingMigrations();
          log(
            pending.length === 0
              ? "All migrations are up to date."
              : `${pending.length} migration(s) pending.`,
          );
        });
      },

      "db:rollback": async (_args, opts) => {
        await requireEvalContext();
        const parsed = parseInt(opts.step ?? "1", 10);
        const step = Number.isNaN(parsed) ? 1 : parsed;
        await withMigrationContext(async (migrationContext) => {
          await migrationContext.rollback(step);
        });
      },

      "db:migrate:status": async () => {
        await withMigrationContext(async (migrationContext) => {
          if (!(await migrationContext.schemaMigration.tableExists())) {
            throw new Error("Schema migrations table does not exist yet.");
          }
          const statuses = await migrationContext.migrationsStatus();
          log("");
          log(" Status   Migration ID    Migration Name");
          log("--------------------------------------------------");
          for (const s of statuses) {
            const statusStr = s.status === "up" ? "  up  " : " down ";
            log(`${statusStr}   ${s.version.padEnd(16)}${s.name}`);
          }
          log("");
        });
      },

      "db:seed": async () => {
        const seedFile = vfs.read("db/seeds.ts");
        if (!seedFile) {
          log("No seeds file found at db/seeds.ts");
          return;
        }
        log("Running seeds...");
        await deps.executeCode(seedFile.content);
        log("Seeds completed.");
      },

      "db:setup": async (_args, opts) => {
        await commands["db:migrate"]([], opts);
        await commands["db:seed"]([], opts);
      },

      "db:reset": async (_args, opts) => {
        await commands["db:drop"]([], opts);
        await commands["db:migrate"]([], opts);
        await commands["db:seed"]([], opts);
      },

      "db:drop": async () => {
        const count = dropUserTables(adapter, deps.getTables);
        log(`Dropped ${count} table(s).`);
      },

      sql: async (args) => {
        const fileOrSql = args.join(" ");
        if (!fileOrSql) {
          log("Usage: sql <file.sql | SELECT ...>");
          return;
        }

        const file = vfs.read(fileOrSql) ?? vfs.read(fileOrSql + ".sql");
        const sqlText = file ? file.content : fileOrSql;

        const cleanedSql = sqlText
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n");
        const statements = cleanedSql
          .split(/;/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);

        let hasError = false;
        for (const stmt of statements) {
          try {
            const results = adapter.execRaw(stmt);
            if (results.length > 0) {
              for (const result of results) {
                const widths = result.columns.map((c, i) => {
                  let maxVal = c.length;
                  for (const row of result.values) {
                    const len = String(row[i] ?? "NULL").length;
                    if (len > maxVal) maxVal = len;
                  }
                  return Math.min(maxVal, 30);
                });
                log(result.columns.map((c, i) => c.padEnd(widths[i])).join(" | "));
                log(widths.map((w) => "-".repeat(w)).join("-+-"));
                for (const row of result.values) {
                  log(
                    row
                      .map((v, i) =>
                        String(v ?? "NULL")
                          .padEnd(widths[i])
                          .slice(0, widths[i]),
                      )
                      .join(" | "),
                  );
                }
                log(`(${result.values.length} row${result.values.length !== 1 ? "s" : ""})`);
              }
            } else {
              log(`OK: ${stmt.slice(0, 60)}${stmt.length > 60 ? "..." : ""}`);
            }
          } catch (e: any) {
            log(`ERROR: ${e.message}`);
            hasError = true;
          }
        }
        if (hasError) throw new Error("One or more SQL statements failed");
      },
    };

  return {
    async exec(input: string): Promise<CliResult> {
      output.length = 0;
      if (!input.trim()) {
        return { success: true, output: [], exitCode: 0 };
      }
      const { command, args, opts } = parseInput(input);

      const handler = commands[command];
      if (!handler) {
        return {
          success: false,
          output: [
            `Unknown command: ${command}`,
            "",
            "Available commands:",
            "  new <name>                           Create a new app",
            "  generate model <name> [cols...]      Generate a model + migration",
            "  generate migration <name> [cols...]  Generate a migration",
            "  g <type> <name> [cols...]            Alias for generate",
            "  sql <file.sql | SELECT ...>          Execute SQL",
            ...Object.keys(commands)
              .filter((c) => c.startsWith("db:"))
              .map((c) => `  ${c}`),
          ],
          exitCode: 1,
        };
      }

      try {
        await handler(args, opts);
        return { success: true, output: [...output], exitCode: 0 };
      } catch (e: any) {
        output.push(`Error: ${e.message}`);
        return { success: false, output: [...output], exitCode: 1 };
      }
    },

    commands: Object.keys(commands),
  };
}
