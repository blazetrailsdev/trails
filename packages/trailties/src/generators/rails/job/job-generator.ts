import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export interface JobGeneratorOptions extends NamedBaseOptions {
  queue?: string;
  parent?: string;
}

export class JobGenerator extends NamedBase {
  declare options: JobGeneratorOptions;

  static {
    this.checkClassCollision({ suffix: "Job" });
    this.commands().push("createJobFile");
  }

  constructor(options: JobGeneratorOptions) {
    super(options);
    this.fileName = this.fileName.replace(/_job$/i, "");
  }

  /**
   * @missingRailsCall template — CONVERGEABLE thor-actions-template-is-unported
   * @missingRailsCall in_root — CONVERGEABLE thor-actions-template-is-unported
   */
  createJobFile(): void {
    this.createFile(
      File.join("app/jobs", ...this.classPathParts, `${dasherize(this.fileName)}-job${this.ext()}`),
      TEMPLATES.job.call(this),
    );

    if (
      this.behavior === "invoke" &&
      !File.isExist(File.join(this.cwd, this.applicationJobFileName()))
    ) {
      this.createFile(this.applicationJobFileName(), TEMPLATES.application_job.call(this));
    }
  }

  /** @internal */
  parentClassName(): string {
    return this.options.parent!;
  }

  /**
   * @internal
   * @missingRailsCall mountable_engine? — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms
   */
  private applicationJobFileName(): string {
    return `app/jobs/application-job${this.ext()}`;
  }
}

Object.defineProperty(JobGenerator, "name", { value: "Rails::Generators::JobGenerator" });
JobGenerator.classOption("queue", {
  type: "string",
  default: "default",
  desc: "The queue name for the generated job",
});
JobGenerator.classOption("parent", {
  type: "string",
  default: "ApplicationJob",
  desc: "The parent class for the generated job",
});
JobGenerator.hookFor("testFramework");
