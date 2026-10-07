import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const Pack2Helper = new Module().include({
  conflictingHelper(): string {
    return "pack2";
  },
});
registerConstant("Pack2Helper", Pack2Helper);
