import { beforeEach, expect, it } from "vitest";
import { StringIO, regexpEscape } from "@blazetrails/ruby-compat";
import { Logger } from "../../../lib/logger.js";
import { Store, type StoreOptions } from "../../../lib/cache/store.js";

/** @internal */
export interface CacheLoggingBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  keyPattern?(key: string, options?: { namespace?: string | null }): RegExp;
}

export function cacheLoggingBehavior(host: CacheLoggingBehaviorHost): void {
  let cache: Store;
  const namespace: string | null = null;

  beforeEach(async () => {
    cache = host.lookupStore({ expiresIn: 60 });
  });

  it("fetch logging", async () => {
    await assertLogs(new RegExp(`Cache read: ${keyPattern("foo").source}`), async () => {
      await cache.fetch("foo");
    });

    await assertLogs(
      new RegExp(`Cache read: ${keyPattern("foo", { namespace: "bar" }).source}`),
      async () => {
        await cache.fetch("foo", { namespace: "bar" });
      },
    );
  });

  it("read logging", async () => {
    await assertLogs(new RegExp(`Cache read: ${keyPattern("foo").source}`), async () => {
      await cache.read("foo");
    });

    await assertLogs(
      new RegExp(`Cache read: ${keyPattern("foo", { namespace: "bar" }).source}`),
      async () => {
        await cache.read("foo", { namespace: "bar" });
      },
    );
  });

  it("write logging", async () => {
    await assertLogs(new RegExp(`Cache write: ${keyPattern("foo").source}`), async () => {
      await cache.write("foo", "qux");
    });

    await assertLogs(
      new RegExp(`Cache write: ${keyPattern("foo", { namespace: "bar" }).source}`),
      async () => {
        await cache.write("foo", "qux", { namespace: "bar" });
      },
    );
  });

  it("delete logging", async () => {
    await assertLogs(new RegExp(`Cache delete: ${keyPattern("foo").source}`), async () => {
      await cache.delete("foo");
    });

    await assertLogs(
      new RegExp(`Cache delete: ${keyPattern("foo", { namespace: "bar" }).source}`),
      async () => {
        await cache.delete("foo", { namespace: "bar" });
      },
    );
  });

  it("exist logging", async () => {
    await assertLogs(new RegExp(`Cache exist\\?: ${keyPattern("foo").source}`), async () => {
      await cache.exist("foo");
    });

    await assertLogs(
      new RegExp(`Cache exist\\?: ${keyPattern("foo", { namespace: "bar" }).source}`),
      async () => {
        await cache.exist("foo", { namespace: "bar" });
      },
    );
  });

  it("read multi logging", async () => {
    await assertLogs("Cache read_multi: 1 key(s)", () => cache.readMulti("foo"));
    await assertLogs("Cache read_multi: 2 key(s)", () => cache.readMulti("foo", "bar"));
  });

  it("write multi logging", async () => {
    const key = crypto.randomUUID();
    await assertLogs("Cache write_multi: 1 key(s)", () => cache.writeMulti({ [`${key}1`]: 1 }));
    await assertLogs("Cache write_multi: 2 key(s)", () =>
      cache.writeMulti({ [`${key}1`]: 1, [`${key}2`]: 2 }),
    );
  });

  it("delete multi logging", async () => {
    const key = crypto.randomUUID();
    await assertLogs("Cache delete_multi: 1 key(s)", () => cache.deleteMulti([`${key}1`]));
    await assertLogs("Cache delete_multi: 2 key(s)", () =>
      cache.deleteMulti([`${key}1`, `${key}2`]),
    );
  });

  async function assertLogs(pattern: RegExp | string, block: () => unknown): Promise<void> {
    const io = new StringIO();
    const oldLogger = Store.logger;
    try {
      Store.logger = new Logger(io, { level: "debug" });
      await block();
    } finally {
      Store.logger = oldLogger;
    }
    if (typeof pattern === "string") expect(io.string()).toContain(pattern);
    else expect(io.string()).toMatch(pattern);
  }

  function keyPattern(key: string, options: { namespace?: string | null } = {}): RegExp {
    if (host.keyPattern) return host.keyPattern(key, options);
    const ns = Object.hasOwn(options, "namespace") ? options.namespace : namespace;
    return new RegExp(`${regexpEscape(ns ?? "")}${ns != null ? ":" : ""}${regexpEscape(key)}`);
  }
}
