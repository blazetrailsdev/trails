import { afterEach, describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { TSETracker } from "../dependency-tracker/tse-tracker.js";
import { PathSet } from "../path-set.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "../template/handlers.js";
import { Tse } from "../template/handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";

describe("TSETracker reads Template#source", () => {
  afterEach(() => TemplateHandlers.clear());

  it("returns the same dependencies after the template has been compiled", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());

    const template = new Template({
      source: `<%= render("comments/comment") %>`,
      identifier: "messages/_message",
      virtualPath: "messages/_message.html.tse",
      extension: "tse",
    });

    const before = new TSETracker("messages/_message", template, null).dependencies();
    expect(before).toEqual(["comments/comment"]);

    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    template.render(view, { render: () => "" });

    expect(new TSETracker("messages/_message", template, null).dependencies()).toEqual(before);
  });
});

describe("TSETracker explicit dependencies", () => {
  it("de-duplicates a repeated Template Dependency comment", () => {
    const template = {
      source: `
      <%# Template Dependency: foo/bar %>
      <%# Template Dependency: foo/bar %>
    `,
      handler: null,
    } as unknown as Template;

    expect(new TSETracker("explicit/_dependencies", template, null).dependencies()).toEqual([
      "foo/bar",
    ]);
  });
});

describe("TSETracker interpolation holding an expression", () => {
  it("resolves an interpolation containing a quoted string to a wildcard", () => {
    const template = {
      source: '<%= render `orders/${variable || "default"}` %>',
      handler: null,
    } as unknown as Template;

    const viewPaths = new PathSet([
      new FixtureResolver({
        "orders/_line_item.html.tse": "",
        "orders/index.html.tse": "",
        "invoices/index.html.tse": "",
      }),
    ]);

    expect(new TSETracker("interpolation/_string", template, viewPaths).dependencies()).toEqual([
      "orders/_line_item",
      "orders/index",
    ]);
  });

  it("drops the wildcard when no view paths are given", () => {
    const template = {
      source: '<%= render `orders/${variable || "default"}` %>',
      handler: null,
    } as unknown as Template;

    expect(new TSETracker("interpolation/_string", template, null).dependencies()).toEqual([]);
  });
});
