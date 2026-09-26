import { describe, it, expect } from "vitest";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import "../template.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { TemplateHandlers } from "./handlers.js";

describe("Template::Handlers.extended", () => {
  const buildView = (): Base => {
    const resolver = new FixtureResolver({
      "test/greeting.html": "<p>Hello</p>",
      "ruby_template.ruby":
        'let body = "";\nbody += ["Hello", "from", "Ruby", "code"].join(" ");\nreturn body;',
    });
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([resolver]);
    return new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
  };

  it("registers raw as the default and the tse, html and ruby handlers", () => {
    expect(TemplateHandlers.extensions()).toEqual([":raw", ":tse", ":html", ":ruby"]);
  });

  it("renders a .html template through the Html handler", () => {
    expect(buildView().render({ template: "test/greeting" }).toString()).toBe("<p>Hello</p>");
  });

  it("renders a .ruby template's source verbatim as code", () => {
    expect(buildView().render({ template: "ruby_template" }).toString()).toBe(
      "Hello from Ruby code",
    );
  });
});
