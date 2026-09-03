import { ArgumentError } from "@blazetrails/ruby-compat";
import { StringInquirer } from "./string-inquirer.js";
import { isIn } from "./enumerable-utils.js";

const LOCAL_ENVIRONMENTS = ["development", "test"];

export class EnvironmentInquirer extends StringInquirer {
  #local: boolean;

  constructor(env: string) {
    if (env === "local") throw new ArgumentError("'local' is a reserved environment name");

    super(env);

    this.#local = isIn(env, LOCAL_ENVIRONMENTS);
  }

  isLocal(): boolean {
    return this.#local;
  }

  "local?"(): boolean {
    return this.isLocal();
  }
}
