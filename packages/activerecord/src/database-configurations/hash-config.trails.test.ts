import { describe, it, expect } from "vitest";
import { HashConfig } from "./hash-config.js";
import { load, register, resolve } from "../connection-adapters.js";
import { LoadError } from "@blazetrails/ruby-compat";
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

    it("validate rejects an empty adapter string", async () => {
      const config = new HashConfig("default_env", "primary", { adapter: "" });
      await expect(config.validateBang()).rejects.toThrow(AdapterNotFound);
    });

    it("validate reports a registered adapter whose loader failed", async () => {
      register("trails_broken_adapter", "TrailsTestAdapter", "./trails-broken-adapter.js", () =>
        Promise.reject(new Error("Cannot find module 'pg'")),
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_broken_adapter",
      });
      await expect(config.validateBang()).rejects.toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter. Missing a package it depends on? Cannot find module 'pg'",
      );

      expect(() => resolve("trails_broken_adapter")).toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter. Missing a package it depends on? Cannot find module 'pg'",
      );
      await expect(config.validateBang()).rejects.toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter.",
      );
    });

    it("resolve raises AdapterNotFound when the registered class_name does not resolve", async () => {
      register("trails_nameless_adapter", "NoSuchAdapter", "./trails-nameless-adapter.js", () =>
        Promise.resolve(undefined as never),
      );
      await load("trails_nameless_adapter");
      expect(() => resolve("trails_nameless_adapter")).toThrow(AdapterNotFound);
      expect(() => resolve("trails_nameless_adapter")).toThrow(
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
      await load("trails_mispathed_adapter");
      expect(() => resolve("trails_mispathed_adapter")).toThrow(
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
      await load("trails_unpackaged_adapter");
      expect(() => resolve("trails_unpackaged_adapter")).toThrow(
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
      await load("trails_depless_adapter");
      expect(() => resolve("trails_depless_adapter")).toThrow(
        "Error loading the 'trails_depless_adapter' Active Record adapter. Missing a package it depends on? Cannot find package 'mysql2'",
      );
    });

    it("adapter_class raises rather than answering a Promise before the adapter is loaded", async () => {
      class TrailsUnloadedAdapter {}
      register("trails_unloaded_adapter", "TrailsTestAdapter", "./trails-unloaded-adapter.js", () =>
        Promise.resolve(TrailsUnloadedAdapter as never),
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_unloaded_adapter",
      });
      expect(() => config.adapterClass()).toThrow(AdapterNotFound);
      expect(() => config.adapterClass()).toThrow(
        "Could not load the TrailsTestAdapter Active Record adapter (uninitialized constant TrailsTestAdapter).",
      );
      await config.validateBang();
      expect(config.adapterClass()).toBe(TrailsUnloadedAdapter);
    });

    it("validate! keeps a memoized adapter class", async () => {
      class TrailsFirstAdapter {}
      class TrailsSecondAdapter {}
      register("trails_memo_adapter", "TrailsTestAdapter", "./trails-memo-adapter.js", () =>
        Promise.resolve(TrailsFirstAdapter as never),
      );
      const config = new HashConfig("default_env", "primary", { adapter: "trails_memo_adapter" });
      await config.validateBang();
      expect(config.adapterClass()).toBe(TrailsFirstAdapter);

      register("trails_memo_adapter", "TrailsTestAdapter", "./trails-memo-adapter.js", () =>
        Promise.resolve(TrailsSecondAdapter as never),
      );
      await config.validateBang();
      expect(config.adapterClass()).toBe(TrailsFirstAdapter);
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
      await config.validateBang();
      expect(config.inspect()).toBe(
        "#<ActiveRecord::DatabaseConfigurations::HashConfig env_name=default_env name=primary adapter_class=TrailsInspectAdapter>",
      );
    });

    it("re-registering an adapter clears the recorded load failure", async () => {
      register("trails_refixed_adapter", "TrailsTestAdapter", "./trails-refixed-adapter.js", () =>
        Promise.reject(new Error("boom")),
      );
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_refixed_adapter",
      });
      await load("trails_refixed_adapter");
      expect(() => resolve("trails_refixed_adapter")).toThrow(LoadError);
      await expect(config.validateBang()).rejects.toThrow();

      register(
        "trails_refixed_adapter",
        "TrailsTestAdapter",
        "./trails-refixed-adapter.js",
        () => Promise.resolve(class {}) as never,
      );
      expect(await config.validateBang()).toBe(true);
    });
  });
});
