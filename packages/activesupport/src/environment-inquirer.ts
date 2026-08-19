import { StringInquirer } from "./string-inquirer.js";
import { isIn } from "./enumerable-utils.js";

/** Ruby's `ArgumentError`, raised by the reserved-name guard. */
class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * Environments that'll respond true for #local?
 *
 * Mirrors: `EnvironmentInquirer::LOCAL_ENVIRONMENTS`
 * (`environment_inquirer.rb:13`).
 */
const LOCAL_ENVIRONMENTS = ["development", "test"];

export class EnvironmentInquirer extends StringInquirer {
  #local: boolean;

  constructor(env: string) {
    if (env === "local") throw new ArgumentError("'local' is a reserved environment name");

    super(env);

    this.#local = isIn(env, LOCAL_ENVIRONMENTS);
  }

  /** Returns true if we're in the development or test environment. */
  isLocal(): boolean {
    return this.#local;
  }

  "local?"(): boolean {
    return this.isLocal();
  }
}
