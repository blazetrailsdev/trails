import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./base.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import {
  asyncQueryExecutor,
  databaseCli,
  errorOnIgnoredOrder,
  maintainTestSchema,
  migrationStrategy,
  setAsyncQueryExecutor,
  setErrorOnIgnoredOrder,
  setMaintainTestSchema,
  setTimestampedMigrations,
  timestampedMigrations,
  verifyForeignKeysForFixtures,
} from "./active-record.js";

describe("ar-config module-level flags", () => {
  it("mirror the ActiveRecord module defaults from active_record.rb", () => {
    expect(databaseCli()).toEqual({
      postgresql: "psql",
      mysql: ["mysql", "mysql5"],
      sqlite: "sqlite3",
    });
    expect(asyncQueryExecutor()).toBeNull();
    expect(Base.queues).toEqual({});
    expect(maintainTestSchema()).toBeNull();
    expect(Base.applicationRecordClass).toBeNull();
    expect(errorOnIgnoredOrder()).toBe(false);
    expect(timestampedMigrations()).toBe(true);
    expect(migrationStrategy()).toBe(DefaultStrategy);
    expect(verifyForeignKeysForFixtures()).toBe(false);
    expect(Base.useYamlUnsafeLoad).toBe(false);
    expect(Base.raiseIntWiderThan64bit).toBe(true);
    expect(Base.yamlColumnPermittedClasses).toEqual([Symbol]);
    expect(Base.generateSecureTokenOn).toBe("create");
  });

  describe("the ActiveRecord module object assigns through to the live value", () => {
    afterEach(() => {
      setAsyncQueryExecutor(null);
      Base.queues = {};
      setMaintainTestSchema(null);
      setErrorOnIgnoredOrder(false);
      setTimestampedMigrations(true);
      Base.generateSecureTokenOn = "create";
      Base.raiseIntWiderThan64bit = true;
      Base.belongsToRequiredValidatesForeignKey = false;
    });

    it("round-trip a written value", () => {
      setAsyncQueryExecutor("multi_thread_pool");
      expect(asyncQueryExecutor()).toBe("multi_thread_pool");

      Base.queues = { destroyAssociationAsync: "low" };
      expect(Base.queues).toEqual({ destroyAssociationAsync: "low" });

      setMaintainTestSchema(true);
      expect(maintainTestSchema()).toBe(true);

      setErrorOnIgnoredOrder(true);
      expect(errorOnIgnoredOrder()).toBe(true);

      setTimestampedMigrations(false);
      expect(timestampedMigrations()).toBe(false);

      Base.generateSecureTokenOn = "initialize";
      expect(Base.generateSecureTokenOn).toBe("initialize");

      Base.raiseIntWiderThan64bit = false;
      expect(Base.raiseIntWiderThan64bit).toBe(false);

      Base.belongsToRequiredValidatesForeignKey = true;
      expect(Base.belongsToRequiredValidatesForeignKey).toBe(true);
    });
  });
});
