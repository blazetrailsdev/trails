import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export const Pack2Helper = {
  conflictingHelper(): string {
    return "pack2";
  },
};
constSet(TopLevel, "Pack2Helper", Pack2Helper);
