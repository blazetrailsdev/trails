import { registerConstant } from "@blazetrails/ruby-compat";

export const MeTooHelper = {
  me(): string {
    return "me too!";
  },
};
registerConstant("MeTooHelper", MeTooHelper);
