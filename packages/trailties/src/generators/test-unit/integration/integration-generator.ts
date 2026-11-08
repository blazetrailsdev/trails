import "../../../constants.test-unit-integration-integration-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { Base } from "../../test-unit.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class IntegrationGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "Test" });
    this.methodAdded("createTestFiles");
  }

  async createTestFiles(): Promise<void> {
    await this.template(
      "integration_test.ts",
      File.join(
        "test/integration",
        ...this.classPath(),
        `${dasherize(this.fileName)}.test${this.ext()}`,
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

Object.defineProperty(IntegrationGenerator, "name", {
  value: "TestUnit::Generators::IntegrationGenerator",
});
