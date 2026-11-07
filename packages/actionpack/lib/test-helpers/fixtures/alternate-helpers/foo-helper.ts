import {
  TopLevel,
  constSet,
} from "@blazetrails/ruby-compat";

export const FooHelper = {
  baz(): void {},
};
constSet(TopLevel, "FooHelper", FooHelper);
