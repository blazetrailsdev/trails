import { describe, it, expect } from "vitest";
import { HashConfig } from "./hash-config.js";
import { register, resolve } from "../connection-adapters.js";
import { AdapterNotFound } from "../errors.js";
import "../connection-handling.js";

describe("DatabaseConfigurations", () => {
  describe("HashConfigTrailsTest", () => {
    it("validate rejects an empty adapter string", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "" });
      expect(() => config.validateBang()).toThrow(AdapterNotFound);
    });

    it("validate reports a registered adapter whose loader failed", async () => {
      register("trails_broken_adapter", () => Promise.reject(new Error("Cannot find module 'pg'")));
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_broken_adapter",
      });
      expect(config.validateBang()).toBe(true);

      await expect(resolve("trails_broken_adapter")).rejects.toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter. Missing a package it depends on? Cannot find module 'pg'",
      );
      expect(() => config.validateBang()).toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter.",
      );
    });

    it("validate reports a registered adapter whose own path does not resolve", async () => {
      register(
        "trails_mispathed_adapter",
        async () => (await import("./no-such-adapter.js" as string)) as never,
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_mispathed_adapter",
      });

      await expect(resolve("trails_mispathed_adapter")).rejects.toThrow(
        "Error loading the 'trails_mispathed_adapter' Active Record adapter. Ensure that the path registered by the adapter package is correct.",
      );
    });

    it("validate reports a registered adapter whose own dependency does not resolve", async () => {
      register("trails_depless_adapter", async () => {
        await import("./hash-config.js");
        throw new Error("Cannot find module 'mysql2' imported from '/adapters/mysql2-adapter.js'");
      });
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_depless_adapter",
      });

      await expect(resolve("trails_depless_adapter")).rejects.toThrow(
        "Error loading the 'trails_depless_adapter' Active Record adapter. Missing a package it depends on? Cannot find module 'mysql2'",
      );
    });

    it("re-registering an adapter clears the recorded load failure", async () => {
      register("trails_refixed_adapter", () => Promise.reject(new Error("boom")));
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_refixed_adapter",
      });
      await expect(resolve("trails_refixed_adapter")).rejects.toThrow();
      expect(() => config.validateBang()).toThrow();

      register("trails_refixed_adapter", () => Promise.resolve(class {}) as never);
      expect(config.validateBang()).toBe(true);
    });
  });
});
