import "../../../constants.trails-job-job-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";

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
    this.noCommands(() => this.methodAdded("parentClassName"));
  }

  /** @internal */
  private _applicationJobFileName?: string;

  async createJobFile(): Promise<void> {
    await this.template(
      "job.ts",
      File.join("app/jobs", ...this.classPath(), `${dasherize(this.fileName)}-job${this.ext()}`),
    );

    await this.inRoot(async () => {
      if (this.behavior === "invoke" && !File.isExist(this.applicationJobFileName())) {
        await this.template("application_job.ts", this.applicationJobFileName());
      }
    });
  }

  /** @internal */
  parentClassName(): string {
    return this.options.parent!;
  }

  /** @internal */
  private applicationJobFileName(): string {
    return (this._applicationJobFileName ??= this.isMountableEngine()
      ? `app/jobs/${this.namespacedPath()}/application-job${this.ext()}`
      : `app/jobs/application-job${this.ext()}`);
  }

  /** @internal */
  private __fileName?: string;

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_job$/i, ""));
  }
}

Object.defineProperty(JobGenerator, "name", { value: "Trails::Generators::JobGenerator" });
