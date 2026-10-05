import { rbArgv, setVerbose } from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "../../thor.js";

setVerbose(true);

export class Test extends Thor {
  static isExitOnFailure(): boolean {
    return true;
  }
}

await (Test as unknown as ThorClass).start(rbArgv());
