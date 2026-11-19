import { beforeEach, describe, expect, it } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";
import { lookupStore } from "../../lib/cache.js";
import type { Store } from "../../lib/cache/store.js";
import { Logger } from "../../lib/logger.js";
import { assertPredicate } from "../../lib/testing/assertions.js";
import { isBlank, isPresent } from "../../lib/core-ext/object/blank.js";

describe("CacheStoreLoggerTest", () => {
  let cache: Store;
  let buffer: StringIO;

  beforeEach(() => {
    cache = lookupStore(":memory_store") as Store;

    buffer = new StringIO();
    cache.logger = new Logger(buffer);
  });

  it("logging", async () => {
    await cache.fetch("foo", () => "bar");
    assertPredicate(buffer.string(), isPresent);
  });

  it("log with string namespace", async () => {
    await cache.fetch("foo", { namespace: "string_namespace" }, () => "bar");
    expect(buffer.string()).toMatch(/string_namespace:foo/);
  });

  it("log with proc namespace", async () => {
    const proc = () => "proc_namespace";
    await cache.fetch("foo", { namespace: proc }, () => "bar");
    expect(buffer.string()).toMatch(/proc_namespace:foo/);
  });

  it("mute logging", async () => {
    await cache.mute(async () => await cache.fetch("foo", () => "bar"));
    assertPredicate(buffer.string(), isBlank);
  });
});
