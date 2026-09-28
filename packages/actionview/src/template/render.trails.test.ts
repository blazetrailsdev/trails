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
});
