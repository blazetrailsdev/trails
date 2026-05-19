import { describe, test, expect } from "vitest";
import { renderForApi } from "./api-rendering.js";

describe("renderForApi — contentType contract", () => {
  test("honors camelCase `contentType` over the format default", () => {
    expect(renderForApi({ plain: "hi", contentType: "text/markdown" })).toEqual({
      body: "hi",
      contentType: "text/markdown",
    });
  });

  test("ignores snake_case `content_type` (camelCase-only contract)", () => {
    expect(renderForApi({ plain: "hi", content_type: "text/markdown" })).toEqual({
      body: "hi",
      contentType: "text/plain; charset=utf-8",
    });
  });
});
