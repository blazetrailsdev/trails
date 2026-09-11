import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asyncContextAdapterConfig, getAsyncContext } from "./async-context-adapter.js";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("fallback AsyncContextAdapter", () => {
  afterEach(() => {
    asyncContextAdapterConfig.adapter = null;
    delete (globalThis as { AsyncContext?: unknown }).AsyncContext;
  });

  describe("with TC39 AsyncContext", () => {
    beforeEach(() => {
      const host = getAsyncContext();
      class Variable<T> {
        #ctx = host.create<T>();
        get(): T | undefined {
          return this.#ctx.getStore();
        }
        run<R>(value: T, fn: () => R): R {
          return this.#ctx.run(value, fn);
        }
      }
      (globalThis as { AsyncContext?: unknown }).AsyncContext = { Variable };
      asyncContextAdapterConfig.adapter = "fallback";
    });

    it("overlapping async scopes each see their own store", async () => {
      const ctx = getAsyncContext().create<string>();
      const seen: Array<[string, string | undefined]> = [];
      const flow = (name: string) =>
        ctx.run(name, async () => {
          await tick();
          seen.push([name, ctx.getStore()]);
          await tick(5);
          seen.push([name, ctx.getStore()]);
        });
      await Promise.all([flow("a"), flow("b")]);
      for (const [name, store] of seen) expect(store).toBe(name);
    });

    it("a timer sees its scope's store on every tick after a later scope opens", async () => {
      const ctx = getAsyncContext().create<string>();
      const ticks: Array<string | undefined> = [];
      let stop!: () => void;
      const reaper = ctx.run("reaper", () => {
        const timer = setInterval(() => ticks.push(ctx.getStore()), 1);
        return new Promise<void>((resolve) => {
          stop = () => {
            clearInterval(timer);
            resolve();
          };
        });
      });
      await ctx.run("later", () => tick(10));
      stop();
      await reaper;
      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks.every((store) => store === "reaper")).toBe(true);
    });
  });

  describe("without AsyncContext", () => {
    beforeEach(() => {
      asyncContextAdapterConfig.adapter = "fallback";
    });

    it("refuses overlapping async scopes rather than sharing one store", async () => {
      const ctx = getAsyncContext().create<string>();
      const a = ctx.run("a", () => tick(1));
      const b = ctx.run("b", () => tick(20));
      await expect(a).rejects.toThrow(/Overlapping async context scopes/);
      await b;
    });

    it("keeps nested async scopes working", async () => {
      const ctx = getAsyncContext().create<string>();
      await ctx.run("outer", async () => {
        await ctx.run("inner", async () => {
          await tick();
          expect(ctx.getStore()).toBe("inner");
        });
        expect(ctx.getStore()).toBe("outer");
      });
      expect(ctx.getStore()).toBeUndefined();
    });
  });
});
