import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MemoryRateLimitStore,
  isRateLimited,
  rateLimit,
  rateLimiting,
  type RateLimitStore,
  type RateLimitingClassHost,
  type RateLimitingHost,
} from "./rate-limiting.js";
import { Base } from "../base.js";
import { API } from "../api.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import { Notifications } from "@blazetrails/activesupport";
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

  describe("prune sweep", () => {
    type StoreInternals = {
      _entries: Map<string, unknown>;
      _pruneThreshold: number;
      _skipSweepInserts: number;
    };
    const peek = (store: MemoryRateLimitStore): StoreInternals =>
      store as unknown as StoreInternals;
    // Derive tuning constants from the implementation so these tests
    // assert behavior, not specific numeric values.
    const STATICS = MemoryRateLimitStore as unknown as {
      _PRUNE_BASELINE: number;
      _PRUNE_MAX: number;
    };
    const BASELINE = STATICS._PRUNE_BASELINE;
    const PRUNE_MAX = STATICS._PRUNE_MAX;

    it("sweeps expired entries once size crosses the threshold", () => {
      vi.useFakeTimers();
      try {
        const store = new MemoryRateLimitStore();
        for (let i = 0; i < BASELINE - 1; i += 1) {
          store.increment(`old:${i}`, 1, { expiresIn: 1 });
        }
        vi.advanceTimersByTime(2000);
        // Stays just under the threshold — no sweep yet.
        expect(peek(store)._entries.size).toBe(BASELINE - 1);
        store.increment("trigger", 1, { expiresIn: 60 });
        // Crossing the threshold triggers a sweep that drops all expired keys.
        expect(peek(store)._entries.size).toBe(1);
        // Sweep freed space → threshold relaxes back to the baseline.
        expect(peek(store)._pruneThreshold).toBe(BASELINE);
      } finally {
        vi.useRealTimers();
      }
    });

    it("doubles the threshold when an all-live sweep frees nothing", () => {
      const store = new MemoryRateLimitStore();
      for (let i = 0; i < BASELINE; i += 1) {
        store.increment(`live:${i}`, 1, { expiresIn: 3600 });
      }
      // All entries are live, so the sweep freed nothing and the next
      // threshold doubles.
      expect(peek(store)._pruneThreshold).toBe(BASELINE * 2);
      expect(peek(store)._skipSweepInserts).toBe(0);
    });

    it("saturates the threshold at _PRUNE_MAX and arms _skipSweepInserts", () => {
      const store = new MemoryRateLimitStore();
      // Each sterile (all-live) sweep doubles the threshold:
      // BASELINE → 2·BASELINE → 4·BASELINE → … → PRUNE_MAX.
      // The Nth all-live insert (where N == current threshold) trips the
      // sweep, so the run that saturates at PRUNE_MAX happens once size
      // reaches PRUNE_MAX/2 == BASELINE * 8 (when PRUNE_MAX = 16·BASELINE).
      const saturatingInsertCount = PRUNE_MAX / 2;
      for (let i = 0; i < saturatingInsertCount; i += 1) {
        store.increment(`live:${i}`, 1, { expiresIn: 3600 });
      }
      expect(peek(store)._pruneThreshold).toBe(PRUNE_MAX);
      expect(peek(store)._skipSweepInserts).toBe(BASELINE);
    });

    it("decrements _skipSweepInserts on inserts past the saturated cap (no rescan)", () => {
      const store = new MemoryRateLimitStore();
      for (let i = 0; i < PRUNE_MAX; i += 1) {
        store.increment(`live:${i}`, 1, { expiresIn: 3600 });
      }
      // size now == _PRUNE_MAX; the most recent insert hit the sweep block,
      // saw the skip counter armed, and decremented it once rather than
      // walking the whole map.
      expect(peek(store)._pruneThreshold).toBe(PRUNE_MAX);
      expect(peek(store)._skipSweepInserts).toBe(BASELINE - 1);
    });
  });
});

afterEach(() => {
  Notifications.unsubscribeAll();
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

  it("instruments a rate_limit.action_controller event when the limit is exceeded", async () => {
    const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
    const sub = Notifications.subscribe("rate_limit.action_controller", (event) => {
      events.push({ name: event.name, payload: event.payload });
    });
    try {
      const store: RateLimitStore = { increment: () => 11 };
      const request = { remoteIp: "1.2.3.4" };
      const host: RateLimitingHost = { controllerPath: "api", request, head: vi.fn() };
      await rateLimiting.call(host, { to: 10, within: 60, store });
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe("rate_limit.action_controller");
      expect(events[0].payload.request).toBe(request);
      expect(host.head).toHaveBeenCalledWith(429);
    } finally {
      Notifications.unsubscribe(sub);
    }
  });

  it("does not instrument when the limit is not exceeded", async () => {
    const events: unknown[] = [];
    const sub = Notifications.subscribe("rate_limit.action_controller", (e) => events.push(e));
    try {
      const store: RateLimitStore = { increment: () => 1 };
      const host: RateLimitingHost = { request: { remoteIp: "x" }, head: vi.fn() };
      await rateLimiting.call(host, { to: 10, within: 60, store });
      expect(events).toHaveLength(0);
    } finally {
      Notifications.unsubscribe(sub);
    }
  });

  it("awaits an async store.increment result", async () => {
    const store: RateLimitStore = {
      increment: () => Promise.resolve(11),
    };
    const host: RateLimitingHost = { request: { remoteIp: "x" }, head: vi.fn() };
    await rateLimiting.call(host, { to: 10, within: 60, store });
    expect(host.head).toHaveBeenCalledWith(429);
  });

  it("awaits an async `with` callback before resolving", async () => {
    const order: string[] = [];
    const store: RateLimitStore = { increment: () => 11 };
    const host: RateLimitingHost = { request: { remoteIp: "x" }, head: vi.fn() };
    await rateLimiting.call(host, {
      to: 10,
      within: 60,
      store,
      async with() {
        await new Promise((r) => setTimeout(r, 5));
        order.push("with");
      },
    });
    order.push("after");
    expect(order).toEqual(["with", "after"]);
  });

  it("treats a null/undefined `by` result like Rails `compact` (dropped from key)", async () => {
    const store: RateLimitStore = { increment: vi.fn().mockReturnValue(1) };
    const host: RateLimitingHost = { controllerPath: "posts" };
    await rateLimiting.call(host, {
      to: 10,
      within: 60,
      store,
      by: () => null,
    });
    expect(store.increment).toHaveBeenCalledWith("rate-limit:posts", 1, { expiresIn: 60 });
  });

  it("does nothing when store.increment returns null", async () => {
    const store: RateLimitStore = { increment: () => null };
    const host: RateLimitingHost = { request: { remoteIp: "x" }, head: vi.fn() };
    await rateLimiting.call(host, { to: 0, within: 60, store });
    expect(host.head).not.toHaveBeenCalled();
  });

  it("calls controllerPath() when it is a method (Metal exposes it as a function)", async () => {
    const store: RateLimitStore = { increment: vi.fn().mockReturnValue(1) };
    const host: RateLimitingHost = {
      controllerPath: () => "admin/users",
      request: { remoteIp: "1.2.3.4" },
    };
    await rateLimiting.call(host, { to: 10, within: 60, store });
    expect(store.increment).toHaveBeenCalledWith("rate-limit:admin/users:1.2.3.4", 1, {
      expiresIn: 60,
    });
  });

  it("drops a null remoteIp from the cache key (mirrors Rails `compact`)", async () => {
    const store: RateLimitStore = { increment: vi.fn().mockReturnValue(1) };
    const host: RateLimitingHost = { controllerPath: "posts", request: { remoteIp: null } };
    await rateLimiting.call(host, { to: 10, within: 60, store });
    expect(store.increment).toHaveBeenCalledWith("rate-limit:posts", 1, { expiresIn: 60 });
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
    beforeAction(
      callback: (controller: RateLimitingHost) => void | Promise<void>,
      options?: CallbackOptions,
    ) {
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

  it("is wired onto ActionController::Base as a static method", () => {
    expect(typeof Base.rateLimit).toBe("function");
    class PostsController extends Base {}
    expect(() =>
      PostsController.rateLimit({ to: 5, within: 60, store: new MemoryRateLimitStore() }),
    ).not.toThrow();
  });

  it("is also wired onto ActionController::API (Rails api.rb:125 includes RateLimiting)", () => {
    expect(typeof API.rateLimit).toBe("function");
    class PingApi extends API {}
    expect(() =>
      PingApi.rateLimit({ to: 5, within: 60, store: new MemoryRateLimitStore() }),
    ).not.toThrow();
  });
});

describe("rateLimit integration through Base.beforeAction / dispatch", () => {
  it("triggers head(429) and short-circuits the action body once the limit is exceeded", async () => {
    const store = new MemoryRateLimitStore();
    let actionRan = 0;

    class LimitedController extends Base {
      async show() {
        actionRan += 1;
        this.head(200);
      }
    }
    LimitedController.rateLimit({ to: 1, within: 60, store });

    const makeRequest = () =>
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/show",
        HTTP_HOST: "localhost",
        REMOTE_ADDR: "1.2.3.4",
      });

    const r1 = new LimitedController();
    await r1.dispatch("show", makeRequest(), new Response());
    expect(r1.status).toBe(200);
    expect(actionRan).toBe(1);

    const r2 = new LimitedController();
    await r2.dispatch("show", makeRequest(), new Response());
    expect(r2.status).toBe(429);
    expect(actionRan).toBe(1);
  });

  it("dispatches through the instance's rateLimiting slot so subclass overrides win", async () => {
    const store = new MemoryRateLimitStore();
    const overrideCalls: string[] = [];

    class OverridingController extends Base {
      async show() {
        this.head(200);
      }
      override rateLimiting = async function (
        this: RateLimitingHost,
        args: Parameters<typeof rateLimiting>[0],
      ) {
        overrideCalls.push("override");
        await rateLimiting.call(this, args);
      };
    }
    OverridingController.rateLimit({ to: 1, within: 60, store });

    const c = new OverridingController();
    await c.dispatch(
      "show",
      new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/show", HTTP_HOST: "x" }),
      new Response(),
    );
    expect(overrideCalls).toEqual(["override"]);
  });

  it("a prototype-method override of rateLimiting wins through rateLimit/beforeAction dispatch", async () => {
    const store = new MemoryRateLimitStore();
    const overrideCalls: string[] = [];

    class MethodOverrideController extends Base {
      async show() {
        this.head(200);
      }
      override async rateLimiting(args: Parameters<typeof rateLimiting>[0]): Promise<void> {
        overrideCalls.push("method-override");
        await rateLimiting.call(this, args);
      }
    }
    MethodOverrideController.rateLimit({ to: 1, within: 60, store });

    const c = new MethodOverrideController();
    await c.dispatch(
      "show",
      new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/show", HTTP_HOST: "x" }),
      new Response(),
    );
    expect(overrideCalls).toEqual(["method-override"]);
    // Sanity: the override lives on the subclass prototype (not as an own
    // instance field), which is the override shape this PR is enabling.
    expect(
      Object.prototype.hasOwnProperty.call(MethodOverrideController.prototype, "rateLimiting"),
    ).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(c, "rateLimiting")).toBe(false);
  });
});
