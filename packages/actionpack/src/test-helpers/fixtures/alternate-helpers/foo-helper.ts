import { Module } from "@blazetrails/ruby-compat";

export const FooHelper = new Module().include({
  baz(): void {},
});
