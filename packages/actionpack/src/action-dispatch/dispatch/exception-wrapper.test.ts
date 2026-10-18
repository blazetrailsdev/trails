import { describe, it, expect } from "vitest";
import { ParameterTypeError } from "@blazetrails/rack";
import { ActionNotFound } from "../../abstract-controller/base.js";
import { RoutingError } from "../../action-controller/metal/exceptions.js";
import { BacktraceCleaner, assertCalledWith, assertEmpty } from "@blazetrails/activesupport";
import { ExceptionWrapper } from "../middleware/exception-wrapper.js";

const BACKTRACE =
  "TestError\n    at index (lib/file.ts:42:1)\n    at run (node_modules/vitest/index.js:7:3)";

function makeCleaner(): BacktraceCleaner {
  const cleaner = new BacktraceCleaner();
  cleaner.removeFilters();
  cleaner.addSilencer((line) => !line.includes("lib/"));
  return cleaner;
}

function raised(klass: ErrorConstructor, ...frames: string[]): Error {
  const ex = new klass();
  ex.stack = [klass.name, ...frames.map((frame) => `    at ${frame}`)].join("\n");
  return ex;
}

function badlyDefinedError(): Error {
  const ex = new Error();
  ex.stack = undefined;
  return ex;
}

describe("ExceptionWrapperTest", () => {
  it("#source_extracts fetches source fragments for every backtrace entry", async () => {
    const exception = raised(Error, "index (lib/file.rb:42:1)");
    const wrapper = new ExceptionWrapper(null, exception);

    await assertCalledWith(
      wrapper,
      "sourceFragment",
      ["lib/file.rb", 42],
      { returns: "foo" },
      () => {
        expect(wrapper.sourceExtracts).toEqual([{ code: "foo", lineNumber: 42 }]);
      },
    );
  });

  it("#source_extracts works with Windows paths", async () => {
    const exc = raised(Error, "ms_index (c:/path/to/rails/app/controller.rb:27:1)");

    const wrapper = new ExceptionWrapper(null, exc);

    await assertCalledWith(
      wrapper,
      "sourceFragment",
      ["c:/path/to/rails/app/controller.rb", 27],
      { returns: "nothing" },
      () => {
        expect(wrapper.sourceExtracts).toEqual([{ code: "nothing", lineNumber: 27 }]);
      },
    );
  });

  it("#source_extracts works with non standard backtrace", async () => {
    const exc = raised(Error, "invalid_ex (invalid:0:1)");

    const wrapper = new ExceptionWrapper(null, exc);

    await assertCalledWith(
      wrapper,
      "sourceFragment",
      ["invalid", 0],
      { returns: "nothing" },
      () => {
        expect(wrapper.sourceExtracts).toEqual([{ code: "nothing", lineNumber: 0 }]);
      },
    );
  });

  it("#source_extracts works with eval syntax error", async () => {
    const exception = raised(SyntaxError, "throw_syntax_error (lib/file.rb:42:1)");

    const wrapper = new ExceptionWrapper(null, exception);

    await assertCalledWith(
      wrapper,
      "sourceFragment",
      ["lib/file.rb", 42],
      { returns: "foo" },
      () => {
        expect(wrapper.sourceExtracts).toEqual([{ code: "foo", lineNumber: 42 }]);
      },
    );
  });

  it("#source_extracts works with nil backtrace_locations", () => {
    const exception = badlyDefinedError();

    const wrapper = new ExceptionWrapper(null, exception);

    assertEmpty(wrapper.sourceExtracts);
  });

  it("#source_extracts works with error_highlight", () => {
    const err = new Error("highlighted");
    const wrapper = new ExceptionWrapper(err);
    const extracts = wrapper.sourceExtracts;
    expect(Array.isArray(extracts)).toBe(true);
  });

  it("#application_trace returns traces only from the application", () => {
    const exception = new Error("test");
    exception.stack = BACKTRACE;
    const wrapper = new ExceptionWrapper(makeCleaner(), exception);
    expect(wrapper.applicationTrace.map(String)).toEqual(["at index (lib/file.ts:42:1)"]);
  });

  it("#status_code returns 400 for Rack::Utils::ParameterTypeError", () => {
    const exception = new ParameterTypeError("");
    const wrapper = new ExceptionWrapper(null, exception);
    expect(wrapper.statusCode).toBe(400);
  });

  it("#rescue_response? returns false for an exception that's not in rescue_responses", () => {
    const wrapper = new ExceptionWrapper(null, new Error());
    expect(wrapper.rescueResponse()).toBe(false);
  });

  it("#rescue_response? returns true for an exception that is in rescue_responses", () => {
    const wrapper = new ExceptionWrapper(null, new RoutingError(""));
    expect(wrapper.rescueResponse()).toBe(true);
  });

  it("#application_trace cannot be nil", () => {
    const nilBacktraceWrapper = new ExceptionWrapper(makeCleaner(), badlyDefinedError());
    const nilCleanerWrapper = new ExceptionWrapper(null, badlyDefinedError());

    expect(nilBacktraceWrapper.applicationTrace).toEqual([]);
    expect(nilCleanerWrapper.applicationTrace).toEqual([]);
  });

  it("#framework_trace returns traces outside the application", () => {
    const exception = new Error("test");
    exception.stack = BACKTRACE;
    const wrapper = new ExceptionWrapper(makeCleaner(), exception);
    expect(wrapper.frameworkTrace.map(String)).toEqual([
      "at run (node_modules/vitest/index.js:7:3)",
    ]);
  });

  it("#framework_trace cannot be nil", () => {
    const nilBacktraceWrapper = new ExceptionWrapper(makeCleaner(), badlyDefinedError());
    const nilCleanerWrapper = new ExceptionWrapper(null, badlyDefinedError());

    expect(nilBacktraceWrapper.frameworkTrace).toEqual([]);
    expect(nilCleanerWrapper.frameworkTrace).toEqual([]);
  });

  it("#full_trace returns application and framework traces", () => {
    const exception = new Error("test");
    exception.stack = BACKTRACE;
    const wrapper = new ExceptionWrapper(makeCleaner(), exception);
    expect(wrapper.fullTrace.map(String)).toEqual(wrapper.backtrace.map(String));
  });

  it("#full_trace cannot be nil", () => {
    const nilBacktraceWrapper = new ExceptionWrapper(makeCleaner(), badlyDefinedError());
    const nilCleanerWrapper = new ExceptionWrapper(null, badlyDefinedError());

    expect(nilBacktraceWrapper.fullTrace).toEqual([]);
    expect(nilCleanerWrapper.fullTrace).toEqual([]);
  });

  it("#traces returns every trace by category enumerated with an index", () => {
    const exception = raised(Error, "index (lib/file.rb:42:1)", "in_rack (/gems/rack.rb:43:1)");
    const wrapper = new ExceptionWrapper(makeCleaner(), exception);
    const exceptionObjectId = wrapper.exceptionId();

    expect(wrapper.traces).toEqual({
      "Application Trace": [{ exceptionObjectId, id: 0, trace: "at index (lib/file.rb:42:1)" }],
      "Framework Trace": [{ exceptionObjectId, id: 1, trace: "at in_rack (/gems/rack.rb:43:1)" }],
      "Full Trace": [
        { exceptionObjectId, id: 0, trace: "at index (lib/file.rb:42:1)" },
        { exceptionObjectId, id: 1, trace: "at in_rack (/gems/rack.rb:43:1)" },
      ],
    });
  });

  const requestWith = (mode: "all" | "rescuable" | "none") => ({
    getHeader: (k: string) => (k === "action_dispatch.show_exceptions" ? mode : undefined),
  });

  it("#show? returns false when using :rescuable and the exceptions is not rescuable", () => {
    const wrapper = new ExceptionWrapper(null, new Error("generic"));
    expect(wrapper.isShow(requestWith("rescuable"))).toBe(false);
  });

  it("#show? returns true when using :rescuable and the exceptions is rescuable", () => {
    const wrapper = new ExceptionWrapper(null, new ActionNotFound(""));
    expect(wrapper.isShow(requestWith("rescuable"))).toBe(true);
  });

  it("#show? returns false when using :none and the exceptions is rescuable", () => {
    const wrapper = new ExceptionWrapper(null, new ActionNotFound(""));
    expect(wrapper.isShow(requestWith("none"))).toBe(false);
  });

  it("#show? returns true when using :all and the exceptions is not rescuable", () => {
    const wrapper = new ExceptionWrapper(null, new Error("generic"));
    expect(wrapper.isShow(requestWith("all"))).toBe(true);
  });
});
