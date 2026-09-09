import { describe, it, expect } from "vitest";

import { Base } from "./base.js";
import { OutputFlow } from "./flows.js";

describe("Context", () => {
  it("Base obtains viewFlow through _prepareContext", () => {
    const view = new Base();
    expect(view.viewFlow).toBeInstanceOf(OutputFlow);
    expect(view.outputBuffer).not.toBeNull();

    const first = view.viewFlow;
    view._prepareContext();
    expect(view.viewFlow).not.toBe(first);
  });

  it("_layoutFor defaults to the layout flow and returns an html-safe buffer", () => {
    const view = new Base();
    view.viewFlow.set("layout", "<b>");
    expect(view._layoutFor().toString()).toBe("<b>");
    expect(view._layoutFor("missing").toString()).toBe("");
  });
});
