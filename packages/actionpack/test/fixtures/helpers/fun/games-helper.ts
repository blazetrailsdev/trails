import { constSet, constDefined } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { constGet } from "@blazetrails/ruby-compat/variable";

export const GamesHelper = {
  stratego(): string {
    return "Iz guuut!";
  },
};
if (!constDefined(Object, "Fun")) constSet(TopLevel, "Fun", {});
constSet(constGet(Object, "Fun") as object, "GamesHelper", GamesHelper);
