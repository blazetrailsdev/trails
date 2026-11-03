import {
  TopLevel,
  constSet,
} from "@blazetrails/ruby-compat";

export const Pack2Helper = {
  conflictingHelper(): string {
    return "pack2";
  },
};
constSet(TopLevel, "Pack2Helper", Pack2Helper);
