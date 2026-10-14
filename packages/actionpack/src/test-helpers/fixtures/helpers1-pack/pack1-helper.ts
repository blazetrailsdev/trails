import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const Pack1Helper = new Module().include({
  conflictingHelper(): string {
    return "pack1";
  },
});
registerConstant("Pack1Helper", Pack1Helper);
