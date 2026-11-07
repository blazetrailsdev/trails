import {
  TopLevel,
  constSet,
} from "@blazetrails/ruby-compat";

export const JustMeHelper = {
  me(): string {
    return "mine!";
  },
};
constSet(TopLevel, "JustMeHelper", JustMeHelper);
