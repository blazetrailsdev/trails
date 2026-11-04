import {
  TopLevel,
  constSet,
} from "@blazetrails/ruby-compat";

export const MeTooHelper = {
  me(): string {
    return "me too!";
  },
};
constSet(TopLevel, "MeTooHelper", MeTooHelper);
