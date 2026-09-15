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
import { AsyncExecutor } from "./ar-config.js";
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

describe("AsyncExecutor", () => {
  it("runs at most maxThreads tasks, queues up to maxQueue, then runs on the caller", async () => {
    const executor = new AsyncExecutor({
      minThreads: 0,
      maxThreads: 2,
      maxQueue: 1,
      fallbackPolicy: "caller_runs",
    });
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const task = (name: string) => async () => {
      running += 1;
      peak = Math.max(peak, running);
      order.push(name);
      await gate;
      running -= 1;
    };

    executor.post(task("a"));
    executor.post(task("b"));
    executor.post(task("c"));
    executor.post(task("d"));
    expect(order).toEqual(["d"]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["d", "a", "b"]);
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(order).toEqual(["d", "a", "b", "c"]);
    expect(peak).toBe(3);
  });
});
