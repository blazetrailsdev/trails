import { puts, rbArgv, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "../../thor.js";

export class Help extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("bugs", "ALL THE BUGZ!");
    klass.option("--not_help", { type: "boolean" });
    (this as unknown as ThorClass).methodAdded("bugs");
  }

  bugs() {
    puts.call($stdout, "Invoked!");
  }
}

await (Help as unknown as ThorClass).start(rbArgv());
