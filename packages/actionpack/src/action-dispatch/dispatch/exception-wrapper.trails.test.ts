import { afterEach, describe, expect, it } from "vitest";
import { BacktraceCleaner } from "@blazetrails/activesupport";
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
    const template = new Template(
      "first line\n<%= [].boom.length %>\nlast line\n",
      "posts/show.html.tse",
      new TseHandler(),
      { locals: [], format: ":html", virtualPath: "posts/show" },
    );
    const resolver = { findAll: () => [], builtTemplates: () => [template] };
    PathRegistry.setViewPaths(Holder, new PathSet([resolver]));

    let raised: unknown;
    try {
      template.render(new (Base.withEmptyTemplateCache())(null, {}, null));
    } catch (e) {
      raised = e;
    }
    expect((raised as TemplateError).lineNumber()).toBe(2);
    const frames = ((raised as Error).cause as Error)
      .stack!.split("\n")
      .filter((l) => l.includes(template.methodName()));
    expect(frames).toHaveLength(1);
    const wrapper = new ExceptionWrapper(null, (raised as Error).cause as Error);
    const extract = wrapper.sourceExtracts.find((e) => e.file.includes(template.methodName()));

    expect(extract).toBeDefined();
    expect(extract!.line).toBe(2);
    expect(extract!.code).toEqual({
      1: "first line\n",
      2: ["<%= [].boom.", "length %>\n", ""],
      3: "last line\n",
    });
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

describe("ExceptionWrapper#backtrace", () => {
  it("is built once, at construction, from the exception's backtrace locations", () => {
    const error = new Error("boom");
    error.stack =
      "Error: boom\n    at index (/app/lib/file.js:42:7)\n    at x (/app/node_modules/rack.js:43:1)";
    const wrapper = new ExceptionWrapper(null, error);
    expect(wrapper.backtrace).toBe(wrapper.backtrace);
    expect(wrapper.backtrace.map((loc) => [loc.path, loc.lineno])).toEqual([
      ["/app/lib/file.js", 42],
      ["/app/node_modules/rack.js", 43],
    ]);
    expect(wrapper.applicationTrace[0]).toBe(wrapper.fullTrace[0]);
    expect(wrapper.traces["Application Trace"].map((t) => t.id)).toEqual([0]);
    expect(wrapper.sourceExtracts.map((e) => [e.file, e.line])).toEqual([
      ["/app/lib/file.js", 42],
      ["/app/node_modules/rack.js", 43],
    ]);
  });
});

describe("ExceptionWrapper#clean_backtrace", () => {
  it("hands the memoized locations to the backtrace cleaner", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at index (/app/lib/file.js:42:7)";
    const wrapper = new ExceptionWrapper(new BacktraceCleaner().removeFilters(), error);
    expect(wrapper.fullTrace[0]).toBe(wrapper.backtrace[0]);
    expect(wrapper.traces["Full Trace"][0].trace).toBe("at index (/app/lib/file.js:42:7)");
  });
});
