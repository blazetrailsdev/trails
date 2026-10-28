import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export interface JobGeneratorOptions extends GeneratorOptions {
  queue?: string;
  parent?: string;
}

export class JobGenerator extends NamedBase {
  declare options: JobGeneratorOptions;

  static {
    this.classOption("queue", {
      type: "string",
      default: "default",
      desc: "The queue name for the generated job",
    });
    this.classOption("parent", {
      type: "string",
      default: "ApplicationJob",
      desc: "The parent class for the generated job",
    });
    this.checkClassCollision({ suffix: "Job" });
    this.hookFor("testFramework");
    this.methodAdded("createJobFile");
  }

  /** @internal */
  private _applicationJobFileName?: string;

  /**
   * @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions
   * @missingRailsCall in_root — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions
   */
  createJobFile(): void {
    this.createFile(
      File.join("app/jobs", ...this.classPathParts, `${dasherize(this.fileName)}-job${this.ext()}`),
      TEMPLATES.job.call(this, this.ext()),
    );

    if (
      this.behavior === "invoke" &&
      !File.isExist(File.join(this.destinationRoot, this.applicationJobFileName()))
    ) {
      this.createFile(this.applicationJobFileName(), TEMPLATES.application_job.call(this));
    }
  }

  parentClassName(): string {
    return this.options.parent!;
  }

  /**
   * @internal
   * @missingRailsCall mountable_engine? — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms
   */
  private applicationJobFileName(): string {
    return (this._applicationJobFileName ??= `app/jobs/application-job${this.ext()}`);
  }

  /** @internal */
  private __fileName?: string;

  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_job$/i, ""));
  }
}

Object.defineProperty(JobGenerator, "name", { value: "Rails::Generators::JobGenerator" });
