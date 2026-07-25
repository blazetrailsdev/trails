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
    // `belongsToRequiredValidatesForeignKey` is deliberately absent: the AR test
    // harness flips it to false suite-wide (helper.rb:43), so the live binding
    // never reads back the framework default here. `trailtie.test.ts` covers the
    // `true` default via the untouched config hash.
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
