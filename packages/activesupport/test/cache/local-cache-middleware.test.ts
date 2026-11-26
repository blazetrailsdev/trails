import { describe, expect, it } from "vitest";
import { UncaughtThrowError, kernelThrow } from "@blazetrails/ruby-compat/kernel-catch";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { constGet } from "@blazetrails/ruby-compat/variable";
import { LocalCacheRegistry } from "../../lib/cache/strategy/local-cache.js";
import { Middleware } from "../../lib/cache/strategy/local-cache-middleware.js";

describe("MiddlewareTest", () => {
  it("local cache cleared on close", async () => {
    const key = "super awesome key";
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
    const middleware = new Middleware("<3", key).new((env) => {
      expect(LocalCacheRegistry.cacheFor(key)).toBeTruthy();
      return [200, {}, []];
    });
    const [, , rackBody] = await middleware.call({});
    const body = rackBody as unknown as { each(fn: () => void): void; close(): void };
    expect(LocalCacheRegistry.cacheFor(key)).toBeTruthy();
    body.each(() => {});
    expect(LocalCacheRegistry.cacheFor(key)).toBeTruthy();
    body.close();
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
  });

  it("local cache cleared and response should be present on invalid parameters error", async () => {
    const key = "super awesome key";
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
    const middleware = new Middleware("<3", key).new((env) => {
      expect(LocalCacheRegistry.cacheFor(key)).toBeTruthy();
      throw new (constGet(Object, "Rack::Utils::InvalidParameterError") as new () => Error)();
    });
    const response = await middleware.call({});
    expect(response).toBeTruthy();
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
  });

  it("local cache cleared on exception", async () => {
    const key = "super awesome key";
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
    const middleware = new Middleware("<3", key).new((env) => {
      expect(LocalCacheRegistry.cacheFor(key)).toBeTruthy();
      throw new RuntimeError();
    });
    await expect(middleware.call({})).rejects.toThrow(RuntimeError);
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
  });

  it("local cache cleared on throw", async () => {
    const key = "super awesome key";
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
    const middleware = new Middleware("<3", key).new((env) => {
      expect(LocalCacheRegistry.cacheFor(key)).toBeTruthy();
      kernelThrow(":warden");
    });
    await expect(middleware.call({})).rejects.toThrow(UncaughtThrowError);
    expect(LocalCacheRegistry.cacheFor(key) ?? null).toBeNull();
  });
});
