import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class JobGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "JobTest" });
    this.methodAdded("createTestFile");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createTestFile(): Promise<void> {
    await this.template(
      "unit_test.ts",
      File.join(
        "test/jobs",
        ...this.classPathParts,
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
