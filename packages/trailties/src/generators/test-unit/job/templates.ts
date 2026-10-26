import type { JobGenerator } from "./job-generator.js";

type Template = (this: JobGenerator, ext: string) => string;

/** @missingRailsCall module_namespacing — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms */
const unitTest: Template = function (ext) {
  const root = "../".repeat(this.classPathParts.length + 1);
  return `import "${root}test-helper${ext}";
import { ActiveJob } from "@blazetrails/activejob";

export class ${this.className().split("::").join("")}JobTest extends ActiveJob.TestCase {
  // test("the truth", () => {
  //   assert(true);
  // });
}
`;
};

export const TEMPLATES = {
  unit_test: unitTest,
};
