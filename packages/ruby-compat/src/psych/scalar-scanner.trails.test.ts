import { beforeEach, describe, it, expect } from "vitest";
import { Psych } from "../psych.js";

describe("Psych::TestScalarScanner", () => {
  let ss: Psych.ScalarScanner;

  beforeEach(() => {
    ss = new Psych.ScalarScanner(new Psych.ClassLoader());
  });

  it("scan inf", () => {
    expect(ss.tokenize(".inf")).toBe(1 / 0.0);
  });

  it("scan plus inf", () => {
    expect(ss.tokenize("+.inf")).toBe(1 / 0.0);
  });

  it("scan minus inf", () => {
    expect(ss.tokenize("-.inf")).toBe(-1 / 0.0);
  });

  it("scan nan", () => {
    expect(Number.isNaN(ss.tokenize(".nan"))).toBe(true);
  });

  it("scan float with exponent but no fraction", () => {
    expect(ss.tokenize("0.E+0")).toBe(0.0);
  });

  it("scan null", () => {
    expect(ss.tokenize("null")).toBeNull();
    expect(ss.tokenize("~")).toBeNull();
    expect(ss.tokenize("")).toBeNull();
  });

  it("scan symbol", () => {
    expect(ss.tokenize(":foo")).toBe(":foo");
  });

  it("scan not sexagesimal", () => {
    expect(ss.tokenize("00:00:00:00:0f")).toBe("00:00:00:00:0f");
    expect(ss.tokenize("00:00:00:00:00")).toBe("00:00:00:00:00");
    expect(ss.tokenize("00:00:00:00:00.0")).toBe("00:00:00:00:00.0");
  });

  it("scan sexagesimal float", () => {
    expect(ss.tokenize("190:20:30.15")).toBe(685230.15);
  });

  it("scan sexagesimal int", () => {
    expect(ss.tokenize("190:20:30")).toBe(685230);
  });

  it("scan float", () => {
    expect(ss.tokenize("1.2")).toBe(1.2);
  });

  it("scan true", () => {
    expect(ss.tokenize("true")).toBe(true);
  });

  it("scan strings starting with underscores", () => {
    expect(ss.tokenize("_100")).toBe("_100");
  });

  it("scan strings starting with number", () => {
    expect(ss.tokenize("450D")).toBe("450D");
  });

  it("scan strings ending with underscores", () => {
    expect(ss.tokenize("100_")).toBe("100_");
  });

  it("scan int commas and underscores", () => {
    expect(ss.tokenize("123_456_789")).toBe(123_456_789);
    expect(ss.tokenize("123,456,789")).toBe(123_456_789);
    expect(ss.tokenize("1_2,3,4_5,6_789")).toBe(123_456_789);

    expect(ss.tokenize("1")).toBe(1);
    expect(ss.tokenize("+1")).toBe(1);
    expect(ss.tokenize("-1")).toBe(-1);

    expect(ss.tokenize("0b010101010")).toBe(0b010101010);
    expect(ss.tokenize("0b0,1_0,1_,0,1_01,0")).toBe(0b010101010);

    expect(ss.tokenize("01234567")).toBe(0o1234567);
    expect(ss.tokenize("0_,,,1_2,_34567")).toBe(0o1234567);

    expect(ss.tokenize("0x123456789abcdef")).toBe(Number(0x123456789abcdefn));
    expect(ss.tokenize("0x12_,34,_56,_789abcdef")).toBe(Number(0x123456789abcdefn));
    expect(ss.tokenize("0x_12_,34,_56,_789abcdef")).toBe(Number(0x123456789abcdefn));
    expect(ss.tokenize("0x12_,34,_56,_789abcdef__")).toBe(Number(0x123456789abcdefn));
  });

  it("scan strict int commas and underscores", () => {
    const scanner = new Psych.ScalarScanner(new Psych.ClassLoader(), { strictInteger: true });
    expect(scanner.tokenize("123_456_789")).toBe(123_456_789);
    expect(scanner.tokenize("123,456,789")).toBe("123,456,789");
    expect(scanner.tokenize("1_2,3,4_5,6_789")).toBe("1_2,3,4_5,6_789");

    expect(scanner.tokenize("1")).toBe(1);
    expect(scanner.tokenize("+1")).toBe(1);
    expect(scanner.tokenize("-1")).toBe(-1);

    expect(scanner.tokenize("0b010101010")).toBe(0b010101010);
    expect(scanner.tokenize("0b01_01_01_010")).toBe(0b010101010);
    expect(scanner.tokenize("0b0,1_0,1_,0,1_01,0")).toBe("0b0,1_0,1_,0,1_01,0");

    expect(scanner.tokenize("01234567")).toBe(0o1234567);
    expect(scanner.tokenize("0_,,,1_2,_34567")).toBe("0_,,,1_2,_34567");

    expect(scanner.tokenize("0x123456789abcdef")).toBe(Number(0x123456789abcdefn));
    expect(scanner.tokenize("0x12_34_56_789abcdef")).toBe(Number(0x123456789abcdefn));
    expect(scanner.tokenize("0x12_,34,_56,_789abcdef")).toBe("0x12_,34,_56,_789abcdef");
    expect(scanner.tokenize("0x_12_,34,_56,_789abcdef")).toBe("0x_12_,34,_56,_789abcdef");
    expect(scanner.tokenize("0x12_,34,_56,_789abcdef__")).toBe("0x12_,34,_56,_789abcdef__");
  });

  it("scan dot", () => {
    expect(ss.tokenize(".")).toBe(".");
  });

  it("scan plus dot", () => {
    expect(ss.tokenize("+.")).toBe("+.");
  });

  // PERMANENT-SKIP: counts `match?` calls on a String subclass; a JS string is a primitive that cannot be subclassed (CLAUDE.md, "Ruby Strings are JS string primitives").
  it.skip("scan ascii matches quickly", () => {});

  // PERMANENT-SKIP: counts `match?` calls on a String subclass; a JS string is a primitive that cannot be subclassed (CLAUDE.md, "Ruby Strings are JS string primitives").
  it.skip("scan unicode matches quickly", () => {});
});

describe("Psych::ScalarScanner#tokenize arms", () => {
  const ss = new Psych.ScalarScanner(new Psych.ClassLoader());

  it("answers YAML 1.1 booleans and nulls case-insensitively", () => {
    for (const s of ["yes", "Yes", "TRUE", "on", "On"]) expect(ss.tokenize(s)).toBe(true);
    for (const s of ["no", "No", "FALSE", "off", "OFF"]) expect(ss.tokenize(s)).toBe(false);
    for (const s of ["null", "Null", "NULL", "~"]) expect(ss.tokenize(s)).toBeNull();
  });

  it("keeps y, n and longer words Strings", () => {
    for (const s of ["y", "n", "nope", "truthy", "falsey", "a\nb"]) expect(ss.tokenize(s)).toBe(s);
  });

  it("reads octal only from a leading 0, and no exponent without a dot", () => {
    expect(ss.tokenize("0o17")).toBe("0o17");
    expect(ss.tokenize("017")).toBe(15);
    expect(ss.tokenize("08")).toBe("08");
    expect(ss.tokenize("1e3")).toBe("1e3");
    expect(ss.tokenize("1.")).toBe(1);
    expect(ss.tokenize("1,000.5")).toBe(1000.5);
  });

  it("breaks a line at a newline only, as Ruby's ^ and $ do", () => {
    for (const s of ["12\r", "1.5\u2028", "1.5\u2029", "0x1F\r", "+.inf\r"]) {
      expect(ss.tokenize(s)).toBe(s);
    }
    expect(ss.tokenize(":a\rb")).toBe(":a\rb");
    expect(ss.tokenize(":\r")).toBe(":\r");
    expect(ss.tokenize("12\n")).toBe("12\n");
  });

  it("strips the quotes of a quoted symbol and caches it", () => {
    expect(ss.tokenize(':"foo bar"')).toBe(":foo bar");
    expect(ss.tokenize(":'foo'")).toBe(":foo");
    expect(ss.tokenize(":'foo'")).toBe(":foo");
    expect(ss.tokenize(':":x"')).toBe(":x");
    expect(ss.tokenize(":")).toBe(":");
  });
});

describe("Psych.unsafeLoad through ScalarScanner", () => {
  it("resolves plain scalars as Psych does, not as YAML 1.2 core", () => {
    expect(
      Psych.unsafeLoad("a: yes\nb: off\nc: 0o17\nd: 017\ne: 1,000\nf: ~\ng:\nh: :sym"),
    ).toEqual({
      a: true,
      b: false,
      c: "0o17",
      d: 15,
      e: 1000,
      f: null,
      g: null,
      h: ":sym",
    });
  });

  it("keeps quoted and block scalars Strings", () => {
    expect(Psych.unsafeLoad("a: 'yes'\nb: \"12\"\nc: |-\n  12\nd: >-\n  no")).toEqual({
      a: "yes",
      b: "12",
      c: "12",
      d: "no",
    });
  });

  it("round-trips strings that scan as another type", () => {
    const value = ["yes", "off", "1,000", "017", "~", ":sym", "190:20:30", ""];
    expect(Psych.unsafeLoad(Psych.dump(value))).toEqual(value);
  });
});
