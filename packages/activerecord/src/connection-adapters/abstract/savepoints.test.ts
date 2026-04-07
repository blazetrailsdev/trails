import { describe, it, expect, beforeEach } from "vitest";
import {
  currentSavepointName,
  createSavepointSql,
  execRollbackToSavepointSql,
  releaseSavepointSql,
  nextSavepointName,
  resetSavepointNumber,
  createSavepoint,
  execRollbackToSavepoint,
  releaseSavepoint,
  type SavepointHost,
} from "./savepoints.js";

describe("Savepoints", () => {
  beforeEach(() => {
    resetSavepointNumber();
  });

  it("currentSavepointName", () => {
    expect(currentSavepointName()).toBe("active_record_0");
  });

  it("nextSavepointName increments", () => {
    expect(nextSavepointName()).toBe("active_record_1");
    expect(nextSavepointName()).toBe("active_record_2");
  });

  describe("SQL generation", () => {
    it("createSavepointSql", () => {
      expect(createSavepointSql("active_record_1")).toBe("SAVEPOINT active_record_1");
    });

    it("execRollbackToSavepointSql", () => {
      expect(execRollbackToSavepointSql("active_record_1")).toBe(
        "ROLLBACK TO SAVEPOINT active_record_1",
      );
    });

    it("releaseSavepointSql", () => {
      expect(releaseSavepointSql("active_record_1")).toBe("RELEASE SAVEPOINT active_record_1");
    });
  });

  describe("adapter methods", () => {
    let executedSql: string[];
    let host: SavepointHost;

    beforeEach(() => {
      executedSql = [];
      host = {
        async internalExecute(sql: string, _name: string) {
          executedSql.push(sql);
        },
      };
    });

    it("createSavepoint executes SAVEPOINT SQL", async () => {
      nextSavepointName();
      await createSavepoint.call(host);
      expect(executedSql).toEqual(["SAVEPOINT active_record_1"]);
    });

    it("createSavepoint with explicit name", async () => {
      await createSavepoint.call(host, "my_savepoint");
      expect(executedSql).toEqual(["SAVEPOINT my_savepoint"]);
    });

    it("execRollbackToSavepoint executes ROLLBACK TO SAVEPOINT SQL", async () => {
      nextSavepointName();
      await execRollbackToSavepoint.call(host);
      expect(executedSql).toEqual(["ROLLBACK TO SAVEPOINT active_record_1"]);
    });

    it("releaseSavepoint executes RELEASE SAVEPOINT SQL", async () => {
      nextSavepointName();
      await releaseSavepoint.call(host);
      expect(executedSql).toEqual(["RELEASE SAVEPOINT active_record_1"]);
    });
  });
});
