import { GeneratorBase } from "../../base.js";
import { TEMPLATES } from "./templates.js";

export class AuthenticationGenerator extends GeneratorBase {
  static {
    this.methodAdded("createFiles");
  }

  async createFiles(): Promise<void> {
    await this.template("app/views/passwords/new.html.erb");
    await this.template("app/views/passwords/edit.html.erb");
    await this.template("app/views/sessions/new.html.erb");
  }

  override async template(file: string): Promise<void> {
    await this.createFile(file.replace(/\.erb$/, ".tse"), TEMPLATES[file]);
  }
}
