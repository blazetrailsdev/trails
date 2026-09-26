import { ObjectSpace } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Base } from "../base.js";
import { Inline } from "./inline.js";
import { TemplateHandlers, type TemplateHandler } from "./handlers.js";

const echo: TemplateHandler = {
  call: (_template, source) => `return ${JSON.stringify(source)};`,
};

describe("ActionView::Template::Inline", () => {
  afterEach(() => {
    TemplateHandlers.clear();
    vi.restoreAllMocks();
  });

  it("registers a finalizer that removes the compiled method from the container", () => {
    TemplateHandlers.registerTemplateHandler("txt", echo);
    const define = vi.spyOn(ObjectSpace, "defineFinalizer");
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    const container = view.compiledMethodContainer();
    const template = new Inline({ source: "hi", identifier: "inline template", extension: "txt" });

    expect(template.render(view, {})).toBe("hi");
    expect(container._compiledMethods.has(template.methodName())).toBe(true);

    expect(define).toHaveBeenCalledTimes(1);
    const [obj, finalizer] = define.mock.calls[0];
    expect(obj).toBe(template);
    finalizer();
    expect(container._compiledMethods.has(template.methodName())).toBe(false);
  });

  it("builds the finalizer from the method name and container alone", () => {
    const mod = { _compiledMethods: new Map([["_m", (() => "") as never]]) };
    const finalizer = Inline.Finalizer("_m", mod);
    expect(finalizer.length).toBe(0);
    finalizer();
    expect(mod._compiledMethods.has("_m")).toBe(false);
  });
});
