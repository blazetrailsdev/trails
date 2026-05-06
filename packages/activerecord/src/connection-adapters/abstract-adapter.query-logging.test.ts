import { describe, it, expect, vi } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { ActiveRecordError, StatementInvalid } from "../errors.js";
import { Notifications } from "@blazetrails/activesupport";
import { Collectors } from "@blazetrails/arel";

describe("AbstractAdapter query/logging infrastructure (PR 25b)", () => {
  describe("translateExceptionClass", () => {
    it("passes through ActiveRecordError subclasses unchanged", () => {
      const a = new AbstractAdapter();
      const err = new ActiveRecordError("boom");
      expect(a.translateExceptionClass(err, "SELECT 1", [])).toBe(err);
    });

    it("wraps native errors via translateException", () => {
      const a = new AbstractAdapter();
      const native = new Error("disk I/O error");
      const result = a.translateExceptionClass(native, "INSERT INTO t VALUES (1)", []);
      expect(result).toBeInstanceOf(StatementInvalid);
    });

    it("copies stack from native error onto wrapped error", () => {
      const a = new AbstractAdapter();
      const native = new Error("native");
      native.stack = "some stack";
      const result = a.translateExceptionClass(native, "SELECT 1", []) as Error;
      expect(result.stack).toBe("some stack");
    });
  });

  describe("translateException", () => {
    it("passes ActiveRecordError through", () => {
      const a = new AbstractAdapter();
      const err = new ActiveRecordError("nope");
      expect(a.translateException(err, { message: "msg", sql: "SELECT 1", binds: [] })).toBe(err);
    });

    it("wraps unknown errors as StatementInvalid", () => {
      const a = new AbstractAdapter();
      const err = new Error("native db error");
      const result = a.translateException(err, {
        message: "Error: native db error",
        sql: "DELETE FROM t",
        binds: [],
      });
      expect(result).toBeInstanceOf(StatementInvalid);
      expect((result as StatementInvalid).sql).toBe("DELETE FROM t");
    });
  });

  describe("instrumenter", () => {
    it("returns the Notifications class", () => {
      const a = new AbstractAdapter();
      expect(a.instrumenter).toBe(Notifications);
    });
  });

  describe("log", () => {
    it("wraps block in sql.active_record notification", async () => {
      const a = new AbstractAdapter();
      const events: string[] = [];
      const sub = Notifications.subscribe("sql.active_record", (e) => events.push(e.name));
      try {
        await a.log("SELECT 1", "SQL", [], [], false, async () => "result");
        expect(events).toContain("sql.active_record");
      } finally {
        Notifications.unsubscribe(sub);
      }
    });

    it("re-throws StatementInvalid with query attached", async () => {
      const a = new AbstractAdapter();
      const inner = new StatementInvalid("oops");
      await expect(
        a.log("SELECT 1", "SQL", [1, 2], [], false, async () => {
          throw inner;
        }),
      ).rejects.toBeInstanceOf(StatementInvalid);
    });
  });

  describe("collector", () => {
    it("returns Composite when preparedStatements=true", () => {
      const a = new AbstractAdapter();
      (a as any)._preparedStatements = true;
      expect(a.collector()).toBeInstanceOf(Collectors.Composite);
    });

    it("returns SubstituteBinds when preparedStatements=false", () => {
      const a = new AbstractAdapter();
      (a as any)._preparedStatements = false;
      expect(a.collector()).toBeInstanceOf(Collectors.SubstituteBinds);
    });
  });

  describe("buildResult", () => {
    it("constructs a Result with the given columns, rows, and types", () => {
      const a = new AbstractAdapter();
      const result = a.buildResult(["id", "name"], [[1, "Alice"]]);
      expect(result.columns).toEqual(["id", "name"]);
      expect(result.rows).toEqual([[1, "Alice"]]);
    });
  });

  describe("buildStatementPool", () => {
    it("returns undefined in the base implementation", () => {
      const a = new AbstractAdapter();
      expect(a.buildStatementPool()).toBeUndefined();
    });
  });

  describe("defaultPreparedStatements", () => {
    it("returns true in the base implementation", () => {
      const a = new AbstractAdapter();
      expect(a.defaultPreparedStatements()).toBe(true);
    });
  });

  describe("attemptConfigureConnection", () => {
    it("calls configureConnection and resolves", async () => {
      const a = new AbstractAdapter();
      let called = 0;
      a.configureConnection = async () => void called++;
      await a.attemptConfigureConnection();
      expect(called).toBe(1);
    });

    it("disconnects and re-throws if configureConnection fails", async () => {
      const a = new AbstractAdapter();
      a.configureConnection = async () => {
        throw new Error("connect failed");
      };
      const spy = vi.spyOn(a, "disconnectBang");
      await expect(a.attemptConfigureConnection()).rejects.toThrow("connect failed");
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe("isWarningIgnored", () => {
    it("returns false when no matchers are configured", () => {
      const a = new AbstractAdapter();
      expect(a.isWarningIgnored({ message: "some warning", code: "W123" })).toBe(false);
    });

    it("matches by string substring on message", () => {
      const a = new AbstractAdapter();
      (a.constructor as any).dbWarningsIgnore = ["deprecated"];
      expect(a.isWarningIgnored({ message: "this feature is deprecated" })).toBe(true);
      delete (a.constructor as any).dbWarningsIgnore;
    });

    it("matches by RegExp on message", () => {
      const a = new AbstractAdapter();
      (a.constructor as any).dbWarningsIgnore = [/W\d+/];
      expect(a.isWarningIgnored({ message: "ok", code: "W001" })).toBe(true);
      delete (a.constructor as any).dbWarningsIgnore;
    });
  });

  describe("lookupCastTypeFromColumn", () => {
    it("returns null for a column with null sqlType", () => {
      const a = new AbstractAdapter();
      expect(a.lookupCastTypeFromColumn({ sqlType: null })).toBeNull();
    });

    it("delegates to lookupCastType when available", () => {
      const a = new AbstractAdapter();
      (a as any).lookupCastType = (t: string) => `cast:${t}`;
      expect(a.lookupCastTypeFromColumn({ sqlType: "varchar" })).toBe("cast:varchar");
    });

    it("returns the sqlType string when lookupCastType is absent", () => {
      const a = new AbstractAdapter();
      expect(a.lookupCastTypeFromColumn({ sqlType: "integer" })).toBe("integer");
    });
  });
});
