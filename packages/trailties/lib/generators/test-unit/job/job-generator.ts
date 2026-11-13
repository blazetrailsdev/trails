import "../../../constants.test-unit-job-job-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { Base } from "../../test-unit.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class JobGenerator extends Base {
  static {
    this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "JobTest" });
    this.methodAdded("createTestFile");
  }

  async createTestFile(): Promise<void> {
    await this.template(
      "unit_test.ts",
      File.join(
        "test/jobs",
        ...this.classPath(),
        `${dasherize(this.fileName)}-job.test${this.ext()}`,
      ),
    );
  }

  /** @internal */
  private __fileName?: string;

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_job$/i, ""));
  }
}

Object.defineProperty(JobGenerator, "name", { value: "TestUnit::Generators::JobGenerator" });
