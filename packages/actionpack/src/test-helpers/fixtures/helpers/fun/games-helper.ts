import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const GamesHelper = new Module().include({
  stratego(): string {
    return "Iz guuut!";
  },
});
registerConstant("Fun::GamesHelper", GamesHelper);
