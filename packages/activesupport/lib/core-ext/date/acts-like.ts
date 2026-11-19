import { rbClearMethodCache } from "@blazetrails/ruby-compat";
import { Date as RubyDate } from "@blazetrails/date";

declare module "@blazetrails/date" {
  interface Date {
    actsLikeDate(): boolean;
  }
}

Object.assign(RubyDate.prototype, {
  actsLikeDate(this: RubyDate): boolean {
    return true;
  },
});
rbClearMethodCache();
