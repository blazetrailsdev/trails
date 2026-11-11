import { DSL } from "@blazetrails/rake";
import { isBlank, isPresent } from "@blazetrails/activesupport";
import {
  File,
  RuntimeError,
  STDOUT,
  abort,
  sprintf,
  TopLevel,
  block,
  env as ENV,
  rbObjRespondTo,
  rbStrToI,
} from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { EnvironmentStorageError, Migration, Migrator, type MigrationProxy } from "../migration.js";
import { Schema } from "../schema.js";
import { DatabaseTasks, type SchemaFormat } from "../tasks/database-tasks.js";
import type { HashConfig } from "../database-configurations/hash-config.js";
import * as ActiveRecord from "../active-record.js";

const databases = await DatabaseTasks.setupInitialDatabaseYaml();

DSL.namespace("db", (dbNamespace) => {
  DSL.desc("Set the environment value for the database");
  DSL.task(
    { "environment:set": "load_config" },
    block(async () => {
      const pool = DatabaseTasks.migrationConnectionPool();
      if (!pool.internalMetadata.enabled) throw new EnvironmentStorageError();

      await pool.internalMetadata.createTableAndSetFlags(pool.migrationContext.currentEnvironment);
    }),
  );

  DSL.task(
    { check_protected_environments: "load_config" },
    block(async () => {
      await DatabaseTasks.checkProtectedEnvironmentsBang();
    }),
  );

  DSL.task(
    { load_config: "environment" },
    block(async () => {
      if (Base.configurations().empty) {
        Base.configurations(DatabaseTasks.databaseConfiguration!);
      }

      Migrator.migrationsPaths = await DatabaseTasks.migrationsPaths;
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

  DSL.namespace("purge", () => {
    DSL.task(
      { all: ["load_config", "check_protected_environments"] },
      block(async () => {
        await DatabaseTasks.purgeAll();
      }),
    );
  });

  DSL.task(
    { truncate_all: ["load_config", "check_protected_environments"] },
    block(async () => {
      await DatabaseTasks.truncateAll();
    }),
  );

  DSL.task(
    { purge: ["load_config", "check_protected_environments"] },
    block(async () => {
      await DatabaseTasks.purgeCurrent();
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
      if (ActiveRecord.dumpSchemaAfterMigration()) {
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
          if (ActiveRecord.dumpSchemaAfterMigration()) {
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

    DSL.desc("Resets your database using your migrations for the current environment");
    DSL.task({ reset: ["db:drop", "db:create", "db:schema:dump", "db:migrate"] });

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

  DSL.namespace("reset", () => {
    DSL.task({ all: ["db:drop", "db:setup"] });

    DatabaseTasks.forEach(databases, (name) => {
      DSL.desc(
        `Drop and recreate the ${name} database from its schema for the current environment and load the seeds.`,
      );
      DSL.task({ [name]: [`db:drop:${name}`, `db:setup:${name}`] });
    });
  });

  DSL.desc(
    "Drop and recreate all databases from their schema for the current environment and load the seeds.",
  );
  DSL.task({ reset: ["db:drop", "db:setup"] });

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

  DSL.task(
    { abort_if_pending_migrations: "load_config" },
    block(async () => {
      const pendingMigrationsByPool: MigrationProxy[][] = [];

      await DatabaseTasks.withTemporaryPoolForEach({}, async (pool) => {
        pendingMigrationsByPool.push(await pool.migrationContext.open().pendingMigrations());
      });

      const pendingMigrations = pendingMigrationsByPool.flat();

      if (pendingMigrations.length > 0) {
        STDOUT.puts(
          `You have ${pendingMigrations.length} pending ${pendingMigrations.length > 1 ? "migrations:" : "migration:"}`,
        );

        for (const pendingMigration of pendingMigrations) {
          STDOUT.puts(sprintf("  %4d %s", pendingMigration.version, pendingMigration.name));
        }

        abort("Run `bin/trails db:migrate` to update your database then try again.");
      }
    }),
  );

  DSL.namespace("abort_if_pending_migrations", () => {
    DatabaseTasks.forEach(databases, (name) => {
      DSL.task(
        { [name]: "load_config" },
        block(async () => {
          await DatabaseTasks.withTemporaryPoolForEach(
            { env: TopLevel.Trails!.env, name },
            async (pool) => {
              const pendingMigrations = await pool.migrationContext.open().pendingMigrations();

              if (pendingMigrations.length > 0) {
                STDOUT.puts(
                  `You have ${pendingMigrations.length} pending ${pendingMigrations.length > 1 ? "migrations:" : "migration:"}`,
                );

                for (const pendingMigration of pendingMigrations) {
                  STDOUT.puts(sprintf("  %4d %s", pendingMigration.version, pendingMigration.name));
                }

                abort(
                  `Run \`bin/trails db:migrate:${name}\` to update your database then try again.`,
                );
              }
            },
          );
        }),
      );
    });
  });

  DSL.namespace("setup", () => {
    DSL.task({ all: ["db:create", "environment", "db:schema:load", "seed"] });

    DatabaseTasks.forEach(databases, (name) => {
      DSL.desc(
        `Create the ${name} database, load the schema, and initialize with the seed data (use db:reset:${name} to also drop the database first)`,
      );
      DSL.task({
        [name]: [`db:create:${name}`, "environment", `db:schema:load:${name}`, "db:seed"],
      });
    });
  });

  DSL.desc(
    "Create all databases, load all schemas, and initialize with the seed data (use db:reset to also drop all databases first)",
  );
  DSL.task({ setup: ["db:create", "environment", "db:schema:load", "seed"] });

  DSL.desc("Run setup if database does not exist, or run migrations if it does");
  DSL.task(
    { prepare: "load_config" },
    block(async () => {
      await DatabaseTasks.prepareAll();
    }),
  );

  DSL.desc("Load the seed data from db/seeds.rb");
  DSL.task(
    { seed: "load_config" },
    block(async () => {
      await dbNamespace.get("abort_if_pending_migrations")!.invoke();
      await DatabaseTasks.loadSeed();
    }),
  );

  DSL.namespace("seed", () => {
    DSL.desc("Truncate tables of each database for current environment and load the seeds");
    DSL.task({ replant: ["load_config", "truncate_all", "seed"] });
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
          const schemaFormat = (ENV["SCHEMA_FORMAT"] ??
            ActiveRecord.schemaFormat()) as SchemaFormat;
          await DatabaseTasks.dumpSchema(dbConfig, schemaFormat);
        });

        dbNamespace.get("schema:dump")!.reenable();
      }),
    );

    DSL.desc(
      "Load a database schema file (either db/schema.rb or db/structure.sql, depending on `ENV['SCHEMA_FORMAT']` or `config.active_record.schema_format`) into the database",
    );
    DSL.task(
      { load: ["load_config", "check_protected_environments"] },
      block(async () => {
        await DatabaseTasks.loadSchemaCurrent(ActiveRecord.schemaFormat(), ENV["SCHEMA"]);
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
              const schemaFormat = (ENV["SCHEMA_FORMAT"] ??
                ActiveRecord.schemaFormat()) as SchemaFormat;
              await DatabaseTasks.dumpSchema(dbConfig, schemaFormat);
            });

            dbNamespace.get(`schema:dump:${name}`)!.reenable();
          }),
        );
      });
    });

    DSL.namespace("load", () => {
      DatabaseTasks.forEach(databases, (name) => {
        DSL.desc(
          `Load a database schema file (either db/schema.rb or db/structure.sql, depending on \`ENV['SCHEMA_FORMAT']\` or \`config.active_record.schema_format\`) into the ${name} database`,
        );
        DSL.task(
          { [name]: `db:test:purge:${name}` },
          block(async () => {
            await DatabaseTasks.withTemporaryPoolForEach({ name }, async (pool) => {
              const dbConfig = pool.dbConfig;
              const schemaFormat = (ENV["SCHEMA_FORMAT"] ??
                ActiveRecord.schemaFormat()) as SchemaFormat;
              await DatabaseTasks.loadSchema(dbConfig, schemaFormat);
            });
          }),
        );
      });
    });

    DSL.namespace("cache", () => {
      DSL.desc("Create a db/schema_cache.yml file.");
      DSL.task(
        { dump: "load_config" },
        block(async () => {
          await DatabaseTasks.withTemporaryPoolForEach({}, async (pool) => {
            const dbConfig = pool.dbConfig;
            const filename = DatabaseTasks.cacheDumpFilename(dbConfig);

            await DatabaseTasks.dumpSchemaCache(pool, filename);
          });
        }),
      );

      DSL.desc("Clear a db/schema_cache.yml file.");
      DSL.task(
        { clear: "load_config" },
        block(() => {
          for (const dbConfig of Base.configurations().configsFor({
            envName: DatabaseTasks.env,
          })) {
            const filename = DatabaseTasks.cacheDumpFilename(dbConfig);
            DatabaseTasks.clearSchemaCache(filename);
          }
        }),
      );
    });
  });

  DSL.namespace("test", () => {
    DSL.task(
      { load_schema: ["db:test:purge"] },
      block(async () => {
        await DatabaseTasks.withTemporaryPoolForEach({ env: "test" }, async (pool) => {
          const dbConfig = pool.dbConfig;
          Schema.verbose = false;
          const schemaFormat = (ENV["SCHEMA_FORMAT"] ??
            ActiveRecord.schemaFormat()) as SchemaFormat;
          await DatabaseTasks.loadSchema(dbConfig, schemaFormat);
        });
      }),
    );

    DSL.task(
      { purge: ["load_config", "check_protected_environments"] },
      block(async () => {
        for (const dbConfig of Base.configurations().configsFor({ envName: "test" })) {
          await DatabaseTasks.purge(dbConfig);
        }
      }),
    );

    DSL.task(
      { prepare: "load_config" },
      block(async () => {
        if (!isBlank(Base.configurations())) {
          await dbNamespace.get("test:load_schema")!.invoke();
        }
      }),
    );

    DatabaseTasks.forEach(databases, (name) => {
      DSL.namespace("load_schema", () => {
        DSL.task(
          { [name]: `db:test:purge:${name}` },
          block(async () => {
            await DatabaseTasks.withTemporaryPoolForEach({ env: "test", name }, async (pool) => {
              const dbConfig = pool.dbConfig;
              Schema.verbose = false;
              const schemaFormat = (ENV["SCHEMA_FORMAT"] ??
                ActiveRecord.schemaFormat()) as SchemaFormat;
              await DatabaseTasks.loadSchema(dbConfig, schemaFormat);
            });
          }),
        );
      });

      DSL.namespace("purge", () => {
        DSL.task(
          { [name]: ["load_config", "check_protected_environments"] },
          block(async () => {
            await DatabaseTasks.withTemporaryPoolForEach({ env: "test", name }, async (pool) => {
              const dbConfig = pool.dbConfig;
              await DatabaseTasks.purge(dbConfig);
            });
          }),
        );
      });

      DSL.namespace("prepare", () => {
        DSL.task(
          { [name]: "load_config" },
          block(async () => {
            await dbNamespace.get(`test:load_schema:${name}`)!.invoke();
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
          destination = (await DatabaseTasks.migrationsPaths)[0];
        }

        await Migration.copy(destination as string, railties, { onSkip, onCopy });
      }),
    );
  });
});
