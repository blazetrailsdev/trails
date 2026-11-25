import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export const Pack1Helper = {
  conflictingHelper(): string {
    return "pack1";
  },
};
constSet(TopLevel, "Pack1Helper", Pack1Helper);
