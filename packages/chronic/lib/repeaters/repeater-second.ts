import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterSecond extends Repeater {
  static SECOND_SECONDS = 1;

  /** @internal */
  secondStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.secondStart = null;
  }

  next(pointer = "future"): Span {
    super.next(pointer);

    const direction = pointer === "future" ? 1 : -1;

    if (!this.secondStart) {
      this.secondStart = this.now!.plus(direction * RepeaterSecond.SECOND_SECONDS);
    } else {
      this.secondStart = this.secondStart.plus(RepeaterSecond.SECOND_SECONDS * direction);
    }

    return new Span(this.secondStart, this.secondStart.plus(RepeaterSecond.SECOND_SECONDS));
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    return new Span(this.now!, this.now!.plus(1));
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    return span.plus(direction * amount * RepeaterSecond.SECOND_SECONDS);
  }

  width(): number {
    return RepeaterSecond.SECOND_SECONDS;
  }

  toString(): string {
    return super.toString() + "-second";
  }
}

Chronic.RepeaterSecond = RepeaterSecond;
