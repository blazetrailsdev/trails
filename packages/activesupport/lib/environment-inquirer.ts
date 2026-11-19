import { ArgumentError } from "@blazetrails/ruby-compat";
import { StringInquirer } from "./string-inquirer.js";
import { isIn } from "./core-ext/object/inclusion.js";

export const DEFAULT_ENVIRONMENTS = ["development", "test", "production"];

export const LOCAL_ENVIRONMENTS = ["development", "test"];

export class EnvironmentInquirer extends StringInquirer {
  #development: boolean;
  #test: boolean;
  #production: boolean;
  #local: boolean;

  constructor(env: string) {
    if (env === "local") throw new ArgumentError("'local' is a reserved environment name");

    super(env);

    this.#development = env === "development";
    this.#test = env === "test";
    this.#production = env === "production";

    this.#local = isIn(env, LOCAL_ENVIRONMENTS);
  }

  isDevelopment(): boolean {
    return this.#development;
  }

  isTest(): boolean {
    return this.#test;
  }

  isProduction(): boolean {
    return this.#production;
  }

  isLocal(): boolean {
    return this.#local;
  }
}
