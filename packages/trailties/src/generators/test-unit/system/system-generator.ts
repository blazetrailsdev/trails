import { pluralize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { Base } from "../../test-unit.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class SystemGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "Test" });
    this.methodAdded("createTestFiles");
  }

  async createTestFiles(): Promise<void> {
    if (
      !File.isExist(
        File.join(this.destinationRoot, `test/application-system-test-case${this.ext()}`),
      )
    ) {
      await this.template(
        "application_system_test_case.ts",
        File.join("test", `application-system-test-case${this.ext()}`),
      );
    }

    await this.template(
      "system_test.ts",
      File.join(
        "test/system",
        ...this.classPath(),
        `${dasherize(pluralize(this.fileName))}.test${this.ext()}`,
      ),
    );
  }

  /** @internal */
  private __fileName?: string;

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_test$/i, ""));
  }
}

Object.defineProperty(SystemGenerator, "name", {
  value: "TestUnit::Generators::SystemGenerator",
});
