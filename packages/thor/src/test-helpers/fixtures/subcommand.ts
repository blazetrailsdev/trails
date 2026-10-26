import { print, rbModConstSet, stdout as $stdout } from "@blazetrails/ruby-compat";
import type { Base } from "../../base.js";
import { Thor, type ThorClass } from "../../thor.js";

const testSubcommands = { name: "TestSubcommands" };

class Subcommand extends Thor {
  declare options: Base["options"];

  static {
    (this as unknown as ThorClass).desc("print_opt", "My method");
    (this as unknown as ThorClass).methodAdded("print_opt");
  }

  print_opt() {
    print.call($stdout, this.options["opt"]);
  }
}
rbModConstSet(testSubcommands, "Subcommand", Subcommand);

class Parent extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("opt");

    klass.desc("sub", "My subcommand");
    klass.subcommand("sub", Subcommand as unknown as ThorClass);
  }
}
rbModConstSet(testSubcommands, "Parent", Parent);

export const TestSubcommands = testSubcommands as typeof testSubcommands & {
  Subcommand: typeof Subcommand;
  Parent: typeof Parent;
};
