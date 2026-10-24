import { capitalize, cmp, Hash, rbModConstGet, RuntimeError } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import type { Span } from "./span.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class Repeater<T = unknown> extends Tag<T> {
  static scan(tokens: Token[], options: Record<string, unknown>): Token[] {
    for (const token of tokens) {
      let t;
      if ((t = this.scanForSeasonNames(token, options))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForMonthNames(token, options))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForDayNames(token, options))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForDayPortions(token, options))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForTimes(token, options))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForUnits(token, options))) {
        token.tag(t);
        continue;
      }
    }
    return tokens;
  }

  static scanForSeasonNames(token: Token, options: Record<string, unknown> = {}): Repeater | null {
    return this.scanFor(
      token,
      Chronic.RepeaterSeasonName,
      new Hash<RegExp, string>()
        .set(/^springs?$/m, "spring")
        .set(/^summers?$/m, "summer")
        .set(/^(autumn)|(fall)s?$/m, "autumn")
        .set(/^winters?$/m, "winter"),
      options,
    );
  }

  static scanForMonthNames(token: Token, options: Record<string, unknown> = {}): Repeater | null {
    return this.scanFor(
      token,
      Chronic.RepeaterMonthName,
      new Hash<RegExp, string>()
        .set(/^jan[:.]?(uary)?$/m, "january")
        .set(/^feb[:.]?(ruary)?$/m, "february")
        .set(/^mar[:.]?(ch)?$/m, "march")
        .set(/^apr[:.]?(il)?$/m, "april")
        .set(/^may$/m, "may")
        .set(/^jun[:.]?e?$/m, "june")
        .set(/^jul[:.]?y?$/m, "july")
        .set(/^aug[:.]?(ust)?$/m, "august")
        .set(/^sep[:.]?(t[:.]?|tember)?$/m, "september")
        .set(/^oct[:.]?(ober)?$/m, "october")
        .set(/^nov[:.]?(ember)?$/m, "november")
        .set(/^dec[:.]?(ember)?$/m, "december"),
      options,
    );
  }

  static scanForDayNames(token: Token, options: Record<string, unknown> = {}): Repeater | null {
    return this.scanFor(
      token,
      Chronic.RepeaterDayName,
      new Hash<RegExp, string>()
        .set(/^m[ou]n(day)?$/m, "monday")
        .set(/^t(ue|eu|oo|u|)s?(day)?$/m, "tuesday")
        .set(/^we(d|dnes|nds|nns)(day)?$/m, "wednesday")
        .set(/^th(u|ur|urs|ers)(day)?$/m, "thursday")
        .set(/^fr[iy](day)?$/m, "friday")
        .set(/^sat(t?[ue]rday)?$/m, "saturday")
        .set(/^su[nm](day)?$/m, "sunday"),
      options,
    );
  }

  static scanForDayPortions(token: Token, options: Record<string, unknown> = {}): Repeater | null {
    return this.scanFor(
      token,
      Chronic.RepeaterDayPortion,
      new Hash<RegExp, string>()
        .set(/^ams?$/m, "am")
        .set(/^pms?$/m, "pm")
        .set(/^mornings?$/m, "morning")
        .set(/^afternoons?$/m, "afternoon")
        .set(/^evenings?$/m, "evening")
        .set(/^(night|nite)s?$/m, "night"),
      options,
    );
  }

  static scanForTimes(token: Token, options: Record<string, unknown> = {}): Repeater | null {
    return this.scanFor(
      token,
      Chronic.RepeaterTime,
      /^\d{1,2}(:?\d{1,2})?([.:]?\d{1,2}([.:]\d{1,6})?)?$/m,
      options,
    );
  }

  static scanForUnits(token: Token, options: Record<string, unknown> = {}): Repeater | null {
    for (const [item, symbol] of new Hash<RegExp, string>()
      .set(/^years?$/m, "year")
      .set(/^seasons?$/m, "season")
      .set(/^months?$/m, "month")
      .set(/^fortnights?$/m, "fortnight")
      .set(/^weeks?$/m, "week")
      .set(/^weekends?$/m, "weekend")
      .set(/^(week|business)days?$/m, "weekday")
      .set(/^days?$/m, "day")
      .set(/^hrs?$/m, "hour")
      .set(/^hours?$/m, "hour")
      .set(/^mins?$/m, "minute")
      .set(/^minutes?$/m, "minute")
      .set(/^secs?$/m, "second")
      .set(/^seconds?$/m, "second")) {
      if (item.test(token.word)) {
        const klassName = "Repeater" + capitalize(symbol, []);
        const klass = rbModConstGet(Chronic, klassName) as typeof Repeater;
        return new klass(symbol, options);
      }
    }
    return null;
  }

  compareTo(other: Repeater): number | null {
    return cmp(this.width(), other.width());
  }

  width(): number {
    throw new RuntimeError("Repeater#width must be overridden in subclasses");
  }

  next(_pointer: string): Span | null {
    if (!this.now) {
      throw new RuntimeError("Start point must be set before calling #next");
    }
    return null;
  }

  this(_pointer: string): Span | null {
    if (!this.now) {
      throw new RuntimeError("Start point must be set before calling #this");
    }
    return null;
  }

  toString(): string {
    return "repeater";
  }
}

Chronic.Repeater = Repeater;
