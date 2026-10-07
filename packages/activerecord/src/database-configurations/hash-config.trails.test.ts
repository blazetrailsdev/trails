import { describe, it, expect } from "vitest";
import { HashConfig } from "./hash-config.js";
import { load, register, resolve } from "../connection-adapters.js";
import { LoadError } from "@blazetrails/ruby-compat";
import { AdapterNotFound } from "../errors.js";
import "../connection-handling.js";

const adaptersPath = new URL("../support/trails-test-adapters.ts", import.meta.url).href;
const deplessPath = new URL("../support/trails-depless-adapter.ts", import.meta.url).href;
const brokenPath = new URL("../support/trails-broken-adapter.ts", import.meta.url).href;

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
      expect(() => config.validateBang()).toThrow(AdapterNotFound);
    });

    it("validate reports a registered adapter whose loader failed", async () => {
      register("trails_broken_adapter", "TrailsBrokenAdapter", brokenPath);
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_broken_adapter",
      });
      await load("trails_broken_adapter");
      expect(() => config.validateBang()).toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter. Missing a gem it depends on? cannot load such file -- pg",
      );

      expect(() => resolve("trails_broken_adapter")).toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter. Missing a gem it depends on? cannot load such file -- pg",
      );
      expect(() => config.validateBang()).toThrow(
        "Error loading the 'trails_broken_adapter' Active Record adapter.",
      );
    });

    it("resolve raises AdapterNotFound when the registered class_name does not resolve", async () => {
      register(
        "trails_nameless_adapter",
        "NoSuchAdapter",
        new URL("./hash-config.ts", import.meta.url).href,
      );
      await load("trails_nameless_adapter");
      expect(() => resolve("trails_nameless_adapter")).toThrow(AdapterNotFound);
      expect(() => resolve("trails_nameless_adapter")).toThrow(
        "Could not load the NoSuchAdapter Active Record adapter (uninitialized constant NoSuchAdapter).",
      );
    });

    it("validate reports a registered adapter whose own path does not resolve", async () => {
      register("trails_mispathed_adapter", "TrailsMispathedAdapter", "./no-such-adapter.js");
      await load("trails_mispathed_adapter");
      expect(() => resolve("trails_mispathed_adapter")).toThrow(
        "Error loading the 'trails_mispathed_adapter' Active Record adapter. Ensure that the path registered by the adapter gem is correct.",
      );
    });

    it("validate reports a registered adapter whose package does not resolve", async () => {
      register("trails_unpackaged_adapter", "MegaDB::ActiveRecordAdapter");
      await load("trails_unpackaged_adapter");
      expect(() => resolve("trails_unpackaged_adapter")).toThrow(
        "Error loading the 'trails_unpackaged_adapter' Active Record adapter. Ensure that the path registered by the adapter gem is correct.",
      );
    });

    it("validate reports a registered adapter whose own dependency does not resolve", async () => {
      register("trails_depless_adapter", "TrailsDeplessAdapter", deplessPath);
      await load("trails_depless_adapter");
      expect(() => resolve("trails_depless_adapter")).toThrow(
        "Error loading the 'trails_depless_adapter' Active Record adapter. Missing a gem it depends on? Cannot find package 'mysql2'",
      );
    });

    it("adapter_class raises rather than answering a Promise before the adapter is loaded", async () => {
      register("trails_unloaded_adapter", "TrailsFirstAdapter", adaptersPath);
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_unloaded_adapter",
      });
      expect(() => config.adapterClass()).toThrow(AdapterNotFound);
      expect(() => config.adapterClass()).toThrow(
        "Could not load the TrailsFirstAdapter Active Record adapter (uninitialized constant TrailsFirstAdapter).",
      );
      await load("trails_unloaded_adapter");
      config.validateBang();
      expect((config.adapterClass() as { name: string }).name).toBe("TrailsFirstAdapter");
    });

    it("validate! keeps a memoized adapter class and seats one read before it loaded", async () => {
      register("trails_memo_adapter", "TrailsFirstAdapter", adaptersPath);
      const config = new HashConfig("default_env", "primary", { adapter: "trails_memo_adapter" });
      await load("trails_memo_adapter");
      config.validateBang();
      expect((config.adapterClass() as { name: string }).name).toBe("TrailsFirstAdapter");

      register("trails_memo_adapter", "TrailsSecondAdapter", adaptersPath);
      await load("trails_memo_adapter");
      config.validateBang();
      expect((config.adapterClass() as { name: string }).name).toBe("TrailsFirstAdapter");
    });

    it("inspect renders the resolved adapter class", async () => {
      register("trails_inspect_adapter", "TrailsSecondAdapter", adaptersPath);
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_inspect_adapter",
      });
      await load("trails_inspect_adapter");
      config.validateBang();
      expect(config.inspect()).toBe(
        "#<ActiveRecord::DatabaseConfigurations::HashConfig env_name=default_env name=primary adapter_class=TrailsSecondAdapter>",
      );
    });

    it("re-registering an adapter clears the recorded load failure", async () => {
      register("trails_refixed_adapter", "TrailsRefixedAdapter", brokenPath);
      const config = new HashConfig("default_env", "primary", {
        adapter: "trails_refixed_adapter",
      });
      await load("trails_refixed_adapter");
      expect(() => resolve("trails_refixed_adapter")).toThrow(LoadError);
      expect(() => config.validateBang()).toThrow();

      register("trails_refixed_adapter", "TrailsFirstAdapter", adaptersPath);
      await load("trails_refixed_adapter");
      expect(config.validateBang()).toBe(true);
    });
  });
});
