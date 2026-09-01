import { describe, expect, it } from "vitest";

import { Digestor } from "./digestor.js";
import { LookupContext } from "./lookup-context.js";
import { TemplateHandlers } from "./template/handlers.js";
import { FixtureResolver } from "./testing/resolvers.js";

function withFinder(source: string): LookupContext {
  TemplateHandlers.registerTemplateHandler("html", {
    extensions: ["html"],
    call: (_template, source) => JSON.stringify(source),
  });
  const resolver = new FixtureResolver({
    "posts/show.html.html": source,
    "posts/index.html.html": source,
  });
  const finder = new LookupContext();
  finder.addResolver(resolver);
  return finder;
}

describe("Digestor.digest", () => {
  it("is stable for identical inputs", () => {
    const a = Digestor.digest({ name: "posts/show", format: "html", finder: withFinder("hello") });
    const b = Digestor.digest({ name: "posts/show", format: "html", finder: withFinder("hello") });
    expect(a).toBe(b);
  });

  it("changes when the resolved template source changes", () => {
    const a = Digestor.digest({ name: "posts/show", format: "html", finder: withFinder("hello") });
    const b = Digestor.digest({
      name: "posts/show",
      format: "html",
      finder: withFinder("goodbye"),
    });
    expect(a).not.toBe(b);
  });

  it("changes when the name changes", () => {
    const finder = withFinder("hello");
    const a = Digestor.digest({ name: "posts/show", format: "html", finder });
    const b = Digestor.digest({ name: "posts/index", format: "html", finder });
    expect(a).not.toBe(b);
  });

  it("returns a 16-char lowercase hex string", () => {
    const digest = Digestor.digest({ name: "posts/show", format: "html", finder: withFinder("x") });
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it("treats a missing template as empty source rather than throwing", () => {
    const finder = new LookupContext();
    expect(() =>
      Digestor.digest({ name: "missing/template", format: "html", finder }),
    ).not.toThrow();
  });
});
