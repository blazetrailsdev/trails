import { describe, expect, it } from "vitest";
import { Base } from "../base.js";

function viewWith(controller: unknown): Base {
  return Base.withViewPaths([], {}, controller);
}

function controllerWithReferer(env: Record<string, unknown>): unknown {
  return { request: { env } };
}

describe("UrlHelperTest", () => {
  it("url for with back", () => {
    const referer = "http://www.example.com/referer";
    const view = viewWith(controllerWithReferer({ HTTP_REFERER: referer }));

    expect(view.urlFor(":back")).toBe("http://www.example.com/referer");
  });

  it("url for with back and no referer", () => {
    const view = viewWith(controllerWithReferer({}));
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  it("url for with back and no controller", () => {
    const view = viewWith(null);
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  it("url for with back and javascript referer", () => {
    const referer = "javascript:alert(document.cookie)";
    const view = viewWith(controllerWithReferer({ HTTP_REFERER: referer }));
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  it("url for with invalid referer", () => {
    const referer = "THIS IS NOT A URL";
    const view = viewWith(controllerWithReferer({ HTTP_REFERER: referer }));
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });
});
