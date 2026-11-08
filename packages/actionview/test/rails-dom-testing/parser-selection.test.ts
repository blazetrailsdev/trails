import { describe, expect, it } from "vitest";
import { HTML5 } from "@blazetrails/nokogiri";
import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import { Testing } from "../../lib/rails-dom-testing/testing.js";
import { withDefaultHtmlVersion } from "../support/dom-testing-helpers.js";

describe("DomTestingParserSelectionTest", () => {
  it("with default html4", () => {
    withDefaultHtmlVersion(":html4", () => {
      /* eslint-disable vitest/no-conditional-expect -- parser_selection_test.rb:16-22 branches on `html5_support?` */
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
      /* eslint-enable vitest/no-conditional-expect */

      expect(() => Testing.htmlDocument({ htmlVersion: ":html9" })).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html9" })).toThrow(ArgumentError);
    });
  });

  it("with default html5", () => {
    withDefaultHtmlVersion(":html5", () => {
      /* eslint-disable vitest/no-conditional-expect -- parser_selection_test.rb:16-22 branches on `html5_support?` */
      if (Testing.isHtml5Support()) {
        expect(Testing.htmlDocument()).toBe(HTML5.Document);
        expect(Testing.htmlDocumentFragment()).toBe(HTML5.DocumentFragment);
      } else {
        expect(() => Testing.htmlDocument()).toThrow(NotImplementedError);
        expect(() => Testing.htmlDocumentFragment()).toThrow(NotImplementedError);
      }
      /* eslint-enable vitest/no-conditional-expect */

      /* eslint-disable vitest/no-conditional-expect -- parser_selection_test.rb:16-22 branches on `html5_support?` */
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
      /* eslint-enable vitest/no-conditional-expect */

      expect(() => Testing.htmlDocument({ htmlVersion: ":html9" })).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html9" })).toThrow(ArgumentError);
    });
  });

  it("with invalid default", () => {
    withDefaultHtmlVersion(":html8", () => {
      expect(() => Testing.htmlDocument()).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment()).toThrow(ArgumentError);

      /* eslint-disable vitest/no-conditional-expect -- parser_selection_test.rb:16-22 branches on `html5_support?` */
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
      /* eslint-enable vitest/no-conditional-expect */

      expect(() => Testing.htmlDocument({ htmlVersion: ":html9" })).toThrow(ArgumentError);
      expect(() => Testing.htmlDocumentFragment({ htmlVersion: ":html9" })).toThrow(ArgumentError);
    });
  });
});
