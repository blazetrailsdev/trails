import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { Base } from "../../test-unit.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class MailerGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.argument("actions", { type: "array", default: [], banner: "method method" });
    this.methodAdded("checkClassCollision");
    this.methodAdded("createTestFiles");
    this.methodAdded("createPreviewFiles");
  }

  declare actions: string[];

  checkClassCollision(): void {
    this.classCollisions(`${this.className()}MailerTest`, `${this.className()}MailerPreview`);
  }

  async createTestFiles(): Promise<void> {
    await this.template(
      "functional_test.ts",
      File.join(
        "test/mailers",
        ...this.classPath(),
        `${dasherize(this.fileName)}-mailer.test${this.ext()}`,
      ),
    );
  }

  async createPreviewFiles(): Promise<void> {
    await this.template(
      "preview.ts",
      File.join(
        "test/mailers/previews",
        ...this.classPath(),
        `${dasherize(this.fileName)}-mailer-preview${this.ext()}`,
      ),
    );
  }

  /** @internal */
  private __fileName?: string;

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_mailer$/i, ""));
  }
}

Object.defineProperty(MailerGenerator, "name", { value: "TestUnit::Generators::MailerGenerator" });
