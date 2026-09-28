import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";

class Customer {
  constructor(readonly name: string) {}
}

describe("CachedViewRenderTest", () => {
  let view: Base;

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    const resolver = new FixtureResolver({
      "test/_customer.html.tse": "Hello: <%= customer.name %>",
      "test/_customer_with_var.html.tse":
        "<%= customer.name %> <%= customer.name %> <%= customer.name %>",
      "test/_local_inspector.html.tse": '<%= Object.keys(localAssigns).sort().join(",") -%>',
    });
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([resolver]);
    view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
  });

  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("render partial collection", () => {
    expect(
      String(
        view.render({
          partial: "test/customer",
          collection: [new Customer("david"), new Customer("mary")],
        }),
      ),
    ).toBe("Hello: davidHello: mary");
  });

  it("render partial collection as by string", () => {
    expect(
      String(
        view.render({
          partial: "test/customer_with_var",
          collection: [new Customer("david"), new Customer("mary")],
          as: "customer",
        }),
      ),
    ).toBe("david david davidmary mary mary");
  });

  it("render partial collection without as", () => {
    expect(
      String(view.render({ partial: "test/local_inspector", collection: [new Customer("mary")] })),
    ).toBe("local_inspector,local_inspector_counter,local_inspector_iteration");
  });

  it("render partial with empty collection should return nil", () => {
    expect(view.viewRenderer.render(view, { partial: "test/customer", collection: [] })).toBeNull();
  });

  it("render partial with nil collection should return nil", () => {
    expect(
      view.viewRenderer.render(view, { partial: "test/customer", collection: null as never }),
    ).toBeNull();
  });
});
