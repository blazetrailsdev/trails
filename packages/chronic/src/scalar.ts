import { Chronic } from "./namespaces.js";
import { Date } from "./date.js";
import { Time } from "./time.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class Scalar extends Tag {
  declare type: number;

  static DAY_PORTIONS = ["am", "pm", "morning", "afternoon", "evening", "night"];

  static scan(tokens: Token[], options: Record<string, unknown>): Token[] {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const postToken = tokens[i + 1];
      if (/^\d+$/m.test(token.word)) {
        const scalar = parseInt(token.word, 10);
        token.tag(new Scalar(scalar));
        if (Time.isCouldBeSubsecond(scalar)) token.tag(new ScalarSubsecond(scalar));
        if (Time.isCouldBeSecond(scalar)) token.tag(new ScalarSecond(scalar));
        if (Time.isCouldBeMinute(scalar)) token.tag(new ScalarMinute(scalar));
        if (Time.isCouldBeHour(scalar)) token.tag(new ScalarHour(scalar));
        if (!(postToken && Scalar.DAY_PORTIONS.includes(postToken.word))) {
          if (Date.isCouldBeDay(scalar)) token.tag(new ScalarDay(scalar));
          if (Date.isCouldBeMonth(scalar)) token.tag(new ScalarMonth(scalar));
          if (Date.isCouldBeYear(scalar)) {
            const year = Date.makeYear(scalar, options.ambiguousYearFutureBias as number);
            token.tag(new ScalarYear(Math.trunc(year)));
          }
        }
      }
    }
    return tokens;
  }

  toString(): string {
    return "scalar";
  }
}

export class ScalarSubsecond extends Scalar {
  toString(): string {
    return super.toString() + "-subsecond-" + String(this.type);
  }
}

export class ScalarSecond extends Scalar {
  toString(): string {
    return super.toString() + "-second-" + String(this.type);
  }
}

export class ScalarMinute extends Scalar {
  toString(): string {
    return super.toString() + "-minute-" + String(this.type);
  }
}

export class ScalarHour extends Scalar {
  toString(): string {
    return super.toString() + "-hour-" + String(this.type);
  }
}

export class ScalarDay extends Scalar {
  toString(): string {
    return super.toString() + "-day-" + String(this.type);
  }
}

export class ScalarMonth extends Scalar {
  toString(): string {
    return super.toString() + "-month-" + String(this.type);
  }
}

export class ScalarYear extends Scalar {
  toString(): string {
    return super.toString() + "-year-" + String(this.type);
  }
}

Chronic.Scalar = Scalar;
Chronic.ScalarSubsecond = ScalarSubsecond;
Chronic.ScalarSecond = ScalarSecond;
Chronic.ScalarMinute = ScalarMinute;
Chronic.ScalarHour = ScalarHour;
Chronic.ScalarDay = ScalarDay;
Chronic.ScalarMonth = ScalarMonth;
Chronic.ScalarYear = ScalarYear;
