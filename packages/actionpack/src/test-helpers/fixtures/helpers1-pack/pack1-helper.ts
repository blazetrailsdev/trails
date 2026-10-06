import { Module } from "@blazetrails/ruby-compat";

export const Pack1Helper = new Module().include({
  conflictingHelper(): string {
    return "pack1";
  },
});
