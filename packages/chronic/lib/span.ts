import type { Time as RubyTime } from "@blazetrails/date";
import { Range, rbPlus } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";

export class Span extends Range<RubyTime> {
  width(): number {
    return Math.trunc(this.end!.minus(this.begin!) as number);
  }

  plus(seconds: number): Span {
    return new Span(rbPlus(this.begin, seconds) as RubyTime, rbPlus(this.end, seconds) as RubyTime);
  }

  minus(seconds: number): Span {
    return this.plus(-seconds);
  }

  toString(): string {
    return "(" + this.begin!.toS() + ".." + this.end!.toS() + ")";
  }
}

Chronic.Span = Span;
