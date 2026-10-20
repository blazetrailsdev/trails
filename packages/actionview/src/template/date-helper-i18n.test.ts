/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  I18n,
  Mock,
  assertCalledWith,
  assertMock,
  assertNotCalled,
  expectCalledWith,
  isPresent,
  stub,
} from "@blazetrails/activesupport";
import { Date as RubyDate, Time } from "@blazetrails/date";
import { StandardError } from "@blazetrails/ruby-compat";
import { distanceOfTimeInWords, selectMonth, timeAgoInWords } from "../helpers/date-helper.js";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 2629746;
const YEAR = 31556952;

describe("DateHelperDistanceOfTimeInWordsI18nTests", () => {
  let from: Time;

  beforeEach(() => {
    from = Time.utc(2004, 6, 6, 21, 45, 0);
  });

  function assertDistanceOfTimeInWordsTranslatesKey(
    passed: [number, Record<string, unknown>],
    expected: [string, number | null],
    expectedOptions: Record<string, unknown> = {},
  ): void {
    const [diff, passedOptions] = passed;
    const [key, count] = expected;
    const to = from.plus(diff);

    const options: Record<string, unknown> = Object.assign(
      { locale: "en", scope: "datetime.distance_in_words" },
      expectedOptions,
    );
    if (count != null) options.count = count;

    assertCalledWith(I18n, "t", [key, options], {}, () => {
      distanceOfTimeInWords(from, to, { ...passedOptions, locale: "en" });
    });
  }

  it("distance of time in words calls i18n", () => {
    const cases: Array<[[number, Record<string, unknown>], [string, number | null]]> = [
      [
        [2, { includeSeconds: true }],
        ["less_than_x_seconds", 5],
      ],
      [
        [9, { includeSeconds: true }],
        ["less_than_x_seconds", 10],
      ],
      [
        [19, { includeSeconds: true }],
        ["less_than_x_seconds", 20],
      ],
      [
        [30, { includeSeconds: true }],
        ["half_a_minute", null],
      ],
      [
        [59, { includeSeconds: true }],
        ["less_than_x_minutes", 1],
      ],
      [
        [60, { includeSeconds: true }],
        ["x_minutes", 1],
      ],

      [
        [29, { includeSeconds: false }],
        ["less_than_x_minutes", 1],
      ],
      [
        [60, { includeSeconds: false }],
        ["x_minutes", 1],
      ],
      [
        [44 * MINUTE, { includeSeconds: false }],
        ["x_minutes", 44],
      ],
      [
        [61 * MINUTE, { includeSeconds: false }],
        ["about_x_hours", 1],
      ],
      [
        [24 * HOUR, { includeSeconds: false }],
        ["x_days", 1],
      ],
      [
        [30 * DAY, { includeSeconds: false }],
        ["about_x_months", 1],
      ],
      [
        [60 * DAY, { includeSeconds: false }],
        ["x_months", 2],
      ],
      [
        [YEAR, { includeSeconds: false }],
        ["about_x_years", 1],
      ],
      [
        [3 * YEAR + 6 * MONTH, { includeSeconds: false }],
        ["over_x_years", 3],
      ],
      [
        [3 * YEAR + 10 * MONTH, { includeSeconds: false }],
        ["almost_x_years", 4],
      ],
    ];
    for (const [passed, expected] of cases) {
      assertDistanceOfTimeInWordsTranslatesKey(passed, expected);
    }
  });

  it("distance of time in words calls i18n with custom scope", () => {
    const cases: Array<[[number, Record<string, unknown>], [string, number]]> = [
      [
        [30 * DAY, { scope: "datetime.distance_in_words_ago" }],
        ["about_x_months", 1],
      ],
      [
        [60 * DAY, { scope: "datetime.distance_in_words_ago" }],
        ["x_months", 2],
      ],
    ];
    for (const [passed, expected] of cases) {
      assertDistanceOfTimeInWordsTranslatesKey(passed, expected, {
        scope: "datetime.distance_in_words_ago",
      });
    }
  });

  it("time ago in words passes locale", () => {
    assertCalledWith(
      I18n,
      "t",
      ["less_than_x_minutes", { scope: "datetime.distance_in_words", count: 1, locale: "ru" }],
      {},
      () => {
        timeAgoInWords(Time.now().minus(15) as Time, { locale: "ru" });
      },
    );
  });

  it("distance of time pluralizations", () => {
    const cases: Array<[[string, number], string]> = [
      [["less_than_x_seconds", 1], "less than 1 second"],
      [["less_than_x_seconds", 2], "less than 2 seconds"],
      [["less_than_x_minutes", 1], "less than a minute"],
      [["less_than_x_minutes", 2], "less than 2 minutes"],
      [["x_minutes", 1], "1 minute"],
      [["x_minutes", 2], "2 minutes"],
      [["about_x_hours", 1], "about 1 hour"],
      [["about_x_hours", 2], "about 2 hours"],
      [["x_days", 1], "1 day"],
      [["x_days", 2], "2 days"],
      [["about_x_years", 1], "about 1 year"],
      [["about_x_years", 2], "about 2 years"],
      [["over_x_years", 1], "over 1 year"],
      [["over_x_years", 2], "over 2 years"],
    ];
    for (const [args, expected] of cases) {
      const [key, count] = args;
      expect(I18n.t(key, { count, scope: "datetime.distance_in_words" })).toBe(expected);
    }
  });
});

describe("DateHelperSelectTagsI18nTests", () => {
  let view: Base & Record<string, any>;

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as Base &
      Record<string, any>;
  });

  it("select month given use month names option does not translate monthnames", () => {
    assertNotCalled(I18n, "translate", null, () => {
      selectMonth(8, { locale: "en", useMonthNames: RubyDate.MONTHNAMES });
    });
  });

  it("select month translates monthnames", () => {
    assertCalledWith(
      I18n,
      "translate",
      ["date.month_names", { locale: "en" }],
      { returns: RubyDate.MONTHNAMES },
      () => {
        selectMonth(8, { locale: "en" });
      },
    );
  });

  it("select month given use short month option translates abbr monthnames", () => {
    assertCalledWith(
      I18n,
      "translate",
      ["date.abbr_month_names", { locale: "en" }],
      { returns: RubyDate.ABBR_MONTHNAMES },
      () => {
        selectMonth(8, { locale: "en", useShortMonth: true });
      },
    );
  });

  it("select month with frozen month names", () => {
    const monthNames = RubyDate.MONTHNAMES.slice(1);
    const mock = new Mock();
    expectCalledWith(mock, ["date.month_names", { locale: "en" }], {
      returns: Object.freeze(monthNames),
    });

    stub(I18n, "translate", mock, [], () => {
      selectMonth(8, { locale: "en" });
    });

    assertMock(mock);
  });

  it("date or time select translates prompts", () => {
    const promptDefaults: Record<string, string> = {
      year: "Year",
      month: "Month",
      day: "Day",
      hour: "Hour",
      minute: "Minute",
      second: "Seconds",
    };
    const defaults = new Map<string, unknown>([
      [JSON.stringify(["date.order", { locale: "en", default: [] }]), ["year", "month", "day"]],
    ]);

    for (const [key, prompt] of Object.entries(promptDefaults)) {
      defaults.set(JSON.stringify(["datetime.prompts." + key, { locale: "en" }]), prompt);
    }

    let promptCalled = 0;
    const promptsCheck = (prompt: string, x: unknown) => {
      const returnValue = defaults.get(JSON.stringify([prompt, x]));
      if (isPresent(returnValue)) promptCalled += 1;

      return returnValue;
    };

    stub(I18n, "translate", promptsCheck, [], () => {
      view.datetimeSelect("post", "updated_at", {
        locale: "en",
        includeSeconds: true,
        prompt: true,
        useMonthNames: RubyDate.MONTHNAMES,
      });
    });
    expect(promptCalled).toBe(defaults.size);
  });

  it("date or time select given an order options does not translate order", () => {
    assertNotCalled(I18n, "translate", null, () => {
      view.datetimeSelect("post", "updated_at", {
        order: ["year", "month", "day"],
        locale: "en",
        useMonthNames: RubyDate.MONTHNAMES,
      });
    });
  });

  it("date or time select given no order options translates order", () => {
    const mock = new Mock();
    expectCalledWith(mock, ["date.order", { locale: "en", default: [] }], {
      returns: ["year", "month", "day"],
    });
    expectCalledWith(mock, ["date.month_names", { locale: "en" }], { returns: [] });

    stub(I18n, "translate", mock, [], () => {
      view.datetimeSelect("post", "updated_at", { locale: "en" });
    });

    assertMock(mock);
  });

  it("date or time select given invalid order", () => {
    assertCalledWith(
      I18n,
      "translate",
      ["date.order", { locale: "en", default: [] }],
      { returns: ["invalid", "month", "day"] },
      () => {
        expect(() => view.datetimeSelect("post", "updated_at", { locale: "en" })).toThrow(
          StandardError,
        );
      },
    );
  });

  it("date or time select given symbol keys", () => {
    const mock = new Mock();
    expectCalledWith(mock, ["date.order", { locale: "en", default: [] }], {
      returns: ["year", "month", "day"],
    });
    expectCalledWith(mock, ["date.month_names", { locale: "en" }], { returns: [] });

    stub(I18n, "translate", mock, [], () => {
      view.datetimeSelect("post", "updated_at", { locale: "en" });
    });

    assertMock(mock);
  });
});
