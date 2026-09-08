import { ArgumentError } from "@blazetrails/ruby-compat";
import { StringInquirer } from "./string-inquirer.js";
import { isIn } from "./enumerable-utils.js";

export const DEFAULT_ENVIRONMENTS = ["development", "test", "production"];

export const LOCAL_ENVIRONMENTS = ["development", "test"];

export class EnvironmentInquirer extends StringInquirer {
  #local: boolean;

  constructor(env: string) {
    if (env === "local") throw new ArgumentError("'local' is a reserved environment name");

    super(env);

    for (const defaultEnv of DEFAULT_ENVIRONMENTS) {
      (this as unknown as Record<string, boolean>)[defaultEnv] = env === defaultEnv;
    }

    this.#local = isIn(env, LOCAL_ENVIRONMENTS);
  }

  "local?"(): boolean {
    return this.#local;
  }
}

for (const env of DEFAULT_ENVIRONMENTS) {
  Object.defineProperty(EnvironmentInquirer.prototype, `${env}?`, {
    configurable: true,
    writable: true,
    value: function (this: Record<string, boolean>): boolean {
      return this[env];
    },
  });
}
