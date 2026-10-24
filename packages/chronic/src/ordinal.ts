import { toI } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import { Date } from "./date.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class Ordinal extends Tag<number> {
  static scan(tokens: Token[], options: Record<string, unknown>): Token[] {
    for (let i = 0; i < tokens.length; i++) {
      const m = /^(\d+)(st|nd|rd|th|\.)$/m.exec(tokens[i].word);
      if (m) {
        const ordinal = parseInt(m[1], 10);
        tokens[i].tag(new Ordinal(ordinal));
        if (Date.isCouldBeDay(ordinal)) tokens[i].tag(new OrdinalDay(ordinal));
        if (Date.isCouldBeMonth(ordinal)) tokens[i].tag(new OrdinalMonth(ordinal));
        if (Date.isCouldBeYear(ordinal)) {
          const year = Date.makeYear(ordinal, options.ambiguousYearFutureBias as number);
          tokens[i].tag(new OrdinalYear(toI(year) as number));
        }
      }
    }
    return tokens;
  }

  toString(): string {
    return "ordinal";
  }
}

export class OrdinalDay extends Ordinal {
  toString(): string {
    return super.toString() + "-day-" + String(this.type);
  }
}

export class OrdinalMonth extends Ordinal {
  toString(): string {
    return super.toString() + "-month-" + String(this.type);
  }
}

export class OrdinalYear extends Ordinal {
  toString(): string {
    return super.toString() + "-year-" + String(this.type);
  }
}

Chronic.Ordinal = Ordinal;
Chronic.OrdinalDay = OrdinalDay;
Chronic.OrdinalMonth = OrdinalMonth;
Chronic.OrdinalYear = OrdinalYear;
