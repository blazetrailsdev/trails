import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";

class Customer {
  constructor(readonly name: string) {}
}

describe("Base#render collection: inside a template", () => {
  let view: Base;

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    const resolver = new FixtureResolver({
      "test/_customer.html.tse": "Hello: <%= customer.name %>",
      "test/_list.html.tse": '<%= render({ partial: "test/customer", collection: customers }) %>',
      "test/_customer_with_var.html.tse": "<%= customer_with_var.name %>",
    });
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([resolver]);
    view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
  });

  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("renders a partial collection from inside a compiled template", () => {
    expect(
      String(
        view.render({
          partial: "test/list",
          locals: { customers: [new Customer("david"), new Customer("mary")] },
        }),
      ),
    ).toBe("Hello: davidHello: mary");
  });

  it("treats as: false like an absent as:, deriving the local from the partial name", () => {
    expect(
      String(
        view.render({
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
