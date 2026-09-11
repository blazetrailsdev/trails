import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./base.js";
import { DefaultStrategy } from "./migration/default-strategy.js";

describe("ar-config module-level flags", () => {
  it("mirror the ActiveRecord module defaults from active_record.rb", () => {
    expect(Base.databaseCli).toEqual({
      postgresql: "psql",
      mysql: ["mysql", "mysql5"],
      sqlite: "sqlite3",
    });
    expect(Base.asyncQueryExecutor).toBeNull();
    expect(Base.queues).toEqual({});
    expect(Base.maintainTestSchema).toBeNull();
    expect(Base.applicationRecordClass).toBeNull();
    expect(Base.errorOnIgnoredOrder).toBe(false);
    expect(Base.timestampedMigrations).toBe(true);
    expect(Base.migrationStrategy).toBe(DefaultStrategy);
    expect(Base.verifyForeignKeysForFixtures).toBe(false);
    expect(Base.useYamlUnsafeLoad).toBe(false);
    expect(Base.raiseIntWiderThan64bit).toBe(true);
    expect(Base.yamlColumnPermittedClasses).toEqual([Symbol]);
    expect(Base.generateSecureTokenOn).toBe("create");
  });

  describe("the ActiveRecord module object assigns through to the live value", () => {
    afterEach(() => {
      Base.asyncQueryExecutor = null;
      Base.queues = {};
      Base.maintainTestSchema = null;
      Base.errorOnIgnoredOrder = false;
      Base.timestampedMigrations = true;
      Base.generateSecureTokenOn = "create";
      Base.raiseIntWiderThan64bit = true;
      Base.belongsToRequiredValidatesForeignKey = false;
    });

    it("round-trip a written value", () => {
      Base.asyncQueryExecutor = "multi_thread_pool";
      expect(Base.asyncQueryExecutor).toBe("multi_thread_pool");

      Base.queues = { destroyAssociationAsync: "low" };
      expect(Base.queues).toEqual({ destroyAssociationAsync: "low" });

      Base.maintainTestSchema = true;
      expect(Base.maintainTestSchema).toBe(true);

      Base.errorOnIgnoredOrder = true;
      expect(Base.errorOnIgnoredOrder).toBe(true);

      Base.timestampedMigrations = false;
      expect(Base.timestampedMigrations).toBe(false);

      Base.generateSecureTokenOn = "initialize";
      expect(Base.generateSecureTokenOn).toBe("initialize");

      Base.raiseIntWiderThan64bit = false;
      expect(Base.raiseIntWiderThan64bit).toBe(false);

      Base.belongsToRequiredValidatesForeignKey = true;
      expect(Base.belongsToRequiredValidatesForeignKey).toBe(true);
    });
  });
});
