import "../../../constants.tse-authentication-authentication-generator.generated.js";
import { Base } from "../../base.js";

export class AuthenticationGenerator extends Base {
  static {
    this.methodAdded("createFiles");
  }

  async createFiles(): Promise<void> {
    await this.template("app/views/passwords/new.html.tse");
    await this.template("app/views/passwords/edit.html.tse");
    await this.template("app/views/sessions/new.html.tse");
  }
}
