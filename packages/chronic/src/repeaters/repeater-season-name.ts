import type { Time as RubyTime } from "@blazetrails/date";
import { MiniDate } from "../mini-date.js";
import { Chronic } from "../namespaces.js";
import { Span } from "../span.js";
import { RepeaterDay } from "./repeater-day.js";
import { RepeaterSeason } from "./repeater-season.js";
import { RepeaterYear } from "./repeater-year.js";

export class RepeaterSeasonName extends RepeaterSeason {
  static SEASON_SECONDS = 7_862_400;
  static DAY_SECONDS = 86_400;

  next(pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    return this.findNextSeasonSpan(direction, this.type);
  }

  this(pointer = "future"): Span {
    const direction = pointer === "future" ? 1 : -1;

    const today = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
    const goalSsnStart = today.plus(direction * this.numSecondsTilStart(this.type, direction));
    const goalSsnEnd = today.plus(direction * this.numSecondsTilEnd(this.type, direction));
    const currSsn = this.findCurrentSeason(MiniDate.fromTime(this.now!));
    let thisSsnStart: RubyTime | undefined, thisSsnEnd: RubyTime | undefined;
    switch (pointer) {
      case "past":
        thisSsnStart = goalSsnStart;
        thisSsnEnd = currSsn === this.type ? today : goalSsnEnd;
        break;
      case "future":
        thisSsnStart = currSsn === this.type ? today.plus(RepeaterDay.DAY_SECONDS) : goalSsnStart;
        thisSsnEnd = goalSsnEnd;
        break;
      case "none":
        thisSsnStart = goalSsnStart;
        thisSsnEnd = goalSsnEnd;
        break;
    }

    return this.constructSeason(thisSsnStart!, thisSsnEnd!);
  }

  offset(span: Span, amount: number, pointer: string): Span {
    return new Span(
      this.offsetBy(span.begin, amount, pointer),
      this.offsetBy(span.end, amount, pointer),
    );
  }

  offsetBy(time: RubyTime, amount: number, pointer: string): RubyTime {
    const direction = pointer === "future" ? 1 : -1;
    return time.plus(amount * direction * RepeaterYear.YEAR_SECONDS);
  }
}

Chronic.RepeaterSeasonName = RepeaterSeasonName;
