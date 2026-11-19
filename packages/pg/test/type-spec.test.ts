import { describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";

describe("PG::Type derivations", () => {
  describe("PG::CompositeCoder", () => {
    describe("Array types", () => {
      const textencStringArray = new PG.TextEncoder.Array();
      const textdecStringArray = new PG.TextDecoder.Array();
      const textencIntArray = new PG.TextEncoder.Array();
      const textencStringArrayWithDelimiter = new PG.TextEncoder.Array(undefined, {
        delimiter: ";",
      });
      const textdecStringArrayWithDelimiter = new PG.TextDecoder.Array(undefined, {
        delimiter: ";",
      });

      describe("#decode", () => {
        describe("one dimensional arrays", () => {
          describe("empty", () => {
            it("returns an empty array", () => {
              expect(textdecStringArray.decode(`{}`)).toEqual([]);
            });
          });

          describe("no strings", () => {
            it("returns an array of strings", () => {
              expect(textdecStringArray.decode(`{1,2,3}`)).toEqual(["1", "2", "3"]);
            });
          });

          describe("NULL values", () => {
            it("returns an array of strings, with nils replacing NULL characters", () => {
              expect(textdecStringArray.decode(`{1,NULL,NULL}`)).toEqual(["1", null, null]);
            });
          });

          describe("quoted NULL", () => {
            it("returns an array with the word NULL", () => {
              expect(textdecStringArray.decode(`{1,"NULL",3}`)).toEqual(["1", "NULL", "3"]);
            });
          });

          describe("strings", () => {
            it("returns an array of strings when containing commas in a quoted string", () => {
              expect(textdecStringArray.decode(`{1,"2,3",4}`)).toEqual(["1", "2,3", "4"]);
            });

            it("returns an array of strings when containing an escaped quote", () => {
              expect(textdecStringArray.decode(`{1,"2\\",3",4}`)).toEqual(["1", '2",3', "4"]);
            });

            it("returns an array of strings when containing an escaped backslash", () => {
              expect(textdecStringArray.decode(`{1,"2\\\\",3,4}`)).toEqual(["1", "2\\", "3", "4"]);
              expect(textdecStringArray.decode(`{1,"2\\\\\\",3",4}`)).toEqual(["1", '2\\",3', "4"]);
            });

            it("returns an array containing empty strings", () => {
              expect(textdecStringArray.decode(`{1,"",3,""}`)).toEqual(["1", "", "3", ""]);
            });

            it("respects a different delimiter", () => {
              expect(textdecStringArrayWithDelimiter.decode(`{1;2;3}`)).toEqual(["1", "2", "3"]);
            });

            it("ignores array dimensions", () => {
              expect(textdecStringArray.decode(`[2:4]={1,2,3}`)).toEqual(["1", "2", "3"]);
              expect(textdecStringArray.decode(`[]={1,2,3}`)).toEqual(["1", "2", "3"]);
              expect(textdecStringArray.decode(`  [-1:+2]=  {4,3,2,1}`)).toEqual([
                "4",
                "3",
                "2",
                "1",
              ]);
            });
          });
        });

        describe("two dimensional arrays", () => {
          describe("empty", () => {
            it("returns an empty array", () => {
              expect(textdecStringArray.decode(`{{}}`)).toEqual([[]]);
              expect(textdecStringArray.decode(`{{},{}}`)).toEqual([[], []]);
            });
          });

          describe("strings", () => {
            it("returns an array of strings with a sub array and a quoted }", () => {
              expect(textdecStringArray.decode(`{1,{"2,}3",NULL},4}`)).toEqual([
                "1",
                ["2,}3", null],
                "4",
              ]);
            });

            it("returns an array of strings with a sub array with empty strings", () => {
              expect(textdecStringArray.decode(`{1,{""},4,{""}}`)).toEqual(["1", [""], "4", [""]]);
            });
          });
        });
      });

      describe("#encode", () => {
        describe("three dimensional arrays", () => {
          it("encodes an array of strings with quotes", () => {
            expect(
              textencStringArray.encode(["", [" ", ["{", "}", "\\", ",", '"', "\\t"]]]),
            ).toEqual(`{"",{" ",{"{","}","\\\\",",","\\"","\\\\t"}}}`);
          });
        });

        describe("one dimensional array", () => {
          it("can encode empty arrays", () => {
            expect(textencIntArray.encode([])).toEqual("{}");
            expect(textencStringArray.encode([])).toEqual("{}");
          });

          it("encodes an array of NULL strings w/wo quotes", () => {
            expect(
              textencStringArray.encode(["NUL", "NULL", "NULLL", "nul", "null", "nulll"]),
            ).toEqual(`{NUL,"NULL",NULLL,nul,"null",nulll}`);
          });

          it("respects a different delimiter", () => {
            expect(textencStringArrayWithDelimiter.encode(["a", "b,", "c"])).toEqual("{a;b,;c}");
          });
        });
      });
    });
  });
});
