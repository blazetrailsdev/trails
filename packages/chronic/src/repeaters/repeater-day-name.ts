import { Date as RubyDate } from "@blazetrails/date";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterDayName extends Repeater<string> {
  static DAY_SECONDS = 86400;

  /** @internal */
  currentDate: RubyDate | null;

  constructor(type: string, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentDate = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    const direction = pointer === "future" ? 1 : -1;

    if (!this.currentDate) {
      this.currentDate = new RubyDate(this.now!.year, this.now!.month, this.now!.day);
      this.currentDate = this.currentDate.plus(direction);

      const dayNum = this.symbolToNumber(this.type);

      while (this.currentDate.wday !== dayNum) {
        this.currentDate = this.currentDate.plus(direction);
      }
    } else {
      this.currentDate = this.currentDate.plus(direction * 7);
    }
    const nextDate = this.currentDate.succ();
    return new Span(
      Chronic.construct(
        Number(this.currentDate.year),
        this.currentDate.month,
        this.currentDate.day,
      ),
      Chronic.construct(Number(nextDate.year), nextDate.month, nextDate.day),
    );
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    if (pointer === "none") pointer = "future";
    return this.next(pointer);
  }

  width(): number {
    return RepeaterDayName.DAY_SECONDS;
  }

  toString(): string {
    return super.toString() + "-dayname-" + String(this.type);
  }

  /** @internal */
  private symbolToNumber(sym: string): number {
    const lookup: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const number = lookup[sym];
    if (number != null) return number;
    throw new RuntimeError("Invalid symbol specified");
  }
}

Chronic.RepeaterDayName = RepeaterDayName;
