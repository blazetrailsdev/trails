import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const JustMeHelper = new Module().include({
  me(): string {
    return "mine!";
  },
});
registerConstant("JustMeHelper", JustMeHelper);
