import { describe, it, expect } from "vitest";
import { ExceptionWrapper } from "../exception-wrapper.js";

// ==========================================================================
// dispatch/exception_wrapper_test.rb
// ==========================================================================
describe("ExceptionWrapperTest", () => {
  it("#source_extracts fetches source fragments for every backtrace entry", () => {
    const err = new Error("test");
    const wrapper = new ExceptionWrapper(err);
    const extracts = wrapper.sourceExtracts;
    expect(extracts.length).toBeGreaterThan(0);
    for (const extract of extracts) {
      expect(extract).toHaveProperty("file");
      expect(extract).toHaveProperty("line");
    }
  });

  it("#source_extracts works with Windows paths", () => {
    const err = new Error("test");
    err.stack = "Error: test\n    at Object.<anonymous> (C:\\Users\\test\\file.ts:10:5)";
    const wrapper = new ExceptionWrapper(err);
    const extracts = wrapper.sourceExtracts;
    expect(extracts.length).toBe(1);
  });

  it("#source_extracts works with non standard backtrace", () => {
    const err = new Error("test");
    err.stack = "Error: test\n    at some_function (weird/path:42:1)";
    const wrapper = new ExceptionWrapper(err);
    const extracts = wrapper.sourceExtracts;
    expect(extracts.length).toBe(1);
  });

  it("#source_extracts works with eval syntax error", () => {
    const err = new SyntaxError("Unexpected token");
    const wrapper = new ExceptionWrapper(err);
    const extracts = wrapper.sourceExtracts;
    expect(Array.isArray(extracts)).toBe(true);
  });

  it("#source_extracts works with nil backtrace_locations", () => {
    const err = new Error("no stack");
    err.stack = undefined;
    const wrapper = new ExceptionWrapper(err);
    expect(wrapper.sourceExtracts).toEqual([]);
  });

  it("#source_extracts works with error_highlight", () => {
    const err = new Error("highlighted");
    const wrapper = new ExceptionWrapper(err);
    const extracts = wrapper.sourceExtracts;
    expect(Array.isArray(extracts)).toBe(true);
  });

  it("#application_trace returns traces only from the application", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    for (const line of wrapper.applicationTrace) {
      expect(line).not.toContain("node_modules");
    }
  });

  it("#status_code returns 400 for Rack::Utils::ParameterTypeError", () => {
    expect(ExceptionWrapper.statusCodeFor("ParameterTypeError")).toBe(400);
  });

  it("#rescue_response? returns false for an exception that's not in rescue_responses", () => {
    expect(ExceptionWrapper.rescueResponse("SomeRandomError")).toBe(false);
  });

  it("#rescue_response? returns true for an exception that is in rescue_responses", () => {
    expect(ExceptionWrapper.rescueResponse("RoutingError")).toBe(true);
  });

  it("#application_trace cannot be nil", () => {
    const err = new Error("no stack");
    err.stack = undefined;
    const wrapper = new ExceptionWrapper(err);
    expect(wrapper.applicationTrace).toEqual([]);
  });

  it("#framework_trace returns traces outside the application", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    for (const line of wrapper.frameworkTrace) {
      expect(line).toContain("node_modules");
    }
  });

  it("#framework_trace cannot be nil", () => {
    const err = new Error("no stack");
    err.stack = undefined;
    const wrapper = new ExceptionWrapper(err);
    expect(wrapper.frameworkTrace).toEqual([]);
  });

  it("#full_trace returns application and framework traces", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    const total = wrapper.applicationTrace.length + wrapper.frameworkTrace.length;
    expect(wrapper.fullTrace.length).toBe(total);
  });

  it("#full_trace cannot be nil", () => {
    const err = new Error("no stack");
    err.stack = undefined;
    const wrapper = new ExceptionWrapper(err);
    expect(wrapper.fullTrace).toEqual([]);
  });

  it("#traces returns every trace by category enumerated with an index", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    expect(wrapper.traces.length).toBeGreaterThan(0);
    for (const line of wrapper.traces) {
      expect(typeof line).toBe("string");
    }
  });

  it("#show? returns false when using :rescuable and the exceptions is not rescuable", () => {
    const wrapper = new ExceptionWrapper(new Error("generic"));
    expect(wrapper.show("rescuable")).toBe(false);
  });

  it("#show? returns true when using :rescuable and the exceptions is rescuable", () => {
    class RoutingError extends Error {
      get name() {
        return "RoutingError";
      }
    }
    ExceptionWrapper.registerStatus("RoutingError", 404);
    const wrapper = new ExceptionWrapper(new RoutingError("not found"));
    expect(wrapper.show("rescuable")).toBe(true);
  });

  it("#show? returns false when using :none and the exceptions is rescuable", () => {
    class RoutingError extends Error {
      get name() {
        return "RoutingError";
      }
    }
    const wrapper = new ExceptionWrapper(new RoutingError("not found"));
    expect(wrapper.show("none")).toBe(false);
  });

  it("#show? returns true when using :all and the exceptions is not rescuable", () => {
    const wrapper = new ExceptionWrapper(new Error("generic"));
    expect(wrapper.show("all")).toBe(true);
  });
});
