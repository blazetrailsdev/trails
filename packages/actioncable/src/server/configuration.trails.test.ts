import { describe, expect, it } from "vitest";
import { LoadError, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActionCable, SubscriptionAdapter } from "../namespaces.js";
import { Configuration } from "./configuration.js";

class Async {}
class PostgreSQL {}
const loaded: string[] = [];
Object.assign(ActionCable.loadPath, {
  "action_cable/subscription_adapter/async": async () => {
    loaded.push("async");
    rbModConstSet(SubscriptionAdapter, "Async", Async);
  },
  "action_cable/subscription_adapter/postgresql": async () => {
    loaded.push("postgresql");
    rbModConstSet(SubscriptionAdapter, "PostgreSQL", PostgreSQL);
  },
  "action_cable/subscription_adapter/redis": async () => {
    loaded.push("redis");
    throw Object.assign(new Error("Cannot find package 'redis'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
  },
});

describe("ActionCable::Server::Configuration", () => {
  it("has Rails' defaults", () => {
    const config = new Configuration();
    expect(config.logTags).toEqual([]);
    expect(config.logTags).not.toBe(new Configuration().logTags);
    expect(config.workerPoolSize).toBe(4);
    expect(config.disableRequestForgeryProtection).toBe(false);
    expect(config.allowSameOriginAsHost).toBe(true);
    const [status, headers, body] = config.healthCheckApplication({});
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/html");
    expect(headers["date"]).toMatch(/GMT$/);
    expect(body).toEqual([]);
  });

  it("resolves async without loading the other adapters", async () => {
    loaded.length = 0;
    const config = new Configuration();
    config.cable = { adapter: "async" };
    expect(await config.pubsubAdapter()).toBe(Async);
    expect(loaded).toEqual(["async"]);
  });

  it("fixes up PostgreSQL", async () => {
    const config = new Configuration();
    config.cable = { adapter: "postgresql" };
    expect(await config.pubsubAdapter()).toBe(PostgreSQL);
  });

  it("defaults to redis and reports its missing dependency", async () => {
    const config = new Configuration();
    config.cable = {};
    const error = await config.pubsubAdapter().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LoadError);
    expect((error as Error).message).toBe(
      "Error loading the 'redis' Action Cable pubsub adapter. Missing a gem it depends on? Cannot find package 'redis'",
    );
  });

  it("reports a misspelled adapter", async () => {
    const config = new Configuration();
    config.cable = { adapter: "bogus" };
    await expect(config.pubsubAdapter()).rejects.toThrow(
      "Could not load the 'bogus' Action Cable pubsub adapter. Ensure that the adapter is spelled correctly in config/cable.yml and that you've added the necessary adapter gem to your Gemfile.",
    );
  });
});
