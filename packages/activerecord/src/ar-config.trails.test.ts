import { describe, it, expect, afterEach } from "vitest";
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
import {
  applicationRecordClass,
  belongsToRequiredValidatesForeignKey,
  generateSecureTokenOn,
  queues,
  raiseIntWiderThan64bit,
  setBelongsToRequiredValidatesForeignKey,
  setGenerateSecureTokenOn,
  setQueues,
  setRaiseIntWiderThan64bit,
  useYamlUnsafeLoad,
  yamlColumnPermittedClasses,
} from "./active-record.js";

describe("ar-config module-level flags", () => {
  it("mirror the ActiveRecord module defaults from active_record.rb", () => {
    expect(databaseCli()).toEqual({
      postgresql: "psql",
      mysql: ["mysql", "mysql5"],
      sqlite: "sqlite3",
    });
    expect(asyncQueryExecutor()).toBeNull();
    expect(queues()).toEqual({});
    expect(maintainTestSchema()).toBeNull();
    expect(applicationRecordClass()).toBeNull();
    expect(errorOnIgnoredOrder()).toBe(false);
    expect(timestampedMigrations()).toBe(true);
    expect(migrationStrategy()).toBe(DefaultStrategy);
    expect(verifyForeignKeysForFixtures()).toBe(false);
    expect(useYamlUnsafeLoad()).toBe(false);
    expect(raiseIntWiderThan64bit()).toBe(true);
    expect(yamlColumnPermittedClasses()).toEqual([Symbol]);
    expect(generateSecureTokenOn()).toBe("create");
  });

  describe("the ActiveRecord module object assigns through to the live value", () => {
    afterEach(() => {
      setAsyncQueryExecutor(null);
      setQueues({});
      setMaintainTestSchema(null);
      setErrorOnIgnoredOrder(false);
      setTimestampedMigrations(true);
      setGenerateSecureTokenOn("create");
      setRaiseIntWiderThan64bit(true);
      setBelongsToRequiredValidatesForeignKey(false);
    });

    it("round-trip a written value", () => {
      setAsyncQueryExecutor("multi_thread_pool");
      expect(asyncQueryExecutor()).toBe("multi_thread_pool");

      setQueues({ destroyAssociationAsync: "low" });
      expect(queues()).toEqual({ destroyAssociationAsync: "low" });

      setMaintainTestSchema(true);
      expect(maintainTestSchema()).toBe(true);

      setErrorOnIgnoredOrder(true);
      expect(errorOnIgnoredOrder()).toBe(true);

      setTimestampedMigrations(false);
      expect(timestampedMigrations()).toBe(false);

      setGenerateSecureTokenOn("initialize");
      expect(generateSecureTokenOn()).toBe("initialize");

      setRaiseIntWiderThan64bit(false);
      expect(raiseIntWiderThan64bit()).toBe(false);

      setBelongsToRequiredValidatesForeignKey(true);
      expect(belongsToRequiredValidatesForeignKey()).toBe(true);
    });
  });
});
