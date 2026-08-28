/**
 * Port of `ActiveRecord::Migration::PendingMigrationsTest`
 * (vendor/rails/activerecord/test/cases/migration/pending_migrations_test.rb).
 *
 * Rails gates the whole class on
 * `current_adapter?(:SQLite3Adapter) && !in_memory_db?` — it rewrites
 * `ActiveRecord::Base.configurations` to a pair of on-disk sqlite databases in
 * a tmpdir — and this mirrors that gate.
 *
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Base } from "../base.js";
import { CheckPending, Migration, MigrationContext, PendingMigrationError } from "../migration.js";
import { SchemaMigration } from "../schema-migration.js";
import { InternalMetadata } from "../internal-metadata.js";
import { DatabaseConfigurations, type RawConfigurations } from "../database-configurations.js";
import { camelize, Logger } from "@blazetrails/activesupport";
import { currentAdapter, inMemoryDb } from "../support/adapter-helper.js";

// Rails writes `class #{name.classify} < ActiveRecord::Migration::Current`; a
// generated TS migration has to name the module it inherits from.
const MIGRATION_MODULE = new URL("../migration.js", import.meta.url).pathname;

const skip = !currentAdapter("SQLite3Adapter") || inMemoryDb();

describe.skipIf(skip)("Migration", () => {
  describe("PendingMigrationsTest", () => {
    let tmpDir: string;
    let originalConfigurations: DatabaseConfigurations;

    const databasePathFor = (databaseName: string): string =>
      path.join(tmpDir, `${databaseName}.sqlite3`);

    const migrationsPathFor = (databaseName: string): string =>
      path.join(tmpDir, `${databaseName}-migrations`);

    const baseConfig = (): RawConfigurations => ({
      [DatabaseConfigurations.defaultEnv]: {
        primary: {
          adapter: "sqlite3",
          database: databasePathFor("primary"),
          migrationsPaths: migrationsPathFor("primary"),
        },
        secondary: {
          adapter: "sqlite3",
          database: databasePathFor("secondary"),
          migrationsPaths: migrationsPathFor("secondary"),
        },
      },
    });

    const createMigration = (number: string, name: string, database = "primary"): void => {
      const migrationDir = migrationsPathFor(database);
      fs.mkdirSync(migrationDir, { recursive: true });
      fs.writeFileSync(
        path.join(migrationDir, `${number}_${name}.ts`),
        `import { Migration } from ${JSON.stringify(MIGRATION_MODULE)};\n` +
          `export class ${camelize(name)} extends Migration {}\n`,
      );
    };

    // Rails is `Base.connection_pool.migration_context`. `pool.migrationContext`
    // builds its collaborators from the pool's adapter *proxy*, whose every
    // member answers a Promise — so `Migrator#with_advisory_lock`'s synchronous
    // `supports_advisory_locks?` / `current_database` probes (migration.rb:1595)
    // both misread. Threading a leased connection is what
    // `migration-context-collaborators-need-a-pool` converges.
    const runMigrations = async (): Promise<void> => {
      const wasVerbose = Migration.verbose;
      Migration.verbose = false;
      const pool = Base.connectionPool();
      const connection = await pool.leaseConnection();
      await new MigrationContext(
        pool.migrationsPaths,
        new SchemaMigration(connection.pool),
        new InternalMetadata(connection.pool),
      ).migrate();
      Migration.verbose = wasVerbose;
    };

    const assertPendingMigrations = async (...expectedMigrations: string[]): Promise<void> => {
      for (let i = 0; i < 2; i++) {
        const error = await Migration.checkAllPendingBang().then(
          () => null,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(PendingMigrationError);

        const checkPendingError = await new CheckPending(async () => {
          throw new Error("flunk");
        })
          .call({})
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(checkPendingError).toBeInstanceOf(PendingMigrationError);

        for (const message of [(error as Error).message, (checkPendingError as Error).message]) {
          expect(message).toContain("Migrations are pending.");
          for (const migration of expectedMigrations) expect(message).toContain(migration);
        }
      }
    };

    const assertNoPendingMigrations = async (): Promise<void> => {
      const calls: Record<string, unknown>[] = [];
      const app = async (env: Record<string, unknown>): Promise<unknown> => {
        calls.push(env);
        return null;
      };
      const checkPending = new CheckPending(app);

      for (let i = 0; i < 2; i++) {
        await expect(Migration.checkAllPendingBang()).resolves.toBeUndefined();

        await checkPending.call({});
        expect(calls.length).toBe(i + 1);
      }
    };

    beforeEach(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending_migrations_test-"));
      originalConfigurations = Base.configurations();
      Base.configurations(baseConfig());
      await Base.establishConnection("primary");
    });

    afterEach(async () => {
      Base.configurations(originalConfigurations);
      await Base.establishConnection("arunit");
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("errors if pending", async () => {
      createMigration("01", "create_foo");
      await assertPendingMigrations("01_create_foo.ts");
    });

    it("checks if supported", async () => {
      await runMigrations();
      await assertNoPendingMigrations();
    });

    it("okay with no migrations", async () => {
      await assertNoPendingMigrations();
    });

    // Regression test for https://github.com/rails/rails/pull/29759
    it("understands migrations created out of order", async () => {
      // With a prior file before even initialization
      createMigration("05", "create_bar");
      await runMigrations();
      await assertNoPendingMigrations();

      // It understands the new migration created at 01
      createMigration("01", "create_foo");
      await assertPendingMigrations("01_create_foo.ts");
    });

    it("with stdlib logger", async () => {
      const old = Base.logger;
      Base.logger = new Logger() as unknown as typeof Base.logger;
      try {
        await expect(new CheckPending(async () => {}).call({})).resolves.toBeUndefined();
      } finally {
        Base.logger = old;
      }
    });

    it("with multiple database", async () => {
      createMigration("01", "create_bar", "primary");
      createMigration("02", "create_foo", "secondary");
      await assertPendingMigrations("01_create_bar.ts", "02_create_foo.ts");

      await Base.establishConnection("secondary");
      await runMigrations();

      await Base.establishConnection("primary");
      await runMigrations();

      await assertNoPendingMigrations();
    });
  });
});
