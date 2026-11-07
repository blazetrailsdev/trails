import { describe, expect, it } from "vitest";
import { RoutesProxy } from "./routes-proxy.js";
import type { UrlForHost, UrlForRoutes } from "./url-for.js";

describe("RoutesProxy method_missing in the prototype chain", () => {
  it("lets a subclass with a #private field construct and answer url helpers", () => {
    class Sub extends RoutesProxy {
      #tag = "sub";
      tag(): string {
        return this.#tag;
      }
    }
    const scope = { urlOptions: () => ({}) } as unknown as UrlForHost;
    const helpers = { fooPath: (options: Record<string, unknown>) => `/foo${options.x ?? ""}` };
    const proxy = new Sub({} as UrlForRoutes, scope, helpers);
    expect(proxy.tag()).toBe("sub");
    expect((proxy as unknown as { fooPath(o: object): string }).fooPath({ x: 1 })).toBe("/foo1");
    expect(proxy instanceof Sub).toBe(true);
    expect(Object.getPrototypeOf(proxy)).toBe(Sub.prototype);
  });
});
