import {
  TopLevel,
  constSet,
} from "@blazetrails/ruby-compat";

export const Pack1Helper = {
  conflictingHelper(): string {
    return "pack1";
  },
};
constSet(TopLevel, "Pack1Helper", Pack1Helper);
