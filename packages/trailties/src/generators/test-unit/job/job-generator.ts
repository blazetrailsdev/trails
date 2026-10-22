import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";

export class JobGenerator extends NamedBase {
  static {
    this.checkClassCollision({ suffix: "JobTest" });
    this.commands().push("createTestFile");
  }

  constructor(options: NamedBaseOptions) {
    super(options);
    this.fileName = this.fileName.replace(/_job$/i, "");
  }

  /**
   * @missingRailsCall template — CONVERGEABLE thor-actions-template-is-unported
   * @missingRailsCall module_namespacing — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms
   */
  createTestFile(): void {
    const root = "../".repeat(this.classPathParts.length + 1);
    this.createFile(
      File.join(
        "test/jobs",
        ...this.classPathParts,
        `${dasherize(this.fileName)}-job.test${this.ext()}`,
      ),
      `import "${root}test-helper.js";
import { ActiveJob } from "@blazetrails/activejob";

export class ${this.className().split("::").join("")}JobTest extends ActiveJob.TestCase {
  // test("the truth", () => {
  //   assert(true);
  // });
}
`,
    );
  }
}

Object.defineProperty(JobGenerator, "name", { value: "TestUnit::Generators::JobGenerator" });
