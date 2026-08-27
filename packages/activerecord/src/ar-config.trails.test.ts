import { describe, it, expect, afterEach } from "vitest";
import { ActiveRecord } from "./ar-config.js";
import { DefaultStrategy } from "./migration/default-strategy.js";

describe("ar-config module-level flags", () => {
  it("mirror the ActiveRecord module defaults from active_record.rb", () => {
    expect(ActiveRecord.databaseCli).toEqual({
      postgresql: "psql",
      mysql: ["mysql", "mysql5"],
      sqlite: "sqlite3",
    });
    expect(ActiveRecord.asyncQueryExecutor).toBeNull();
    expect(ActiveRecord.queues).toEqual({});
    expect(ActiveRecord.maintainTestSchema).toBeNull();
    expect(ActiveRecord.applicationRecordClass).toBeNull();
    expect(ActiveRecord.errorOnIgnoredOrder).toBe(false);
    expect(ActiveRecord.timestampedMigrations).toBe(true);
    expect(ActiveRecord.migrationStrategy).toBe(DefaultStrategy);
    expect(ActiveRecord.verifyForeignKeysForFixtures).toBe(false);
    expect(ActiveRecord.useYamlUnsafeLoad).toBe(false);
    expect(ActiveRecord.raiseIntWiderThan64bit).toBe(true);
    expect(ActiveRecord.yamlColumnPermittedClasses).toEqual([Symbol]);
    expect(ActiveRecord.generateSecureTokenOn).toBe("create");
  });

  describe("the ActiveRecord module object assigns through to the live value", () => {
    afterEach(() => {
      ActiveRecord.asyncQueryExecutor = null;
      ActiveRecord.queues = {};
      ActiveRecord.maintainTestSchema = null;
      ActiveRecord.errorOnIgnoredOrder = false;
      ActiveRecord.timestampedMigrations = true;
      ActiveRecord.generateSecureTokenOn = "create";
      ActiveRecord.raiseIntWiderThan64bit = true;
      ActiveRecord.belongsToRequiredValidatesForeignKey = false;
    });

    it("round-trip a written value", () => {
      ActiveRecord.asyncQueryExecutor = "multi_thread_pool";
      expect(ActiveRecord.asyncQueryExecutor).toBe("multi_thread_pool");

      ActiveRecord.queues = { destroyAssociationAsync: "low" };
      expect(ActiveRecord.queues).toEqual({ destroyAssociationAsync: "low" });

      ActiveRecord.maintainTestSchema = true;
      expect(ActiveRecord.maintainTestSchema).toBe(true);

      ActiveRecord.errorOnIgnoredOrder = true;
      expect(ActiveRecord.errorOnIgnoredOrder).toBe(true);

      ActiveRecord.timestampedMigrations = false;
      expect(ActiveRecord.timestampedMigrations).toBe(false);

      ActiveRecord.generateSecureTokenOn = "initialize";
      expect(ActiveRecord.generateSecureTokenOn).toBe("initialize");

      ActiveRecord.raiseIntWiderThan64bit = false;
      expect(ActiveRecord.raiseIntWiderThan64bit).toBe(false);

      ActiveRecord.belongsToRequiredValidatesForeignKey = true;
      expect(ActiveRecord.belongsToRequiredValidatesForeignKey).toBe(true);
    });
  });
});
