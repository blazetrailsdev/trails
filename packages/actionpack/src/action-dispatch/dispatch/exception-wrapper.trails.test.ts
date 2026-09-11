import { afterEach, describe, expect, it } from "vitest";
import {
  Base,
  MissingTemplate,
  PathRegistry,
  PathSet,
  Template,
  TemplateError,
  TemplateHandlers,
  TseHandler,
} from "@blazetrails/actionview";
import { RoutingError, UnknownFormat } from "../../action-controller/metal/exceptions.js";
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

describe("ExceptionWrapper tables keyed on qualified class names", () => {
  it("rescue_responses maps a raised ActionController::UnknownFormat to :not_acceptable", () => {
    const wrapper = new ExceptionWrapper(null, new UnknownFormat(""));
    expect(wrapper.exceptionClassName).toBe("ActionController::UnknownFormat");
    expect(wrapper.statusCode).toBe(406);
  });

  it("rescue_templates maps a raised ActionView::MissingTemplate to missing_template", () => {
    const wrapper = new ExceptionWrapper(
      null,
      new MissingTemplate([], "index", ["posts"], false, {}),
    );
    expect(wrapper.rescueTemplate()).toBe("missing_template");
  });

  it("wrapper_exceptions unwraps a raised ActionView::Template::Error to its cause", () => {
    const original = new RoutingError("");
    const error = new TemplateError({ original, template: {} as Template });
    const wrapper = new ExceptionWrapper(null, error);
    expect(wrapper.unwrappedException).toBe(original);
    expect(wrapper.statusCode).toBe(404);
  });

  it("silent_exceptions keeps a raised ActionController::RoutingError off the framework trace", () => {
    const error = new RoutingError("");
    error.stack = "RoutingError\n    at x (/app/node_modules/pkg/index.js:1:1)";
    const wrapper = new ExceptionWrapper(null, error);
    expect(wrapper.exceptionTrace()).toEqual([]);
  });
});
