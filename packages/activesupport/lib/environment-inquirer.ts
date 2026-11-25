import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { StringInquirer } from "./string-inquirer.js";
import { isIn } from "./core-ext/object/inclusion.js";

export const DEFAULT_ENVIRONMENTS = ["development", "test", "production"];

export const LOCAL_ENVIRONMENTS = ["development", "test"];

export class EnvironmentInquirer extends StringInquirer {
  #defaults: Record<string, boolean> = {};
  #local: boolean;

  constructor(env: string) {
    if (env === "local") throw new ArgumentError("'local' is a reserved environment name");

    super(env);

    for (const defaultEnv of DEFAULT_ENVIRONMENTS) {
      this.#defaults[defaultEnv] = env === defaultEnv;
    }

    this.#local = isIn(env, LOCAL_ENVIRONMENTS);
  }

  isDevelopment(): boolean {
    return this.#defaults["development"];
  }

  isTest(): boolean {
    return this.#defaults["test"];
  }

  isProduction(): boolean {
    return this.#defaults["production"];
  }

  isLocal(): boolean {
    return this.#local;
  }
}
