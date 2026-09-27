import { GeneratorBase } from "../../base.js";
import { TEMPLATES } from "./templates.js";

export class AuthenticationGenerator extends GeneratorBase {
  createFiles(): void {
    this.template("app/views/passwords/new.html.erb");
    this.template("app/views/passwords/edit.html.erb");
    this.template("app/views/sessions/new.html.erb");
  }

  run(): string[] {
    this.createFiles();
    return this.getCreatedFiles();
  }

  private template(file: string): void {
    this.createFile(file.replace(/\.erb$/, ".tse"), TEMPLATES[file]);
  }
}
