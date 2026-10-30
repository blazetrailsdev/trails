import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export class JobGenerator extends NamedBase {
  static {
    this.checkClassCollision({ suffix: "JobTest" });
    this.methodAdded("createTestFile");
  }

  /** @missingRailsCall template — CONVERGEABLE converge-remaining-generators-onto-thor-template */
  async createTestFile(): Promise<void> {
    await this.createFile(
      File.join(
        "test/jobs",
        ...this.classPathParts,
        `${dasherize(this.fileName)}-job.test${this.ext()}`,
      ),
      TEMPLATES.unit_test.call(this, this.ext()),
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
