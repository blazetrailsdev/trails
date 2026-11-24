import "../../../constants.test-unit-authentication-authentication-generator.generated.js";
import { TopLevel } from "@blazetrails/activesupport";
import { File, constDefined } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class AuthenticationGenerator extends Base {
  static {
    this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("createUserTestFiles");
    this.methodAdded("createMailerPreviewFiles");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createUserTestFiles(): Promise<void> {
    await this.template("test/fixtures/users.yml");
    await this.template("test/models/user.test.ts");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createMailerPreviewFiles(): Promise<void> {
    if (constDefined(TopLevel, "ActionMailer::Railtie"))
      await this.template("test/mailers/previews/passwords-mailer-preview.ts");
  }
}

Object.defineProperty(AuthenticationGenerator, "name", {
  value: "TestUnit::Generators::AuthenticationGenerator",
});
