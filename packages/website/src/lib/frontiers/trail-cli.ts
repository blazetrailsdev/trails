import type { VirtualFS } from "./virtual-fs.js";
import type { SqlJsAdapter } from "./sql-js-adapter.js";
import { VfsModelGenerator, VfsMigrationGenerator, VfsAppGenerator } from "./vfs-generator.js";
import type { MigrationProxy, MigrationLike } from "@blazetrails/activerecord/migration";
import { Migrator } from "@blazetrails/activerecord/migration";
import { camelize } from "@blazetrails/activesupport";

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

const MIGRATION_FILE_PATTERN = /^(\d+)[-_](.+)\.(?:ts|js)$/;

// NOTE: The up/down implementations assume executeCode will register migrations
// via deps.registerMigration. When executeCode is implemented, it must either:
// (a) evaluate the file in a sandbox that exposes registerMigration, or
// (b) be changed to return the migration class directly so we can build the
//     proxy without the registry lookup.
function discoverMigrations(
  vfs: VirtualFS,
  executeCode: (code: string) => Promise<unknown>,
  getMigrations: () => MigrationProxy[],
): MigrationProxy[] {
  return vfs
    .list()
    .filter((f) => f.path.startsWith("db/migrations/"))
    .flatMap((file) => {
      const basename = file.path.split("/").pop() ?? "";
      const match = basename.match(MIGRATION_FILE_PATTERN);
      if (!match) return [];
      return [
        {
          version: match[1],
          name: camelize(match[2].replace(/-/g, "_")),
          filename: file.path,
          migration: (): MigrationLike => ({
            async up(adapter) {
              const content = vfs.read(file.path)?.content;
              if (!content) throw new Error(`File not found: ${file.path}`);
              await executeCode(content);
              const reg = getMigrations().find((m) => m.version === match![1]);
              if (!reg) {
                throw new Error(
                  `Migration ${match![1]} from ${file.path} did not register after execution`,
                );
              }
              await reg.migration().up(adapter);
            },
            async down(adapter) {
              const content = vfs.read(file.path)?.content;
              if (!content) throw new Error(`File not found: ${file.path}`);
              await executeCode(content);
              const reg = getMigrations().find((m) => m.version === match![1]);
              if (!reg) {
                throw new Error(
                  `Migration ${match![1]} from ${file.path} did not register after execution`,
                );
              }
              await reg.migration().down(adapter);
            },
          }),
        },
      ];
    });
}

export interface TrailCliDeps {
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

export function createTrailCLI(deps: TrailCliDeps) {
  const { vfs, adapter } = deps;
  const output: string[] = [];
  function log(msg: string) {
    output.push(msg);
  }

  async function withMigrator(fn: (migrator: Migrator) => Promise<void>): Promise<void> {
    const proxies = discoverMigrations(vfs, deps.executeCode, deps.getMigrations);
    if (proxies.length === 0) {
      log("No migrations found in db/migrations/.");
      return;
    }
    const migrator = new Migrator(adapter, proxies);
    await fn(migrator);
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

        const gen = new VfsAppGenerator({ vfs, output: log });
        await gen.run(name, { database: "sqlite" });
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
        const version = opts.version && opts.version !== "true" ? opts.version : null;
        await withMigrator(async (migrator) => {
          await migrator.migrate(version);
          for (const line of migrator.output) log(line);
          const pending = await migrator.pendingMigrations();
          log(
            pending.length === 0
              ? "All migrations are up to date."
              : `${pending.length} migration(s) pending.`,
          );
        });
      },

      "db:rollback": async (_args, opts) => {
        const parsed = parseInt(opts.step ?? "1", 10);
        const step = Number.isNaN(parsed) ? 1 : parsed;
        await withMigrator(async (migrator) => {
          await migrator.rollback(step);
          for (const line of migrator.output) log(line);
        });
      },

      "db:migrate:status": async () => {
        await withMigrator(async (migrator) => {
          const statuses = await migrator.migrationsStatus();
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
