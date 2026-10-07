import { describe, it, expect, beforeEach } from "vitest";
import {
  Concern,
  Module,
  extend,
  include,
  initializeIncludedModules,
} from "@blazetrails/activesupport";
import { ControllerRuntime, logProcessAction } from "./controller-runtime.js";
import * as RuntimeRegistry from "../runtime-registry.js";

const FakeInstrumentation = new Module((mod) => {
  extend(mod, Concern);

  mod.defineMethod(
    "processAction",
    function (this: FakeController, action: string, ...args: unknown[]): unknown {
      this.processedWith = [action, ...args];
      return undefined;
    },
  );
  mod.defineMethod("cleanupViewRuntime", function <T>(block: () => T): T {
    return block();
  });
  mod.defineMethod(
    "appendInfoToPayload",
    function (this: FakeController, payload: Record<string, unknown>): void {
      payload.view_runtime = this.viewRuntime;
    },
  );
}) as Module & { ClassMethods: Module };
FakeInstrumentation.ClassMethods = new Module((mod) => {
  mod.defineMethod("logProcessAction", function (payload: Record<string, unknown>): string[] {
    return payload.view_runtime == null ? [] : [`Views: ${payload.view_runtime}ms`];
  });
});

class FakeController {
  dbRuntime: number | null = null;
  logger: { "info?": boolean } | null = null;
  viewRuntime: number | null = null;
  processedWith: unknown[] = [];
  declare processAction: (action: string, ...args: unknown[]) => unknown;
  declare cleanupViewRuntime: <T>(block: () => T) => T;
  declare appendInfoToPayload: (payload: Record<string, unknown>) => void;

  constructor() {
    initializeIncludedModules(this);
  }
}
include(FakeController as never, FakeInstrumentation);
include(FakeController as never, ControllerRuntime);

describe("ControllerRuntimeTest", () => {
  beforeEach(() => RuntimeRegistry.reset());

  describe("processAction", () => {
    it("resets the SQL runtime registry before action", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 10.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      expect(RuntimeRegistry.sqlRuntime()).toBe(10.0);

      const controller = new FakeController();
      controller.processAction("index");

      expect(RuntimeRegistry.sqlRuntime()).toBe(0.0);
      expect(controller.processedWith).toEqual(["index"]);
    });

    it("accepts additional args without error", () => {
      const controller = new FakeController();
      controller.processAction("show", "extra", "args");
      expect(controller.processedWith).toEqual(["show", "extra", "args"]);
    });
  });

  describe("appendInfoToPayload", () => {
    it("appends db_runtime from registry to payload, over super's view_runtime", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 7.5);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      const payload: Record<string, unknown> = {};
      const controller = new FakeController();
      controller.viewRuntime = 2.0;

      controller.appendInfoToPayload(payload);

      expect(payload["view_runtime"]).toBe(2.0);
      expect(payload["db_runtime"]).toBe(7.5);
      expect(RuntimeRegistry.sqlRuntime()).toBe(0.0);
    });

    it("sums controller db_runtime with registry runtime", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 3.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      const payload: Record<string, unknown> = {};
      const controller = new FakeController();
      controller.dbRuntime = 4.0;

      controller.appendInfoToPayload(payload);

      expect(payload["db_runtime"]).toBe(7.0);
    });

    it("treats null db_runtime as 0", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 2.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(payload["db_runtime"]).toBe(2.0);
    });

    it("appends queries_count to payload", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 1.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 1.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(payload["queries_count"]).toBe(2);
    });

    it("resets counts after appending", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 1.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(RuntimeRegistry.queriesCount()).toBe(0);
    });

    it("appends cached_queries_count and resets it", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 1.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      RuntimeRegistry.setCachedQueriesCount(RuntimeRegistry.cachedQueriesCount() + 1);
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 1.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      RuntimeRegistry.setCachedQueriesCount(RuntimeRegistry.cachedQueriesCount() + 1);
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(payload["cached_queries_count"]).toBe(2);
      expect(RuntimeRegistry.cachedQueriesCount()).toBe(0);
    });
  });

  describe("cleanupViewRuntime", () => {
    it("yields to super when logger is absent", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 5.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      expect(new FakeController().cleanupViewRuntime(() => 3.0)).toBe(3.0);
    });

    it("yields to super when logger.info returns false", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 5.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      const controller = new FakeController();
      controller.logger = { "info?": false };
      expect(controller.cleanupViewRuntime(() => 3.0)).toBe(3.0);
    });

    it("accumulates pre-render db_runtime when logger.info returns true", () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 6.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
      const controller = new FakeController();
      controller.dbRuntime = 1.0;
      controller.logger = { "info?": true };

      controller.cleanupViewRuntime(() => 0);

      expect(controller.dbRuntime).toBe(7.0);
      expect(RuntimeRegistry.sqlRuntime()).toBe(0.0);
    });

    it("subtracts the queries run inside the block from the measured runtime", () => {
      const controller = new FakeController();
      controller.logger = { "info?": true };

      const result = controller.cleanupViewRuntime(() => {
        RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 4.0);
        RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
        return 10.0;
      });

      expect(result).toBe(6.0);
      expect(controller.dbRuntime).toBe(4.0);
    });

    it("subtracts the queries of a block that deferred its render to a promise", async () => {
      const controller = new FakeController();
      controller.logger = { "info?": true };

      const result = await controller.cleanupViewRuntime(async () => {
        await Promise.resolve();
        RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 4.0);
        RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
        return 10.0;
      });

      expect(result).toBe(6.0);
      expect(controller.dbRuntime).toBe(4.0);
    });
  });

  describe("log_process_action", () => {
    it("appends the ActiveRecord segment over super's messages", () => {
      expect(
        logProcessAction.call(FakeController as never, {
          view_runtime: 1.0,
          db_runtime: 2.34,
          queries_count: 1,
          cached_queries_count: 3,
        }),
      ).toEqual(["Views: 1ms", "ActiveRecord: 2.3ms (1 query, 3 cached)"]);
    });

    it("pluralizes on queries_count and defaults the counts to zero", () => {
      expect(logProcessAction.call(FakeController as never, { db_runtime: 10.0 })).toEqual([
        "ActiveRecord: 10.0ms (0 queries, 0 cached)",
      ]);
    });

    it("appends nothing without a db_runtime", () => {
      expect(logProcessAction.call(FakeController as never, { view_runtime: 1.0 })).toEqual([
        "Views: 1ms",
      ]);
    });
  });

  describe("initialize", () => {
    it("seats dbRuntime to null on a fresh controller", () => {
      class SeatController {
        logger: { "info?": boolean } | null = null;
        constructor() {
          initializeIncludedModules(this);
        }
      }
      include(SeatController as never, FakeInstrumentation);
      include(SeatController as never, ControllerRuntime);

      const controller = new SeatController() as SeatController & { dbRuntime: number | null };
      expect(
        typeof Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(SeatController.prototype),
          "dbRuntime",
        )?.get,
      ).toBe("function");
      expect(controller.dbRuntime).toBe(null);
      expect(Object.hasOwn(controller, "_dbRuntime")).toBe(true);

      controller.dbRuntime = 1.5;
      expect(Object.hasOwn(controller, "_dbRuntime")).toBe(true);
      expect(new SeatController() as unknown as { dbRuntime: unknown }).toMatchObject({
        dbRuntime: null,
      });
    });
  });
});
