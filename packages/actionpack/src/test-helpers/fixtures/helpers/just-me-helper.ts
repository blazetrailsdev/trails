import { registerConstant } from "@blazetrails/ruby-compat";

export const JustMeHelper = {
  me(): string {
    return "mine!";
  },
};
registerConstant("JustMeHelper", JustMeHelper);
