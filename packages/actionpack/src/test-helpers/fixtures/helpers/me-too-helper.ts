import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const MeTooHelper = new Module().include({
  me(): string {
    return "me too!";
  },
});
registerConstant("MeTooHelper", MeTooHelper);
