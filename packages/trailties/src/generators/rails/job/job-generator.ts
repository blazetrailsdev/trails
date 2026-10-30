import { classify } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export interface JobGeneratorOptions extends GeneratorOptions {
  queue?: string;
  parent?: string;
}

export class JobGenerator extends NamedBase {
  declare options: JobGeneratorOptions;

  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
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

  /** @missingRailsArgs template — PERMANENT */
  async createJobFile(): Promise<void> {
    await this.template(
      "job.ts",
      File.join("app/jobs", ...this.classPathParts, `${dasherize(this.fileName)}-job${this.ext()}`),
    );

    await this.inRoot(async () => {
      if (this.behavior === "invoke" && !File.isExist(this.applicationJobFileName())) {
        await this.template("application_job.ts", this.applicationJobFileName());
      }
    });
  }

  parentClassName(): string {
    return this.options.parent!;
  }

  /** @noRailsEquivalent CONVERGEABLE converge-generators-remainder-onto-thor-template */
  private parentClass(): string {
    return classify(this.parentClassName());
  }

  /** @noRailsEquivalent CONVERGEABLE converge-generators-remainder-onto-thor-template */
  private parentPath(): string {
    return dasherize(this.parentClassName());
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
