import { describe, expect, it } from "vitest";
import { HTML5 } from "@blazetrails/nokogiri";
import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import { Testing } from "./testing.js";

function withDefaultHtmlVersion(version: string, block: () => void): void {
  const oldVersion = Testing.defaultHtmlVersion;
  try {
    Testing.defaultHtmlVersion = version;
    block();
  } finally {
    Testing.defaultHtmlVersion = oldVersion;
  }
}

/* eslint-disable vitest/no-conditional-expect -- Rails branches on `html5_support?` (parser_selection_test.rb:16-22) */
describe("DomTestingParserSelectionTest", () => {
  it("with default html4", () => {
    withDefaultHtmlVersion(":html4", () => {
      if (Testing.isHtml5Support()) {
        expect(Testing.htmlDocument({ htmlVersion: ":html5" })).toBe(HTML5.Document);
        expect(Testing.htmlDocumentFragment({ htmlVersion: ":html5" })).toBe(
          HTML5.DocumentFragment,
        );
      } else {
        expect(() => Testing.htmlDocument({ htmlVersion: ":html5" })).toThrow(NotImplementedError);
        expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html5" })).toThrow(
          NotImplementedError,
        );
      }

      expect(() => Testing.htmlDocument({ htmlVersion: ":html9" })).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html9" })).toThrow(ArgumentError);
    });
  });

  it("with default html5", () => {
    withDefaultHtmlVersion(":html5", () => {
      if (Testing.isHtml5Support()) {
        expect(Testing.htmlDocument()).toBe(HTML5.Document);
        expect(Testing.htmlDocumentFragment()).toBe(HTML5.DocumentFragment);
      } else {
        expect(() => Testing.htmlDocument()).toThrow(NotImplementedError);
        expect(() => Testing.htmlDocumentFragment()).toThrow(NotImplementedError);
      }

      if (Testing.isHtml5Support()) {
        expect(Testing.htmlDocument({ htmlVersion: ":html5" })).toBe(HTML5.Document);
        expect(Testing.htmlDocumentFragment({ htmlVersion: ":html5" })).toBe(
          HTML5.DocumentFragment,
        );
      } else {
        expect(() => Testing.htmlDocument({ htmlVersion: ":html5" })).toThrow(NotImplementedError);
        expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html5" })).toThrow(
          NotImplementedError,
        );
      }

      expect(() => Testing.htmlDocument({ htmlVersion: ":html9" })).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html9" })).toThrow(ArgumentError);
    });
  });

  it("with invalid default", () => {
    withDefaultHtmlVersion(":html8", () => {
      expect(() => Testing.htmlDocument()).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment()).toThrow(ArgumentError);

      if (Testing.isHtml5Support()) {
        expect(Testing.htmlDocument({ htmlVersion: ":html5" })).toBe(HTML5.Document);
        expect(Testing.htmlDocumentFragment({ htmlVersion: ":html5" })).toBe(
          HTML5.DocumentFragment,
        );
      } else {
        expect(() => Testing.htmlDocument({ htmlVersion: ":html5" })).toThrow(NotImplementedError);
        expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html5" })).toThrow(
          NotImplementedError,
        );
      }

      expect(() => Testing.htmlDocument({ htmlVersion: ":html9" })).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html9" })).toThrow(ArgumentError);
    });
  });
});
/* eslint-enable vitest/no-conditional-expect */
