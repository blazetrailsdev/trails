import type {} from "@blazetrails/vitest-matchers";
import { Date as RubyDate, DateTime, Time } from "@blazetrails/date";
import { ArgumentError, RuntimeError, stdout } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";
import type { TimeClass } from "./namespaces.js";

describe("TestChronic", () => {
  beforeEach(() => {
    Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("pre normalize", () => {
    expect(new Chronic.Parser().preNormalize("12.55 pm")).toEqual(
      new Chronic.Parser().preNormalize("12:55 pm"),
    );
  });

  it("pre normalize numerized string", () => {
    const string = "two and a half years";
    expect(new Chronic.Parser().preNormalize(string)).toEqual(Chronic.Numerizer.numerize(string));
  });

  it("post normalize am pm aliases", () => {
    let tokens = [new Chronic.Token("5:00"), new Chronic.Token("morning")];
    tokens[0].tag(new Chronic.RepeaterTime("5:00"));
    tokens[1].tag(new Chronic.RepeaterDayPortion("morning"));

    expect(tokens[1].tags[0].type).toEqual("morning");

    tokens = Chronic.Handlers.dealiasAndDisambiguateTimes(tokens, {});

    expect(tokens[1].tags[0].type).toEqual("am");
    expect(tokens.length).toEqual(2);

    tokens = [new Chronic.Token("friday"), new Chronic.Token("morning")];
    tokens[0].tag(new Chronic.RepeaterDayName("friday"));
    tokens[1].tag(new Chronic.RepeaterDayPortion("morning"));

    expect(tokens[1].tags[0].type).toEqual("morning");

    tokens = Chronic.Handlers.dealiasAndDisambiguateTimes(tokens, {});

    expect(tokens[1].tags[0].type).toEqual("morning");
    expect(tokens.length).toEqual(2);
  });

  it("guess", () => {
    let span = new Chronic.Span(Time.local(2006, 8, 16, 0), Time.local(2006, 8, 17, 0));
    expect(new Chronic.Parser().guess(span)).toEqualRuby(Time.local(2006, 8, 16, 12));

    span = new Chronic.Span(Time.local(2006, 8, 16, 0), Time.local(2006, 8, 17, 0, 0, 1));
    expect(new Chronic.Parser().guess(span)).toEqualRuby(Time.local(2006, 8, 16, 12));

    span = new Chronic.Span(Time.local(2006, 11), Time.local(2006, 12));
    expect(new Chronic.Parser().guess(span)).toEqualRuby(Time.local(2006, 11, 16));
  });

  it("endian definitions", () => {
    const endians = [
      new Chronic.Handler(
        [
          ":scalar_month",
          [":separator_slash", ":separator_dash"],
          ":scalar_day",
          [":separator_slash", ":separator_dash"],
          ":scalar_year",
          ":separator_at?",
          "time?",
        ],
        "handleSmSdSy",
      ),
      new Chronic.Handler(
        [
          ":scalar_month",
          [":separator_slash", ":separator_dash"],
          ":scalar_day",
          ":separator_at?",
          "time?",
        ],
        "handleSmSd",
      ),
      new Chronic.Handler(
        [
          ":scalar_day",
          [":separator_slash", ":separator_dash"],
          ":scalar_month",
          ":separator_at?",
          "time?",
        ],
        "handleSdSm",
      ),
      new Chronic.Handler(
        [
          ":scalar_day",
          [":separator_slash", ":separator_dash"],
          ":scalar_month",
          [":separator_slash", ":separator_dash"],
          ":scalar_year",
          ":separator_at?",
          "time?",
        ],
        "handleSdSmSy",
      ),
    ];

    expect(new Chronic.Parser().definitions().endian).toEqualRuby(endians);

    let defs = new Chronic.Parser().definitions({ endianPrecedence: "little" });
    expect(defs.endian).toEqualRuby([...endians].reverse());

    defs = new Chronic.Parser().definitions({ endianPrecedence: ["little", "middle"] });
    expect(defs.endian).toEqualRuby([...endians].reverse());

    expect(() => new Chronic.Parser().definitions({ endianPrecedence: "invalid" })).toThrow(
      ArgumentError,
    );
  });

  it("debug", () => {
    const write = stdout.write;
    let string = "";
    stdout.write = (chunk) => {
      string += chunk;
      return true;
    };
    Chronic.setDebug(true);
    try {
      Chronic.parse("now");
      expect(string.includes("this(grabber-this)")).toBeTruthy();
    } finally {
      stdout.write = write;
      Chronic.setDebug(false);
    }
  });

  it("normal", () => {
    expect(Chronic.construct(2006, 1, 2, 0, 0, 0)).toEqualRuby(Time.local(2006, 1, 2, 0, 0, 0));
    expect(Chronic.construct(2006, 1, 2, 3, 0, 0)).toEqualRuby(Time.local(2006, 1, 2, 3, 0, 0));
    expect(Chronic.construct(2006, 1, 2, 3, 4, 0)).toEqualRuby(Time.local(2006, 1, 2, 3, 4, 0));
    expect(Chronic.construct(2006, 1, 2, 3, 4, 5)).toEqualRuby(Time.local(2006, 1, 2, 3, 4, 5));
  });

  it("second overflow", () => {
    expect(Chronic.construct(2006, 1, 1, 0, 0, 90)).toEqualRuby(Time.local(2006, 1, 1, 0, 1, 30));
    expect(Chronic.construct(2006, 1, 1, 0, 0, 300)).toEqualRuby(Time.local(2006, 1, 1, 0, 5, 0));
  });

  it("minute overflow", () => {
    expect(Chronic.construct(2006, 1, 1, 0, 90)).toEqualRuby(Time.local(2006, 1, 1, 1, 30));
    expect(Chronic.construct(2006, 1, 1, 0, 300)).toEqualRuby(Time.local(2006, 1, 1, 5));
  });

  it("hour overflow", () => {
    expect(Chronic.construct(2006, 1, 1, 36)).toEqualRuby(Time.local(2006, 1, 2, 12));
    expect(Chronic.construct(2006, 1, 1, 144)).toEqualRuby(Time.local(2006, 1, 7));
  });

  it("day overflow", () => {
    expect(Chronic.construct(2006, 1, 32)).toEqualRuby(Time.local(2006, 2, 1));
    expect(Chronic.construct(2006, 2, 33)).toEqualRuby(Time.local(2006, 3, 5));
    expect(Chronic.construct(2004, 2, 33)).toEqualRuby(Time.local(2004, 3, 4));
    expect(Chronic.construct(2000, 2, 33)).toEqualRuby(Time.local(2000, 3, 4));

    expect(() => Chronic.construct(2006, 1, 57)).toThrow(RuntimeError);
  });

  it("month overflow", () => {
    expect(Chronic.construct(2005, 13)).toEqualRuby(Time.local(2006, 1));
    expect(Chronic.construct(2000, 72)).toEqualRuby(Time.local(2005, 12));
  });

  it("time", () => {
    const org = Chronic.timeClass();
    try {
      Chronic.setTimeClass(Time as unknown as TimeClass);
      expect(Chronic.construct(2013, 8, 27, 20, 30, 40, "+05:30")).toEqualRuby(
        Time.new(2013, 8, 27, 20, 30, 40, "+05:30"),
      );
      expect(Chronic.construct(2013, 8, 27, 20, 30, 40, -28800)).toEqualRuby(
        Time.new(2013, 8, 27, 20, 30, 40, "-08:00"),
      );
    } finally {
      Chronic.setTimeClass(org);
    }
  });

  it("date", () => {
    const org = Chronic.timeClass();
    try {
      Chronic.setTimeClass(RubyDate as unknown as TimeClass);
      expect(Chronic.construct(2013, 8, 27)).toEqualRuby(new RubyDate(2013, 8, 27));
    } finally {
      Chronic.setTimeClass(org);
    }
  });

  it("datetime", () => {
    const org = Chronic.timeClass();
    try {
      Chronic.setTimeClass(DateTime as unknown as TimeClass);
      expect(Chronic.construct(2013, 8, 27, 20, 30, 40, "+05:30")).toEqualRuby(
        new DateTime(2013, 8, 27, 20, 30, 40, "+05:30"),
      );
      expect(Chronic.construct(2013, 8, 27, 20, 30, 40, -28800)).toEqualRuby(
        new DateTime(2013, 8, 27, 20, 30, 40, "-08:00"),
      );
    } finally {
      Chronic.setTimeClass(org);
    }
  });

  it("activesupport", () => {});
});
