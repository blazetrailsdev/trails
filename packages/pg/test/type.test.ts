import { describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";

describe("PG::Type derivations", () => {
  const textencInt = new PG.TextEncoder.Integer(undefined, { name: "Integer", oid: 23 });
  const textdecInt = new PG.TextDecoder.Integer(undefined, { name: "Integer", oid: 23 });
  const textencBoolean = new PG.TextEncoder.Boolean();
  const textdecTimestamptz = new PG.TextDecoder.TimestampWithTimeZone();
  const textdecBytea = new PG.TextDecoder.Bytea();

  const int = (n: bigint): number | bigint => (Number.isSafeInteger(Number(n)) ? Number(n) : n);

  describe("PG::SimpleCoder", () => {
    describe("#decode", () => {
      it("should offer decode method with tuple/field", () => {
        const res = textdecInt.decode("123", 1, 1);
        expect(res).toBe(123);
      });

      it("should offer decode method without tuple/field", () => {
        const res = textdecInt.decode("234");
        expect(res).toBe(234);
      });

      it("should decode integers of different lengths from text format", () => {
        for (let zeros = 0; zeros < 30; zeros++) {
          const z = 10n ** BigInt(zeros);
          expect(textdecInt.decode("1" + "0".repeat(zeros))).toEqual(int(z));
          expect(textdecInt.decode(zeros == 0 ? "0" : "9".repeat(zeros))).toEqual(int(z - 1n));
          expect(textdecInt.decode("-1" + "0".repeat(zeros))).toEqual(int(-z));
          expect(textdecInt.decode(zeros == 0 ? "0" : "-" + "9".repeat(zeros))).toEqual(
            int(-z + 1n),
          );
        }
        for (let bits = 0; bits < 66; bits++) {
          const b = 2n ** BigInt(bits);
          expect(textdecInt.decode(b.toString())).toEqual(int(b));
          expect(textdecInt.decode((b - 1n).toString())).toEqual(int(b - 1n));
          expect(textdecInt.decode((-b).toString())).toEqual(int(-b));
          expect(textdecInt.decode((-b + 1n).toString())).toEqual(int(-b + 1n));
        }
      });

      it("decodes bytea to a binary string", () => {
        expect(textdecBytea.decode("\\x00010203EF")).toEqual(
          new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xef]),
        );
        expect(textdecBytea.decode("\\377\\000")).toEqual(new Uint8Array([0xff, 0]));
      });

      describe("timestamps", () => {
        function textdecTimestamptzDecodeShouldFail(str: string): void {
          expect(textdecTimestamptz.decode(str)).toBe(str);
        }

        it("fails when the timestamp is an empty string", () => {
          textdecTimestamptzDecodeShouldFail("");
        });
        it("fails when the timestamp contains values with less digits than expected", () => {
          textdecTimestamptzDecodeShouldFail("2016-0-02 23:23:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-0 23:23:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 2:23:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:2:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:5.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.123456+0:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.123456+00:2:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.123456+00:25:2");
        });
        it("fails when the timestamp contains values with more digits than expected", () => {
          textdecTimestamptzDecodeShouldFail("2016-011-02 23:23:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-022 23:23:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 233:23:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:233:59.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:599.123456+00:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.123456+000:25:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.123456+00:255:21");
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.123456+00:25:211");
        });
        it("fails when the timestamp contains values with invalid characters", () => {
          const str = "2013-01-02 23:23:59.123456+00:25:21";
          for (let i = 0; i < str.length; i++) {
            textdecTimestamptzDecodeShouldFail(str.slice(0, i) + "x" + str.slice(i + 1));
          }
        });
        it("fails when the timestamp contains leading characters", () => {
          textdecTimestamptzDecodeShouldFail(" 2016-01-02 23:23:59.123456");
        });
        it("fails when the timestamp contains trailing characters", () => {
          textdecTimestamptzDecodeShouldFail("2016-01-02 23:23:59.123456 ");
        });
        it("fails when the timestamp contains non ASCII character", () => {
          textdecTimestamptzDecodeShouldFail("2016-01\u00aa02 23:23:59.123456");
        });
      });
    });

    describe("#encode", () => {
      it("should encode integers of different lengths to text format", () => {
        for (let zeros = 0; zeros < 30; zeros++) {
          const z = 10n ** BigInt(zeros);
          expect(textencInt.encode(z)).toBe("1" + "0".repeat(zeros));
          expect(textencInt.encode(z - 1n)).toBe(zeros == 0 ? "0" : "9".repeat(zeros));
          expect(textencInt.encode(-z)).toBe("-1" + "0".repeat(zeros));
          expect(textencInt.encode(-z + 1n)).toBe(zeros == 0 ? "0" : "-" + "9".repeat(zeros));
        }
        for (let bits = 0; bits < 66; bits++) {
          const b = 2n ** BigInt(bits);
          expect(textencInt.encode(b)).toBe(b.toString());
          expect(textencInt.encode(b - 1n)).toBe((b - 1n).toString());
          expect(textencInt.encode(-b)).toBe((-b).toString());
          expect(textencInt.encode(-b + 1n)).toBe((-b + 1n).toString());
        }
      });

      it("should encode boolean values", () => {
        expect(textencBoolean.encode(false)).toBe("f");
        expect(textencBoolean.encode(true)).toBe("t");
        for (const value of ["any", "other", "value", 0, 1, 2]) {
          expect(textencBoolean.encode(value)).toBe(String(value));
        }
      });
    });
  });

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

        describe("three dimensional arrays", () => {
          describe("empty", () => {
            it("returns an empty array", () => {
              expect(textdecStringArray.decode(`{{{}}}`)).toEqual([[[]]]);
              expect(textdecStringArray.decode(`{{{},{}},{{},{}}}`)).toEqual([
                [[], []],
                [[], []],
              ]);
            });
          });

          it("returns an array of strings with sub arrays", () => {
            expect(textdecStringArray.decode(`{1,{2,{3,4}},{NULL,6},7}`)).toEqual([
              "1",
              ["2", ["3", "4"]],
              [null, "6"],
              "7",
            ]);
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
