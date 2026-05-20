import { describe, expect, it } from "vitest";

import { UrlGenerationError } from "./exceptions.js";

function makeRoutes(helperNames: string[]) {
  return { namedRoutes: { helperNames } };
}

describe("UrlGenerationError#corrections", () => {
  it("returns SpellChecker suggestions narrowed by substring grep", () => {
    const err = new UrlGenerationError(
      "missing",
      makeRoutes(["user_path", "users_path", "post_path", "comment_path"]),
      "user_pat",
      null,
    );
    expect(err.corrections).toContain("user_path");
  });

  it("excludes the exact methodName from the grep dictionary", () => {
    const err = new UrlGenerationError(
      "missing",
      makeRoutes(["user_path", "users_path"]),
      "user_pat",
      "user_path",
    );
    expect(err.corrections).not.toContain("user_path");
  });

  it("returns [] when routeName is null", () => {
    const err = new UrlGenerationError("missing", makeRoutes(["user_path"]), null, null);
    expect(err.corrections).toEqual([]);
  });

  it("returns [] when routes is null", () => {
    const err = new UrlGenerationError("missing", null, "user_path", null);
    expect(err.corrections).toEqual([]);
  });

  it("memoizes the result", () => {
    const err = new UrlGenerationError(
      "missing",
      makeRoutes(["user_path", "users_path"]),
      "user_path",
      null,
    );
    expect(err.corrections).toBe(err.corrections);
  });
});
