import { registerConstant } from "@blazetrails/ruby-compat";

export const GamesHelper = {
  stratego(): string {
    return "Iz guuut!";
  },
};
registerConstant("Fun::GamesHelper", GamesHelper);
