import { registerConstant } from "@blazetrails/ruby-compat";

export const Pack2Helper = {
  conflictingHelper(): string {
    return "pack2";
  },
};
registerConstant("Pack2Helper", Pack2Helper);
