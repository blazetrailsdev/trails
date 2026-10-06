import { Module } from "@blazetrails/ruby-compat";

export const Pack2Helper = new Module().include({
  conflictingHelper(): string {
    return "pack2";
  },
});
