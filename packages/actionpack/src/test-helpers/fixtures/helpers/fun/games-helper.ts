import {
  constGet,
  constSet, TopLevel, constDefined } from "@blazetrails/ruby-compat";

export const GamesHelper = {
  stratego(): string {
    return "Iz guuut!";
  },
};
if (!constDefined(Object, "Fun")) constSet(TopLevel, "Fun", {});
constSet(constGet(Object, "Fun") as object, "GamesHelper", GamesHelper);
