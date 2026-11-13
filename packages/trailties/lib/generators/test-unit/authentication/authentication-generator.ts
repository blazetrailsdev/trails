import "../../../constants.test-unit-authentication-authentication-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class AuthenticationGenerator extends Base {
  static {
    this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("createUserTestFiles");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createUserTestFiles(): Promise<void> {
    await this.template("test/fixtures/users.yml");
    await this.template("test/models/user.test.ts");
  }
}

Object.defineProperty(AuthenticationGenerator, "name", {
  value: "TestUnit::Generators::AuthenticationGenerator",
});
