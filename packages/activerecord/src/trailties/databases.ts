import { DSL } from "@blazetrails/rake";
import { isBlank, isPresent } from "@blazetrails/activesupport";
import {
  File,
  RuntimeError,
  STDOUT,
  TopLevel,
  block,
  env as ENV,
  rbObjRespondTo,
  rbStrToI,
} from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { Migration, Migrator, type MigrationProxy } from "../migration.js";
import { DatabaseTasks, type SchemaFormat } from "../tasks/database-tasks.js";
import type { HashConfig } from "../database-configurations/hash-config.js";
import { dumpSchemaAfterMigration, schemaFormat } from "../active-record.js";

const databases = DatabaseTasks.setupInitialDatabaseYaml();

DSL.namespace("db", (dbNamespace) => {
  DSL.task(
    { check_protected_environments: "load_config" },
    block(async () => {
      await DatabaseTasks.checkProtectedEnvironmentsBang();
    }),
  );

  DSL.task(
    { load_config: "environment" },
    block(() => {
      if (Base.configurations().empty) {
        Base.configurations(DatabaseTasks.databaseConfiguration!);
      }

      Migrator.migrationsPaths = DatabaseTasks.migrationsPaths;
    }),
  );

  DSL.namespace("create", () => {
    DSL.task(
      { all: "load_config" },
      block(async () => {
        await DatabaseTasks.createAll();
      }),
    );

    DatabaseTasks.forEach(databases, (name) => {
      DSL.desc(`Create ${name} database for current environment`);
      DSL.task(
        { [name]: "load_config" },
        block(async () => {
          const dbConfig = Base.configurations().configsFor({
            envName: TopLevel.Trails!.env,
            name,
          });
          await DatabaseTasks.create(dbConfig as HashConfig);
        }),
      );
    });
  });

  DSL.desc(
    "Create the database from DATABASE_URL or config/database.yml for the current RAILS_ENV (use db:create:all to create all databases in the config). Without RAILS_ENV or when RAILS_ENV is development, it defaults to creating the development and test databases, except when DATABASE_URL is present.",
  );
  DSL.task(
    { create: ["load_config"] },
    block(async () => {
      await DatabaseTasks.createCurrent();
    }),
  );

  DSL.namespace("drop", () => {
    DSL.task(
      { all: ["load_config", "check_protected_environments"] },
      block(async () => {
        await DatabaseTasks.dropAll();
      }),
    );

    DatabaseTasks.forEach(databases, (name) => {
      DSL.desc(`Drop ${name} database for current environment`);
      DSL.task(
        { [name]: ["load_config", "check_protected_environments"] },
        block(async () => {
          const dbConfig = Base.configurations().configsFor({
            envName: TopLevel.Trails!.env,
            name,
          });
          await DatabaseTasks.drop(dbConfig as HashConfig);
        }),
      );
    });
  });

  DSL.desc(
    "Drop the database from DATABASE_URL or config/database.yml for the current RAILS_ENV (use db:drop:all to drop all databases in the config). Without RAILS_ENV or when RAILS_ENV is development, it defaults to dropping the development and test databases, except when DATABASE_URL is present.",
  );
  DSL.task(
    { drop: ["load_config", "check_protected_environments"] },
    block(async () => {
      await dbNamespace.get("drop:_unsafe")!.invoke();
    }),
  );

  DSL.task(
    { "drop:_unsafe": ["load_config"] },
    block(async () => {
      await DatabaseTasks.dropCurrent();
    }),
  );

  DSL.desc("Migrate the database (options: VERSION=x, VERBOSE=false, SCOPE=blog).");
  DSL.task(
    { migrate: "load_config" },
    block(async () => {
      await DatabaseTasks.migrateAll();
      await dbNamespace.get("_dump")!.invoke();
    }),
  );

  DSL.task(
    "_dump",
    block(async () => {
      if (dumpSchemaAfterMigration()) {
        await dbNamespace.get("schema:dump")!.invoke();
      }
      dbNamespace.get("_dump")!.reenable();
    }),
  );

  DSL.namespace("_dump", () => {
    DatabaseTasks.forEach(databases, (name) => {
      DSL.task(
        name,
        block(async () => {
          if (dumpSchemaAfterMigration()) {
            await dbNamespace.get(`schema:dump:${name}`)!.invoke();
          }
          dbNamespace.get(`_dump:${name}`)!.reenable();
        }),
      );
    });
  });

  DSL.namespace("migrate", () => {
    DatabaseTasks.forEach(databases, (name) => {
      DSL.desc(`Migrate ${name} database for current environment`);
      DSL.task(
        { [name]: "load_config" },
        block(async () => {
          await DatabaseTasks.withTemporaryPoolForEach(
            { env: TopLevel.Trails!.env, name },
            async () => {
              await DatabaseTasks.migrate();
            },
          );

          await dbNamespace.get(`_dump:${name}`)!.invoke();
        }),
      );
    });

    DSL.desc(
      "Roll back the database one migration and re-migrate up (options: STEP=x, VERSION=x).",
    );
    DSL.task(
      { redo: "load_config" },
      block(async () => {
        DatabaseTasks.raiseForMultiDb(undefined, { command: "db:migrate:redo" });

        if (ENV["VERSION"] != null && ENV["VERSION"] === "") {
          throw new RuntimeError("Empty VERSION provided");
        }

        if (ENV["VERSION"] != null) {
          await dbNamespace.get("migrate:down")!.invoke();
          await dbNamespace.get("migrate:up")!.invoke();
        } else {
          await dbNamespace.get("rollback")!.invoke();
          await dbNamespace.get("migrate")!.invoke();
        }
      }),
    );

    DSL.namespace("redo", () => {
      DatabaseTasks.forEach(databases, (name) => {
        DSL.desc(
          `Roll back ${name} database one migration and re-migrate up (options: STEP=x, VERSION=x).`,
        );
        DSL.task(
          { [name]: "load_config" },
          block(async () => {
            if (ENV["VERSION"] != null && ENV["VERSION"] === "") {
              throw new RuntimeError("Empty VERSION provided");
            }

            if (ENV["VERSION"] != null) {
              await dbNamespace.get(`migrate:down:${name}`)!.invoke();
              await dbNamespace.get(`migrate:up:${name}`)!.invoke();
            } else {
              await dbNamespace.get(`rollback:${name}`)!.invoke();
              await dbNamespace.get(`migrate:${name}`)!.invoke();
            }
          }),
        );
      });
    });

    DSL.desc('Run the "up" for a given migration VERSION.');
    DSL.task(
      { up: "load_config" },
      block(async () => {
        DatabaseTasks.raiseForMultiDb(undefined, { command: "db:migrate:up" });

        if (ENV["VERSION"] == null || ENV["VERSION"] === "") {
          throw new RuntimeError("VERSION is required");
        }

        DatabaseTasks.checkTargetVersion();

        await DatabaseTasks.migrationConnectionPool().migrationContext.run(
          "up",
          DatabaseTasks.targetVersion()!,
        );
        await dbNamespace.get("_dump")!.invoke();
      }),
    );

    DSL.namespace("up", () => {
      DatabaseTasks.forEach(databases, (name) => {
        DSL.desc(`Run the "up" on ${name} database for a given migration VERSION.`);
        DSL.task(
          { [name]: "load_config" },
          block(async () => {
            if (ENV["VERSION"] == null || ENV["VERSION"] === "") {
              throw new RuntimeError("VERSION is required");
            }

            await DatabaseTasks.withTemporaryPoolForEach(
              { env: TopLevel.Trails!.env, name },
              async (pool) => {
                DatabaseTasks.checkTargetVersion();
                await pool.migrationContext.run("up", DatabaseTasks.targetVersion()!);
              },
            );

            await dbNamespace.get(`_dump:${name}`)!.invoke();
          }),
        );
      });
    });

    DSL.desc('Run the "down" for a given migration VERSION.');
    DSL.task(
      { down: "load_config" },
      block(async () => {
        DatabaseTasks.raiseForMultiDb(undefined, { command: "db:migrate:down" });

        if (ENV["VERSION"] == null || ENV["VERSION"] === "") {
          throw new RuntimeError("VERSION is required - To go down one migration, use db:rollback");
        }

        DatabaseTasks.checkTargetVersion();

        await DatabaseTasks.migrationConnectionPool().migrationContext.run(
          "down",
          DatabaseTasks.targetVersion()!,
        );
        await dbNamespace.get("_dump")!.invoke();
      }),
    );

    DSL.namespace("down", () => {
      DatabaseTasks.forEach(databases, (name) => {
        DSL.desc(`Run the "down" on ${name} database for a given migration VERSION.`);
        DSL.task(
          { [name]: "load_config" },
          block(async () => {
            if (ENV["VERSION"] == null || ENV["VERSION"] === "") {
              throw new RuntimeError("VERSION is required");
            }

            await DatabaseTasks.withTemporaryPoolForEach(
              { env: TopLevel.Trails!.env, name },
              async (pool) => {
                DatabaseTasks.checkTargetVersion();
                await pool.migrationContext.run("down", DatabaseTasks.targetVersion()!);
              },
            );

            await dbNamespace.get(`_dump:${name}`)!.invoke();
          }),
        );
      });
    });

    DSL.desc("Display status of migrations");
    DSL.task(
      { status: "load_config" },
      block(async () => {
        await DatabaseTasks.withTemporaryPoolForEach({}, async () => {
          await DatabaseTasks.migrateStatus();
        });
      }),
    );

    DSL.namespace("status", () => {
      DatabaseTasks.forEach(databases, (name) => {
        DSL.desc(`Display status of migrations for ${name} database`);
        DSL.task(
          { [name]: "load_config" },
          block(async () => {
            await DatabaseTasks.withTemporaryPoolForEach(
              { env: TopLevel.Trails!.env, name },
              async () => {
                await DatabaseTasks.migrateStatus();
              },
            );
          }),
        );
      });
    });
  });

  DSL.namespace("rollback", () => {
    DatabaseTasks.forEach(databases, (name) => {
      DSL.desc(`Rollback ${name} database for current environment (specify steps w/ STEP=n).`);
      DSL.task(
        { [name]: "load_config" },
        block(async () => {
          const step = ENV["STEP"] != null ? Number(rbStrToI(ENV["STEP"])) : 1;

          await DatabaseTasks.withTemporaryPoolForEach(
            { env: TopLevel.Trails!.env, name },
            async (pool) => {
              await pool.migrationContext.rollback(step);
            },
          );

          await dbNamespace.get(`_dump:${name}`)!.invoke();
        }),
      );
    });
  });

  DSL.desc("Roll the schema back to the previous version (specify steps w/ STEP=n).");
  DSL.task(
    { rollback: "load_config" },
    block(async () => {
      DatabaseTasks.raiseForMultiDb(undefined, { command: "db:rollback" });
      if (ENV["VERSION"] != null) {
        throw new RuntimeError(
          "VERSION is not supported - To rollback a specific version, use db:migrate:down",
        );
      }

      const step = ENV["STEP"] != null ? Number(rbStrToI(ENV["STEP"])) : 1;

      await DatabaseTasks.migrationConnectionPool().migrationContext.rollback(step);

      await dbNamespace.get("_dump")!.invoke();
    }),
  );

  DSL.task(
    { forward: "load_config" },
    block(async () => {
      const step = ENV["STEP"] != null ? Number(rbStrToI(ENV["STEP"])) : 1;

      await DatabaseTasks.migrationConnectionPool().migrationContext.forward(step);

      await dbNamespace.get("_dump")!.invoke();
    }),
  );

  DSL.desc("Retrieve the current schema version number");
  DSL.task(
    { version: "load_config" },
    block(async () => {
      await DatabaseTasks.withTemporaryPoolForEach({ env: TopLevel.Trails!.env }, async (pool) => {
        STDOUT.puts(`\ndatabase: ${pool.dbConfig.database}\n`);
        STDOUT.puts(`Current version: ${await pool.migrationContext.currentVersion()}`);
        STDOUT.puts();
      });
    }),
  );

  DSL.namespace("version", () => {
    DatabaseTasks.forEach(databases, (name) => {
      DSL.desc(`Retrieve the current schema version number for ${name} database`);
      DSL.task(
        { [name]: "load_config" },
        block(async () => {
          const dbConfig = Base.configurations().configsFor({
            envName: TopLevel.Trails!.env,
            name,
          });
          await DatabaseTasks.withTemporaryConnection(
            dbConfig as HashConfig,
            async (connection) => {
              STDOUT.puts(`Current version: ${await connection.schemaVersion()}`);
            },
          );
        }),
      );
    });
  });

  DSL.namespace("schema", () => {
    DSL.desc(
      "Create a database schema file (either db/schema.rb or db/structure.sql, depending on `ENV['SCHEMA_FORMAT']` or `config.active_record.schema_format`)",
    );
    DSL.task(
      { dump: "load_config" },
      block(async () => {
        await DatabaseTasks.withTemporaryPoolForEach({}, async (pool) => {
          const dbConfig = pool.dbConfig;
          const schemaFormat_ = (ENV["SCHEMA_FORMAT"] ?? schemaFormat()) as SchemaFormat;
          await DatabaseTasks.dumpSchema(dbConfig, schemaFormat_);
        });

        dbNamespace.get("schema:dump")!.reenable();
      }),
    );

    DSL.namespace("dump", () => {
      DatabaseTasks.forEach(databases, (name) => {
        DSL.desc(
          `Create a database schema file (either db/schema.rb or db/structure.sql, depending on \`ENV['SCHEMA_FORMAT']\` or \`config.active_record.schema_format\`) for ${name} database`,
        );
        DSL.task(
          { [name]: "load_config" },
          block(async () => {
            await DatabaseTasks.withTemporaryPoolForEach({ name }, async (pool) => {
              const dbConfig = pool.dbConfig;
              const schemaFormat_ = (ENV["SCHEMA_FORMAT"] ?? schemaFormat()) as SchemaFormat;
              await DatabaseTasks.dumpSchema(dbConfig, schemaFormat_);
            });

            dbNamespace.get(`schema:dump:${name}`)!.reenable();
          }),
        );
      });
    });
  });
});

DSL.namespace("railties", () => {
  DSL.namespace("install", () => {
    DSL.task(
      { migrations: "db:load_config" },
      block(async () => {
        const toLoad = isBlank(ENV["FROM"]) ? "all" : ENV["FROM"]!.split(",").map((s) => s.trim());
        const railties: Record<string, string> = {};
        for (const railtie of TopLevel.Trails!.application!.migrationRailties()) {
          if (!(toLoad === "all" || toLoad.includes(railtie.railtieName))) continue;

          let path: string | undefined;
          if (
            rbObjRespondTo(railtie, "paths") &&
            (path = await railtie.paths!().get("db/migrate")!.first()) != null
          ) {
            railties[railtie.railtieName] = path;
          }

          if (!isBlank(ENV["MIGRATIONS_PATH"])) {
            railties[railtie.railtieName] = File.join(railtie.root()!, ENV["MIGRATIONS_PATH"]!);
          }
        }

        const onSkip = (name: string, migration: MigrationProxy): void => {
          STDOUT.puts(
            `NOTE: Migration ${migration.basename()} from ${name} has been skipped. Migration with the same name already exists.`,
          );
        };

        const onCopy = (name: string, migration: MigrationProxy): void => {
          STDOUT.puts(`Copied migration ${migration.basename()} from ${name}`);
        };

        let destination: string | string[] | undefined;
        if (isPresent(ENV["DATABASE"]) && ENV["DATABASE"] !== "primary") {
          const config = Base.configurations().configsFor({ name: ENV["DATABASE"]! });
          if (isBlank(config)) throw new RuntimeError("Invalid DATABASE provided");
          destination = config!.migrationsPaths;
          if (isBlank(destination)) {
            throw new RuntimeError(`${ENV["DATABASE"]} does not have a custom migration path`);
          }
        } else {
          destination = DatabaseTasks.migrationsPaths[0];
        }

        await Migration.copy(destination as string, railties, { onSkip, onCopy });
      }),
    );
  });
});
