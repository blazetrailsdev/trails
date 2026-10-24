import { toI } from "@blazetrails/ruby-compat";
import type {} from "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("ParseNumbersTest", () => {
  it("straight parsing", () => {
    const strings: Record<string, number> = {
      one: 1,
      five: 5,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
      "twenty seven": 27,
      "thirty-one": 31,
      "thirty-seven": 37,
      "thirty seven": 37,
      "fifty nine": 59,
      "forty two": 42,
      "fourty two": 42,
      "one hundred": 100,
      "one hundred and fifty": 150,
      "two-hundred": 200,
      "5 hundred": 500,
      "nine hundred and ninety nine": 999,
      "one thousand": 1000,
      "twelve hundred": 1200,
      "one thousand two hundred": 1_200,
      "seventeen thousand": 17_000,
      "twentyone-thousand-four-hundred-and-seventy-three": 21_473,
      "seventy four thousand and two": 74_002,
      "ninety nine thousand nine hundred ninety nine": 99_999,
      "100 thousand": 100_000,
      "two hundred fifty thousand": 250_000,
      "one million": 1_000_000,
      "one million two hundred fifty thousand and seven": 1_250_007,
      "one billion": 1_000_000_000,
      "one billion and one": 1_000_000_001,
    };

    for (const [key, val] of Object.entries(strings)) {
      expect(toI(Chronic.Numerizer.numerize(key))).toEqual(val);
    }
  });

  it("ordinal strings", () => {
    for (const [key, val] of Object.entries({
      first: "1st",
      second: "second",
      "second day": "2nd day",
      "second of may": "2nd of may",
      fifth: "5th",
      twelfth: "12th",
      twentieth: "20th",
      thirtieth: "30th",
      fourtieth: "40th",
      fiftieth: "50th",
      sixtieth: "60th",
      seventieth: "70th",
      eightieth: "80th",
      ninetieth: "90th",
      hundredth: "100th",
      thousandth: "1000th",
      millionth: "1000000th",
      billionth: "1000000000th",
      trillionth: "1000000000000th",
      "twenty third": "23rd",
      "first day month two": "1st day month 2",
    })) {
      expect(new Chronic.Parser().preNormalize(key)).toEqual(val);
    }
  });

  it("edges", () => {
    expect(Chronic.Numerizer.numerize("27 Oct 2006 7:30am")).toEqual("27 Oct 2006 7:30am");
  });
});
