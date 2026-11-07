import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class AuthenticationGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("createFiles");
  }

  async createFiles(): Promise<void> {
    await this.template("app/views/passwords/new.html.tse");
    await this.template("app/views/passwords/edit.html.tse");
    await this.template("app/views/sessions/new.html.tse");
  }
}
