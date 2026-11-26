import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { constGet } from "@blazetrails/ruby-compat/variable";
import { Middleware } from "../../lib/cache/strategy/local-cache-middleware.js";

describe("LocalCache::Middleware in a process that has not loaded rack", () => {
  it("requires rack/body_proxy before wrapping the body", async () => {
    expect((TopLevel as { Rack?: unknown }).Rack).toBeUndefined();
    const middleware = new Middleware("<3", "rack-load-key").new(() => [200, {}, []]);
    const [, , body] = await middleware.call({});
    expect(body).toBeInstanceOf(constGet(Object, "::Rack::BodyProxy") as typeof Object);
  });
});
