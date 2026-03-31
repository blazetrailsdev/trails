import { StringInquirer } from "./string-inquirer.js";

const LOCAL_ENVIRONMENTS = new Set(["development", "test"]);

export class EnvironmentInquirer extends StringInquirer {
  constructor(env: string) {
    if (env === "local") {
      throw new Error(
        `"local" is a reserved environment name. Use "development" or "test" instead.`,
      );
    }
    super(env);
  }

  isLocal(): boolean {
    return LOCAL_ENVIRONMENTS.has(this.toString());
  }

  "local?"(): boolean {
    return this.isLocal();
  }
}
