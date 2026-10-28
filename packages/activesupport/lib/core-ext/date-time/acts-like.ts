import { rbClearMethodCache } from "@blazetrails/ruby-compat";
import { DateTime as RubyDateTime } from "@blazetrails/date";

declare module "@blazetrails/date" {
  interface DateTime {
    actsLikeDate(): boolean;
    actsLikeTime(): boolean;
  }
}

Object.assign(RubyDateTime.prototype, {
  actsLikeDate(this: RubyDateTime): boolean {
    return true;
  },

  actsLikeTime(this: RubyDateTime): boolean {
    return true;
  },
});
rbClearMethodCache();
