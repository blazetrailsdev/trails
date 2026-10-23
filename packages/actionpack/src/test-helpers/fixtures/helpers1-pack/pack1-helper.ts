import { registerConstant } from "@blazetrails/ruby-compat";

export const Pack1Helper = {
  conflictingHelper(): string {
    return "pack1";
  },
};
registerConstant("Pack1Helper", Pack1Helper);
