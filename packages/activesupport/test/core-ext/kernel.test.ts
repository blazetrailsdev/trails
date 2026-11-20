import { describe, it, expect } from "vitest";
import { enableWarnings, silenceWarnings } from "../../lib/core-ext/kernel/reporting.js";
import { suppress } from "../../lib/core-ext/kernel/reporting.js";
import { ArgumentError, LoadError, rbObjSingletonClass, verbose } from "@blazetrails/ruby-compat";
import { classEval } from "../../lib/core-ext/kernel/singleton-class.js";
import { assertNil } from "../../lib/testing/assertions.js";

describe("KernelTest", () => {
  it("silence warnings", () => {
    silenceWarnings(() => assertNil(verbose()));
    expect(silenceWarnings(() => 1234)).toEqual(1234);
  });

  it("silence warnings verbose invariant", () => {
    const oldVerbose = verbose();
    try {
      silenceWarnings(() => {
        throw new Error();
      });
      expect.unreachable();
    } catch {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(verbose()).toEqual(oldVerbose);
    }
  });

  it("enable warnings", () => {
    enableWarnings(() => expect(verbose()).toEqual(true));
    expect(enableWarnings(() => 1234)).toEqual(1234);
  });

  it("enable warnings verbose invariant", () => {
    const oldVerbose = verbose();
    try {
      enableWarnings(() => {
        throw new Error();
      });
      expect.unreachable();
    } catch {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(verbose()).toEqual(oldVerbose);
    }
  });

  it("class eval", () => {
    const o = {};
    (rbObjSingletonClass(o) as unknown as { x: number }).x = 1;
    expect(
      classEval.call(o, function (this: object) {
        return (this as { x: number }).x;
      }),
    ).toEqual(1);
  });
});

describe("KernelSuppressTest", () => {
  it("reraise", () => {
    expect(() =>
      suppress(() => {
        throw new LoadError();
      }, ArgumentError),
    ).toThrow(LoadError);
  });

  it("suppression", () => {
    expect(() => {
      suppress(() => {
        throw new ArgumentError();
      }, ArgumentError);
      suppress(() => {
        throw new LoadError();
      }, LoadError);
      suppress(
        () => {
          throw new LoadError();
        },
        LoadError,
        ArgumentError,
      );
      suppress(
        () => {
          throw new ArgumentError();
        },
        LoadError,
        ArgumentError,
      );
    }).not.toThrow();
  });
});
