import { describe, it, expect } from "vitest";
import { enableWarnings, silenceWarnings } from "./kernel/reporting.js";
import { suppress } from "../module-ext.js";
import { ArgumentError, LoadError, verbose } from "@blazetrails/ruby-compat";

describe("KernelTest", () => {
  it("silence warnings", () => {
    silenceWarnings(() => expect(verbose()).toBeNull());
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
    const o = class {
      static x = 1;
    };
    expect(
      function (this: { x: number }) {
        return this.x;
      }.call(o),
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
