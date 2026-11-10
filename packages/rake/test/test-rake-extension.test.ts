import { stderr as $stderr } from "@blazetrails/ruby-compat";
import { describe, expect, it, vi } from "vitest";
import { rakeExtension } from "../lib/ext/core.js";

function errorRedirect(block: () => void): { string: string } {
  const result = { string: "" };
  const spy = vi.spyOn($stderr, "write").mockImplementation((chunk) => {
    result.string += String(chunk);
    return true;
  });
  try {
    block();
    return result;
  } finally {
    spy.mockRestore();
  }
}

class Sample {
  duplicateMethod(): string {
    return "original";
  }

  static OK_ERRS = errorRedirect(() => {
    rakeExtension.call(Sample, "a", () => {
      (Sample.prototype as unknown as Record<string, unknown>).okMethod = function () {};
    });
  });

  static DUP_ERRS = errorRedirect(() => {
    rakeExtension.call(Sample, "duplicateMethod", () => {
      Sample.prototype.duplicateMethod = function () {
        return "override";
      };
    });
  });
}

describe("TestRakeExtension", () => {
  it("methods actually exist", () => {
    const sample = new Sample() as Sample & { okMethod(): void };
    sample.okMethod();
    sample.duplicateMethod();
  });

  it("no warning when defining ok method", () => {
    expect(Sample.OK_ERRS.string).toEqual("");
  });

  it("extension complains when a method that is present", () => {
    expect(Sample.DUP_ERRS.string).toMatch(/warning:/i);
    expect(Sample.DUP_ERRS.string).toMatch(/already exists/i);
    expect(Sample.DUP_ERRS.string).toMatch(/duplicateMethod/i);
    expect(new Sample().duplicateMethod()).toEqual("original");
  });
});
