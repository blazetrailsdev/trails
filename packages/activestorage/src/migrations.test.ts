import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deepDup, TopLevel } from "@blazetrails/activesupport";
import { Base, Migration, type DatabaseAdapter } from "@blazetrails/activerecord";
import "./test-helpers/database/setup.js";
import type { Configuration } from "@blazetrails/trailties/trailtie/configuration";
import { CreateActiveStorageTables } from "./db/migrate/20170806125915_create_active_storage_tables.js";

type Generators = ReturnType<Configuration["appGenerators"]>;

describe("ActiveStorage::MigrationsTest", () => {
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

  it("migration creates tables with default primary and foreign key types", async () => {
    await rerunMigration();

    for (const table of activeStorageTables()) {
      expect((await primaryKey(table))!.type).toBe("integer");

      for (const foreignKey of await foreignKeys(table)) {
        expect(foreignKey.type).toBe("integer");
      }
    }
  });

  it("migration creates tables with configured primary and foreign key types", async () => {
    configuration.generators((g) => {
      (g as unknown as { orm(...args: unknown[]): void }).orm("active_record", {
        primaryKeyType: "string",
      });
    });

    await rerunMigration();

    for (const table of activeStorageTables()) {
      expect((await primaryKey(table))!.type).toBe("string");

      for (const foreignKey of await foreignKeys(table)) {
        expect(foreignKey.type).toBe("string");
      }
    }
  });

  async function rerunMigration(): Promise<void> {
    await CreateActiveStorageTables.migrate("down");
    await CreateActiveStorageTables.migrate("up");
  }

  function activeStorageTables(): string[] {
    return ["active_storage_blobs", "active_storage_attachments", "active_storage_variant_records"];
  }

  async function primaryKey(table: string) {
    return (await connection.columns(table)).find((c) => c.name === "id");
  }

  async function foreignKeys(table: string) {
    const columns = (await connection.foreignKeys(table)).map((fk) => fk.column);
    return (await connection.columns(table)).filter((c) => columns.includes(c.name));
  }
});
