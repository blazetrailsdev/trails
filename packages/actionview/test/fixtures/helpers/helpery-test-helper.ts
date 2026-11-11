import { TopLevel, constSet } from "@blazetrails/ruby-compat";

export const HelperyTestHelper = {
  helperyTest(): string {
    return "Default";
  },
};
constSet(TopLevel, "HelperyTestHelper", HelperyTestHelper);
