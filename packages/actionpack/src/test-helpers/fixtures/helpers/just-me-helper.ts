import { Module } from "@blazetrails/ruby-compat";

export const JustMeHelper = new Module().include({
  me(): string {
    return "mine!";
  },
});
