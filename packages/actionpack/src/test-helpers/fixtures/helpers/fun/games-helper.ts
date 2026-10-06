import { Module } from "@blazetrails/ruby-compat";

export const GamesHelper = new Module().include({
  stratego(): string {
    return "Iz guuut!";
  },
});
