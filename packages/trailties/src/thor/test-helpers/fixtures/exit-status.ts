import { rbArgv } from "@blazetrails/ruby-compat";
import { Error as ThorError } from "../../error.js";
import { Thor, type ThorClass } from "../../thor.js";

export class ExitStatus extends Thor {
  static isExitOnFailure(): boolean {
    return true;
  }

  static {
    const klass = this as unknown as ThorClass;
    klass.desc("error", "exit with a planned error");
    (this as unknown as ThorClass).methodAdded("error");

    klass.desc("ok", "exit with no error");
    (this as unknown as ThorClass).methodAdded("ok");
  }

  error() {
    throw new ThorError("planned error");
  }

  ok() {}
}

await (ExitStatus as unknown as ThorClass).start(rbArgv());
