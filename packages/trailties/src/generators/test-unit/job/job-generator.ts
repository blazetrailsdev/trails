import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export class JobGenerator extends NamedBase {
  static {
    this.checkClassCollision({ suffix: "JobTest" });
    this.commands().push("createTestFile");
  }

  constructor(options: NamedBaseOptions) {
    super(options);
    this.fileName = this.fileName.replace(/_job$/i, "");
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-file-actions-onto-thor-actions */
  createTestFile(): void {
    this.createFile(
      File.join(
        "test/jobs",
        ...this.classPathParts,
        `${dasherize(this.fileName)}-job.test${this.ext()}`,
      ),
      TEMPLATES.unit_test.call(this, this.ext()),
    );
  }
}

Object.defineProperty(JobGenerator, "name", { value: "TestUnit::Generators::JobGenerator" });
