import { describe, it, expect, beforeEach } from "vitest";
import { processAction, cleanupViewRuntime, appendInfoToPayload } from "./controller-runtime.js";
import * as RuntimeRegistry from "../runtime-registry.js";

describe("ControllerRuntimeTest", () => {
  beforeEach(() => RuntimeRegistry.reset());

  describe("processAction", () => {
    it("resets the SQL runtime registry before action", () => {
      RuntimeRegistry.record("SELECT", 10.0);
      expect(RuntimeRegistry.stats().sqlRuntime).toBe(10.0);

      processAction.call({ dbRuntime: null }, "index");

      expect(RuntimeRegistry.stats().sqlRuntime).toBe(0.0);
    });

    it("accepts additional args without error", () => {
      expect(() => processAction.call({ dbRuntime: null }, "show", "extra", "args")).not.toThrow();
    });
  });

  describe("appendInfoToPayload", () => {
    it("appends dbRuntime from registry to payload", () => {
      RuntimeRegistry.record("SELECT", 7.5);
      const payload: Record<string, unknown> = {};

      appendInfoToPayload.call({ dbRuntime: null }, payload);

      expect(payload["dbRuntime"]).toBe(7.5);
      expect(RuntimeRegistry.stats().sqlRuntime).toBe(0.0);
    });

    it("sums controller dbRuntime with registry runtime", () => {
      RuntimeRegistry.record("SELECT", 3.0);
      const payload: Record<string, unknown> = {};

      appendInfoToPayload.call({ dbRuntime: 4.0 }, payload);

      expect(payload["dbRuntime"]).toBe(7.0);
    });

    it("treats null dbRuntime as 0", () => {
      RuntimeRegistry.record("SELECT", 2.0);
      const payload: Record<string, unknown> = {};

      appendInfoToPayload.call({ dbRuntime: null }, payload);

      expect(payload["dbRuntime"]).toBe(2.0);
    });

    it("appends queriesCount to payload", () => {
      RuntimeRegistry.record("SELECT 1", 1.0);
      RuntimeRegistry.record("SELECT 2", 1.0);
      const payload: Record<string, unknown> = {};

      appendInfoToPayload.call({ dbRuntime: null }, payload);

      expect(payload["queriesCount"]).toBe(2);
    });

    it("resets counts after appending", () => {
      RuntimeRegistry.record("SELECT", 1.0);
      const payload: Record<string, unknown> = {};

      appendInfoToPayload.call({ dbRuntime: null }, payload);

      expect(RuntimeRegistry.stats().queriesCount).toBe(0);
    });

    it("appends cachedQueriesCount and resets it", () => {
      RuntimeRegistry.record("SELECT", 1.0, { cached: true });
      RuntimeRegistry.record("SELECT", 1.0, { cached: true });
      const payload: Record<string, unknown> = {};

      appendInfoToPayload.call({ dbRuntime: null }, payload);

      expect(payload["cachedQueriesCount"]).toBe(2);
      expect(RuntimeRegistry.stats().cachedQueriesCount).toBe(0);
    });
  });

  describe("cleanupViewRuntime", () => {
    it("returns 0 when logger is absent", () => {
      RuntimeRegistry.record("SELECT", 5.0);
      const result = cleanupViewRuntime.call({ dbRuntime: null });
      expect(result).toBe(0);
    });

    it("returns 0 when logger.info returns false", () => {
      RuntimeRegistry.record("SELECT", 5.0);
      const result = cleanupViewRuntime.call({ dbRuntime: null, logger: { "info?": false } });
      expect(result).toBe(0);
    });

    it("accumulates pre-render dbRuntime when logger.info returns true", () => {
      RuntimeRegistry.record("SELECT", 6.0);
      const host = { dbRuntime: 1.0, logger: { "info?": true } };

      cleanupViewRuntime.call(host);

      // pre-render SQL time (6.0) is added to existing dbRuntime (1.0)
      expect(host.dbRuntime).toBe(7.0);
    });

    it("resets the runtime registry when logger.info returns true", () => {
      RuntimeRegistry.record("SELECT", 6.0);
      const host = { dbRuntime: null, logger: { "info?": true } };

      cleanupViewRuntime.call(host);

      expect(RuntimeRegistry.stats().sqlRuntime).toBe(0.0);
    });

    it("returns 0 without ActionView (no queries between resets)", () => {
      RuntimeRegistry.record("SELECT", 6.0);
      const host = { dbRuntime: null, logger: { "info?": true } };

      const result = cleanupViewRuntime.call(host);

      // Without ActionView super(), no queries run between the two resets so
      // queriesRt = 0 and the return value is viewRenderTime(0) - queriesRt(0) = 0.
      expect(result).toBe(0);
    });
  });
});
