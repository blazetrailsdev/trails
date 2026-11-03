import {
  constGet,
  constSet, TopLevel, isRegisteredConstant } from "@blazetrails/ruby-compat";

export const GamesHelper = {
  stratego(): string {
    return "Iz guuut!";
  },
};
if (!isRegisteredConstant("Fun")) constSet(TopLevel, "Fun", {});
constSet(constGet(Object, "Fun") as object, "GamesHelper", GamesHelper);
