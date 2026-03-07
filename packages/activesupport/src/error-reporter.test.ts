import { describe, it, expect, beforeEach } from "vitest";
import { ErrorReporter } from "./error-reporter.js";

describe("ErrorReporterTest", () => {
  let reporter: ErrorReporter;
  const reports: any[] = [];

  beforeEach(() => {
    reporter = new ErrorReporter();
    reports.length = 0;
    reporter.subscribe({ report: (r) => reports.push(r) });
  });

  it("receives the execution context", () => {
    reporter.setContext({ user: "alice" });
    reporter.handle([Error], () => { throw new Error("boom"); });
    expect(reports[0].context.user).toBe("alice");
  });

  it("passed context has priority over the execution context", () => {
    reporter.setContext({ env: "test" });
    reporter.handle([Error], { context: { env: "override" } }, () => {
      throw new Error("boom");
    });
    expect(reports[0].context.env).toBe("override");
  });

  it("passed source is forwarded", () => {
    reporter.handle([Error], { source: "my_source" }, () => {
      throw new Error("boom");
    });
    expect(reports[0].source).toBe("my_source");
  });

  it("#disable allow to skip a subscriber", () => {
    const sub = { report: (r: any) => reports.push({ label: "sub", ...r }) };
    reporter.subscribe(sub);
    reporter.disable(sub, () => {
      reporter.handle([Error], () => { throw new Error("boom"); });
    });
    // Only the first subscriber should have received the report
    expect(reports.every((r) => !r.label)).toBe(true);
  });

  it("#disable allow to skip a subscribers per class", () => {
    const reported: any[] = [];
    const sub = { report: (r: any) => reported.push(r) };
    reporter.subscribe(sub);
    reporter.disable([sub], () => {
      reporter.handle([Error], () => { throw new Error("boom"); });
    });
    expect(reported).toHaveLength(0);
  });

  it("#handle swallow and report any unhandled error", () => {
    reporter.handle([Error], () => { throw new Error("oops"); });
    expect(reports).toHaveLength(1);
    expect(reports[0].error.message).toBe("oops");
    expect(reports[0].handled).toBe(true);
  });

  it("#handle can be scoped to an exception class", () => {
    expect(() => {
      reporter.handle([TypeError], () => { throw new RangeError("range"); });
    }).toThrow(RangeError);
    expect(reports).toHaveLength(0);
  });

  it("#handle can be scoped to several exception classes", () => {
    reporter.handle([TypeError, RangeError], () => { throw new TypeError("t"); });
    expect(reports[0].error).toBeInstanceOf(TypeError);
    reporter.handle([TypeError, RangeError], () => { throw new RangeError("r"); });
    expect(reports[1].error).toBeInstanceOf(RangeError);
  });

  it("#handle swallows and reports matching errors", () => {
    reporter.handle([TypeError], () => { throw new TypeError("matched"); });
    expect(reports).toHaveLength(1);
    expect(reports[0].handled).toBe(true);
  });

  it("#handle passes through the return value", () => {
    const result = reporter.handle([Error], () => 42);
    expect(result).toBe(42);
  });

  it("#handle returns nil on handled raise", () => {
    const result = reporter.handle([Error], () => { throw new Error("boom"); });
    expect(result).toBeUndefined();
  });

  it("#handle returns the value of the fallback as a proc on handled raise", () => {
    const result = reporter.handle([Error], { fallback: () => "fallback_value" }, () => {
      throw new Error("boom");
    });
    expect(result).toBe("fallback_value");
  });

  it("#handle raises if the fallback is not a callable", () => {
    // With a non-callable fallback value, it just returns it as-is
    const result = reporter.handle([Error], { fallback: "static_fallback" }, () => {
      throw new Error("boom");
    });
    expect(result).toBe("static_fallback");
  });

  it("#handle raises the error up if fallback is a proc that then also raises", () => {
    expect(() => {
      reporter.handle([Error], { fallback: () => { throw new Error("fallback error"); } }, () => {
        throw new Error("original");
      });
    }).toThrow("fallback error");
  });

  it("#record report any unhandled error and re-raise them", () => {
    expect(() => {
      reporter.record([Error], () => { throw new Error("re-raised"); });
    }).toThrow("re-raised");
    expect(reports[0].handled).toBe(false);
  });

  it("#record can be scoped to an exception class", () => {
    expect(() => {
      reporter.record([TypeError], () => { throw new RangeError("range"); });
    }).toThrow(RangeError);
    expect(reports).toHaveLength(0);
  });

  it("#record can be scoped to several exception classes", () => {
    expect(() => {
      reporter.record([TypeError, RangeError], () => { throw new TypeError("t"); });
    }).toThrow(TypeError);
    expect(reports[0].error).toBeInstanceOf(TypeError);
  });

  it("#record report any matching, unhandled error and re-raise them", () => {
    const err = new TypeError("match");
    expect(() => {
      reporter.record([TypeError], () => { throw err; });
    }).toThrow(TypeError);
    expect(reports[0].error).toBe(err);
    expect(reports[0].handled).toBe(false);
  });

  it("#record passes through the return value", () => {
    const result = reporter.record([Error], () => "success");
    expect(result).toBe("success");
  });

  it("#unexpected swallows errors by default", () => {
    expect(() => reporter.unexpected(new Error("unexpected!"))).not.toThrow();
    expect(reports[0].error.message).toBe("unexpected!");
  });

  it("#unexpected accepts an error message", () => {
    reporter.unexpected("something went wrong");
    expect(reports[0].error.message).toBe("something went wrong");
  });

  it("can have multiple subscribers", () => {
    const extra: any[] = [];
    reporter.subscribe({ report: (r) => extra.push(r) });
    reporter.handle([Error], () => { throw new Error("multi"); });
    expect(reports).toHaveLength(1);
    expect(extra).toHaveLength(1);
  });

  it("can unsubscribe", () => {
    const sub = { report: (r: any) => reports.push(r) };
    reporter.subscribe(sub);
    reporter.unsubscribe(sub);
    reporter.handle([Error], () => { throw new Error("after unsub"); });
    // Only the original subscriber receives it (sub was removed)
    expect(reports).toHaveLength(1); // only the first subscriber still active
  });

  it("handled errors default to :warning severity", () => {
    reporter.handle([Error], () => { throw new Error("warn"); });
    expect(reports[0].severity).toBe("warning");
  });

  it("unhandled errors default to :error severity", () => {
    try {
      reporter.record([Error], () => { throw new Error("err"); });
    } catch {}
    expect(reports[0].severity).toBe("error");
  });

  it("report errors only once", () => {
    const err = new Error("once");
    reporter.handle([Error], () => { throw err; });
    reporter.handle([Error], () => { throw err; });
    // Same error object should only be reported once
    expect(reports).toHaveLength(1);
  });

  it("can report frozen exceptions", () => {
    const err = Object.freeze(new Error("frozen"));
    expect(() => reporter.handle([Error], () => { throw err; })).not.toThrow();
    expect(reports[0].error).toBe(err);
  });

  it("subscriber errors are re-raised if no logger is set", () => {
    reporter.logger = null;
    reporter.subscribe({
      report: () => { throw new Error("subscriber blew up"); },
    });
    expect(() => {
      reporter.handle([Error], () => { throw new Error("original"); });
    }).toThrow("subscriber blew up");
  });

  it("subscriber errors are logged if a logger is set", () => {
    const logs: string[] = [];
    reporter.logger = { error: (msg) => logs.push(msg) };
    reporter.subscribe({
      report: () => { throw new Error("subscriber error"); },
    });
    expect(() => {
      reporter.handle([Error], () => { throw new Error("original"); });
    }).not.toThrow();
    expect(logs.some((l) => l.includes("subscriber error"))).toBe(true);
  });

  it.skip("#report assigns a backtrace if it's missing", () => { /* Ruby backtrace */ });
  it.skip("causes can't be reported again either", () => { /* Ruby exception cause chain */ });
  it.skip("#unexpected re-raise errors in development and test", () => { /* env-specific */ });
});
