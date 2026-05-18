import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MemoryRateLimitStore,
  isRateLimited,
  rateLimit,
  rateLimiting,
  type RateLimitStore,
  type RateLimitingClassHost,
  type RateLimitingHost,
} from "./rate-limiting.js";
import type { CallbackOptions } from "../../abstract-controller/callbacks.js";

describe("isRateLimited", () => {
  it("returns false when count is at or below the limit", () => {
    expect(isRateLimited(1, 3)).toBe(false);
    expect(isRateLimited(3, 3)).toBe(false);
  });

  it("returns true once the count exceeds the limit", () => {
    expect(isRateLimited(4, 3)).toBe(true);
  });
});

describe("MemoryRateLimitStore", () => {
  it("increments a counter for the given key", () => {
    const store = new MemoryRateLimitStore();
    expect(store.increment("k", 1, { expiresIn: 60 })).toBe(1);
    expect(store.increment("k", 1, { expiresIn: 60 })).toBe(2);
    expect(store.increment("k", 2, { expiresIn: 60 })).toBe(4);
  });

  it("expires entries after the window elapses", () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryRateLimitStore();
      store.increment("k", 1, { expiresIn: 1 });
      vi.advanceTimersByTime(2000);
      expect(store.increment("k", 1, { expiresIn: 1 })).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("scopes counters by key", () => {
    const store = new MemoryRateLimitStore();
    store.increment("a", 1, { expiresIn: 60 });
    store.increment("a", 1, { expiresIn: 60 });
    expect(store.increment("b", 1, { expiresIn: 60 })).toBe(1);
  });
});

describe("rateLimiting (instance helper)", () => {
  it("increments the store with controller_path + name + identity", async () => {
    const calls: Array<{ key: string; amount: number; expiresIn: number }> = [];
    const store: RateLimitStore = {
      increment(key, amount, options) {
        calls.push({ key, amount, expiresIn: options.expiresIn });
        return 1;
      },
    };
    const host: RateLimitingHost = {
      controllerPath: "sessions",
      request: { remoteIp: "1.2.3.4" },
      head: vi.fn(),
    };
    await rateLimiting.call(host, { to: 10, within: 60, store, name: "short" });
    expect(calls).toEqual([{ key: "rate-limit:sessions:short:1.2.3.4", amount: 1, expiresIn: 60 }]);
    expect(host.head).not.toHaveBeenCalled();
  });

  it('drops null/undefined parts but keeps empty strings (mirrors Rails `compact.join(":")`)', async () => {
    const store: RateLimitStore = { increment: vi.fn().mockReturnValue(1) };
    const host: RateLimitingHost = { request: { remoteIp: "1.2.3.4" } };
    await rateLimiting.call(host, { to: 10, within: 60, store });
    expect(store.increment).toHaveBeenCalledWith("rate-limit:1.2.3.4", 1, { expiresIn: 60 });
  });

  it('preserves empty-string identity in the cache key (Ruby `compact` keeps "")', async () => {
    const store: RateLimitStore = { increment: vi.fn().mockReturnValue(1) };
    const host: RateLimitingHost = { controllerPath: "posts", request: { remoteIp: "" } };
    await rateLimiting.call(host, { to: 10, within: 60, store });
    expect(store.increment).toHaveBeenCalledWith("rate-limit:posts:", 1, { expiresIn: 60 });
  });

  it("calls `with` (instance_exec) when count exceeds `to`", async () => {
    const store: RateLimitStore = { increment: () => 11 };
    const withCallback = vi.fn(function (this: RateLimitingHost) {
      expect(this.controllerPath).toBe("api");
    });
    const host: RateLimitingHost = {
      controllerPath: "api",
      request: { remoteIp: "1.2.3.4" },
      head: vi.fn(),
    };
    await rateLimiting.call(host, { to: 10, within: 60, store, with: withCallback });
    expect(withCallback).toHaveBeenCalledTimes(1);
    expect(withCallback.mock.contexts[0]).toBe(host);
    expect(host.head).not.toHaveBeenCalled();
  });

  it("falls back to head(429) when no `with` is given and limit is exceeded", async () => {
    const store: RateLimitStore = { increment: () => 11 };
    const host: RateLimitingHost = {
      controllerPath: "api",
      request: { remoteIp: "x" },
      head: vi.fn(),
    };
    await rateLimiting.call(host, { to: 10, within: 60, store });
    expect(host.head).toHaveBeenCalledWith(429);
  });

  it("does nothing when store.increment returns null", async () => {
    const store: RateLimitStore = { increment: () => null };
    const host: RateLimitingHost = { request: { remoteIp: "x" }, head: vi.fn() };
    await rateLimiting.call(host, { to: 0, within: 60, store });
    expect(host.head).not.toHaveBeenCalled();
  });

  it("uses the `by` callback for identity when provided", async () => {
    const store: RateLimitStore = { increment: vi.fn().mockReturnValue(1) };
    const host: RateLimitingHost = {
      controllerPath: "signups",
      request: { remoteIp: "ignored" },
    };
    await rateLimiting.call(host, {
      to: 10,
      within: 60,
      store,
      by() {
        return "example.com";
      },
    });
    expect(store.increment).toHaveBeenCalledWith("rate-limit:signups:example.com", 1, {
      expiresIn: 60,
    });
  });
});

describe("rateLimit class DSL", () => {
  type Registration = {
    callback: (controller: RateLimitingHost) => void | Promise<void>;
    options?: CallbackOptions;
  };

  let registered: Registration[];
  let store: RateLimitStore;

  const makeHost = (overrides: Partial<RateLimitingClassHost> = {}): RateLimitingClassHost => ({
    beforeAction(callback, options) {
      registered.push({ callback, options });
    },
    ...overrides,
  });

  beforeEach(() => {
    registered = [];
    store = { increment: vi.fn().mockReturnValue(1) };
  });

  it("registers a before_action with the given store", async () => {
    rateLimit.call(makeHost(), { to: 10, within: 60, store });
    expect(registered).toHaveLength(1);
    const controller: RateLimitingHost = { request: { remoteIp: "1.1.1.1" } };
    await registered[0].callback(controller);
    expect(store.increment).toHaveBeenCalledWith("rate-limit:1.1.1.1", 1, { expiresIn: 60 });
  });

  it("falls back to host.cacheStore when no store is passed", async () => {
    rateLimit.call(makeHost({ cacheStore: store }), { to: 10, within: 60 });
    await registered[0].callback({ request: { remoteIp: "x" } });
    expect(store.increment).toHaveBeenCalled();
  });

  it("throws when neither store nor cacheStore is available", () => {
    expect(() => rateLimit.call(makeHost(), { to: 10, within: 60 })).toThrow(/store/);
  });

  it("forwards only/except as arrays to beforeAction", () => {
    rateLimit.call(makeHost(), { to: 10, within: 60, store, only: "create" });
    rateLimit.call(makeHost(), { to: 10, within: 60, store, except: ["index", "show"] });
    expect(registered[0].options).toEqual({ only: ["create"] });
    expect(registered[1].options).toEqual({ except: ["index", "show"] });
  });

  it("forwards if/unless/prepend to beforeAction (Rails **options)", () => {
    const ifFn = () => true;
    const unlessFn = () => false;
    rateLimit.call(makeHost(), {
      to: 10,
      within: 60,
      store,
      if: ifFn,
      unless: unlessFn,
      prepend: true,
    });
    expect(registered[0].options).toEqual({ if: ifFn, unless: unlessFn, prepend: true });
  });

  it("supports multiple named rate limits stacked on the same host", () => {
    const host = makeHost();
    rateLimit.call(host, { to: 3, within: 2, store, name: "short-term" });
    rateLimit.call(host, { to: 10, within: 300, store, name: "long-term" });
    expect(registered).toHaveLength(2);
  });
});
