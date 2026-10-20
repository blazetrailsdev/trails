import { afterEach, describe, expect, it } from "vitest";
import { BacktraceCleaner, TopLevel } from "@blazetrails/activesupport";
import {
  Base,
  LookupContext,
  MissingTemplate,
  PathRegistry,
  PathSet,
  Template,
  TemplateError,
  TemplateHandlers,
  TseHandler,
} from "@blazetrails/actionview";
import { rbObjClassname } from "@blazetrails/ruby-compat";
import { ParameterTypeError, InvalidParameterError } from "@blazetrails/rack";
import { ActionNotFound } from "../../abstract-controller/base.js";
import {
  BadRequest,
  MethodNotAllowed,
  MissingExactTemplate,
  NotImplemented,
  RoutingError,
  UnknownFormat,
  UnknownHttpMethod,
} from "../../action-controller/metal/exceptions.js";
import {
  InvalidAuthenticityToken,
  InvalidCrossOriginRequest,
} from "../../action-controller/metal/request-forgery-protection.js";
import { ParameterMissing } from "../../action-controller/metal/strong-parameters.js";
import { InvalidType } from "../http/mime-negotiation.js";
import { ParseError } from "../http/parameters.js";
import { ExceptionWrapper } from "../middleware/exception-wrapper.js";

class Holder {}

describe("ExceptionWrapper template spots", () => {
  afterEach(() => {
    PathRegistry.setViewPaths(Holder, new PathSet([]));
    TemplateHandlers.clear();
  });

  it("remaps a compiled-template frame onto the template's own source", async () => {
    TemplateHandlers.registerTemplateHandler("tse", new TseHandler());
    const root = decodeURIComponent(
      new URL("../../../test-fixtures/precompiled", import.meta.url).pathname,
    );
    const template = new LookupContext([`${root}/app/views`]).findTemplate(
      "show",
      ["posts"],
      false,
      [],
      {},
    ) as Template;
    const resolver = { findAll: () => [], builtTemplates: () => [template] };
    PathRegistry.setViewPaths(Holder, new PathSet([resolver]));

    let raised: unknown;
    try {
      await template.render(new (Base.withEmptyTemplateCache())(null, {}, null));
    } catch (e) {
      raised = e;
    }
    expect((raised as TemplateError).lineNumber()).toBe(2);
    const frames = ((raised as Error).cause as Error)
      .stack!.split("\n")
      .filter((l) => l.includes(template.methodName()));
    expect(frames).toHaveLength(1);
    const wrapper = new ExceptionWrapper(null, (raised as Error).cause as Error);
    const extract =
      wrapper.sourceExtracts[
        wrapper.backtrace.findIndex((loc) => String(loc).includes(template.methodName()))
      ];

    expect(extract).toBeDefined();
    expect(extract.lineNumber).toBe(2);
    expect(extract.code?.[1]).toBe("first line\n");
    expect((extract.code?.[2] as string[]).join("")).toBe("<%= [].boom.length %>\n");
    expect(extract.code?.[3]).toBe("last line\n");
  });
});

describe("ExceptionWrapper tables keyed on qualified class names", () => {
  it("every rescue_responses class answers its key as class.name", () => {
    const klasses = [
      RoutingError,
      ActionNotFound,
      MethodNotAllowed,
      UnknownHttpMethod,
      NotImplemented,
      UnknownFormat,
      InvalidType,
      MissingExactTemplate,
      InvalidAuthenticityToken,
      InvalidCrossOriginRequest,
      ParseError,
      BadRequest,
      ParameterMissing,
      ParameterTypeError,
      InvalidParameterError,
    ];
    const names = klasses.map((klass) => rbObjClassname(Object.create(klass.prototype)));
    expect(names).toEqual(Object.keys(ExceptionWrapper.rescueResponses));
  });

  it("every rescue_templates class answers its key as class.name", () => {
    const names = [
      MissingTemplate,
      RoutingError,
      ActionNotFound,
      TemplateError,
      MissingExactTemplate,
    ].map((klass) => rbObjClassname(Object.create(klass.prototype)));
    expect(names).toEqual(
      Object.keys(ExceptionWrapper.rescueTemplates).filter((k) => !k.startsWith("ActiveRecord::")),
    );
  });

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
    const error = new TemplateError({} as Template, original);
    const wrapper = new ExceptionWrapper(null, error);
    expect(wrapper.unwrappedException).toBe(original);
    expect(wrapper.statusCode).toBe(404);
  });

  it("silent_exceptions keeps a raised ActionController::RoutingError off the framework trace", () => {
    const error = new RoutingError("");
    error.stack = "RoutingError\n    at x (/app/node_modules/pkg/index.js:1:1)";
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("node_modules"));
    const wrapper = new ExceptionWrapper(cleaner, error);
    expect(wrapper.exceptionTrace()).toEqual([]);
  });
});

describe("ExceptionWrapper#backtrace", () => {
  it("is built once, at construction, from the exception's backtrace locations", () => {
    const error = new Error("boom");
    error.stack =
      "Error: boom\n    at index (/app/lib/file.js:42:7)\n    at x (/app/node_modules/rack.js:43:1)";
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("node_modules"));
    const wrapper = new ExceptionWrapper(cleaner, error);
    expect(wrapper.backtrace).toBe(wrapper.backtrace);
    expect(wrapper.backtrace.map((loc) => [loc.path, loc.lineno])).toEqual([
      ["/app/lib/file.js", 42],
      ["/app/node_modules/rack.js", 43],
    ]);
    expect(wrapper.applicationTrace[0]).toBe(wrapper.fullTrace[0]);
    expect(wrapper.traces["Application Trace"].map((t) => t.id)).toEqual([0]);
    expect(wrapper.sourceExtracts.map((e) => e.lineNumber)).toEqual([42, 43]);
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

describe("ExceptionWrapper#sourceFragment", () => {
  it("reads an absolute backtrace path as is, ignoring Rails.root", () => {
    const trails = TopLevel.Trails;
    TopLevel.Trails = { root: () => "/nonexistent-root" } as unknown as typeof trails;
    try {
      const wrapper = new ExceptionWrapper(null, new Error("boom"));
      const fragment = wrapper.sourceFragment(new URL(import.meta.url).pathname, 1);
      expect(fragment?.[1]).toBe('import { afterEach, describe, expect, it } from "vitest";\n');
    } finally {
      TopLevel.Trails = trails;
    }
  });
});
