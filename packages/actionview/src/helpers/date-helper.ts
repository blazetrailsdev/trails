import {
  I18n,
  extractOptionsBang,
  htmlSafe,
  reverseMerge,
  isPlainObject,
  withOptions,
  type SafeBuffer,
  type TimeWithZone,
} from "@blazetrails/activesupport";
import { Date as RubyDate, Temporal, Time } from "@blazetrails/date";
import {
  ArgumentError,
  StandardError,
  format,
  hashDelete,
  include,
  type Included,
  rbFPublicSend,
  rbInspect,
  rbObjRespondTo,
  Range,
  rbBlockGivenP,
  rbFSend,
  rbModDefineMethod,
  rtest,
  type Block,
  sprintf,
} from "@blazetrails/ruby-compat";

import "../action-view.js";
import { Tags } from "../namespaces.js";
import { FormBuilder } from "./form-helper.js";
import { TagHelper } from "./tag-helper.js";

const MINUTES_IN_YEAR = 525600;
const MINUTES_IN_QUARTER_YEAR = 131400;
const MINUTES_IN_THREE_QUARTERS_YEAR = 394200;

export type DistanceOfTimeInput = Date | number | Temporal.Instant | Time | TimeWithZone;

export interface DistanceOfTimeOptions {
  includeSeconds?: boolean;
  scope?: string;
  locale?: string;
}

export function distanceOfTimeInWords(
  fromTime: DistanceOfTimeInput,
  toTime: DistanceOfTimeInput = 0,
  options: DistanceOfTimeOptions = {},
): string {
  options = { scope: "datetime.distance_in_words", ...options };

  fromTime = normalizeDistanceOfTimeArgumentToTime(fromTime);
  toTime = normalizeDistanceOfTimeArgumentToTime(toTime);
  if (fromTime.compare(toTime)! > 0) {
    [fromTime, toTime] = [toTime, fromTime];
  }
  const distanceInMinutes = Math.round((toTime.minus(fromTime) as number) / 60.0);
  const distanceInSeconds = Math.round(toTime.minus(fromTime) as number);

  return withOptions(I18n, { locale: options.locale, scope: options.scope }, (locale) => {
    if (distanceInMinutes <= 1) {
      if (!options.includeSeconds) {
        return distanceInMinutes === 0
          ? locale.t("less_than_x_minutes", { count: 1 })
          : locale.t("x_minutes", { count: distanceInMinutes });
      }
      if (distanceInSeconds <= 4) return locale.t("less_than_x_seconds", { count: 5 });
      if (distanceInSeconds <= 9) return locale.t("less_than_x_seconds", { count: 10 });
      if (distanceInSeconds <= 19) return locale.t("less_than_x_seconds", { count: 20 });
      if (distanceInSeconds <= 39) return locale.t("half_a_minute");
      if (distanceInSeconds <= 59) return locale.t("less_than_x_minutes", { count: 1 });
      return locale.t("x_minutes", { count: 1 });
    }
    if (distanceInMinutes < 45) return locale.t("x_minutes", { count: distanceInMinutes });
    if (distanceInMinutes < 90) return locale.t("about_x_hours", { count: 1 });
    if (distanceInMinutes < 1440)
      return locale.t("about_x_hours", { count: Math.round(distanceInMinutes / 60) });
    if (distanceInMinutes < 2520) return locale.t("x_days", { count: 1 });
    if (distanceInMinutes < 43200)
      return locale.t("x_days", { count: Math.round(distanceInMinutes / 1440) });
    if (distanceInMinutes < 86400)
      return locale.t("about_x_months", { count: Math.round(distanceInMinutes / 43200) });
    if (distanceInMinutes < 525600)
      return locale.t("x_months", { count: Math.round(distanceInMinutes / 43200) });

    let fromYear = fromTime.year;
    if (fromTime.month >= 3) fromYear += 1;
    let toYear = toTime.year;
    if (toTime.month < 3) toYear -= 1;
    const leapYears =
      fromYear > toYear
        ? 0
        : new Range(fromYear, toYear).toA().filter((x) => RubyDate.isLeap(x)).length;
    const minuteOffsetForLeapYear = leapYears * 1440;
    const minutesWithOffset = distanceInMinutes - minuteOffsetForLeapYear;
    const remainder = ((minutesWithOffset % MINUTES_IN_YEAR) + MINUTES_IN_YEAR) % MINUTES_IN_YEAR;
    const distanceInYears = Math.trunc(minutesWithOffset / MINUTES_IN_YEAR);
    if (remainder < MINUTES_IN_QUARTER_YEAR)
      return locale.t("about_x_years", { count: distanceInYears });
    if (remainder < MINUTES_IN_THREE_QUARTERS_YEAR)
      return locale.t("over_x_years", { count: distanceInYears });
    return locale.t("almost_x_years", { count: distanceInYears + 1 });
  }) as string;
}

/** @internal */
function normalizeDistanceOfTimeArgumentToTime(value: DistanceOfTimeInput): Time {
  if (typeof value === "number") {
    return Time.at(value);
  } else if (rbObjRespondTo(value, "toTime")) {
    return rbFSend(value, "toTime") as Time;
  } else {
    throw new ArgumentError(`${rbInspect(value)} can't be converted to a Time value`);
  }
}

export function timeAgoInWords(
  fromTime: Exclude<DistanceOfTimeInput, number>,
  options: DistanceOfTimeOptions = {},
): string {
  // boundary: "now" sentinel — JS Date is the canonical wall-clock source here.
  return distanceOfTimeInWords(fromTime, new Date(), options);
}

export const distanceOfTimeInWordsToNow = timeAgoInWords;

type Opts = Record<string, unknown>;

export function dateSelect(
  this: unknown,
  objectName: unknown,
  method: unknown,
  options: Opts = {},
  htmlOptions: Opts = {},
): unknown {
  return new Tags.DateSelect(objectName, method, this, options, htmlOptions).render();
}

export function timeSelect(
  this: unknown,
  objectName: unknown,
  method: unknown,
  options: Opts = {},
  htmlOptions: Opts = {},
): unknown {
  return new Tags.TimeSelect(objectName, method, this, options, htmlOptions).render();
}

export function datetimeSelect(
  this: unknown,
  objectName: unknown,
  method: unknown,
  options: Opts = {},
  htmlOptions: Opts = {},
): unknown {
  return new Tags.DatetimeSelect(objectName, method, this, options, htmlOptions).render();
}

export function selectDatetime(
  datetime: unknown = Time.current(),
  options: Opts = {},
  htmlOptions: Opts = {},
): SafeBuffer {
  return new DateTimeSelector(datetime, options, htmlOptions).selectDatetime();
}

export function selectDate(
  date: unknown = RubyDate.current(),
  options: Opts = {},
  htmlOptions: Opts = {},
): SafeBuffer {
  return new DateTimeSelector(date, options, htmlOptions).selectDate();
}

export function selectTime(
  datetime: unknown = Time.current(),
  options: Opts = {},
  htmlOptions: Opts = {},
): SafeBuffer {
  return new DateTimeSelector(datetime, options, htmlOptions).selectTime();
}

export function selectSecond(
  datetime: unknown,
  options: Opts = {},
  htmlOptions: Opts = {},
): SafeBuffer | undefined {
  return new DateTimeSelector(datetime, options, htmlOptions).selectSecond();
}

export function selectMinute(
  datetime: unknown,
  options: Opts = {},
  htmlOptions: Opts = {},
): SafeBuffer {
  return new DateTimeSelector(datetime, options, htmlOptions).selectMinute();
}

export function selectHour(
  datetime: unknown,
  options: Opts = {},
  htmlOptions: Opts = {},
): SafeBuffer {
  return new DateTimeSelector(datetime, options, htmlOptions).selectHour();
}

export function selectDay(date: unknown, options: Opts = {}, htmlOptions: Opts = {}): SafeBuffer {
  return new DateTimeSelector(date, options, htmlOptions).selectDay();
}

export function selectMonth(date: unknown, options: Opts = {}, htmlOptions: Opts = {}): SafeBuffer {
  return new DateTimeSelector(date, options, htmlOptions).selectMonth();
}

export function selectYear(date: unknown, options: Opts = {}, htmlOptions: Opts = {}): SafeBuffer {
  return new DateTimeSelector(date, options, htmlOptions).selectYear();
}

export function timeTag(
  this: { contentTag(...args: unknown[]): SafeBuffer },
  dateOrTime: { iso8601(): string },
  ...args: Array<string | SafeBuffer | Record<string, unknown> | Block<unknown>>
): SafeBuffer {
  const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as Block<unknown>) : undefined;
  const options = extractOptionsBang(args);
  const deleted = hashDelete(options, "format");
  const format = rtest(deleted) ? deleted : ":long";
  const content = rtest(args[0]) ? args[0] : I18n.l(dateOrTime, { format });

  return this.contentTag(
    "time",
    content,
    reverseMerge(options, { datetime: dateOrTime.iso8601() }),
    undefined,
    block,
  );
}

export const DateHelper = {
  distanceOfTimeInWords,
  distanceOfTimeInWordsToNow,
  timeAgoInWords,
  dateSelect,
  timeSelect,
  datetimeSelect,
  selectDatetime,
  selectDate,
  selectTime,
  selectSecond,
  selectMinute,
  selectHour,
  selectDay,
  selectMonth,
  selectYear,
  timeTag,
};

type DateType = "year" | "month" | "day" | "hour" | "minute" | "second";

function isRubyTruthy(value: unknown): boolean {
  return value != null && value !== false;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ActionView::Helpers::TagHelper` (date_helper.rb:711); the class/interface merge is how the mixin surfaces on the type side.
export class DateTimeSelector {
  static DEFAULT_PREFIX = "date";
  static POSITION: Readonly<Record<DateType, number>> = Object.freeze({
    year: 1,
    month: 2,
    day: 3,
    hour: 4,
    minute: 5,
    second: 6,
  });

  static AMPM_TRANSLATION: Readonly<Record<number, string>> = Object.freeze({
    0: "12 AM",
    1: "01 AM",
    2: "02 AM",
    3: "03 AM",
    4: "04 AM",
    5: "05 AM",
    6: "06 AM",
    7: "07 AM",
    8: "08 AM",
    9: "09 AM",
    10: "10 AM",
    11: "11 AM",
    12: "12 PM",
    13: "01 PM",
    14: "02 PM",
    15: "03 PM",
    16: "04 PM",
    17: "05 PM",
    18: "06 PM",
    19: "07 PM",
    20: "08 PM",
    21: "09 PM",
    22: "10 PM",
    23: "11 PM",
  });

  private _options: Record<string, unknown>;
  private _htmlOptions: Record<string, unknown>;
  private _datetime: unknown;
  private _monthNames?: unknown[];
  private _dateOrder?: string[];

  constructor(
    datetime: unknown,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
  ) {
    this._options = { ...options };
    this._htmlOptions = { ...htmlOptions };
    this._datetime = datetime;
    this._options.datetimeSeparator = isRubyTruthy(this._options.datetimeSeparator)
      ? this._options.datetimeSeparator
      : " &mdash; ";
    this._options.timeSeparator = isRubyTruthy(this._options.timeSeparator)
      ? this._options.timeSeparator
      : " : ";
  }

  selectDatetime(): SafeBuffer {
    let order = [...this.dateOrder()];
    order = order.filter((o) => !["hour", "minute", "second"].includes(o));
    if (!order.includes("year"))
      if (!isRubyTruthy(this._options.discardYear)) this._options.discardYear = true;
    if (!order.includes("month"))
      if (!isRubyTruthy(this._options.discardMonth)) this._options.discardMonth = true;
    if (isRubyTruthy(this._options.discardMonth) || !order.includes("day"))
      if (!isRubyTruthy(this._options.discardDay)) this._options.discardDay = true;
    if (isRubyTruthy(this._options.discardHour))
      if (!isRubyTruthy(this._options.discardMinute)) this._options.discardMinute = true;
    if (!(isRubyTruthy(this._options.includeSeconds) && !isRubyTruthy(this._options.discardMinute)))
      if (!isRubyTruthy(this._options.discardSecond)) this._options.discardSecond = true;

    this.setDayIfDiscarded();

    if (isRubyTruthy(this._options.tag) && isRubyTruthy(this._options.ignoreDate)) {
      return this.selectTime();
    } else {
      for (const o of ["day", "month", "year"]) if (!order.includes(o)) order.unshift(o);
      if (!isRubyTruthy(this._options.discardHour)) order = [...order, "hour", "minute", "second"];

      return this.buildSelectsFromTypes(order);
    }
  }

  selectDate(): SafeBuffer {
    const order = [...this.dateOrder()];

    this._options.discardHour = true;
    this._options.discardMinute = true;
    this._options.discardSecond = true;

    if (!order.includes("year"))
      if (!isRubyTruthy(this._options.discardYear)) this._options.discardYear = true;
    if (!order.includes("month"))
      if (!isRubyTruthy(this._options.discardMonth)) this._options.discardMonth = true;
    if (isRubyTruthy(this._options.discardMonth) || !order.includes("day"))
      if (!isRubyTruthy(this._options.discardDay)) this._options.discardDay = true;

    this.setDayIfDiscarded();

    for (const o of ["day", "month", "year"]) if (!order.includes(o)) order.unshift(o);

    return this.buildSelectsFromTypes(order);
  }

  selectTime(): SafeBuffer {
    let order: string[] = [];

    this._options.discardMonth = true;
    this._options.discardYear = true;
    this._options.discardDay = true;
    if (!isRubyTruthy(this._options.includeSeconds))
      if (!isRubyTruthy(this._options.discardSecond)) this._options.discardSecond = true;

    if (!isRubyTruthy(this._options.ignoreDate)) order = [...order, "year", "month", "day"];

    order = [...order, "hour", "minute"];
    if (isRubyTruthy(this._options.includeSeconds)) order.push("second");

    return this.buildSelectsFromTypes(order);
  }

  selectSecond(): SafeBuffer | undefined {
    if (isRubyTruthy(this._options.useHidden) || isRubyTruthy(this._options.discardSecond)) {
      if (isRubyTruthy(this._options.includeSeconds)) return this.buildHidden("second", this.sec());
      return undefined;
    } else {
      return this.buildOptionsAndSelect("second", this.sec());
    }
  }

  selectMinute(): SafeBuffer {
    if (isRubyTruthy(this._options.useHidden) || isRubyTruthy(this._options.discardMinute)) {
      return this.buildHidden("minute", this.min());
    } else {
      return this.buildOptionsAndSelect("minute", this.min(), { step: this._options.minuteStep });
    }
  }

  selectHour(): SafeBuffer {
    if (isRubyTruthy(this._options.useHidden) || isRubyTruthy(this._options.discardHour)) {
      return this.buildHidden("hour", this.hour());
    } else {
      const options: Record<string, unknown> = {};
      options.ampm = isRubyTruthy(this._options.ampm) ? this._options.ampm : false;
      options.start = isRubyTruthy(this._options.startHour) ? this._options.startHour : 0;
      options.end = isRubyTruthy(this._options.endHour) ? this._options.endHour : 23;
      return this.buildOptionsAndSelect("hour", this.hour(), options);
    }
  }

  selectDay(): SafeBuffer {
    if (isRubyTruthy(this._options.useHidden) || isRubyTruthy(this._options.discardDay)) {
      return this.buildHidden("day", isRubyTruthy(this.day()) ? this.day() : 1);
    } else {
      return this.buildSelect("day", this.buildDayOptions(this.day()));
    }
  }

  selectMonth(): SafeBuffer {
    if (isRubyTruthy(this._options.useHidden) || isRubyTruthy(this._options.discardMonth)) {
      return this.buildHidden("month", isRubyTruthy(this.month()) ? this.month() : 1);
    } else {
      const monthOptions: string[] = [];
      for (let monthNumber = 1; monthNumber <= 12; monthNumber++) {
        const options: Record<string, unknown> = { value: monthNumber };
        if (this.month() === monthNumber) options.selected = "selected";
        monthOptions.push(
          this.contentTag("option", this.monthName(monthNumber), options).plus("\n").toString(),
        );
      }
      return this.buildSelect("month", htmlSafe(monthOptions.join("")));
    }
  }

  selectYear(): SafeBuffer {
    let val: unknown;
    let middleYear: number;
    if (!isRubyTruthy(this.year()) || this._datetime === 0) {
      val = "1";
      middleYear = Number(RubyDate.today().year);
    } else {
      val = middleYear = this.year() as number;
    }

    if (isRubyTruthy(this._options.useHidden) || isRubyTruthy(this._options.discardYear)) {
      return this.buildHidden("year", val);
    } else {
      const options: Record<string, number> = {};
      options.start = isRubyTruthy(this._options.startYear)
        ? (this._options.startYear as number)
        : middleYear - 5;
      options.end = isRubyTruthy(this._options.endYear)
        ? (this._options.endYear as number)
        : middleYear + 5;
      options.step = options.start < options.end ? 1 : -1;

      const maxYearsAllowed = isRubyTruthy(this._options.maxYearsAllowed)
        ? (this._options.maxYearsAllowed as number)
        : 1000;

      if (Math.abs(options.end - options.start) > maxYearsAllowed) {
        throw new ArgumentError(
          "There are too many years options to be built. Are you sure you haven't mistyped something? You can provide the :max_years_allowed parameter.",
        );
      }

      return this.buildSelect("year", this.buildYearOptions(val, options));
    }
  }

  static {
    for (const method of ["sec", "min", "hour", "day", "month", "year"]) {
      Object.defineProperty(this.prototype, method, {
        value(this: { _datetime: unknown }): unknown {
          const datetime = this._datetime;
          if (isPlainObject(datetime)) {
            return (datetime as Record<string, unknown>)[method];
          } else if (typeof datetime === "number") {
            return datetime;
          } else if (datetime == null) {
            return null;
          } else {
            return rbFSend(datetime, method);
          }
        },
        writable: true,
        configurable: true,
      });
    }
  }

  /** @internal */
  private promptText(prompt: unknown, type: string): unknown {
    return typeof prompt === "string"
      ? prompt
      : I18n.translate(`datetime.prompts.${type}`, { locale: this._options.locale as string });
  }

  /** @internal */
  private setDayIfDiscarded(): void {
    if (isRubyTruthy(this._datetime) && isRubyTruthy(this._options.discardDay)) {
      this._datetime = rbFSend(this._datetime, "change", { day: 1 });
    }
  }

  /** @internal */
  private monthNames(): unknown[] {
    return (this._monthNames ??= (() => {
      let monthNames = (
        isRubyTruthy(this._options.useMonthNames)
          ? this._options.useMonthNames
          : this.translatedMonthNames()
      ) as unknown[];
      if (monthNames.length < 13) monthNames = [null, ...monthNames];
      return monthNames;
    })());
  }

  /** @internal */
  private translatedMonthNames(): unknown {
    const key = isRubyTruthy(this._options.useShortMonth)
      ? "date.abbr_month_names"
      : "date.month_names";
    return I18n.translate(key, { locale: this._options.locale as string });
  }

  /** @internal */
  private dayName(number: number): unknown {
    const dayFormatLambda = this._options.dayFormat as ((n: number) => unknown) | undefined;
    if (isRubyTruthy(dayFormatLambda)) {
      return dayFormatLambda!(number);
    } else if (isRubyTruthy(this._options.useTwoDigitNumbers)) {
      return format("%02d", number);
    } else {
      return number;
    }
  }

  /** @internal */
  private monthName(number: number): unknown {
    let formatString: unknown;
    if (isRubyTruthy(this._options.useMonthNumbers)) {
      return number;
    } else if (isRubyTruthy(this._options.useTwoDigitNumbers)) {
      return format("%02d", number);
    } else if (isRubyTruthy(this._options.addMonthNumbers)) {
      return `${number} - ${this.monthNames()[number]}`;
    } else if (isRubyTruthy((formatString = this._options.monthFormatString))) {
      return format(formatString as string, { number, name: this.monthNames()[number] });
    } else {
      return this.monthNames()[number];
    }
  }

  /** @internal */
  private yearName(number: number): unknown {
    const yearFormatLambda = this._options.yearFormat as ((n: number) => unknown) | undefined;
    if (isRubyTruthy(yearFormatLambda)) {
      return yearFormatLambda!(number);
    } else {
      return number;
    }
  }

  /** @internal */
  private dateOrder(): string[] {
    return (this._dateOrder ??= isRubyTruthy(this._options.order)
      ? (this._options.order as string[])
      : this.translatedDateOrder());
  }

  /** @internal */
  private translatedDateOrder(): string[] {
    let dateOrder = I18n.translate("date.order", {
      locale: this._options.locale as string,
      default: [],
    }) as unknown[];
    dateOrder = dateOrder.map((o) => String(o));

    const forbiddenElements = dateOrder.filter(
      (o) => !["year", "month", "day"].includes(o as string),
    );
    if (forbiddenElements.length > 0) {
      throw new StandardError(
        `${String(this._options.locale ?? "")}.date.order only accepts :year, :month and :day`,
      );
    }

    return dateOrder as string[];
  }

  /** @internal */
  private buildOptionsAndSelect(
    type: DateType,
    selected: unknown,
    options: Record<string, unknown> = {},
  ): SafeBuffer {
    return this.buildSelect(type, this.buildOptions(selected, options));
  }

  /** @internal */
  private buildOptions(selected: unknown, options: Record<string, unknown> = {}): SafeBuffer {
    options = Object.assign(
      { leadingZeros: true, ampm: false, useTwoDigitNumbers: false },
      options,
    );

    const start = isRubyTruthy(options.start) ? (options.start as number) : 0;
    delete options.start;
    const stop = isRubyTruthy(options.end) ? (options.end as number) : 59;
    delete options.end;
    const step = isRubyTruthy(options.step) ? (options.step as number) : 1;
    delete options.step;
    const leadingZeros = options.leadingZeros;
    delete options.leadingZeros;

    const selectOptions: SafeBuffer[] = [];
    for (let i = start; i <= stop; i += step) {
      const value = isRubyTruthy(leadingZeros) ? sprintf("%02d", i) : i;
      const tagOptions: Record<string, unknown> = { value };
      if (selected === i) tagOptions.selected = "selected";
      let text: unknown = isRubyTruthy(options.useTwoDigitNumbers) ? sprintf("%02d", i) : value;
      text = isRubyTruthy(options.ampm) ? DateTimeSelector.AMPM_TRANSLATION[i] : text;
      selectOptions.push(this.contentTag("option", text, tagOptions));
    }

    return htmlSafe(selectOptions.join("\n") + "\n");
  }

  /** @internal */
  private buildDayOptions(selected: unknown): SafeBuffer {
    const selectOptions: SafeBuffer[] = [];
    for (let value = 1; value <= 31; value++) {
      const tagOptions: Record<string, unknown> = { value };
      if (selected === value) tagOptions.selected = "selected";
      const text = this.dayName(value);
      selectOptions.push(this.contentTag("option", text, tagOptions));
    }

    return htmlSafe(selectOptions.join("\n") + "\n");
  }

  /** @internal */
  private buildYearOptions(selected: unknown, options: Record<string, number> = {}): SafeBuffer {
    const start = options.start;
    delete options.start;
    const stop = options.end;
    delete options.end;
    const step = options.step;
    delete options.step;

    const selectOptions: SafeBuffer[] = [];
    for (let value = start; step > 0 ? value <= stop : value >= stop; value += step) {
      const tagOptions: Record<string, unknown> = { value };
      if (selected === value) tagOptions.selected = "selected";
      const text = this.yearName(value);
      selectOptions.push(this.contentTag("option", text, tagOptions));
    }

    return htmlSafe(selectOptions.join("\n") + "\n");
  }

  /** @internal */
  private buildSelect(type: DateType, selectOptionsAsHtml: SafeBuffer): SafeBuffer {
    const selectOptions: Record<string, unknown> = Object.assign(
      { id: this.inputIdFromType(type), name: this.inputNameFromType(type) },
      this._htmlOptions,
    );
    if (isRubyTruthy(this._options.disabled)) selectOptions.disabled = "disabled";
    if (isRubyTruthy(this._options.withCssClasses))
      selectOptions.class = this.cssClassAttribute(
        type,
        selectOptions.class,
        this._options.withCssClasses,
      );

    let selectHtml = "\n";
    if (isRubyTruthy(this._options.includeBlank))
      selectHtml += this.contentTag("option", "", { value: "", label: " " }) + "\n";
    if (isRubyTruthy(this._options.prompt))
      selectHtml += this.promptOptionTag(type, this._options.prompt) + "\n";
    selectHtml += selectOptionsAsHtml;

    return htmlSafe(this.contentTag("select", htmlSafe(selectHtml), selectOptions) + "\n");
  }

  /** @internal */
  private cssClassAttribute(type: DateType, htmlOptionsClass: unknown, options: unknown): string {
    let cssClass: unknown;
    if (isPlainObject(options)) {
      cssClass = (options as Record<string, unknown>)[type];
    } else {
      cssClass = type;
    }

    return [htmlOptionsClass, cssClass].filter((c) => c != null).join(" ");
  }

  /** @internal */
  private promptOptionTag(type: DateType, options: unknown): SafeBuffer | string {
    let prompt: unknown;
    if (isPlainObject(options)) {
      const defaultOptions: Record<string, unknown> = {
        year: false,
        month: false,
        day: false,
        hour: false,
        minute: false,
        second: false,
      };
      prompt = Object.assign(defaultOptions, options)[type];
    } else if (typeof options === "string") {
      prompt = options;
    } else {
      prompt = I18n.translate(`datetime.prompts.${type}`, {
        locale: this._options.locale as string,
      });
    }

    return isRubyTruthy(prompt)
      ? this.contentTag("option", this.promptText(prompt, type), { value: "" })
      : "";
  }

  /** @internal */
  private buildHidden(type: DateType, value: unknown): SafeBuffer {
    const selectOptions: Record<string, unknown> = Object.assign(
      {
        type: "hidden",
        id: this.inputIdFromType(type),
        name: this.inputNameFromType(type),
        value,
        autocomplete: "off",
      },
      Object.hasOwn(this._htmlOptions, "disabled") ? { disabled: this._htmlOptions.disabled } : {},
    );
    if (isRubyTruthy(this._options.disabled)) selectOptions.disabled = "disabled";

    return this.tag("input", selectOptions).plus("\n");
  }

  /** @internal */
  private inputNameFromType(type: DateType): string {
    let prefix = isRubyTruthy(this._options.prefix)
      ? (this._options.prefix as string)
      : DateTimeSelector.DEFAULT_PREFIX;
    if (Object.hasOwn(this._options, "index")) prefix += `[${String(this._options.index)}]`;

    let fieldName = isRubyTruthy(this._options.fieldName)
      ? (this._options.fieldName as string)
      : type;
    if (isRubyTruthy(this._options.includePosition)) {
      fieldName += `(${DateTimeSelector.POSITION[type]}i)`;
    }

    return isRubyTruthy(this._options.discardType) ? prefix : `${prefix}[${fieldName}]`;
  }

  /** @internal */
  private inputIdFromType(type: DateType): string {
    let id = this.inputNameFromType(type)
      .replace(/([[(])|(\]\[)/g, "_")
      .replace(/[\])]/g, "");
    if (isRubyTruthy(this._options.namespace)) id = `${String(this._options.namespace)}_${id}`;

    return id;
  }

  /** @internal */
  private buildSelectsFromTypes(order: string[]): SafeBuffer {
    let select = "";
    const firstVisible = order.find(
      (type) =>
        !isRubyTruthy(this._options[`discard${type.charAt(0).toUpperCase()}${type.slice(1)}`]),
    );
    for (const type of [...order].reverse()) {
      let separator: unknown;
      if (type !== firstVisible) separator = this.separator(type as DateType);
      select =
        String(separator ?? "") +
        String(rbFPublicSend(this, `select${type.charAt(0).toUpperCase()}${type.slice(1)}`) ?? "") +
        select;
    }
    return htmlSafe(select);
  }

  /** @internal */
  private separator(type: DateType): unknown {
    if (isRubyTruthy(this._options.useHidden)) return "";

    switch (type) {
      case "year":
      case "month":
      case "day":
        return isRubyTruthy(this._options[`discard${type.charAt(0).toUpperCase()}${type.slice(1)}`])
          ? ""
          : this._options.dateSeparator;
      case "hour":
        return isRubyTruthy(this._options.discardYear) && isRubyTruthy(this._options.discardDay)
          ? ""
          : this._options.datetimeSeparator;
      case "minute":
      case "second":
        return isRubyTruthy(this._options[`discard${type.charAt(0).toUpperCase()}${type.slice(1)}`])
          ? ""
          : this._options.timeSeparator;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface DateTimeSelector extends Omit<Included<typeof import("./tag-helper.js")>, "tag"> {
  tag(
    name: string,
    options?: Record<string, unknown> | null,
    open?: boolean,
    escape?: boolean,
  ): SafeBuffer;
  /** @internal */
  sec(): unknown;
  /** @internal */
  min(): unknown;
  /** @internal */
  hour(): unknown;
  /** @internal */
  day(): unknown;
  /** @internal */
  month(): unknown;
  /** @internal */
  year(): unknown;
}

include(DateTimeSelector, TagHelper);

declare module "./form-helper.js" {
  interface FormBuilder {
    dateSelect(method: unknown, options?: Opts, htmlOptions?: Opts): unknown;
    timeSelect(method: unknown, options?: Opts, htmlOptions?: Opts): unknown;
    datetimeSelect(method: unknown, options?: Opts, htmlOptions?: Opts): unknown;
  }
}

type FormBuilderSelf = {
  objectName: unknown;
  _template: Record<string, (...args: unknown[]) => unknown>;
  objectifyOptions(options: Opts): Opts;
};

rbModDefineMethod(
  FormBuilder,
  "dateSelect",
  function (this: FormBuilderSelf, method: unknown, options: Opts = {}, htmlOptions: Opts = {}) {
    return this._template.dateSelect(
      this.objectName,
      method,
      this.objectifyOptions(options),
      htmlOptions,
    );
  },
);

rbModDefineMethod(
  FormBuilder,
  "timeSelect",
  function (this: FormBuilderSelf, method: unknown, options: Opts = {}, htmlOptions: Opts = {}) {
    return this._template.timeSelect(
      this.objectName,
      method,
      this.objectifyOptions(options),
      htmlOptions,
    );
  },
);

rbModDefineMethod(
  FormBuilder,
  "datetimeSelect",
  function (this: FormBuilderSelf, method: unknown, options: Opts = {}, htmlOptions: Opts = {}) {
    return this._template.datetimeSelect(
      this.objectName,
      method,
      this.objectifyOptions(options),
      htmlOptions,
    );
  },
);
