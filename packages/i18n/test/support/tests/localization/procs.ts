import { expect, it } from "vitest";
import { Date as RubyDate, DateTime as RubyDateTime, Time as RubyTime } from "@blazetrails/date";
import { rbInspect } from "@blazetrails/ruby-compat";
import { config, l } from "../../../../lib/i18n.js";

export function testsLocalizationProcs(): void {
  it("localize: using day names from lambdas", () => {
    setupTimeProcTranslations();
    const time = RubyTime.utc(2008, 3, 1, 6, 0);
    expect(l(time, { format: "%A, %d %B", locale: "ru" })).toMatch(/Суббота/);
    expect(l(time, { format: "%d %B (%A)", locale: "ru" })).toMatch(/суббота/);
  });

  it("localize: using month names from lambdas", () => {
    setupTimeProcTranslations();
    const time = RubyTime.utc(2008, 3, 1, 6, 0);
    expect(l(time, { format: "%d %B %Y", locale: "ru" })).toMatch(/марта/);
    expect(l(time, { format: "%B %Y", locale: "ru" })).toMatch(/Март /);
  });

  it("localize: using abbreviated day names from lambdas", () => {
    setupTimeProcTranslations();
    const time = RubyTime.utc(2008, 3, 1, 6, 0);
    expect(l(time, { format: "%d %b %Y", locale: "ru" })).toMatch(/марта/);
    expect(l(time, { format: "%b %Y", locale: "ru" })).toMatch(/март /);
  });

  it("localize Date: given a format that resolves to a Proc it calls the Proc with the object", () => {
    setupTimeProcTranslations();
    const date = new RubyDate(2008, 3, 1);
    expect(l(date, { format: ":proc", locale: "ru" })).toBe("[Sat, 01 Mar 2008, {}]");
  });

  it("localize Date: given a format that resolves to a Proc it calls the Proc with the object and extra options", () => {
    setupTimeProcTranslations();
    const date = new RubyDate(2008, 3, 1);
    expect(l(date, { format: ":proc", foo: "foo", locale: "ru" })).toBe(
      `[Sat, 01 Mar 2008, ${rbInspect({ foo: "foo" })}]`,
    );
  });

  it("localize DateTime: given a format that resolves to a Proc it calls the Proc with the object", () => {
    setupTimeProcTranslations();
    const datetime = new RubyDateTime(2008, 3, 1, 6);
    expect(l(datetime, { format: ":proc", locale: "ru" })).toBe(
      "[Sat, 01 Mar 2008 06:00:00 +00:00, {}]",
    );
  });

  it("localize DateTime: given a format that resolves to a Proc it calls the Proc with the object and extra options", () => {
    setupTimeProcTranslations();
    const datetime = new RubyDateTime(2008, 3, 1, 6);
    expect(l(datetime, { format: ":proc", foo: "foo", locale: "ru" })).toBe(
      `[Sat, 01 Mar 2008 06:00:00 +00:00, ${rbInspect({ foo: "foo" })}]`,
    );
  });

  it("localize Time: given a format that resolves to a Proc it calls the Proc with the object", () => {
    setupTimeProcTranslations();
    const time = RubyTime.utc(2008, 3, 1, 6, 0);
    expect(l(time, { format: ":proc", locale: "ru" })).toBe(inspectArgs([time], {}));
  });

  it("localize Time: given a format that resolves to a Proc it calls the Proc with the object and extra options", () => {
    setupTimeProcTranslations();
    const time = RubyTime.utc(2008, 3, 1, 6, 0);
    const options = { foo: "foo" };
    expect(l(time, { ...options, format: ":proc", locale: "ru" })).toBe(
      inspectArgs([time], options),
    );
  });
}

export function inspectArgs(args: unknown[], kwargs: Record<string, unknown>): string {
  args.push(kwargs);
  args = args.map((arg) => {
    if (arg instanceof RubyTime || arg instanceof RubyDateTime) {
      return arg.strftime("%a, %d %b %Y %H:%M:%S %Z").replace("+0000", "+00:00");
    } else if (arg instanceof RubyDate) {
      return arg.strftime("%a, %d %b %Y");
    } else if (arg != null && typeof arg === "object") {
      const hash = arg as Record<string, unknown>;
      delete hash.fallbackInProgress;
      delete hash.fallbackOriginalLocale;
      return rbInspect(arg);
    } else {
      return rbInspect(arg);
    }
  });
  return `[${args.join(", ")}]`;
}

export function setupTimeProcTranslations(): void {
  config().backend.storeTranslations("ru", {
    time: {
      formats: {
        proc: (...args: unknown[]) =>
          inspectArgs(args.slice(0, -1), args.at(-1) as Record<string, unknown>),
      },
    },
    date: {
      formats: {
        proc: (...args: unknown[]) =>
          inspectArgs(args.slice(0, -1), args.at(-1) as Record<string, unknown>),
      },
      day_names: (_key: unknown, options: { format: string }) =>
        /^%A/.test(options.format)
          ? ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]
          : ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
      month_names: (_key: unknown, options: { format: string }) =>
        /(%d|%e)(\s*)?(%B)/.test(options.format)
          ? [
              null,
              "января",
              "февраля",
              "марта",
              "апреля",
              "мая",
              "июня",
              "июля",
              "августа",
              "сентября",
              "октября",
              "ноября",
              "декабря",
            ]
          : [
              null,
              "Январь",
              "Февраль",
              "Март",
              "Апрель",
              "Май",
              "Июнь",
              "Июль",
              "Август",
              "Сентябрь",
              "Октябрь",
              "Ноябрь",
              "Декабрь",
            ],
      abbr_month_names: (_key: unknown, options: { format: string }) =>
        /(%d|%e)(\s*)(%b)/.test(options.format)
          ? [
              null,
              "янв.",
              "февр.",
              "марта",
              "апр.",
              "мая",
              "июня",
              "июля",
              "авг.",
              "сент.",
              "окт.",
              "нояб.",
              "дек.",
            ]
          : [
              null,
              "янв.",
              "февр.",
              "март",
              "апр.",
              "май",
              "июнь",
              "июль",
              "авг.",
              "сент.",
              "окт.",
              "нояб.",
              "дек.",
            ],
    },
  });
}
