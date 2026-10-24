import { Date as RubyDate, type Time as RubyTime } from "@blazetrails/date";
import {
  ArgumentError,
  compact,
  last,
  rbObjClassname,
  rbObjRespondTo,
  RuntimeError,
  sort,
  STDOUT,
} from "@blazetrails/ruby-compat";
import { Grabber } from "./grabber.js";
import { Chronic } from "./namespaces.js";
import { Ordinal, OrdinalDay } from "./ordinal.js";
import type { Parser } from "./parser.js";
import { Pointer } from "./pointer.js";
import { Repeater } from "./repeater.js";
import { RepeaterDayPortion } from "./repeaters/repeater-day-portion.js";
import { RepeaterMonth } from "./repeaters/repeater-month.js";
import { RepeaterMonthName } from "./repeaters/repeater-month-name.js";
import { RepeaterTime } from "./repeaters/repeater-time.js";
import { Scalar, ScalarDay, ScalarMonth, ScalarYear } from "./scalar.js";
import { Span } from "./span.js";
import { Token } from "./token.js";

type Options = Record<string, unknown>;

interface OffsetRepeater extends Repeater {
  offset(span: Span, amount: number, pointer: string): Span;
}

export const Handlers = {
  handleMD(
    this: Parser,
    month: Repeater | number,
    day: number,
    timeTokens: Token[],
    options: Options,
  ): Span | null {
    (month as Repeater).start = this.now;
    const span = (month as Repeater).this(options.context as string)!;
    const year = span.begin!.year;
    month = span.begin!.month;
    const dayStart = Chronic.timeClass().local(year, month, day);

    return this.dayOrTime(dayStart, timeTokens, options);
  },

  handleRmnSd(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[0].getTag(RepeaterMonthName)!;
    const day = tokens[1].getTag(ScalarDay)!.type;

    if (this.isMonthOverflow(this.now.year, month.index(), day)) return null;

    return this.handleMD(month, day, tokens.slice(2), options);
  },

  handleRmnSdOn(this: Parser, tokens: Token[], options: Options): Span | null {
    let month: RepeaterMonthName, day: number, tokenRange: [number, number];
    if (tokens.length > 3) {
      month = tokens[2].getTag(RepeaterMonthName)!;
      day = tokens[3].getTag(ScalarDay)!.type;
      tokenRange = [0, 1];
    } else {
      month = tokens[1].getTag(RepeaterMonthName)!;
      day = tokens[2].getTag(ScalarDay)!.type;
      tokenRange = [0, 0];
    }

    if (this.isMonthOverflow(this.now.year, month.index(), day)) return null;

    return this.handleMD(month, day, tokens.slice(tokenRange[0], tokenRange[1] + 1), options);
  },

  handleRmnOd(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[0].getTag(RepeaterMonthName)!;
    const day = tokens[1].getTag(OrdinalDay)!.type;

    if (this.isMonthOverflow(this.now.year, month.index(), day)) return null;

    return this.handleMD(month, day, tokens.slice(2), options);
  },

  handleOdRm(this: Parser, tokens: Token[], options: Options): Span | null {
    const day = tokens[0].getTag(OrdinalDay)!.type;
    const month = tokens[2].getTag(RepeaterMonth)!;
    return this.handleMD(month, day, tokens.slice(3), options);
  },

  handleOdRmn(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[1].getTag(RepeaterMonthName)!;
    const day = tokens[0].getTag(OrdinalDay)!.type;

    if (this.isMonthOverflow(this.now.year, month.index(), day)) return null;

    return this.handleMD(month, day, tokens.slice(2), options);
  },

  handleSyRmnOd(this: Parser, tokens: Token[], options: Options): Span | null {
    const year = tokens[0].getTag(ScalarYear)!.type;
    const month = tokens[1].getTag(RepeaterMonthName)!.index();
    const day = tokens[2].getTag(OrdinalDay)!.type;
    const timeTokens = last(tokens, tokens.length - 3);

    if (this.isMonthOverflow(year, month, day)) return null;

    try {
      const dayStart = Chronic.timeClass().local(year, month, day);
      return this.dayOrTime(dayStart, timeTokens, options);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleSdRmn(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[1].getTag(RepeaterMonthName)!;
    const day = tokens[0].getTag(ScalarDay)!.type;

    if (this.isMonthOverflow(this.now.year, month.index(), day)) return null;

    return this.handleMD(month, day, tokens.slice(2), options);
  },

  handleRmnOdOn(this: Parser, tokens: Token[], options: Options): Span | null {
    let month: RepeaterMonthName, day: number, tokenRange: [number, number];
    if (tokens.length > 3) {
      month = tokens[2].getTag(RepeaterMonthName)!;
      day = tokens[3].getTag(OrdinalDay)!.type;
      tokenRange = [0, 1];
    } else {
      month = tokens[1].getTag(RepeaterMonthName)!;
      day = tokens[2].getTag(OrdinalDay)!.type;
      tokenRange = [0, 0];
    }

    if (this.isMonthOverflow(this.now.year, month.index(), day)) return null;

    return this.handleMD(month, day, tokens.slice(tokenRange[0], tokenRange[1] + 1), options);
  },

  handleRmnSy(this: Parser, tokens: Token[], _options: Options): Span | null {
    const month = tokens[0].getTag(RepeaterMonthName)!.index();
    const year = tokens[1].getTag(ScalarYear)!.type;

    let nextMonthYear, nextMonthMonth;
    if (month === 12) {
      nextMonthYear = year + 1;
      nextMonthMonth = 1;
    } else {
      nextMonthYear = year;
      nextMonthMonth = month + 1;
    }

    try {
      const endTime = Chronic.timeClass().local(nextMonthYear, nextMonthMonth);
      return new Span(Chronic.timeClass().local(year, month), endTime);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleGeneric(this: Parser, _tokens: Token[], options: Options): Span | null {
    try {
      const t = Chronic.timeClass().parse(options.text as string);
      return new Span(t, t.plus(1));
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (!/out of range/.test(e.message)) throw e;
      return null;
    }
  },

  handleRmnSdSy(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[0].getTag(RepeaterMonthName)!.index();
    const day = tokens[1].getTag(ScalarDay)!.type;
    const year = tokens[2].getTag(ScalarYear)!.type;
    const timeTokens = last(tokens, tokens.length - 3);

    if (this.isMonthOverflow(year, month, day)) return null;

    try {
      const dayStart = Chronic.timeClass().local(year, month, day);
      return this.dayOrTime(dayStart, timeTokens, options);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleRmnOdSy(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[0].getTag(RepeaterMonthName)!.index();
    const day = tokens[1].getTag(OrdinalDay)!.type;
    const year = tokens[2].getTag(ScalarYear)!.type;
    const timeTokens = last(tokens, tokens.length - 3);

    if (this.isMonthOverflow(year, month, day)) return null;

    try {
      const dayStart = Chronic.timeClass().local(year, month, day);
      return this.dayOrTime(dayStart, timeTokens, options);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleOdRmnSy(this: Parser, tokens: Token[], options: Options): Span | null {
    const day = tokens[0].getTag(OrdinalDay)!.type;
    const month = tokens[1].getTag(RepeaterMonthName)!.index();
    const year = tokens[2].getTag(ScalarYear)!.type;
    const timeTokens = last(tokens, tokens.length - 3);

    if (this.isMonthOverflow(year, month, day)) return null;

    try {
      const dayStart = Chronic.timeClass().local(year, month, day);
      return this.dayOrTime(dayStart, timeTokens, options);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleSdRmnSy(this: Parser, tokens: Token[], options: Options): Span | null {
    const newTokens = [tokens[1], tokens[0], tokens[2]];
    const timeTokens = last(tokens, tokens.length - 3);
    return this.handleRmnSdSy([...newTokens, ...timeTokens], options);
  },

  handleSmSdSy(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[0].getTag(ScalarMonth)!.type;
    const day = tokens[1].getTag(ScalarDay)!.type;
    const year = tokens[2].getTag(ScalarYear)!.type;
    const timeTokens = last(tokens, tokens.length - 3);

    if (this.isMonthOverflow(year, month, day)) return null;

    try {
      const dayStart = Chronic.timeClass().local(year, month, day);
      return this.dayOrTime(dayStart, timeTokens, options);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleSdSmSy(this: Parser, tokens: Token[], options: Options): Span | null {
    const newTokens = [tokens[1], tokens[0], tokens[2]];
    const timeTokens = last(tokens, tokens.length - 3);
    return this.handleSmSdSy([...newTokens, ...timeTokens], options);
  },

  handleSySmSd(this: Parser, tokens: Token[], options: Options): Span | null {
    const newTokens = [tokens[1], tokens[2], tokens[0]];
    const timeTokens = last(tokens, tokens.length - 3);
    return this.handleSmSdSy([...newTokens, ...timeTokens], options);
  },

  handleSmSd(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[0].getTag(ScalarMonth)!.type;
    const day = tokens[1].getTag(ScalarDay)!.type;
    const year = this.now.year;
    const timeTokens = last(tokens, tokens.length - 2);

    if (this.isMonthOverflow(year, month, day)) return null;

    try {
      let dayStart = Chronic.timeClass().local(year, month, day);
      if (options.context === "future" && dayStart.compare(this.now)! < 0) {
        dayStart = Chronic.timeClass().local(year + 1, month, day);
      }
      return this.dayOrTime(dayStart, timeTokens, options);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleSdSm(this: Parser, tokens: Token[], options: Options): Span | null {
    const newTokens = [tokens[1], tokens[0]];
    const timeTokens = last(tokens, tokens.length - 2);
    return this.handleSmSd([...newTokens, ...timeTokens], options);
  },

  handleYearAndMonth(this: Parser, year: number, month: number): Span | null {
    let nextMonthYear, nextMonthMonth;
    if (month === 12) {
      nextMonthYear = year + 1;
      nextMonthMonth = 1;
    } else {
      nextMonthYear = year;
      nextMonthMonth = month + 1;
    }

    try {
      const endTime = Chronic.timeClass().local(nextMonthYear, nextMonthMonth);
      return new Span(Chronic.timeClass().local(year, month), endTime);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleSmSy(this: Parser, tokens: Token[], _options: Options): Span | null {
    const month = tokens[0].getTag(ScalarMonth)!.type;
    const year = tokens[1].getTag(ScalarYear)!.type;
    return this.handleYearAndMonth(year, month);
  },

  handleSySm(this: Parser, tokens: Token[], _options: Options): Span | null {
    const year = tokens[0].getTag(ScalarYear)!.type;
    const month = tokens[1].getTag(ScalarMonth)!.type;
    return this.handleYearAndMonth(year, month);
  },

  handleRdnRmnOd(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[1].getTag(RepeaterMonthName)!;
    const day = tokens[2].getTag(OrdinalDay)!.type;
    const timeTokens = last(tokens, tokens.length - 3);
    const year = this.now.year;

    if (this.isMonthOverflow(year, month.index(), day)) return null;

    try {
      if (timeTokens.length === 0) {
        const startTime = Chronic.timeClass().local(year, month.index(), day);
        const endTime = this.timeWithRollover(year, month.index(), day + 1);
        return new Span(startTime, endTime);
      } else {
        const dayStart = Chronic.timeClass().local(year, month.index(), day);
        return this.dayOrTime(dayStart, timeTokens, options);
      }
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleRdnRmnOdSy(this: Parser, tokens: Token[], _options: Options): Span | null {
    const month = tokens[1].getTag(RepeaterMonthName)!;
    const day = tokens[2].getTag(OrdinalDay)!.type;
    const year = tokens[3].getTag(ScalarYear)!.type;

    if (this.isMonthOverflow(year, month.index(), day)) return null;

    try {
      const startTime = Chronic.timeClass().local(year, month.index(), day);
      const endTime = this.timeWithRollover(year, month.index(), day + 1);
      return new Span(startTime, endTime);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleRdnOd(this: Parser, tokens: Token[], options: Options): Span | null {
    const day = tokens[1].getTag(OrdinalDay)!.type;
    const timeTokens = last(tokens, tokens.length - 2);
    const year = this.now.year;
    let month = this.now.month;
    if (options.context === "future") {
      if (this.now.day > day) month += 1;
    }

    if (this.isMonthOverflow(year, month, day)) return null;

    try {
      if (timeTokens.length === 0) {
        const startTime = Chronic.timeClass().local(year, month, day);
        const endTime = this.timeWithRollover(year, month, day + 1);
        return new Span(startTime, endTime);
      } else {
        const dayStart = Chronic.timeClass().local(year, month, day);
        return this.dayOrTime(dayStart, timeTokens, options);
      }
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleRdnRmnSd(this: Parser, tokens: Token[], options: Options): Span | null {
    const month = tokens[1].getTag(RepeaterMonthName)!;
    const day = tokens[2].getTag(ScalarDay)!.type;
    const timeTokens = last(tokens, tokens.length - 3);
    const year = this.now.year;

    if (this.isMonthOverflow(year, month.index(), day)) return null;

    try {
      if (timeTokens.length === 0) {
        const startTime = Chronic.timeClass().local(year, month.index(), day);
        const endTime = this.timeWithRollover(year, month.index(), day + 1);
        return new Span(startTime, endTime);
      } else {
        const dayStart = Chronic.timeClass().local(year, month.index(), day);
        return this.dayOrTime(dayStart, timeTokens, options);
      }
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleRdnRmnSdSy(this: Parser, tokens: Token[], _options: Options): Span | null {
    const month = tokens[1].getTag(RepeaterMonthName)!;
    const day = tokens[2].getTag(ScalarDay)!.type;
    const year = tokens[3].getTag(ScalarYear)!.type;

    if (this.isMonthOverflow(year, month.index(), day)) return null;

    try {
      const startTime = Chronic.timeClass().local(year, month.index(), day);
      const endTime = this.timeWithRollover(year, month.index(), day + 1);
      return new Span(startTime, endTime);
    } catch (e) {
      if (e instanceof ArgumentError) return null;
      throw e;
    }
  },

  handleSmRmnSy(this: Parser, tokens: Token[], options: Options): Span {
    let day = tokens[0].getTag(ScalarDay)!.type;
    const month = tokens[1].getTag(RepeaterMonthName)!.index();
    const year = tokens[2].getTag(ScalarYear)!.type;
    let time: RubyTime, endTime: RubyTime;
    if (tokens.length > 3) {
      time = this.getAnchor([last(tokens)!], options)!.begin!;
      const h = time.hour,
        m = time.min,
        s = time.sec;
      time = Chronic.timeClass().local(year, month, day, h, m, s);
      endTime = Chronic.timeClass().local(year, month, day + 1, h, m, s);
    } else {
      time = Chronic.timeClass().local(year, month, day);
      if (!(day >= 31)) day += 1;
      endTime = Chronic.timeClass().local(year, month, day);
    }
    return new Span(time, endTime);
  },

  handleR(this: Parser, tokens: Token[], options: Options): Span | null {
    const ddTokens = this.dealiasAndDisambiguateTimes(tokens, options);
    return this.getAnchor(ddTokens, options);
  },

  handleRGR(this: Parser, tokens: Token[], options: Options): Span | null {
    const newTokens = [tokens[1], tokens[0], tokens[2]];
    return this.handleR(newTokens, options);
  },

  handleSrp(this: Parser, tokens: Token[], span: Span, _options: Options): Span | null {
    const distance = tokens[0].getTag(Scalar)!.type;
    const repeater = tokens[1].getTag(Repeater)!;
    const pointer = tokens[2].getTag(Pointer)!.type;

    if (rbObjRespondTo(repeater, "offset")) {
      return (repeater as unknown as OffsetRepeater).offset(span, distance, pointer);
    }
    return null;
  },

  handleSRP(this: Parser, tokens: Token[], options: Options): Span | null {
    const span = new Span(this.now, this.now.plus(1));

    return this.handleSrp(tokens, span, options);
  },

  handlePSR(this: Parser, tokens: Token[], options: Options): Span | null {
    const newTokens = [tokens[1], tokens[2], tokens[0]];
    return this.handleSRP(newTokens, options);
  },

  handleSRPA(this: Parser, tokens: Token[], options: Options): Span | null {
    const anchorSpan = this.getAnchor(tokens.slice(3, tokens.length), options)!;
    return this.handleSrp(tokens, anchorSpan, options);
  },

  handleSRASRPA(this: Parser, tokens: Token[], options: Options): Span | null {
    const anchorSpan = this.getAnchor(tokens.slice(4, tokens.length), options)!;

    const span = this.handleSrp(
      [...tokens.slice(0, 2), ...tokens.slice(4, 7)],
      anchorSpan,
      options,
    )!;
    return this.handleSrp([...tokens.slice(2, 4), ...tokens.slice(4, 7)], span, options);
  },

  handleOrr(this: Parser, tokens: Token[], outerSpan: Span, _options: Options): Span | null {
    const repeater = tokens[1].getTag(Repeater)!;
    repeater.start = outerSpan.begin!.minus(1) as RubyTime;
    const ordinal = tokens[0].getTag(Ordinal)!.type;
    let span: Span | null = null;

    for (let i = 0; i < ordinal; i++) {
      span = repeater.next("future");

      if (span!.begin!.compare(outerSpan.end!)! >= 0) {
        span = null;
        break;
      }
    }

    return span;
  },

  handleORSR(this: Parser, tokens: Token[], options: Options): Span | null {
    const outerSpan = this.getAnchor([tokens[3]], options)!;
    return this.handleOrr(tokens.slice(0, 2), outerSpan, options);
  },

  handleORGR(this: Parser, tokens: Token[], options: Options): Span | null {
    const outerSpan = this.getAnchor(tokens.slice(2, 4), options)!;
    return this.handleOrr(tokens.slice(0, 2), outerSpan, options);
  },

  dayOrTime(this: Parser, dayStart: RubyTime, timeTokens: Token[], options: Options): Span | null {
    const outerSpan = new Span(dayStart, dayStart.plus(24 * 60 * 60));

    if (!(timeTokens.length === 0)) {
      this.now = outerSpan.begin!;
      return this.getAnchor(this.dealiasAndDisambiguateTimes(timeTokens, options), {
        ...options,
        context: "future",
      });
    } else {
      return outerSpan;
    }
  },

  getAnchor(this: Parser, tokens: Token[], options: Options): Span | null {
    let grabber = new Grabber("this");
    const pointer = "future";
    const repeaters = this.getRepeaters(tokens);
    for (let i = 0; i < repeaters.length; i++) tokens.pop();

    if (tokens[0] && tokens[0].getTag(Grabber)) {
      grabber = tokens.shift()!.getTag(Grabber)!;
    }

    const head = repeaters.shift()!;
    head.start = this.now;

    let outerSpan: Span | null;
    switch (grabber.type) {
      case "last":
        outerSpan = head.next("past");
        break;
      case "this":
        if (options.context !== "past" && repeaters.length > 0) {
          outerSpan = head.this("none");
        } else {
          outerSpan = head.this(options.context as string);
        }
        break;
      case "next":
        outerSpan = head.next("future");
        break;
      default:
        throw new RuntimeError("Invalid grabber");
    }

    if (Chronic.debug()) {
      STDOUT.puts(`Handler-class: ${rbObjClassname(head)}`);
      STDOUT.puts(`--${String(outerSpan)}`);
    }

    return this.findWithin(repeaters, outerSpan!, pointer);
  },

  getRepeaters(this: Parser, tokens: Token[]): Repeater[] {
    return sort(compact(tokens.map((token) => token.getTag(Repeater)))).reverse();
  },

  isMonthOverflow(this: Parser, year: number, month: number, day: number): boolean {
    try {
      if (RubyDate.isLeap(year)) {
        return day > RepeaterMonth.MONTH_DAYS_LEAP[month - 1];
      } else {
        return day > RepeaterMonth.MONTH_DAYS[month - 1];
      }
    } catch (e) {
      if (e instanceof ArgumentError) return false;
      throw e;
    }
  },

  findWithin(this: Parser, tags: Repeater[], span: Span, pointer: string): Span | null {
    if (Chronic.debug()) STDOUT.puts(`--${String(span)}`);
    if (tags.length === 0) return span;

    const head = tags.shift()!;
    head.start = pointer === "future" ? span.begin! : span.end!;
    const h = head.this("none")!;

    if (span.cover(h.begin!) || span.cover(h.end!)) {
      return this.findWithin(tags, h, pointer);
    }
    return null;
  },

  timeWithRollover(this: Parser, year: number, month: number, day: number): RubyTime {
    const dateParts = this.isMonthOverflow(year, month, day)
      ? month === 12
        ? [year + 1, 1, 1]
        : [year, month + 1, 1]
      : [year, month, day];
    return Chronic.timeClass().local(...dateParts);
  },

  dealiasAndDisambiguateTimes(this: unknown, tokens: Token[], options: Options): Token[] {
    let dayPortionIndex: number | null = null;
    for (const [i, t] of tokens.entries()) {
      if (t.getTag(RepeaterDayPortion)) {
        dayPortionIndex = i;
        break;
      }
    }

    let timeIndex: number | null = null;
    for (const [i, t] of tokens.entries()) {
      if (t.getTag(RepeaterTime)) {
        timeIndex = i;
        break;
      }
    }

    if (dayPortionIndex != null && timeIndex != null) {
      const t1 = tokens[dayPortionIndex];
      const t1tag = t1.getTag(RepeaterDayPortion)!;

      switch (t1tag.type) {
        case "morning":
          if (Chronic.debug()) STDOUT.puts("--morning->am");
          t1.untag(RepeaterDayPortion);
          t1.tag(new RepeaterDayPortion("am"));
          break;
        case "afternoon":
        case "evening":
        case "night":
          if (Chronic.debug()) STDOUT.puts(`--${String(t1tag.type)}->pm`);
          t1.untag(RepeaterDayPortion);
          t1.tag(new RepeaterDayPortion("pm"));
          break;
      }
    }

    if (options.ambiguousTimeRange !== "none") {
      const ambiguousTokens: Token[] = [];

      for (const [i, token] of tokens.entries()) {
        ambiguousTokens.push(token);
        const nextToken = tokens[i + 1];

        if (
          token.getTag(RepeaterTime) &&
          token.getTag(RepeaterTime)!.type.isAmbiguous() &&
          (!nextToken || !nextToken.getTag(RepeaterDayPortion))
        ) {
          const distoken = new Token("disambiguator");

          distoken.tag(new RepeaterDayPortion(options.ambiguousTimeRange as string | number));
          ambiguousTokens.push(distoken);
        }
      }

      tokens = ambiguousTokens;
    }

    return tokens;
  },
};

Chronic.Handlers = Handlers;
