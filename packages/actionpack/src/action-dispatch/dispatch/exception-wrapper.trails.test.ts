import { afterEach, describe, expect, it } from "vitest";
import {
  Base,
  PathRegistry,
  PathSet,
  Template,
  TemplateHandlers,
  TseHandler,
} from "@blazetrails/actionview";
import { ExceptionWrapper } from "../exception-wrapper.js";

class Holder {}

describe("ExceptionWrapper template spots", () => {
  afterEach(() => {
    PathRegistry.setViewPaths(Holder, new PathSet([]));
    TemplateHandlers.clear();
  });

  it("remaps a compiled-template frame onto the template's own source", () => {
    TemplateHandlers.registerTemplateHandler("tse", new TseHandler());
    const template = new Template({
      source: "first line\n<%= boom() %>\nlast line\n",
      identifier: "posts/show.html.tse",
      virtualPath: "posts/show",
      extension: "tse",
    });
    const resolver = { findAll: () => [], builtTemplates: () => [template] };
    PathRegistry.setViewPaths(Holder, new PathSet([resolver]));

    let raised: unknown;
    try {
      template.render(new (Base.withEmptyTemplateCache())(null, {}, null));
    } catch (e) {
      raised = e;
    }
    const wrapper = new ExceptionWrapper(null, (raised as Error).cause as Error);
    const extract = wrapper.sourceExtracts.find((e) => e.file.includes(template.methodName()));

    expect(extract).toBeDefined();
    expect(extract!.code).toBeDefined();
    expect(Object.keys(extract!.code!)).toContain(String(extract!.line));
  });
});
