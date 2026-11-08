import "../../../constants.tse-mailer-mailer-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../tse.js";
import { dasherize } from "../../base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class MailerGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.argument("actions", { type: "array", default: [], banner: "method method" });

    this.methodAdded("copyViewFiles");
  }

  declare actions: string[];
  /** @internal */
  _action?: string;
  /** @internal */
  _path?: string;

  /**
   * @missingRailsArgs template — PERMANENT
   * @inventedArm dasherize — PERMANENT
   */
  async copyViewFiles(): Promise<void> {
    const viewBasePath = File.join(
      "app/views",
      dasherize(File.join(...this.classPath(), `${this.fileName}_mailer`)),
    );
    await this.emptyDirectory(viewBasePath);

    if (this.behavior === "invoke") {
      for (const format of this.formats()) {
        const layoutPath = File.join(
          "app/views/layouts",
          ...this.classPath(),
          this.filenameWithExtensions("mailer", format),
        );
        if (!File.isExist(layoutPath)) {
          await this.template(this.filenameWithExtensions("layout", format), layoutPath);
        }
      }
    }

    for (const action of this.actions) {
      this._action = action;

      for (const format of this.formats()) {
        this._path = File.join(viewBasePath, this.filenameWithExtensions(action, format));
        await this.template(this.filenameWithExtensions("view", format), this._path);
      }
    }
  }

  /** @internal */
  protected override formats(): string[] {
    return ["text", "html"];
  }

  /** @internal */
  private __fileName?: string;

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_mailer$/i, ""));
  }
}

Object.defineProperty(MailerGenerator, "name", { value: "Tse::Generators::MailerGenerator" });
