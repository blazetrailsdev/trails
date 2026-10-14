import { puts, rtest, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "../../thor.js";

export class Amazing extends Thor {
  static isExitOnFailure(): boolean {
    return false;
  }

  static {
    const klass = this as unknown as ThorClass;
    klass.desc("describe NAME", "say that someone is amazing");
    klass.methodOptions({ forcefully: ":boolean" });
    (this as unknown as ThorClass).methodAdded("describe");
  }

  describe(name: string, opts: Record<string, unknown>) {
    const ret = `${name} is amazing`;
    puts.call($stdout, rtest(opts["forcefully"]) ? ret.toUpperCase() : ret);
  }
}
