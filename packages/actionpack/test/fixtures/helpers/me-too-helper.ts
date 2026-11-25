import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export const MeTooHelper = {
  me(): string {
    return "me too!";
  },
};
constSet(TopLevel, "MeTooHelper", MeTooHelper);
