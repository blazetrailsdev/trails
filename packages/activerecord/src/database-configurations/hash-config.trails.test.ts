import { describe, it, expect } from "vitest";
import { HashConfig } from "./hash-config.js";
import { register, resolve } from "../connection-adapters.js";
import { AdapterNotFound } from "../errors.js";
import "../connection-handling.js";

describe("DatabaseConfigurations", () => {
  describe("HashConfigTrailsTest", () => {
    it("adapter_class raises AdapterNotFound when no adapter is configured", () => {
      const config = new HashConfig("default_env", "primary", {});
      expect(() => config.adapterClass()).toThrow(AdapterNotFound);
      expect(() => config.adapterClass()).toThrow(
        "Database configuration specifies nonexistent '' adapter.",
      );
    });

    it("new_connection raises AdapterNotFound when no adapter is configured", () => {
      const config = new HashConfig("default_env", "primary", {});
      expect(() => config.newConnection()).toThrow(AdapterNotFound);
    });

    it("validate rejects an empty adapter string", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "" });
      expect(() => config.validateBang()).toThrow(AdapterNotFound);
    });

    it("validate reports a registered adapter whose loader failed", async () => {
      register("trails_broken_adapter", "TrailsTestAdapter", "./trails-broken-adapter.js", () =>
        Promise.reject(new Error("Cannot find module 'pg'")),
      );
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

    it("resolve raises AdapterNotFound when the registered class_name does not resolve", async () => {
      register("trails_nameless_adapter", "NoSuchAdapter", "./trails-nameless-adapter.js", () =>
        Promise.resolve(undefined as never),
      );
      const error = await Promise.resolve(resolve("trails_nameless_adapter")).catch((e) => e);
      expect(error).toBeInstanceOf(AdapterNotFound);
      expect(error.message).toBe(
        "Could not load the NoSuchAdapter Active Record adapter (uninitialized constant NoSuchAdapter).",
      );
    });

    it("validate reports a registered adapter whose own path does not resolve", async () => {
      register(
        "trails_mispathed_adapter",
        "TrailsTestAdapter",
        "./no-such-adapter.js",
        async () => {
          await import("./no-such-adapter.js" as string);
          return null as never;
        },
      );
      await expect(resolve("trails_mispathed_adapter")).rejects.toThrow(
        "Error loading the 'trails_mispathed_adapter' Active Record adapter. Ensure that the path registered by the adapter package is correct.",
      );
    });

    it("validate reports a registered adapter whose package does not resolve", async () => {
      register(
        "trails_unpackaged_adapter",
        "TrailsTestAdapter",
        "@blazetrails/no-such-adapter/index.js",
        async () => {
          await import("@blazetrails/no-such-adapter/index.js" as string);
          return null as never;
        },
      );
      await expect(resolve("trails_unpackaged_adapter")).rejects.toThrow(
        "Error loading the 'trails_unpackaged_adapter' Active Record adapter. Ensure that the path registered by the adapter package is correct.",
      );
    });

    it("validate reports a registered adapter whose own dependency does not resolve", async () => {
      register(
        "trails_depless_adapter",
        "TrailsTestAdapter",
        "./trails-depless-adapter.js",
        async () => {
          await import("./hash-config.js");
          throw Object.assign(
            new Error("Cannot find package 'mysql2' imported from /adapters/mysql2-adapter.js"),
            { code: "ERR_MODULE_NOT_FOUND" },
          );
        },
      );
      await expect(resolve("trails_depless_adapter")).rejects.toThrow(
        "Error loading the 'trails_depless_adapter' Active Record adapter. Missing a package it depends on? Cannot find package 'mysql2'",
      );
    });

    it("inspect renders the resolved adapter class", async () => {
      class TrailsInspectAdapter {}
      register(
        "trails_inspect_adapter",
        "TrailsTestAdapter",
        "./trails-inspect-adapter.js",
        () => Promise.resolve(TrailsInspectAdapter) as never,
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_inspect_adapter",
      });
      await resolve("trails_inspect_adapter");
      await config.adapterClass();
      expect(config.inspect()).toBe(
        "#<HashConfig env_name=default_env name=primary adapter_class=TrailsInspectAdapter>",
      );
    });

    it("inspect does not leave the driver load rejection unhandled", async () => {
      register(
        "trails_inspect_broken_adapter",
        "TrailsTestAdapter",
        "./trails-inspect-broken-adapter.js",
        () => Promise.reject(new Error("Cannot find module 'pg'")),
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_inspect_broken_adapter",
      });
      expect(config.inspect()).toContain("adapter_class=trails_inspect_broken_adapter");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("inspect falls back to the adapter name while the adapter is still loading", () => {
      register(
        "trails_inflight_adapter",
        "TrailsTestAdapter",
        "./trails-inflight-adapter.js",
        () => new Promise<never>(() => {}),
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_inflight_adapter",
      });
      expect(config.inspect()).toBe(
        "#<HashConfig env_name=default_env name=primary adapter_class=trails_inflight_adapter>",
      );
    });

    it("re-registering an adapter clears the recorded load failure", async () => {
      register("trails_refixed_adapter", "TrailsTestAdapter", "./trails-refixed-adapter.js", () =>
        Promise.reject(new Error("boom")),
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_refixed_adapter",
      });
      await expect(resolve("trails_refixed_adapter")).rejects.toThrow();
      expect(() => config.validateBang()).toThrow();

      register(
        "trails_refixed_adapter",
        "TrailsTestAdapter",
        "./trails-refixed-adapter.js",
        () => Promise.resolve(class {}) as never,
      );
      expect(config.validateBang()).toBe(true);
    });
  });
});
