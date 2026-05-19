import { describe, it, expect } from "vitest";
import { instrumentPayload, instrumentName, fragmentCacheKey } from "./caching.js";

describe("Caching#instrumentPayload (private)", () => {
  it("returns { controller, action, key } shaped like Rails", () => {
    const host = {
      controllerName: () => "posts",
      actionName: "show",
    };
    expect(instrumentPayload.call(host, "abc")).toEqual({
      controller: "posts",
      action: "show",
      key: "abc",
    });
  });

  it("passes the key through verbatim (any value)", () => {
    const host = { controllerName: () => "x", actionName: "y" };
    const arrayKey = ["a", 1];
    expect(instrumentPayload.call(host, arrayKey)).toEqual({
      controller: "x",
      action: "y",
      key: arrayKey,
    });
  });
});

describe("Caching#instrumentName (private)", () => {
  it("returns the Rails-canonical name", () => {
    expect(instrumentName.call({})).toBe("action_controller");
  });
});

describe("fragmentCacheKey (existing — sanity)", () => {
  it("still composes string keys with controller prefix", () => {
    expect(fragmentCacheKey("k", "Posts")).toBe("Posts/k");
  });
});
