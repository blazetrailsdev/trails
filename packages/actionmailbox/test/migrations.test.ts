import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deepDup, TopLevel } from "@blazetrails/activesupport";
import { Base, Migration, type DatabaseAdapter } from "@blazetrails/activerecord";
import "./support/database/setup.js";
import { Record } from "../lib/record.js";
import type { Configuration } from "@blazetrails/trailties/trailtie/configuration";
import { CreateActionMailboxTables } from "../lib/db/migrate/20180917164000_create_action_mailbox_tables.js";

type Generators = ReturnType<Configuration["appGenerators"]>;

describe("ActionMailbox::MigrationsTest", () => {
  let originalVerbose: boolean | undefined;
  let connection: DatabaseAdapter;
  let originalOptions: unknown;
  const configuration = TopLevel.Trails!.configuration! as unknown as {
    generators(block?: (g: Generators) => void): Generators;
  };

  beforeEach(async () => {
    originalVerbose = Migration.verbose;
    Migration.verbose = false;

    connection = await Base.leaseConnection();
    originalOptions = deepDup(configuration.generators().options);
  });

  afterEach(async () => {
    configuration.generators().options = originalOptions as never;
    await rerunMigration();
    Migration.verbose = originalVerbose;
  });

  it("migration creates tables with default primary key type", async () => {
    for (const table of actionMailboxTables()) {
      expect((await primaryKey(table))!.type).toBe("integer");
    }
  });

  it("migration creates tables with configured primary key type", async () => {
    configuration.generators((g) => {
      (g as unknown as { orm(...args: unknown[]): void }).orm("active_record", {
        primaryKeyType: "string",
      });
    });

    await rerunMigration();

    for (const table of actionMailboxTables()) {
      expect((await primaryKey(table))!.type).toBe("string");
    }
  });

  async function rerunMigration(): Promise<void> {
    await CreateActionMailboxTables.migrate("down");
    await CreateActionMailboxTables.migrate("up");
  }

  function actionMailboxTables(): string[] {
    return Record.descendants.map((klass) => klass.tableName!);
  }

  async function primaryKey(table: string) {
    return (await connection.columns(table)).find((c) => c.name === "id");
  }
});
