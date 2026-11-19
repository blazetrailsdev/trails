import { beforeEach, describe, expect, it } from "vitest";

import { Base } from "../../lib/base.js";
import { LookupContext } from "../../lib/lookup-context.js";
import { Template } from "../../lib/template.js";
import { TSE } from "../../lib/template/handlers/tse.js";
import { FixtureResolver } from "../../lib/testing/resolvers.js";

class Customer {
  constructor(readonly name: string) {}
}

describe("Base#render collection: inside a template", () => {
  let view: Base;

  beforeEach(() => {
    Template.registerTemplateHandler("tse", new TSE());
    const resolver = new FixtureResolver({
      "test/_customer.html.tse": "Hello: <%= customer.name %>",
      "test/_list.html.tse": '<%= render({ partial: "test/customer", collection: customers }) %>',
      "test/_customer_with_var.html.tse": "<%= customer_with_var.name %>",
    });
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([resolver]);
    view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
  });

  it("renders a partial collection from inside a compiled template", async () => {
    expect(
      String(
        await view.render({
          partial: "test/list",
          locals: { customers: [new Customer("david"), new Customer("mary")] },
        }),
      ),
    ).toBe("Hello: davidHello: mary");
  });

  it("treats as: false like an absent as:, deriving the local from the partial name", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer_with_var",
          collection: [new Customer("david"), new Customer("mary")],
          as: false,
        }),
      ),
    ).toBe("davidmary");
  });

  it("names an invalid Symbol as: without its colon", () => {
    expect(() =>
      view.render({
        partial: "test/customer",
        collection: [new Customer("david")],
        as: ":Foo",
      }),
    ).toThrow("The value (Foo) of the option `as` is not a valid Ruby identifier");
  });
});

describe("Base#render: a block body inside a template", () => {
  let view: Base;

  beforeEach(() => {
    Template.registerTemplateHandler("tse", new TSE());
    const resolver = new FixtureResolver({
      "test/_p.html.tse": "<b>p</b>",
      "test/_capture.html.tse":
        '[<%= capture(() => { %><%= render({ partial: "test/p" }) %><% }) %>]',
      "test/_content_tag.html.tse":
        '<%= contentTag("div", null, null, true, () => { %><%= render({ partial: "test/p" }) %><% }) %>',
      "test/_content_for.html.tse":
        '<%= contentFor("x", () => { %><%= render({ partial: "test/p" }) %><% }) %><%= contentFor("x") %>',
      "test/_form_with.html.tse":
        '<%= formWith({ url: "/x" }, (f) => { %><%= render({ partial: "test/p" }) %><% }) %>',
    });
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([resolver]);
    view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
  });

  it("awaits a render nested inside a capture block", async () => {
    expect(String(await view.render({ partial: "test/capture" }))).toBe("[<b>p</b>]");
  });

  it("awaits a render nested inside a contentTag block", async () => {
    expect(String(await view.render({ partial: "test/content_tag" }))).toBe("<div><b>p</b></div>");
  });

  it("awaits a render nested inside a contentFor block", async () => {
    expect(String(await view.render({ partial: "test/content_for" }))).toBe("<b>p</b>");
  });

  it("awaits a render nested inside a formWith block", async () => {
    expect(String(await view.render({ partial: "test/form_with" }))).toContain("<b>p</b></form>");
  });
});
