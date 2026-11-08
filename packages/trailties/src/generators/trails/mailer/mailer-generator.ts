import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class MailerGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.argument("actions", { type: "array", default: [], banner: "method method" });
    this.checkClassCollision({ suffix: "Mailer" });
    this.methodAdded("createMailerFile");
    this.hookFor("templateEngine", "testFramework");
  }

  declare actions: string[];

  /** @internal */
  private _applicationMailerFileName?: string;

  async createMailerFile(): Promise<void> {
    await this.template(
      "mailer.ts",
      File.join(
        "app/mailers",
        ...this.classPath(),
        `${dasherize(this.fileName)}-mailer${this.ext()}`,
      ),
    );

    await this.inRoot(async () => {
      if (this.behavior === "invoke" && !File.isExist(this.applicationMailerFileName())) {
        await this.template("application_mailer.ts", this.applicationMailerFileName());
      }
    });
  }

  /** @internal */
  private __fileName?: string;

  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_mailer$/i, ""));
  }

  /** @internal */
  private applicationMailerFileName(): string {
    return (this._applicationMailerFileName ??= `app/mailers/application-mailer${this.ext()}`);
  }
}

Object.defineProperty(MailerGenerator, "name", { value: "Trails::Generators::MailerGenerator" });
