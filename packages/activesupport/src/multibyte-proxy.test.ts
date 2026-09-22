import { describe, it, expect } from "vitest";
import { Multibyte } from "./multibyte.js";
import type { Chars } from "./multibyte/chars.js";
import { mbChars } from "./core-ext/string/multibyte.js";

describe("MultibyteProxyText", () => {
  class AsciiOnlyEncoder {
    readonly wrappedString: string;

    constructor(string: string) {
      // eslint-disable-next-line no-control-regex -- multibyte_proxy_test.rb:11
      this.wrappedString = string.replace(/[^\u0000-\u007F]/gu, "?");
    }

    toS(): string {
      return this.wrappedString;
    }
  }

  function withCustomEncoder(encoder: unknown, block: () => void): void {
    const originalProxyClass = Multibyte.proxyClass();

    try {
      Multibyte.setProxyClass(encoder as typeof Chars);

      block();
    } finally {
      Multibyte.setProxyClass(originalProxyClass);
    }
  }

  it("custom multibyte encoder", () => {
    withCustomEncoder(AsciiOnlyEncoder, () => {
      expect(mbChars("søme string 123").toS()).toEqual("s?me string 123");
    });

    expect(mbChars("søme string 123").toS()).toEqual("søme string 123");
  });
});
