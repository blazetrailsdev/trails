import { describe, it, expect, beforeEach } from "vitest";
import { include } from "@blazetrails/activesupport";
import { ControllerRuntime, logProcessAction } from "./controller-runtime.js";
import * as RuntimeRegistry from "../runtime-registry.js";

class FakeController {
  dbRuntime: number | null = null;
  logger: { "info?": boolean } | null = null;
  viewRuntime: number | null = null;
  processedWith: unknown[] = [];

  processAction(action: string, ...args: unknown[]): unknown {
    this.processedWith = [action, ...args];
    return undefined;
  }

  cleanupViewRuntime<T>(block: () => T): T {
    return block();
  }

  appendInfoToPayload(payload: Record<string, unknown>): void {
    payload.view_runtime = this.viewRuntime;
  }

  static logProcessAction(payload: Record<string, unknown>): string[] {
    return payload.view_runtime == null ? [] : [`Views: ${payload.view_runtime}ms`];
  }
}
include(FakeController as never, ControllerRuntime);

describe("ControllerRuntimeTest", () => {
  beforeEach(() => RuntimeRegistry.reset());

  describe("processAction", () => {
    it("resets the SQL runtime registry before action", () => {
      RuntimeRegistry.record("SELECT", 10.0);
      expect(RuntimeRegistry.stats().sqlRuntime).toBe(10.0);

      const controller = new FakeController();
      controller.processAction("index");

      expect(RuntimeRegistry.stats().sqlRuntime).toBe(0.0);
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
      RuntimeRegistry.record("SELECT", 7.5);
      const payload: Record<string, unknown> = {};
      const controller = new FakeController();
      controller.viewRuntime = 2.0;

      controller.appendInfoToPayload(payload);

      expect(payload["view_runtime"]).toBe(2.0);
      expect(payload["db_runtime"]).toBe(7.5);
      expect(RuntimeRegistry.stats().sqlRuntime).toBe(0.0);
    });

    it("sums controller db_runtime with registry runtime", () => {
      RuntimeRegistry.record("SELECT", 3.0);
      const payload: Record<string, unknown> = {};
      const controller = new FakeController();
      controller.dbRuntime = 4.0;

      controller.appendInfoToPayload(payload);

      expect(payload["db_runtime"]).toBe(7.0);
    });

    it("treats null db_runtime as 0", () => {
      RuntimeRegistry.record("SELECT", 2.0);
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(payload["db_runtime"]).toBe(2.0);
    });

    it("appends queries_count to payload", () => {
      RuntimeRegistry.record("SELECT 1", 1.0);
      RuntimeRegistry.record("SELECT 2", 1.0);
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(payload["queries_count"]).toBe(2);
    });

    it("resets counts after appending", () => {
      RuntimeRegistry.record("SELECT", 1.0);
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(RuntimeRegistry.stats().queriesCount).toBe(0);
    });

    it("appends cached_queries_count and resets it", () => {
      RuntimeRegistry.record("SELECT", 1.0, { cached: true });
      RuntimeRegistry.record("SELECT", 1.0, { cached: true });
      const payload: Record<string, unknown> = {};

      new FakeController().appendInfoToPayload(payload);

      expect(payload["cached_queries_count"]).toBe(2);
      expect(RuntimeRegistry.stats().cachedQueriesCount).toBe(0);
    });
  });

  describe("cleanupViewRuntime", () => {
    it("yields to super when logger is absent", () => {
      RuntimeRegistry.record("SELECT", 5.0);
      expect(new FakeController().cleanupViewRuntime(() => 3.0)).toBe(3.0);
    });

    it("yields to super when logger.info returns false", () => {
      RuntimeRegistry.record("SELECT", 5.0);
      const controller = new FakeController();
      controller.logger = { "info?": false };
      expect(controller.cleanupViewRuntime(() => 3.0)).toBe(3.0);
    });

    it("accumulates pre-render db_runtime when logger.info returns true", () => {
      RuntimeRegistry.record("SELECT", 6.0);
      const controller = new FakeController();
      controller.dbRuntime = 1.0;
      controller.logger = { "info?": true };

      controller.cleanupViewRuntime(() => 0);

      expect(controller.dbRuntime).toBe(7.0);
      expect(RuntimeRegistry.stats().sqlRuntime).toBe(0.0);
    });

    it("subtracts the queries run inside the block from the measured runtime", () => {
      const controller = new FakeController();
      controller.logger = { "info?": true };

      const result = controller.cleanupViewRuntime(() => {
        RuntimeRegistry.record("SELECT", 4.0);
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
        RuntimeRegistry.record("SELECT", 4.0);
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
        processAction(): unknown {
          return undefined;
        }
        cleanupViewRuntime<T>(block: () => T): T {
          return block();
        }
        appendInfoToPayload(): void {}
        static logProcessAction(): string[] {
          return [];
        }
      }
      include(SeatController as never, ControllerRuntime);

      const controller = new SeatController() as SeatController & { dbRuntime: number | null };
      expect(controller.dbRuntime).toBe(null);
      expect(Object.hasOwn(controller, "dbRuntime")).toBe(false);

      controller.dbRuntime = 1.5;
      expect(Object.hasOwn(controller, "dbRuntime")).toBe(true);
      expect(new SeatController() as unknown as { dbRuntime: unknown }).toMatchObject({
        dbRuntime: null,
      });
    });
  });
});
