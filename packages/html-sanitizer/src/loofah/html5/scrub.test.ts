import { describe, expect, it } from "vitest";

import { Scrub } from "./scrub.js";

describe("UnitHTML5Scrub", () => {
  describe("hex values", () => {
    it("handles upper case", () => {
      expect(Scrub.scrubCss("background: #ABC012")).toBe("background:#ABC012;");
    });
    it("handles lower case", () => {
      expect(Scrub.scrubCss("background: #abc012")).toBe("background:#abc012;");
    });
  });

  describe("css functions", () => {
    it("allows safe functions", () => {
      expect(
        Scrub.scrubCss("background-color: linear-gradient(transparent 50%, #ffff66 50%);"),
      ).toBe("background-color:linear-gradient(transparent 50%, #ffff66 50%);");
    });

    it("disallows unsafe functions", () => {
      expect(Scrub.scrubCss("background-color: haxxor-fun(transparent 50%, #ffff66 50%);")).toBe(
        "",
      );
    });

    it("allows safe functions in shorthand css properties", () => {
      expect(Scrub.scrubCss("background: linear-gradient(transparent 50%, #ffff66 50%);")).toBe(
        "background:linear-gradient(transparent 50%, #ffff66 50%);",
      );
    });
  });

  describe("property string values", () => {
    it("allows hypenated values", () => {
      let text = "font-family:'AvenirNext-Regular';";

      expect(Scrub.scrubCss(text)).toBe(text);

      text = 'font-family:"AvenirNext-Regular";';

      expect(Scrub.scrubCss(text)).toBe(text);
    });

    it("allows embedded spaces in values", () => {
      let text = "font-family:'Avenir Next';";

      expect(Scrub.scrubCss(text)).toBe(text);

      text = 'font-family:"Avenir Next";';

      expect(Scrub.scrubCss(text)).toBe(text);
    });

    it("does not allow values with embedded or irregular quotes", () => {
      expect(Scrub.scrubCss(`font-family:'AvenirNext"-Regular';`)).toBe("");
      expect(Scrub.scrubCss(`font-family:"AvenirNext'-Regular";`)).toBe("");

      expect(Scrub.scrubCss("font-family:'AvenirNext-Regular;")).toBe("");
      expect(Scrub.scrubCss(`font-family:'AvenirNext-Regular";`)).toBe("");

      expect(Scrub.scrubCss('font-family:"AvenirNext-Regular;')).toBe("");
      expect(Scrub.scrubCss(`font-family:"AvenirNext-Regular';`)).toBe("");
    });

    it("keeps whitespace around delimiters if it's already there", () => {
      expect(Scrub.scrubCss("font: 13px / 1.5 Arial , sans-serif;")).toBe(
        "font:13px / 1.5 Arial , sans-serif;",
      );
    });

    it("does not insert spaces around delimiters if they aren't already there", () => {
      expect(Scrub.scrubCss("font: 13px/1.5 Arial, sans-serif;")).toBe(
        "font:13px/1.5 Arial, sans-serif;",
      );
    });
  });

  describe("whitespace", () => {
    it("converts all whitespace to a single space except initial and final whitespace", () => {
      expect(Scrub.scrubCss("font: \n\t 12px \n\t Arial \n\t ;")).toBe("font:12px Arial;");
    });
  });

  describe("colors", () => {
    it("allows basic and extended colors", () => {
      let text = "background-color:blue;";

      expect(Scrub.scrubCss(text)).toBe(text);

      text = "background-color:brown;";

      expect(Scrub.scrubCss(text)).toBe(text);

      text = "background-color:lightblue;";

      expect(Scrub.scrubCss(text)).toBe(text);
    });

    it("does not allow non-colors", () => {
      const text = "background-color:blurple;";

      expect(Scrub.scrubCss(text)).toBe("");
    });
  });
});
