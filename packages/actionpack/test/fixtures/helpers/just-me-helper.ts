import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export const JustMeHelper = {
  me(): string {
    return "mine!";
  },
};
constSet(TopLevel, "JustMeHelper", JustMeHelper);
