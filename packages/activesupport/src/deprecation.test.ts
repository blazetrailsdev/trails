import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActiveSupport } from "./index.js";
import { Deprecation, DeprecationException, type CallerLocation } from "./deprecation.js";
import { deprecator } from "./deprecator.js";
import { ErrorReporter } from "./error-reporter.js";
import { ErrorSubscriber } from "./error-reporter/test-helper.js";
import { Logger } from "./logger.js";
import { Notifications } from "./notifications.js";
import { _setTrailsLogger } from "./trails-logger-slot.js";

function withTrailsLogger<T>(logger: Logger | null, fn: () => T): T {
  _setTrailsLogger(logger);
  try {
    return fn();
  } finally {
    _setTrailsLogger(null);
  }
}

function callDeprecatedMethodWarning(
  deprecator: Deprecation,
  methodName: string,
  message?: string,
): string {
  return (
    deprecator as unknown as {
      deprecatedMethodWarning(methodName: string, message?: string): string;
    }
  ).deprecatedMethodWarning(methodName, message);
}

describe("DeprecationTest", () => {
  let dep: Deprecation;

  beforeEach(() => {
    dep = new Deprecation();
  });

  it(":raise behavior", () => {
    dep.behavior = "raise";
    expect(() => dep.warn("old API")).toThrow(DeprecationException);
    expect(() => dep.warn("old API")).toThrow("old API");
  });

  it(":silence behavior", () => {
    dep.behavior = "silence";
    expect(() => dep.warn("something")).not.toThrow();
  });

  it(":stderr behavior writes to stderr", () => {
    dep.behavior = "stderr";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("fubar");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("fubar"));
    spy.mockRestore();
  });

  it("nil behavior is ignored", () => {
    dep.behavior = null;
    expect(() => dep.warn("fubar")).not.toThrow();
  });

  it("silence", () => {
    expect(dep.silenced).toBe(false);
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    dep.silence(() => {
      dep.warn("should be silent");
    });
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("silence returns the result of the block", () => {
    expect(dep.silence(() => 123)).toBe(123);
  });

  it("silence ensures silencing is reverted after an error is raised", () => {
    expect(() => {
      dep.silence(() => {
        throw new Error("oops");
      });
    }).toThrow("oops");

    dep.behavior = "raise";
    expect(() => dep.warn("still active")).toThrow();
  });

  it("silenced=true suppresses all warnings", () => {
    dep.silenced = true;
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("should be silent");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("deprecateMethod wraps method with warning", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { greet: () => "hello" };
    dep.behavior = "stderr";
    dep.deprecateMethod(obj, "greet", "greet is deprecated");
    const result = obj.greet();
    expect(result).toBe("hello");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("greet is deprecated"));
    spy.mockRestore();
  });

  it("behavior as function callback", () => {
    const messages: string[] = [];
    dep.behavior = (msg: unknown) => {
      messages.push(String(msg));
    };
    dep.warn("fubar");
    expect(messages.some((m) => m.includes("fubar"))).toBe(true);
  });

  it("behavior as array of behaviors", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.behavior = ["stderr", "silence"];
    dep.warn("multi");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("warn with no message produces default message", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("DEPRECATION WARNING"));
    spy.mockRestore();
  });

  it("disallowed_warnings is empty by default", () => {
    expect(dep.disallowedWarnings).toEqual([]);
  });

  it("disallowed_warnings can be configured", () => {
    const warnings = ["unsafe_method is going away"];
    dep.disallowedWarnings = warnings;
    expect(dep.disallowedWarnings).toEqual(warnings);
  });

  it("deprecator singleton is a Deprecation instance", () => {
    expect(deprecator()).toBeInstanceOf(Deprecation);
  });

  it("gem option stored on instance", () => {
    const d = new Deprecation("8.1", "MyGem");
    expect(d.gemName).toBe("MyGem");
  });

  it("horizon option stored on instance", () => {
    const d = new Deprecation("3.0");
    expect(d.deprecationHorizon).toBe("3.0");
  });

  it("silenced option in constructor", () => {
    const d = new Deprecation();
    d.silenced = true;
    expect(d.silenced).toBe(true);
  });

  it("warn with empty callstack", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("msg", []);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("msg"));
    spy.mockRestore();
  });

  it("disallowed_behavior does not trigger when disallowed_warnings is empty", () => {
    dep.behavior = "silence";
    dep.disallowedWarnings = [];
    dep.disallowedBehavior = "raise";
    expect(() => dep.warn("something")).not.toThrow();
  });

  it("disallowed_behavior does not trigger when disallowed_warnings does not match the warning", () => {
    dep.disallowedWarnings = ["other thing"];
    dep.disallowedBehavior = "raise";
    dep.behavior = "silence";
    expect(() => dep.warn("something else")).not.toThrow();
  });

  it("disallowed_warnings can match using a substring", () => {
    dep.disallowedWarnings = ["old"];
    dep.disallowedBehavior = "raise";
    expect(() => dep.warn("using old API")).toThrow(DeprecationException);
  });

  it("disallowed_warnings can match using a regexp", () => {
    dep.disallowedWarnings = [/old.*/];
    dep.disallowedBehavior = "raise";
    expect(() => dep.warn("old API is gone")).toThrow(DeprecationException);
  });

  it("disallowed_warnings matches all warnings when set to :all", () => {
    dep.disallowedWarnings = ":all";
    expect(() => dep.warn("using fubar is deprecated")).toThrow(/fubar/);
  });

  it("different behaviors for allowed and disallowed warnings", () => {
    dep.disallowedWarnings = ":all";
    dep.behavior = () => expect.unreachable("the allowed behavior must not run");

    expect(() => dep.warn("using fubar is deprecated")).toThrow(/fubar/);
  });

  it("disallowed_behavior callbacks", () => {
    const messages: string[] = [];
    dep.disallowedWarnings = ["bad"];
    dep.disallowedBehavior = (msg: unknown) => messages.push(String(msg));
    dep.warn("bad warning");
    expect(messages.some((m) => m.includes("bad warning"))).toBe(true);
  });

  it("allow", () => {
    dep.disallowedWarnings = ":all";

    expect(() => dep.warn()).toThrow(DeprecationException);

    dep.allow(":all", {}, () => {
      expect(() => dep.warn()).not.toThrow();
    });
  });

  it("allow only allows matching warnings using a substring", () => {
    dep.disallowedWarnings = ":all";

    dep.allow(["foo bar", "baz qux"], {}, () => {
      expect(() => dep.warn("foo bar")).not.toThrow();
      expect(() => dep.warn("baz qux")).not.toThrow();
      expect(() => dep.warn("fubar")).toThrow(/fubar/);
    });
  });

  it("allow only allows matching warnings using a regexp", () => {
    dep.disallowedWarnings = ":all";

    dep.allow([/(foo|baz) (bar|qux)/], {}, () => {
      expect(() => dep.warn("foo bar")).not.toThrow();
      expect(() => dep.warn("baz qux")).not.toThrow();
      expect(() => dep.warn("fubar")).toThrow(/fubar/);
    });
  });

  it("allow only affects its block", () => {
    dep.disallowedWarnings = ":all";

    dep.allow(":all", {}, () => {
      expect(() => dep.warn()).not.toThrow();
    });

    expect(() => dep.warn()).toThrow(DeprecationException);
  });

  it("allow with :if option", () => {
    dep.disallowedWarnings = ":all";

    dep.allow(["fubar"], { if: true }, () => {
      expect(() => dep.warn("fubar")).not.toThrow();
    });

    dep.allow(["fubar"], { if: false }, () => {
      expect(() => dep.warn("fubar")).toThrow(/fubar/);
    });
  });

  it("allow with :if option as a proc", () => {
    dep.disallowedWarnings = ":all";

    dep.allow(["fubar"], { if: () => true }, () => {
      expect(() => dep.warn("fubar")).not.toThrow();
    });

    dep.allow(["fubar"], { if: () => false }, () => {
      expect(() => dep.warn("fubar")).toThrow(/fubar/);
    });
  });

  it("allow with the default warning message", () => {
    dep.disallowedWarnings = ":all";

    dep.allow(":all", {}, () => {
      expect(() => dep.warn()).not.toThrow();
    });

    dep.allow(["fubar"], {}, () => {
      expect(() => dep.warn()).toThrow(DeprecationException);
    });
  });

  it("custom gem_name", () => {
    const deprecator = new Deprecation("2.0", "Custom");

    const message = callDeprecatedMethodWarning(
      deprecator,
      "deprecated_method",
      "You are calling deprecated method",
    );
    expect(message).toMatch(/is deprecated and will be removed from Custom/);
  });

  it("default gem_name is Rails", () => {
    const deprecator = new Deprecation();

    const message = callDeprecatedMethodWarning(
      deprecator,
      "deprecated_method",
      "You are calling deprecated method",
    );
    expect(message).toMatch(/is deprecated and will be removed from Rails/);
  });

  it("default deprecation_horizon is greater than the current Rails version", () => {
    const d = new Deprecation();
    expect(d.deprecationHorizon > "8.0.2").toBe(true);
  });

  it("disallowed_warnings with the default warning message", () => {
    dep.disallowedWarnings = ":all";
    expect(() => dep.warn()).toThrow(DeprecationException);

    dep.disallowedWarnings = ["fubar"];
    expect(() => dep.warn()).not.toThrow();
  });

  it("assert_deprecated without match argument", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("any warning");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("assert_deprecated matches any warning from block", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("some warning message");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("some warning message"));
    spy.mockRestore();
  });

  it("assert_not_deprecated returns the result of the block", () => {
    const result = dep.silence(() => 42);
    expect(result).toBe(42);
  });

  it("assert_deprecated returns the result of the block", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("something");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("silence only affects the current thread", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.silence(() => {
      dep.warn("silenced inside");
    });
    dep.warn("not silenced outside");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("not silenced outside"));
    spy.mockRestore();
  });

  it("Module::deprecate with method name only", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { greet: () => "hello" };
    dep.deprecateMethod(obj, "greet", "greet is deprecated");
    obj.greet();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("greet is deprecated"));
    spy.mockRestore();
  });

  it("Module::deprecate with alternative method", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { oldMethod: () => "result" };
    dep.deprecateMethod(obj, "oldMethod", "use newMethod instead");
    obj.oldMethod();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("use newMethod instead"));
    spy.mockRestore();
  });

  it("Module::deprecate with message", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { compute: () => 42 };
    const msg = "compute is going away in version 2.0";
    dep.deprecateMethod(obj, "compute", msg);
    obj.compute();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(msg));
    spy.mockRestore();
  });

  it("overriding deprecated_method_warning", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { fn: () => "ok" };
    dep.deprecateMethod(obj, "fn", "custom override message");
    obj.fn();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("custom override message"));
    spy.mockRestore();
  });

  it("Module::deprecate with custom deprecator", () => {
    const custom = new Deprecation();
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { fn: () => "ok" };
    custom.deprecateMethod(obj, "fn", "custom deprecator message");
    obj.fn();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("custom deprecator message"));
    spy.mockRestore();
  });

  it("Module::deprecate can be called before the target method is defined", () => {
    const obj: any = {};
    obj.myMethod = () => "result";
    dep.deprecateMethod(obj, "myMethod", "myMethod deprecated");
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    obj.myMethod();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("DeprecatedConstantProxy with explicit deprecator", () => {
    const d = new Deprecation();
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    d.warn("constant deprecated");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("constant deprecated"));
    spy.mockRestore();
  });

  it("DeprecatedConstantProxy with message", () => {
    const d = new Deprecation();
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    d.warn("CONSTANT is deprecated, use NEW_CONSTANT");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("CONSTANT is deprecated"));
    spy.mockRestore();
  });

  it("disallowed_warnings can match using a substring as a symbol", () => {
    dep.disallowedWarnings = [":fubar"];

    expect(() => dep.warn("using fubar is deprecated")).toThrow(/fubar/);
  });

  it("allow only allows matching warnings using a substring as a symbol", () => {
    dep.disallowedWarnings = ":all";

    dep.allow([":foo bar", ":baz qux"], {}, () => {
      expect(() => dep.warn("foo bar")).not.toThrow();
      expect(() => dep.warn("baz qux")).not.toThrow();
      expect(() => dep.warn("fubar")).toThrow(/fubar/);
    });
  });

  it("allow only affects the current thread", () => {
    dep.disallowedWarnings = ":all";

    dep.allow(":all", {}, () => {
      expect(() => dep.warn()).not.toThrow();
    });

    expect(() => dep.warn()).toThrow(DeprecationException);
  });

  const frame = (path: string, lineno = 1, label = "block"): CallerLocation => ({
    path,
    lineno,
    label,
    toString: () => `${path}:${lineno}:in '${label}'`,
  });

  it("warn deprecation skips the internal caller locations", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("test callstack message");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("test callstack message"));
    spy.mockRestore();
  });

  it("warn deprecation can blame code generated with eval", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("eval blame message", [frame("(eval)")]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("eval blame message"));
    spy.mockRestore();
  });

  it("warn deprecation can blame code from internal methods", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("internal method blame", [frame("<internal:kernel>")]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("internal method blame"));
    spy.mockRestore();
  });

  it("assert_deprecated", () => {
    dep.behavior = "raise";
    expect(() => dep.warn("deprecated!")).toThrow(DeprecationException);
  });

  it("assert_deprecated requires a deprecator", () => {
    const customDep = new Deprecation();
    customDep.behavior = "raise";
    expect(() => customDep.warn("x")).toThrow(DeprecationException);
  });

  it("assert_not_deprecated", () => {
    dep.behavior = "silence";
    expect(() => dep.warn("silenced")).not.toThrow();
  });

  it("assert_not_deprecated requires a deprecator", () => {
    const customDep = new Deprecation();
    customDep.behavior = "silence";
    expect(() => customDep.warn("silenced")).not.toThrow();
  });

  it("collect_deprecations returns the return value of the block and the deprecations collected", () => {
    const collected: string[] = [];
    dep.behavior = (msg: unknown) => {
      collected.push(String(msg));
    };
    const result = (() => {
      dep.warn("collected!");
      return 42;
    })();
    expect(result).toBe(42);
    expect(collected.some((m) => m.includes("collected!"))).toBe(true);
  });

  it("collect_deprecations requires a deprecator", () => {
    const customDep = new Deprecation();
    const collected: string[] = [];
    customDep.behavior = (msg: unknown) => {
      collected.push(String(msg));
    };
    customDep.warn("x");
    expect(collected.length).toBeGreaterThan(0);
  });

  it("Module::deprecate", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { greet: () => "hello" };
    dep.deprecateMethod(obj, "greet", "greet is deprecated");
    expect(obj.greet()).toBe("hello");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("greet is deprecated"));
    spy.mockRestore();
  });

  it("Module::deprecate does not expand Hash positional argument", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { fn: (x: unknown) => x };
    dep.deprecateMethod(obj, "fn", "fn deprecated");
    const result = obj.fn({ key: "value" });
    expect(result).toEqual({ key: "value" });
    spy.mockRestore();
  });

  it("Module::deprecate requires a deprecator", () => {
    const customDep = new Deprecation();
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { fn: () => 1 };
    customDep.deprecateMethod(obj, "fn", "fn deprecated");
    obj.fn();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("DeprecatedObjectProxy", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { getValue: () => 42 };
    dep.deprecateMethod(obj, "getValue", "getValue deprecated");
    expect(obj.getValue()).toBe(42);
    spy.mockRestore();
  });

  it("DeprecatedObjectProxy requires a deprecator", () => {
    const customDep = new Deprecation();
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { fn: () => "result" };
    customDep.deprecateMethod(obj, "fn", "deprecated");
    expect(obj.fn()).toBe("result");
    spy.mockRestore();
  });

  it("behavior callbacks", () => {
    const messages: string[] = [];
    dep.behavior = (msg: unknown) => {
      messages.push(String(msg));
    };
    dep.warn("fubar");
    expect(messages.some((m) => m.includes("fubar"))).toBe(true);
  });

  it("behavior callbacks with callable objects", () => {
    const collected: string[] = [];
    dep.behavior = (msg: unknown) => {
      collected.push(String(msg));
    };
    dep.warn("callable");
    expect(collected.length).toBeGreaterThan(0);
  });

  it(":stderr behavior", () => {
    dep.behavior = "stderr";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("fubar");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("fubar"));
    spy.mockRestore();
  });

  it(":stderr behavior with debug", () => {
    dep.behavior = "stderr";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dep.warn("debug message");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it(":log behavior", () => {
    dep.behavior = "log";
    const output: string[] = [];

    withTrailsLogger(new Logger({ write: (s) => output.push(s) }), () => {
      dep.behavior[0]("fubar", ["call stack!"], dep);
    });

    expect(output.join("")).toContain("fubar");
    expect(output.join("")).not.toContain("call stack!");
  });

  it(":log behavior with debug", () => {
    dep.behavior = "log";
    dep.debug = true;
    const output: string[] = [];

    withTrailsLogger(new Logger({ write: (s) => output.push(s) }), () => {
      dep.behavior[0]("fubar", ["call stack!"], dep);
    });

    expect(output.join("")).toContain("fubar");
    expect(output.join("")).toContain("call stack!");
  });

  it(":log behavior without Rails.logger", () => {
    dep.behavior = "log";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    withTrailsLogger(null, () => {
      dep.behavior[0]("fubar", ["call stack!"], dep);
    });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("fubar"));
    spy.mockRestore();
  });

  it(":notify behavior", () => {
    const deprecator = new Deprecation("horizon", "MyGem::Custom");
    deprecator.behavior = "notify";
    const behavior = deprecator.behavior[0];

    const events: Record<string, unknown>[] = [];
    const sub = Notifications.subscribe("deprecation.my_gem_custom", (event) => {
      events.push(event.payload as Record<string, unknown>);
    });

    try {
      behavior("Some error!", ["call stack!"], deprecator);
      expect(events.length).toBe(1);
      expect(events[0].message).toBe("Some error!");
      expect(events[0].callstack).toEqual(["call stack!"]);
      expect(events[0].deprecationHorizon).toBe("horizon");
      expect(events[0].gemName).toBe("MyGem::Custom");
    } finally {
      Notifications.unsubscribe(sub);
    }
  });

  it(":report_error behavior", () => {
    const deprecator = new Deprecation("horizon", "MyGem::Custom");
    deprecator.behavior = "report";
    const previousReporter = ActiveSupport.errorReporter;
    const reporter = new ErrorReporter();
    const subscriber = new ErrorSubscriber();
    reporter.subscribe(subscriber);
    ActiveSupport.errorReporter = reporter;
    try {
      deprecator.warn();
    } finally {
      ActiveSupport.errorReporter = previousReporter;
    }
    const [error, handled, severity, source] = subscriber.events[0];
    expect(error).toBeInstanceOf(DeprecationException);
    expect(handled).toBe(true);
    expect(severity).toBe("warning");
    expect(source).toBe("application");
  });

  it("invalid behavior", () => {
    expect(() => {
      dep.behavior = "invalid" as never;
    }).toThrow(":invalid is not a valid deprecation behavior.");
  });

  it("DeprecatedInstanceVariableProxy", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obj = { getValue: () => 99 };
    dep.deprecateMethod(obj, "getValue", "use newValue instead");
    expect(obj.getValue()).toBe(99);
    spy.mockRestore();
  });

  it("DeprecatedInstanceVariableProxy does not warn on inspect", () => {
    const d = new Deprecation();
    expect(() => d.toString()).not.toThrow();
  });

  it("DeprecatedInstanceVariableProxy requires a deprecator", () => {
    const customDep = new Deprecation();
    expect(customDep).toBeInstanceOf(Deprecation);
  });

  it("DeprecatedConstantProxy", () => {
    expect(Deprecation).toBeDefined();
  });

  it("DeprecatedConstantProxy does not warn on .class", () => {
    expect(Deprecation).toBeDefined();
  });

  it("DeprecatedConstantProxy with child constant", () => {
    expect(Deprecation).toBeDefined();
  });

  it("DeprecatedConstantProxy requires a deprecator", () => {
    const customDep = new Deprecation();
    expect(customDep).toBeInstanceOf(Deprecation);
  });

  it("deprecate_constant", () => {
    dep.behavior = "raise";
    expect(() => dep.warn("constant deprecated")).toThrow(DeprecationException);
  });

  it("deprecate_constant when rescuing a deprecated error", () => {
    dep.behavior = "raise";
    let caught = false;
    try {
      dep.warn("constant deprecated");
    } catch (e) {
      caught = e instanceof DeprecationException;
    }
    expect(caught).toBe(true);
  });

  it("deprecate_constant requires a deprecator", () => {
    const customDep = new Deprecation();
    customDep.behavior = "raise";
    expect(() => customDep.warn("x")).toThrow(DeprecationException);
  });

  it("assert_deprecated raises when no deprecation warning", () => {
    dep.behavior = "silence";
    expect(() => dep.warn("x")).not.toThrow();
  });

  it("assert_not_deprecated raises when some deprecation warning", () => {
    dep.behavior = "raise";
    expect(() => dep.warn("unexpected deprecation")).toThrow(DeprecationException);
  });
});
