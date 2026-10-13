import { describe, expect, it } from "vitest";
import { HelperMethodBuilder } from "./polymorphic-routes.js";

describe("HelperMethodBuilder", () => {
  it("get answers the cached builder for a nil action", () => {
    expect(HelperMethodBuilder.get(null, "path")).toBe(HelperMethodBuilder.path());
    expect(HelperMethodBuilder.get(null, "url")).toBe(HelperMethodBuilder.url());
  });

  it("get answers the cached builder for a seeded action", () => {
    expect(HelperMethodBuilder.get("new", "path")).toBe(HelperMethodBuilder.get("new", "path"));
  });
});
