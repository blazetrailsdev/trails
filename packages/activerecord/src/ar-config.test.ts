import { describe, it, expect, afterEach } from "vitest";
import * as arConfig from "./ar-config.js";
import { DefaultStrategy } from "./migration/default-strategy.js";

describe("ar-config module-level flags", () => {
  it("mirror the ActiveRecord module defaults from active_record.rb", () => {
    expect(arConfig.databaseCli).toEqual({
      postgresql: "psql",
      mysql: ["mysql", "mysql5"],
      sqlite: "sqlite3",
    });
    expect(arConfig.asyncQueryExecutor).toBeNull();
    expect(arConfig.queues).toEqual({});
    expect(arConfig.maintainTestSchema).toBeNull();
    expect(arConfig.belongsToRequiredValidatesForeignKey).toBe(true);
    expect(arConfig.applicationRecordClass).toBeNull();
    expect(arConfig.errorOnIgnoredOrder).toBe(false);
    expect(arConfig.timestampedMigrations).toBe(true);
    expect(arConfig.migrationStrategy).toBe(DefaultStrategy);
    expect(arConfig.verifyForeignKeysForFixtures).toBe(false);
    expect(arConfig.useYamlUnsafeLoad).toBe(false);
    expect(arConfig.raiseIntWiderThan64bit).toBe(true);
    expect(arConfig.yamlColumnPermittedClasses).toEqual([Symbol]);
    expect(arConfig.generateSecureTokenOn).toBe("create");
  });

  describe("setters update the live binding", () => {
    afterEach(() => {
      arConfig.setErrorOnIgnoredOrder(false);
      arConfig.setTimestampedMigrations(true);
      arConfig.setGenerateSecureTokenOn("create");
      arConfig.setRaiseIntWiderThan64bit(true);
    });

    it("round-trip a written value", () => {
      arConfig.setErrorOnIgnoredOrder(true);
      expect(arConfig.errorOnIgnoredOrder).toBe(true);

      arConfig.setTimestampedMigrations(false);
      expect(arConfig.timestampedMigrations).toBe(false);

      arConfig.setGenerateSecureTokenOn("initialize");
      expect(arConfig.generateSecureTokenOn).toBe("initialize");

      arConfig.setRaiseIntWiderThan64bit(false);
      expect(arConfig.raiseIntWiderThan64bit).toBe(false);
    });
  });
});
